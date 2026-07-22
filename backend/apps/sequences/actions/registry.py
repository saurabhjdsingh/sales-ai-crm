from typing import Dict, Type
from apps.sequences.actions.base import BaseActionHandler
from apps.sequences.actions.ai_email import AIEmailActionHandler
from apps.sequences.actions.manual_task import ManualTaskActionHandler
from apps.sequences.actions.wait import WaitActionHandler
from apps.sequences.actions.update_stage import UpdateStageActionHandler
from apps.sequences.models import SequenceActionType


class ActionHandlerRegistry:
    """
    Extensible polymorphic Action Handler Registry.
    Maps Action Types to their corresponding ActionHandler implementations.
    Adding a new action type (e.g. LinkedIn, Phone, Webhook) requires only adding
    a new Handler implementation and registering it here.
    """

    _registry: Dict[str, BaseActionHandler] = {
        SequenceActionType.AI_EMAIL: AIEmailActionHandler(),
        SequenceActionType.MANUAL_TASK: ManualTaskActionHandler(),
        SequenceActionType.WAIT: WaitActionHandler(),
        SequenceActionType.UPDATE_STAGE: UpdateStageActionHandler(),
    }

    @classmethod
    def get_handler(cls, action_type: str) -> BaseActionHandler:
        handler = cls._registry.get(action_type)
        if not handler:
            raise ValueError(f"No action handler registered for action_type '{action_type}'")
        return handler

    @classmethod
    def register_handler(cls, action_type: str, handler: BaseActionHandler):
        cls._registry[action_type] = handler
