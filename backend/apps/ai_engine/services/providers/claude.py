"""
Claude (Anthropic) LLM provider.
"""

import logging

from django.conf import settings

from apps.ai_engine.services.providers.base import BaseLLMProvider, LLMResponse, LLMToolResponse
from apps.common.exceptions import AIServiceException

logger = logging.getLogger(__name__)


class ClaudeProvider(BaseLLMProvider):
    """Anthropic Claude API provider."""

    def __init__(self, api_key: str = "", base_url: str = "", model: str = "", use_env_fallback: bool = True):
        import anthropic

        api_key = api_key or settings.ANTHROPIC_API_KEY
        if not api_key:
            raise AIServiceException("ANTHROPIC_API_KEY is not configured.")
        
        if use_env_fallback:
            base_url = base_url or getattr(settings, "ANTHROPIC_BASE_URL", None) or None
        else:
            base_url = base_url or None

        if base_url:
            self.client = anthropic.Anthropic(api_key=api_key, base_url=base_url)
        else:
            self.client = anthropic.Anthropic(api_key=api_key)
        self.model = model or settings.AI_CLAUDE_MODEL

    def chat(self, messages: list[dict], system_prompt: str = "", **kwargs) -> LLMResponse:
        try:
            max_tokens = kwargs.get("max_tokens", settings.AI_MAX_RESPONSE_TOKENS)

            api_kwargs = {
                "model": self.model,
                "max_tokens": max_tokens,
                "messages": messages,
            }
            if system_prompt:
                api_kwargs["system"] = system_prompt

            response = self.client.messages.create(**api_kwargs)

            content = ""
            for block in response.content:
                if block.type == "text":
                    content += block.text

            return LLMResponse(
                content=content,
                model=response.model,
                input_tokens=response.usage.input_tokens,
                output_tokens=response.usage.output_tokens,
                total_tokens=response.usage.input_tokens + response.usage.output_tokens,
            )

        except Exception as e:
            logger.exception("Claude API error")
            raise AIServiceException(f"Claude API error: {str(e)}")

    def chat_with_tools(self, messages: list[dict], tools: list[dict], system_prompt: str = "", **kwargs) -> LLMToolResponse:
        try:
            from apps.ai_engine.services.providers.base import LLMToolResponse
            max_tokens = kwargs.get("max_tokens", settings.AI_MAX_RESPONSE_TOKENS)

            # Format messages for Anthropic (map tool roles to user/tool_result and assistant/tool_use)
            formatted_messages = []
            for msg in messages:
                role = msg.get("role")
                content = msg.get("content")

                if role == "tool":
                    formatted_messages.append({
                        "role": "user",
                        "content": [{
                            "type": "tool_result",
                            "tool_use_id": msg.get("tool_call_id"),
                            "content": content,
                        }]
                    })
                elif role == "assistant" and "tool_calls" in msg:
                    blocks = []
                    if content:
                        blocks.append({"type": "text", "text": content})
                    for tc in msg["tool_calls"]:
                        blocks.append({
                            "type": "tool_use",
                            "id": tc.get("id"),
                            "name": tc.get("name"),
                            "input": tc.get("arguments"),
                        })
                    formatted_messages.append({
                        "role": "assistant",
                        "content": blocks
                    })
                else:
                    formatted_messages.append({
                        "role": role,
                        "content": content or ""
                    })

            api_kwargs = {
                "model": self.model,
                "max_tokens": max_tokens,
                "messages": formatted_messages,
            }
            if tools:
                api_kwargs["tools"] = tools
            if system_prompt:
                api_kwargs["system"] = system_prompt

            response = self.client.messages.create(**api_kwargs)

            text_content = ""
            tool_calls = []

            for block in response.content:
                if block.type == "text":
                    text_content += block.text
                elif block.type == "tool_use":
                    tool_calls.append({
                        "id": block.id,
                        "name": block.name,
                        "arguments": block.input,
                    })

            return LLMToolResponse(
                content=text_content if text_content else None,
                tool_calls=tool_calls,
                model=response.model,
                input_tokens=response.usage.input_tokens,
                output_tokens=response.usage.output_tokens,
                total_tokens=response.usage.input_tokens + response.usage.output_tokens,
            )

        except Exception as e:
            logger.exception("Claude tool API error")
            raise AIServiceException(f"Claude API tool error: {str(e)}")

    def get_model_name(self) -> str:
        return self.model

