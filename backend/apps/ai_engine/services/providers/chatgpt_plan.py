"""
ChatGPT Plan LLM Provider.
Enables using the authenticated user's personal/team ChatGPT subscription
for all CRM AI capabilities via the OpenAI Responses API.
"""

import json
import logging
from typing import List, Dict, Any, Optional
import requests

from apps.ai_engine.services.chatgpt_oauth import get_valid_chatgpt_token
from apps.ai_engine.services.providers.base import BaseLLMProvider, LLMResponse, LLMToolResponse

logger = logging.getLogger(__name__)

RESPONSES_API_URL = "https://api.openai.com/v1/responses"


class ChatGPTPlanProvider(BaseLLMProvider):
    """
    LLM provider that executes inference against OpenAI's Responses API
    authenticated with an OAuth Bearer token authorized for ChatGPT plan usage.
    """

    def __init__(self, user, model: str = None):
        self.user = user
        self.model = model or "gpt-5.6-terra"

    def get_model_name(self) -> str:
        return self.model

    def chat(self, messages: list[dict], system_prompt: str = "", **kwargs) -> LLMResponse:
        """
        Executes a chat completion using the user's ChatGPT subscription.
        Sets store=False and stream=True as mandated by OpenAI SIWC protocol.
        """
        token = get_valid_chatgpt_token(self.user)

        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        }

        # Build Responses API input array
        input_items = []
        for msg in messages:
            role = msg.get("role", "user")
            # In Responses API, explicit system role in message array is rejected.
            # System instructions belong in top-level `instructions`.
            if role == "system":
                if not system_prompt:
                    system_prompt = msg.get("content", "")
                else:
                    system_prompt = f"{system_prompt}\n\n{msg.get('content', '')}"
            else:
                input_items.append({
                    "role": role,
                    "content": msg.get("content", "")
                })

        if not input_items:
            input_items.append({"role": "user", "content": "Hello"})

        payload = {
            "model": self.model,
            "instructions": system_prompt or "You are Radar 36 AI assistant. Provide concise, professional sales intelligence.",
            "input": input_items,
            "store": False,
            "stream": True,
        }

        assembled_text = []
        input_tokens = 0
        output_tokens = 0

        try:
            with requests.post(RESPONSES_API_URL, headers=headers, json=payload, stream=True, timeout=120) as resp:
                if not resp.ok:
                    logger.error("Responses API error (%s): %s", resp.status_code, resp.text)
                    raise RuntimeError(f"ChatGPT Plan inference failed ({resp.status_code}): {resp.text}")

                for line in resp.iter_lines():
                    if not line:
                        continue
                    decoded = line.decode("utf-8")
                    if decoded.startswith("data: "):
                        raw_data = decoded[6:].strip()
                        if raw_data == "[DONE]":
                            break
                        try:
                            event = json.loads(raw_data)
                            event_type = event.get("type")

                            if event_type == "response.output_text.delta":
                                delta = event.get("delta", "")
                                assembled_text.append(delta)

                            elif event_type == "response.completed":
                                response_obj = event.get("response", {})
                                usage = response_obj.get("usage", {})
                                input_tokens = usage.get("input_tokens", 0)
                                output_tokens = usage.get("output_tokens", 0)
                                break

                            elif event_type == "error":
                                error_info = event.get("error", {})
                                code = error_info.get("code", "api_error")
                                msg = error_info.get("message", "OpenAI error")
                                logger.error("Responses API error event: %s - %s", code, msg)
                                raise RuntimeError(f"ChatGPT Plan inference failed: {code} ({msg})")

                            elif event_type == "response.failed":
                                error_info = event.get("response", {}).get("error", {})
                                code = error_info.get("code", "unknown_failure")
                                msg = error_info.get("message", "Inference failed")
                                logger.error("Responses API failed event: %s - %s", code, msg)
                                raise RuntimeError(f"ChatGPT Plan inference failed: {code} ({msg})")

                        except json.JSONDecodeError:
                            continue

        except Exception as e:
            logger.exception("Error executing ChatGPT Plan inference for user %s: %s", getattr(self.user, "email", self.user), e)
            raise

        full_content = "".join(assembled_text).strip()
        total_tokens = input_tokens + output_tokens

        return LLMResponse(
            content=full_content,
            model=self.model,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            total_tokens=total_tokens,
        )

    def _format_tools_for_responses(self, tools: list[dict]) -> list[dict]:
        """
        Formats generic tool definitions into OpenAI Responses API function tool format.
        """
        formatted = []
        for t in tools:
            # Handle tool schema with 'input_schema' or 'parameters'
            params = t.get("parameters") or t.get("input_schema") or {"type": "object", "properties": {}}
            formatted.append({
                "type": "function",
                "name": t.get("name"),
                "description": t.get("description", ""),
                "parameters": params,
            })
        return formatted

    def _build_responses_input(self, messages: list[dict], system_prompt: str = "") -> tuple[list[dict], str]:
        """
        Converts internal CRM messages (including tool calls and tool responses)
        into the format expected by OpenAI Responses API /v1/responses.
        """
        input_items = []
        for msg in messages:
            role = msg.get("role", "user")
            content = msg.get("content", "")

            if role == "system":
                if not system_prompt:
                    system_prompt = content
                else:
                    system_prompt = f"{system_prompt}\n\n{content}"
            elif role == "user":
                input_items.append({
                    "role": "user",
                    "content": content
                })
            elif role == "assistant":
                if content:
                    input_items.append({
                        "role": "assistant",
                        "content": content
                    })
                # Check for assistant tool calls
                for tc in msg.get("tool_calls", []):
                    tc_id = tc.get("id") or tc.get("call_id")
                    tc_name = tc.get("name")
                    tc_args = tc.get("arguments", {})
                    args_str = json.dumps(tc_args) if isinstance(tc_args, dict) else str(tc_args)
                    input_items.append({
                        "type": "function_call",
                        "id": tc_id,
                        "call_id": tc_id,
                        "name": tc_name,
                        "arguments": args_str,
                    })
            elif role == "tool":
                call_id = msg.get("tool_call_id") or msg.get("id")
                input_items.append({
                    "type": "function_call_output",
                    "call_id": call_id,
                    "output": str(content),
                })

        if not input_items:
            input_items.append({"role": "user", "content": "Hello"})

        return input_items, system_prompt

    def chat_with_tools(
        self,
        messages: list[dict],
        tools: list[dict],
        system_prompt: str = "",
        **kwargs
    ) -> LLMToolResponse:
        """
        Executes a tool-enabled completion using the user's ChatGPT subscription.
        Sends tools in Responses API format and parses function calls from the SSE stream.
        """
        token = get_valid_chatgpt_token(self.user)

        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        }

        input_items, sys_prompt = self._build_responses_input(messages, system_prompt)
        formatted_tools = self._format_tools_for_responses(tools)

        payload = {
            "model": self.model,
            "instructions": sys_prompt or "You are Radar 36 AI assistant. Use available tools when relevant.",
            "tools": formatted_tools,
            "input": input_items,
            "store": False,
            "stream": True,
        }

        assembled_text = []
        tool_calls: list[dict] = []
        input_tokens = 0
        output_tokens = 0

        try:
            with requests.post(RESPONSES_API_URL, headers=headers, json=payload, stream=True, timeout=120) as resp:
                if not resp.ok:
                    logger.error("Responses API error (%s): %s", resp.status_code, resp.text)
                    raise RuntimeError(f"ChatGPT Plan inference failed ({resp.status_code}): {resp.text}")

                for line in resp.iter_lines():
                    if not line:
                        continue
                    decoded = line.decode("utf-8")
                    if decoded.startswith("data: "):
                        raw_data = decoded[6:].strip()
                        if raw_data == "[DONE]":
                            break
                        try:
                            event = json.loads(raw_data)
                            event_type = event.get("type")

                            if event_type == "response.output_text.delta":
                                delta = event.get("delta", "")
                                assembled_text.append(delta)

                            elif event_type == "response.output_item.done":
                                item = event.get("item", {})
                                if item.get("type") == "function_call":
                                    call_id = item.get("id") or item.get("call_id")
                                    name = item.get("name")
                                    raw_args = item.get("arguments", "{}")
                                    if isinstance(raw_args, str):
                                        try:
                                            parsed_args = json.loads(raw_args)
                                        except Exception:
                                            parsed_args = {}
                                    else:
                                        parsed_args = raw_args or {}
                                    tool_calls.append({
                                        "id": call_id,
                                        "name": name,
                                        "arguments": parsed_args,
                                    })

                            elif event_type == "response.completed":
                                response_obj = event.get("response", {})
                                usage = response_obj.get("usage", {})
                                input_tokens = usage.get("input_tokens", 0)
                                output_tokens = usage.get("output_tokens", 0)

                                # Backup check for function calls in output array
                                if not tool_calls:
                                    for out_item in response_obj.get("output", []):
                                        if out_item.get("type") == "function_call":
                                            c_id = out_item.get("id") or out_item.get("call_id")
                                            c_name = out_item.get("name")
                                            c_args = out_item.get("arguments", "{}")
                                            if isinstance(c_args, str):
                                                try:
                                                    parsed_c_args = json.loads(c_args)
                                                except Exception:
                                                    parsed_c_args = {}
                                            else:
                                                parsed_c_args = c_args or {}
                                            tool_calls.append({
                                                "id": c_id,
                                                "name": c_name,
                                                "arguments": parsed_c_args,
                                            })
                                break

                            elif event_type == "error":
                                error_info = event.get("error", {})
                                code = error_info.get("code", "api_error")
                                msg = error_info.get("message", "OpenAI error")
                                logger.error("Responses API error event: %s - %s", code, msg)
                                raise RuntimeError(f"ChatGPT Plan inference failed: {code} ({msg})")

                            elif event_type == "response.failed":
                                error_info = event.get("response", {}).get("error", {})
                                code = error_info.get("code", "unknown_failure")
                                msg = error_info.get("message", "Inference failed")
                                logger.error("Responses API failed event: %s - %s", code, msg)
                                raise RuntimeError(f"ChatGPT Plan inference failed: {code} ({msg})")

                        except json.JSONDecodeError:
                            continue

        except Exception as e:
            logger.exception("Error executing ChatGPT Plan tool inference for user %s: %s", getattr(self.user, "email", self.user), e)
            raise

        full_content = "".join(assembled_text).strip()
        total_tokens = input_tokens + output_tokens

        return LLMToolResponse(
            content=full_content,
            tool_calls=tool_calls,
            model=self.model,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            total_tokens=total_tokens,
        )

