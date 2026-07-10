"""
Abstract base class for LLM providers.
All AI providers must implement this interface.
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass


from typing import Optional, List, Dict, Any


@dataclass
class LLMResponse:
    """Standard response from any LLM provider."""

    content: str
    model: str
    input_tokens: int
    output_tokens: int
    total_tokens: int


@dataclass
class LLMToolResponse:
    """Response from LLM provider supporting tool calls."""

    content: Optional[str]
    tool_calls: List[Dict[str, Any]]  # list of {"id": "...", "name": "...", "arguments": {...}}
    model: str
    input_tokens: int
    output_tokens: int
    total_tokens: int


class BaseLLMProvider(ABC):
    """
    Abstract LLM provider interface.
    Enables swapping AI providers without changing business logic.
    """

    @abstractmethod
    def chat(self, messages: list[dict], system_prompt: str = "", **kwargs) -> LLMResponse:
        """
        Send a chat completion request.

        Args:
            messages: List of dicts with 'role' and 'content' keys.
            system_prompt: Optional system-level instruction.

        Returns:
            LLMResponse with the generated content and metadata.
        """
        ...

    @abstractmethod
    def chat_with_tools(
        self,
        messages: list[dict],
        tools: list[dict],
        system_prompt: str = "",
        **kwargs
    ) -> LLMToolResponse:
        """
        Send a chat completion request with support for tool definitions.
        """
        ...

    @abstractmethod
    def get_model_name(self) -> str:
        """Return the model identifier being used."""
        ...

