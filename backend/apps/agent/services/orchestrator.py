import time
import json
import logging
from typing import List, Dict, Any, Tuple
from concurrent.futures import ThreadPoolExecutor, as_completed

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


def estimate_tokens(text: str) -> int:
    """Rough token estimation (1 token ≈ 4 characters or ~0.75 words)."""
    if not text:
        return 0
    return max(1, int(len(text) / 3.8))


class AgentOrchestrator:
    """
    Manages the hybrid agentic loop:
    - Injects lightweight Base Context (~100-200 tokens)
    - Integrates custom organization prompt persona (copilot_system)
    - Dynamic tool calling with parallel execution & turn-level caching
    - Context Debugger metrics tracking (latency, token usage, tool call logs, reasoning trace)
    """

    def __init__(self, user=None):
        self.user = user
        self.context_builder = ContextBuilder()
        self.tool_router = ToolRouter()
        self.provider = get_llm_provider(user=user)

    def process_message(self, conversation: AIConversation, user_message: str) -> AIMessage:
        """
        Processes a user message in an agentic turn loop:
        1. Save the user message.
        2. Build Base Context & assemble System Prompt.
        3. Iterate calling LLM and tools with parallel execution & caching.
        4. Record ContextReport debug metrics.
        5. Return the saved assistant AIMessage.
        """
        start_turn_time = time.time()

        # 1. Save user message
        AIMessage.objects.create(
            conversation=conversation,
            role=AIMessageRole.USER,
            content=user_message,
        )

        # 2. Build Base Context
        t0 = time.time()
        agent_ctx = AgentContext.from_conversation(conversation, self.user)
        base_context_str = self.context_builder.build_base_context(
            user=self.user,
            conversation=conversation,
        )
        context_build_time_ms = int((time.time() - t0) * 1000)

        # 3. Assemble system prompt (Org Persona + Base Context + Tool Rules)
        copilot_system = PromptService.get_prompt(self.user, "copilot_system")
        copilot_context_template = PromptService.get_prompt(self.user, "copilot_context")
        agent_system = PromptService.get_prompt(self.user, "agent_system")

        system_prompt = (
            copilot_system
            + "\n\n"
            + copilot_context_template.format(context=base_context_str)
            + "\n\n"
            + agent_system
        )

        # 4. Format recent message history
        api_messages = self._get_api_messages(conversation)

        max_iterations = getattr(settings, "AGENT_MAX_TOOL_ITERATIONS", 10)
        tool_cache: Dict[Tuple[str, str], Any] = {}
        executed_signatures: List[Tuple[str, str]] = []
        
        debug_tool_calls: List[Dict[str, Any]] = []
        reasoning_trace: List[str] = []
        
        total_input_tokens = 0
        total_output_tokens = 0
        total_tool_exec_time_ms = 0
        total_llm_response_time_ms = 0
        model_used = self.provider.get_model_name()
        final_content = ""

        for iteration in range(max_iterations):
            logger.info("Agent turn iteration %d for conversation %s", iteration + 1, conversation.id)
            reasoning_trace.append(f"Iteration {iteration + 1}: Querying LLM...")

            # Get tool definitions
            tools = tool_registry.get_tool_definitions()

            # Call LLM with tools
            llm_t0 = time.time()
            response = self.provider.chat_with_tools(
                messages=api_messages,
                tools=tools,
                system_prompt=system_prompt,
            )
            llm_dur_ms = int((time.time() - llm_t0) * 1000)
            total_llm_response_time_ms += llm_dur_ms

            total_input_tokens += response.input_tokens
            total_output_tokens += response.output_tokens
            model_used = response.model

            # Append assistant turn to conversation memory
            assistant_msg_dict = {"role": "assistant"}
            if response.content:
                assistant_msg_dict["content"] = response.content
            if response.tool_calls:
                assistant_msg_dict["tool_calls"] = response.tool_calls
            api_messages.append(assistant_msg_dict)

            # If no tool calls, LLM turn is complete
            if not response.tool_calls:
                final_content = response.content or ""
                reasoning_trace.append("LLM provided final answer without additional tool calls.")
                break

            # Handle tool calls (with caching & parallel execution)
            tool_calls_to_run = response.tool_calls
            reasoning_trace.append(f"LLM requested {len(tool_calls_to_run)} tool call(s): {[tc.get('name') for tc in tool_calls_to_run]}")

            # Function to execute a single tool call (using cache if available)
            def run_single_tool(tc: dict) -> Tuple[dict, dict, int, bool]:
                t_name = tc.get("name")
                t_args = tc.get("arguments", {})
                t_id = tc.get("id")

                args_sig = json.dumps(t_args, sort_keys=True)
                sig = (t_name, args_sig)

                # Check turn cache
                if sig in tool_cache:
                    cached_result = tool_cache[sig]
                    res_content = {
                        "success": cached_result.success,
                        "data": cached_result.data,
                        "summary": cached_result.summary,
                        "cached": True,
                    }
                    debug_entry = {
                        "tool_name": t_name,
                        "status": "CACHE_HIT",
                        "execution_time_ms": 0,
                        "args": t_args,
                        "summary": cached_result.summary,
                        "payload_size_bytes": len(json.dumps(res_content)),
                    }
                    return tc, res_content, 0, False

                # Execute tool via ToolRouter
                st_0 = time.time()
                tool_result = self.tool_router.route_tool_call(t_name, t_args, agent_ctx)
                st_dur_ms = int((time.time() - st_0) * 1000)

                # Save to cache
                tool_cache[sig] = tool_result

                res_content = {
                    "success": tool_result.success,
                    "data": tool_result.data,
                    "summary": tool_result.summary,
                }
                if tool_result.error:
                    res_content["error"] = tool_result.error

                debug_entry = {
                    "tool_name": t_name,
                    "status": "SUCCESS" if tool_result.success else "FAILED",
                    "execution_time_ms": st_dur_ms,
                    "args": t_args,
                    "summary": tool_result.summary,
                    "payload_size_bytes": len(json.dumps(res_content)),
                }

                return tc, res_content, st_dur_ms, debug_entry

            # Execute tool calls in parallel using ThreadPoolExecutor
            tool_t0 = time.time()
            parallel_results = []
            if len(tool_calls_to_run) > 1:
                with ThreadPoolExecutor(max_workers=min(5, len(tool_calls_to_run))) as executor:
                    futures = [executor.submit(run_single_tool, tc) for tc in tool_calls_to_run]
                    for future in as_completed(futures):
                        parallel_results.append(future.result())
            else:
                parallel_results.append(run_single_tool(tool_calls_to_run[0]))

            step_tool_dur_ms = int((time.time() - tool_t0) * 1000)
            total_tool_exec_time_ms += step_tool_dur_ms

            loop_interrupted = False
            for tc, res_content, dur_ms, debug_entry in parallel_results:
                t_name = tc.get("name")
                t_args = tc.get("arguments", {})
                t_id = tc.get("id")

                args_sig = json.dumps(t_args, sort_keys=True)
                sig = (t_name, args_sig)

                # Loop detection check
                if sig in executed_signatures:
                    reasoning_trace.append(f"Loop detected for tool '{t_name}'. Execution halted.")
                    api_messages.append({
                        "role": "tool",
                        "tool_call_id": t_id,
                        "content": json.dumps({"error": f"Loop detected for tool '{t_name}'.", "success": False}),
                    })
                    final_content = "Halted repetitive tool calling loop to prevent resource waste."
                    loop_interrupted = True
                    break

                executed_signatures.append(sig)
                if debug_entry:
                    debug_tool_calls.append(debug_entry)

                api_messages.append({
                    "role": "tool",
                    "tool_call_id": t_id,
                    "content": json.dumps(res_content),
                })

            if loop_interrupted:
                break

        total_turn_time_ms = int((time.time() - start_turn_time) * 1000)
        base_tokens_est = estimate_tokens(base_context_str)

        # 5. Build Developer Debug Report
        debug_report = {
            "base_context": {
                "user": getattr(self.user, "email", "Unknown"),
                "organization": getattr(agent_ctx, "organization", "Sales AI CRM"),
                "page_type": conversation.entity_type,
                "company_id": str(conversation.company_id) if conversation.company_id else None,
                "contact_id": str(conversation.contact_id) if conversation.contact_id else None,
                "deal_id": str(conversation.deal_id) if conversation.deal_id else None,
                "call_id": str(conversation.call_id) if conversation.call_id else None,
                "estimated_tokens": base_tokens_est,
            },
            "tool_calls": debug_tool_calls,
            "token_usage": {
                "base_context_tokens": base_tokens_est,
                "input_tokens": total_input_tokens,
                "output_tokens": total_output_tokens,
                "total_tokens": total_input_tokens + total_output_tokens,
            },
            "timings": {
                "context_build_time_ms": context_build_time_ms,
                "tool_execution_time_ms": total_tool_exec_time_ms,
                "llm_response_time_ms": total_llm_response_time_ms,
                "total_time_ms": total_turn_time_ms,
            },
            "reasoning_trace": reasoning_trace,
            "final_prompt": system_prompt[:1500] + ("..." if len(system_prompt) > 1500 else ""),
        }

        # 6. Save assistant response with attached debug report
        ai_message = AIMessage.objects.create(
            conversation=conversation,
            role=AIMessageRole.ASSISTANT,
            content=final_content,
            model_used=model_used,
            tokens_used=total_input_tokens + total_output_tokens,
            debug_report=debug_report,
        )

        # Update conversation title if first turn
        if conversation.messages.count() <= 2:
            conversation.title = user_message[:100]
            conversation.save(update_fields=["title", "updated_at"])

        return ai_message

    def _get_api_messages(self, conversation: AIConversation) -> List[Dict[str, Any]]:
        """Fetch past messages formatted for the LLM API."""
        messages = conversation.messages.order_by("created_at")
        recent_messages = list(messages)[-20:]

        return [
            {"role": msg.role, "content": msg.content}
            for msg in recent_messages
            if msg.role in (AIMessageRole.USER, AIMessageRole.ASSISTANT)
        ]
