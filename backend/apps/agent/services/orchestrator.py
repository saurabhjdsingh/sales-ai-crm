import json
import logging
from typing import List, Dict, Any, Tuple

from django.conf import settings
from django.utils import timezone

from apps.agent.enums import ApprovalStatus
from apps.agent.models import PendingApproval
from apps.agent.services.context import AgentContext
from apps.agent.services.tool_router import ToolRouter
from apps.agent.tools.registry import tool_registry
from apps.ai_engine.models import AIConversation, AIMessage
from apps.ai_engine.services.prompt_service import PromptService
from apps.ai_engine.services.context_builder import ContextBuilder
from apps.ai_engine.services.copilot import get_llm_provider
from apps.common.enums import AIMessageRole

logger = logging.getLogger(__name__)


class AgentOrchestrator:
    """
    Manages the agentic loop, feeding context and conversation history to the LLM,
    invoking tools dynamically, routing outputs, and enforcing approval gates and loop prevention.
    """

    def __init__(self, user=None):
        self.user = user
        self.context_builder = ContextBuilder()
        self.tool_router = ToolRouter()
        self.provider = get_llm_provider(user=user)

    def process_message(self, conversation: AIConversation, user_message: str) -> AIMessage:
        """
        Processes a user message in an agentic loop:
        1. Save the user message.
        2. Build context.
        3. Iterate calling LLM and tools.
        4. Detect and prevent infinite tool loops.
        5. Return the final saved AIMessage.
        """
        # Save user message
        AIMessage.objects.create(
            conversation=conversation,
            role=AIMessageRole.USER,
            content=user_message,
        )

        # Build context
        context = AgentContext.from_conversation(conversation, self.user)
        crm_context_str = self._build_crm_context(conversation)

        # Assemble system prompt
        copilot_system = PromptService.get_prompt(self.user, "copilot_system")
        copilot_context_template = PromptService.get_prompt(self.user, "copilot_context")
        agent_system = PromptService.get_prompt(self.user, "agent_system")
        system_prompt = (
            copilot_system
            + copilot_context_template.format(context=crm_context_str)
            + "\n\n"
            + agent_system
        )

        # Build initial messages list for LLM (last 20 messages)
        api_messages = self._get_api_messages(conversation)

        max_iterations = getattr(settings, "AGENT_MAX_TOOL_ITERATIONS", 10)
        executed_tool_calls: List[Tuple[str, str]] = []  # Keep track of (tool_name, args_json_sorted)
        pending_approvals_list: List[str] = []
        final_content = ""
        total_input_tokens = 0
        total_output_tokens = 0
        model_used = self.provider.get_model_name()

        for iteration in range(max_iterations):
            logger.info("Agent iteration %d for conversation %s", iteration + 1, conversation.id)

            # Get tool definitions
            tools = tool_registry.get_tool_definitions()

            # Call LLM with tools
            response = self.provider.chat_with_tools(
                messages=api_messages,
                tools=tools,
                system_prompt=system_prompt,
            )

            total_input_tokens += response.input_tokens
            total_output_tokens += response.output_tokens
            model_used = response.model

            # Append assistant message with tool calls or text to memory
            assistant_msg_dict = {"role": "assistant"}
            if response.content:
                assistant_msg_dict["content"] = response.content
            if response.tool_calls:
                assistant_msg_dict["tool_calls"] = response.tool_calls
            api_messages.append(assistant_msg_dict)

            # If there are no tool calls, this is the final response
            if not response.tool_calls:
                final_content = response.content or ""
                break

            # Handle tool calls
            tool_outputs_rendered = []
            requires_approval_interrupted = False

            for tool_call in response.tool_calls:
                tool_name = tool_call.get("name")
                tool_args = tool_call.get("arguments", {})
                tool_call_id = tool_call.get("id")

                # Normalize arguments for loop detection
                args_str_sorted = json.dumps(tool_args, sort_keys=True)
                tool_signature = (tool_name, args_str_sorted)

                # Loop prevention check
                if tool_signature in executed_tool_calls:
                    logger.warning("Loop detected: Tool '%s' called with identical arguments.", tool_name)
                    loop_error_msg = f"System Error: Detected repetition of tool '{tool_name}' execution. Execution halted to prevent loop."
                    api_messages.append({
                        "role": "tool",
                        "tool_call_id": tool_call_id,
                        "content": json.dumps({"error": loop_error_msg, "success": False}),
                    })
                    final_content = "I hit a repetitive loop trying to run the same action and halted to prevent waste. Let me know what you'd like to do next."
                    requires_approval_interrupted = True
                    break

                executed_tool_calls.append(tool_signature)

                # Execute tool
                tool_result = self.tool_router.route_tool_call(tool_name, tool_args, context)

                # Format tool response
                tool_response_content = {
                    "success": tool_result.success,
                    "data": tool_result.data,
                    "summary": tool_result.summary,
                }
                if tool_result.error:
                    tool_response_content["error"] = tool_result.error

                # Append tool message
                api_messages.append({
                    "role": "tool",
                    "tool_call_id": tool_call_id,
                    "content": json.dumps(tool_response_content),
                })

                if tool_result.requires_approval:
                    requires_approval_interrupted = True
                    pending_approval_id = tool_result.data.get("pending_approval_id")
                    if pending_approval_id:
                        pending_approvals_list.append(pending_approval_id)

            if requires_approval_interrupted:
                # If we've interrupted for approval, formulate a summary message
                # explaining that we are waiting for user authorization.
                final_content = (
                    response.content or "I have prepared the action for you. "
                    "Please review and approve the action before I can proceed."
                )
                break

        # Save assistant response
        ai_message = AIMessage.objects.create(
            conversation=conversation,
            role=AIMessageRole.ASSISTANT,
            content=final_content,
            model_used=model_used,
            tokens_used=total_input_tokens + total_output_tokens,
        )

        # Update conversation title if first turn
        if conversation.messages.count() <= 2:
            conversation.title = user_message[:100]
            conversation.save(update_fields=["title", "updated_at"])

        return ai_message

    def _build_crm_context(self, conversation: AIConversation) -> str:
        """Helper to build CRM context using existing ContextBuilder."""
        try:
            if conversation.entity_type == AIMessageRole.USER:  # Fallback
                return "No additional context."
            
            if conversation.entity_type == "company" and conversation.company_id:
                return self.context_builder.build_company_context(conversation.company_id)
            elif conversation.entity_type == "contact" and conversation.contact_id:
                return self.context_builder.build_contact_context(conversation.contact_id)
            elif conversation.entity_type == "deal" and conversation.deal_id:
                return self.context_builder.build_deal_context(conversation.deal_id)
        except Exception:
            logger.exception("Failed to build CRM context")
        return "No CRM context available."

    def _get_api_messages(self, conversation: AIConversation) -> List[Dict[str, Any]]:
        """Fetch past messages formatted for the LLM API."""
        messages = conversation.messages.order_by("created_at")
        recent_messages = list(messages)[-20:]

        return [
            {"role": msg.role, "content": msg.content}
            for msg in recent_messages
            if msg.role in (AIMessageRole.USER, AIMessageRole.ASSISTANT)
        ]
