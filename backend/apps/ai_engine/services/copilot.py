"""
AI Copilot service — orchestrates conversations with context building.
"""

import logging

from django.conf import settings

from apps.ai_engine.models import AIConversation, AIMessage
from apps.ai_engine.services.context_builder import ContextBuilder
from apps.ai_engine.services.prompt_service import PromptService
from apps.ai_engine.services.providers.base import BaseLLMProvider, LLMResponse, LLMToolResponse
from apps.common.enums import AIEntityType, AIMessageRole

logger = logging.getLogger(__name__)


class LoggingLLMProviderWrapper(BaseLLMProvider):
    """
    Wraps any BaseLLMProvider to automatically intercept all calls and log
    token usage and cost to the database.
    """

    def __init__(self, provider: BaseLLMProvider, user=None):
        self.provider = provider
        self.user = user

    def chat(self, messages: list[dict], system_prompt: str = "", **kwargs) -> LLMResponse:
        response = self.provider.chat(messages, system_prompt, **kwargs)
        self._log_call(response, **kwargs)
        return response

    def chat_with_tools(
        self,
        messages: list[dict],
        tools: list[dict],
        system_prompt: str = "",
        **kwargs
    ) -> LLMToolResponse:
        response = self.provider.chat_with_tools(messages, tools, system_prompt, **kwargs)
        self._log_call(response, **kwargs)
        return response

    def get_model_name(self) -> str:
        return self.provider.get_model_name()

    def _log_call(self, response, **kwargs):
        try:
            from apps.ai_engine.models import LLMCallLog
            from apps.ai_engine.pricing import calculate_cost

            cost = calculate_cost(response.model, response.input_tokens, response.output_tokens)
            purpose = kwargs.get("purpose", "chat")

            LLMCallLog.objects.create(
                user=self.user,
                model_name=response.model,
                input_tokens=response.input_tokens,
                output_tokens=response.output_tokens,
                total_tokens=response.total_tokens,
                cost=cost,
                prompt_purpose=purpose,
            )
        except Exception as e:
            logger.exception("Failed to log LLM call: %s", str(e))


def get_llm_provider(user=None) -> BaseLLMProvider:
    """
    Factory function to get the LLM provider, wrapped in a logging proxy.

    If the user has a personal AI config (UserAIConfig), use that.
    Otherwise fall back to the system-wide settings from .env.
    """
    raw_provider = None

    # Try per-user config first
    if user is not None:
        try:
            from apps.ai_engine.models import UserAIConfig
            from apps.common.encryption import decrypt_api_key

            config = UserAIConfig.objects.get(user=user, is_active=True, is_deleted=False)
            api_key = decrypt_api_key(config.api_key_encrypted)
            base_url = config.base_url if config.config_type == "custom_endpoint" else ""
            model = config.model_name

            if config.provider == "claude":
                from apps.ai_engine.services.providers.claude import ClaudeProvider
                raw_provider = ClaudeProvider(api_key=api_key, base_url=base_url, model=model, use_env_fallback=False)
            elif config.provider == "openai":
                from apps.ai_engine.services.providers.openai import OpenAIProvider
                raw_provider = OpenAIProvider(api_key=api_key, base_url=base_url, model=model, use_env_fallback=False)
            else:
                logger.warning("Unknown provider '%s' in user config, falling back to defaults", config.provider)
        except Exception:
            # UserAIConfig.DoesNotExist or decryption error — fall through to defaults
            pass

    if not raw_provider:
        # Fall back to system defaults from .env
        provider_name = settings.AI_DEFAULT_PROVIDER

        if provider_name == "claude":
            from apps.ai_engine.services.providers.claude import ClaudeProvider
            raw_provider = ClaudeProvider()
        elif provider_name == "openai":
            from apps.ai_engine.services.providers.openai import OpenAIProvider
            raw_provider = OpenAIProvider()
        else:
            raise ValueError(f"Unknown AI provider: {provider_name}")

    return LoggingLLMProviderWrapper(raw_provider, user=user)


class CopilotService:
    """
    Orchestrates AI copilot conversations.
    Builds context automatically, manages conversation history,
    and delegates to the configured LLM provider.
    """

    def __init__(self, user=None):
        self.context_builder = ContextBuilder()
        self.user = user
        self.provider = get_llm_provider(user=user)

    def create_conversation(
        self,
        entity_type: str,
        entity_id: str,
        user,
        title: str = "",
    ) -> AIConversation:
        """Create a new AI conversation scoped to an entity."""
        kwargs = {
            "entity_type": entity_type,
            "user": user,
            "title": title or f"Chat about {entity_type}",
            "created_by": user,
        }

        if entity_type == AIEntityType.COMPANY:
            kwargs["company_id"] = entity_id
        elif entity_type == AIEntityType.CONTACT:
            kwargs["contact_id"] = entity_id
        elif entity_type == AIEntityType.DEAL:
            kwargs["deal_id"] = entity_id
        elif entity_type == AIEntityType.CALL:
            kwargs["call_id"] = entity_id

        return AIConversation.objects.create(**kwargs)

    def send_message(self, conversation: AIConversation, user_message: str, use_agent: bool = True) -> AIMessage:
        """
        Process a user message in an existing conversation.
        Delegates to AgentOrchestrator when use_agent=True, otherwise falls back to simple chat.
        """
        if use_agent:
            from apps.agent.services.orchestrator import AgentOrchestrator
            orchestrator = AgentOrchestrator(user=self.user)
            return orchestrator.process_message(conversation, user_message)

        # Save user message (fallback/simple flow)
        AIMessage.objects.create(
            conversation=conversation,
            role=AIMessageRole.USER,
            content=user_message,
        )

        # Build context
        context = self._build_context(conversation)

        # Build system prompt with context
        copilot_system = PromptService.get_prompt(self.user, "copilot_system")
        copilot_context_template = PromptService.get_prompt(self.user, "copilot_context")
        system_prompt = copilot_system + copilot_context_template.format(
            context=context
        )

        # Get conversation history
        messages = self._get_conversation_messages(conversation)

        # Call LLM
        response = self.provider.chat(
            messages=messages,
            system_prompt=system_prompt,
        )

        # Save assistant response
        ai_message = AIMessage.objects.create(
            conversation=conversation,
            role=AIMessageRole.ASSISTANT,
            content=response.content,
            model_used=response.model,
            tokens_used=response.total_tokens,
        )

        # Update conversation title if it's the first message
        if conversation.messages.count() <= 2:
            conversation.title = user_message[:100]
            conversation.save(update_fields=["title", "updated_at"])

        return ai_message

    def _build_context(self, conversation: AIConversation) -> str:
        """Build the appropriate context based on entity type."""
        try:
            if conversation.entity_type == AIEntityType.COMPANY and conversation.company_id:
                return self.context_builder.build_company_context(conversation.company_id)
            elif conversation.entity_type == AIEntityType.CONTACT and conversation.contact_id:
                return self.context_builder.build_contact_context(conversation.contact_id)
            elif conversation.entity_type == AIEntityType.DEAL and conversation.deal_id:
                return self.context_builder.build_deal_context(conversation.deal_id)
            elif conversation.entity_type == AIEntityType.CALL and conversation.call_id:
                return self.context_builder.build_call_context(conversation.call_id)
        except Exception:
            logger.exception("Failed to build context for conversation %s", conversation.id)
        return "No additional context available."

    def _get_conversation_messages(self, conversation: AIConversation) -> list[dict]:
        """Get formatted conversation history for the LLM."""
        messages = conversation.messages.order_by("created_at")

        # Limit to last 20 messages to stay within token limits
        recent_messages = list(messages)[-20:]

        return [
            {"role": msg.role, "content": msg.content}
            for msg in recent_messages
            if msg.role in (AIMessageRole.USER, AIMessageRole.ASSISTANT)
        ]

