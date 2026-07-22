import json
import logging
import re
from apps.ai_engine.services.copilot import get_llm_provider

logger = logging.getLogger(__name__)


class LLMProviderWrapperHelper:
    """
    Wrapper helper providing convenience methods like generate_response (json/text parsing)
    around standard LLM providers.
    """

    def __init__(self, provider):
        self.provider = provider

    def generate_response(self, system_prompt: str, prompt: str, response_format: str = "json", purpose: str = "chat", **kwargs) -> dict:
        messages = [{"role": "user", "content": prompt}]
        response = self.provider.chat(messages, system_prompt=system_prompt, purpose=purpose, **kwargs)
        content = response.content.strip()

        if response_format == "json":
            # Strip markdown ```json codeblocks if present
            clean_content = re.sub(r"^```(?:json)?\n", "", content, flags=re.IGNORECASE)
            clean_content = re.sub(r"\n```$", "", clean_content).strip()

            try:
                return json.loads(clean_content)
            except Exception as e:
                logger.warning("Failed to parse JSON response from LLM: %s. Output was: %s", e, content)
                return {
                    "subject": "Follow up regarding our conversation",
                    "body_text": content,
                    "body_html": f"<p>{content.replace(chr(10), '<br>')}</p>",
                    "context_rationale": "Generated follow-up text."
                }
        return {"text": content}


class LLMProviderFactory:
    """
    Factory to retrieve configured LLM Providers for CRM AI modules.
    """

    @staticmethod
    def get_provider(user=None) -> LLMProviderWrapperHelper:
        raw_provider = get_llm_provider(user=user)
        return LLMProviderWrapperHelper(raw_provider)
