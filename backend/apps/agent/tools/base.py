from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from apps.agent.enums import PermissionLevel


@dataclass
class ToolResult:
    """
    Standard result returned by any agent tool execution.
    """

    success: bool
    data: Dict[str, Any] = field(default_factory=dict)
    summary: str = ""
    error: str = ""
    requires_approval: bool = False
    approval_payload: Dict[str, Any] = field(default_factory=dict)


@dataclass
class ToolParameter:
    """
    Defines a single parameter for a tool, conforming to JSON Schema.
    """

    name: str
    type: str  # string, integer, boolean, array, object
    description: str
    required: bool = True
    enum: Optional[List[Any]] = None
    items: Optional[Dict[str, Any]] = None  # for arrays


class BaseTool(ABC):
    """
    Abstract base class for all Agent Tools.
    """

    name: str = ""
    description: str = ""
    parameters: List[ToolParameter] = []
    permission_level: PermissionLevel = PermissionLevel.READ_ONLY

    @abstractmethod
    def execute(self, context: Any, **kwargs) -> ToolResult:
        """
        Execute the tool action.

        Args:
            context: AgentContext containing user, conversation, company, etc.
            **kwargs: Arguments passed to the tool.

        Returns:
            ToolResult object.
        """
        pass

    def get_schema(self) -> Dict[str, Any]:
        """
        Return the JSON Schema representation of the tool.
        Conforms to OpenAI / Anthropic function calling format.
        """
        properties = {}
        required = []

        for param in self.parameters:
            param_schema = {
                "type": param.type,
                "description": param.description,
            }
            if param.enum:
                param_schema["enum"] = param.enum
            if param.items:
                param_schema["items"] = param.items

            properties[param.name] = param_schema
            if param.required:
                required.append(param.name)

        return {
            "name": self.name,
            "description": self.description,
            "input_schema": {
                "type": "object",
                "properties": properties,
                "required": required,
            },
        }
