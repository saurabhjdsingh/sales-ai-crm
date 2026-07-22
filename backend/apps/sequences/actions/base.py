from abc import ABC, abstractmethod
from typing import NamedTuple


class ActionResult(NamedTuple):
    success: bool
    should_advance: bool
    status: str
    message: str = ""
    next_execution_at: object = None


class BaseActionHandler(ABC):
    """
    Abstract base class for all polymorphic sequence action handlers.
    Subclasses implement step execution, state transitions, and progression logic.
    """

    @abstractmethod
    def execute(self, execution) -> ActionResult:
        """
        Executes the step action.
        Returns an ActionResult indicating if execution succeeded and if enrollment should advance.
        """
        pass

    @abstractmethod
    def can_advance(self, execution) -> bool:
        """
        Returns True if execution requirements are fully met (e.g. task completed, draft approved).
        """
        pass
