import logging
import threading
from typing import Dict, List, Type, Dict

from apps.agent.tools.base import BaseTool

logger = logging.getLogger(__name__)


class ToolRegistry:
    """
    Registry for managing and discovering agent tools.
    """

    def __init__(self):
        self._tools: Dict[str, BaseTool] = {}
        self._lock = threading.Lock()

    def register(self, tool_instance: BaseTool) -> None:
        """
        Register a tool instance.
        """
        with self._lock:
            if tool_instance.name in self._tools:
                logger.warning("Overwriting registered tool: %s", tool_instance.name)
            self._tools[tool_instance.name] = tool_instance
            logger.debug("Registered tool: %s", tool_instance.name)

    def get_tool(self, name: str) -> BaseTool:
        """
        Retrieve a tool by name.
        """
        if name not in self._tools:
            raise KeyError(f"Tool '{name}' is not registered.")
        return self._tools[name]

    def get_all_tools(self) -> List[BaseTool]:
        """
        Get all registered tool instances.
        """
        return list(self._tools.values())

    def get_tool_definitions(self) -> List[dict]:
        """
        Get tool schemas in LLM-compatible format.
        """
        return [tool.get_schema() for tool in self.get_all_tools()]


# Global ToolRegistry instance
tool_registry = ToolRegistry()


def register_tool(tool_class: Type[BaseTool]):
    """
    Decorator to automatically register a tool class.
    Instantiates and registers the tool.
    """
    try:
        instance = tool_class()
        tool_registry.register(instance)
    except Exception as e:
        logger.error("Failed to register tool class %s: %s", tool_class.__name__, str(e))
    return tool_class
