"""
OpenAI LLM provider.
"""

import logging

from django.conf import settings

from apps.ai_engine.services.providers.base import BaseLLMProvider, LLMResponse, LLMToolResponse
from apps.common.exceptions import AIServiceException

logger = logging.getLogger(__name__)


class OpenAIProvider(BaseLLMProvider):
    """OpenAI API provider with automatic Azure OpenAI support."""

    def __init__(self, api_key: str = "", base_url: str = "", model: str = "", use_env_fallback: bool = True):
        import openai
        from urllib.parse import urlparse, parse_qs

        api_key = api_key or settings.OPENAI_API_KEY
        if not api_key:
            raise AIServiceException("OPENAI_API_KEY is not configured.")
        
        if use_env_fallback:
            base_url = base_url or getattr(settings, "OPENAI_BASE_URL", None) or None
        else:
            base_url = base_url or None
        
        is_azure = False
        if base_url and ("cognitiveservices.azure.com" in base_url.lower() or "openai.azure.com" in base_url.lower() or "azure" in base_url.lower()):
            is_azure = True

        if is_azure:
            parsed_url = urlparse(base_url)
            query_params = parse_qs(parsed_url.query)
            api_version = "2024-05-01-preview"  # Stable preview supporting tool calling
            if "api-version" in query_params:
                api_version = query_params["api-version"][0]
                
            clean_endpoint = f"{parsed_url.scheme}://{parsed_url.netloc}"
            self.client = openai.AzureOpenAI(
                api_key=api_key,
                azure_endpoint=clean_endpoint,
                api_version=api_version
            )
        else:
            client_kwargs = {"api_key": api_key}
            if base_url:
                client_kwargs["base_url"] = base_url
            self.client = openai.OpenAI(**client_kwargs)

        self.model = model or settings.AI_OPENAI_MODEL

    def chat(self, messages: list[dict], system_prompt: str = "", **kwargs) -> LLMResponse:
        try:
            max_tokens = kwargs.get("max_tokens", settings.AI_MAX_RESPONSE_TOKENS)

            api_messages = []
            if system_prompt:
                api_messages.append({"role": "system", "content": system_prompt})
            api_messages.extend(messages)

            api_kwargs = {
                "model": self.model,
                "messages": api_messages,
            }
            model_lower = self.model.lower()
            if "gpt-5" in model_lower or "gpt5" in model_lower or "gpt-5-mini" in model_lower or "gpt-5-nano" in model_lower:
                api_kwargs["max_completion_tokens"] = max_tokens
            else:
                api_kwargs["max_tokens"] = max_tokens

            response = self.client.chat.completions.create(**api_kwargs)

            choice = response.choices[0]
            usage = response.usage

            return LLMResponse(
                content=choice.message.content or "",
                model=response.model,
                input_tokens=usage.prompt_tokens,
                output_tokens=usage.completion_tokens,
                total_tokens=usage.total_tokens,
            )

        except Exception as e:
            logger.exception("OpenAI API error")
            raise AIServiceException(f"OpenAI API error: {str(e)}")

    def chat_with_tools(self, messages: list[dict], tools: list[dict], system_prompt: str = "", **kwargs) -> LLMToolResponse:
        try:
            import json
            from apps.ai_engine.services.providers.base import LLMToolResponse
            max_tokens = kwargs.get("max_tokens", settings.AI_MAX_RESPONSE_TOKENS)

            # Map tools schema to OpenAI's expected structure
            openai_tools = []
            for t in tools:
                openai_tools.append({
                    "type": "function",
                    "function": {
                        "name": t.get("name"),
                        "description": t.get("description"),
                        "parameters": t.get("input_schema"),
                    }
                })

            # Format messages
            api_messages = []
            if system_prompt:
                api_messages.append({"role": "system", "content": system_prompt})

            for msg in messages:
                role = msg.get("role")
                content = msg.get("content")

                if role == "tool":
                    api_messages.append({
                        "role": "tool",
                        "tool_call_id": msg.get("tool_call_id"),
                        "content": content or "",
                    })
                elif role == "assistant" and "tool_calls" in msg:
                    # Map tool calls array to OpenAI format
                    tc_list = []
                    for tc in msg["tool_calls"]:
                        tc_list.append({
                            "id": tc.get("id"),
                            "type": "function",
                            "function": {
                                "name": tc.get("name"),
                                "arguments": json.dumps(tc.get("arguments", {})),
                            }
                        })
                    api_messages.append({
                        "role": "assistant",
                        "content": content,
                        "tool_calls": tc_list,
                    })
                else:
                    api_messages.append({
                        "role": role,
                        "content": content or "",
                    })

            api_kwargs = {
                "model": self.model,
                "messages": api_messages,
            }
            model_lower = self.model.lower()
            if "gpt-5" in model_lower or "gpt5" in model_lower or "gpt-5-mini" in model_lower or "gpt-5-nano" in model_lower:
                api_kwargs["max_completion_tokens"] = max_tokens
            else:
                api_kwargs["max_tokens"] = max_tokens
            if openai_tools:
                api_kwargs["tools"] = openai_tools

            response = self.client.chat.completions.create(**api_kwargs)

            choice = response.choices[0]
            usage = response.usage
            text_content = choice.message.content
            tool_calls = []

            if choice.message.tool_calls:
                for tc in choice.message.tool_calls:
                    try:
                        args = json.loads(tc.function.arguments)
                    except ValueError:
                        args = {}
                    tool_calls.append({
                        "id": tc.id,
                        "name": tc.function.name,
                        "arguments": args,
                    })

            return LLMToolResponse(
                content=text_content,
                tool_calls=tool_calls,
                model=response.model,
                input_tokens=usage.prompt_tokens,
                output_tokens=usage.completion_tokens,
                total_tokens=usage.total_tokens,
            )

        except Exception as e:
            logger.exception("OpenAI tool API error")
            raise AIServiceException(f"OpenAI API tool error: {str(e)}")

    def get_model_name(self) -> str:
        return self.model

