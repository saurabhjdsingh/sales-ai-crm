from dataclasses import dataclass
from typing import Any, Optional
from uuid import UUID

from apps.ai_engine.models import AIConversation
from apps.companies.models import Company
from apps.contacts.models import Contact
from apps.deals.models import Deal


@dataclass
class AgentContext:
    """
    State context bundled for tool execution.
    """

    user: Any
    conversation: AIConversation
    entity_type: str
    entity_id: UUID
    company: Optional[Company] = None
    contact: Optional[Contact] = None
    deal: Optional[Deal] = None

    @classmethod
    def from_conversation(cls, conversation: AIConversation, user: Any) -> "AgentContext":
        """
        Build an AgentContext from an AIConversation.
        """
        context = cls(
            user=user,
            conversation=conversation,
            entity_type=conversation.entity_type,
            entity_id=conversation.company_id or conversation.contact_id or conversation.deal_id,
        )

        if conversation.company_id:
            context.company = Company.objects.filter(id=conversation.company_id).first()
        elif conversation.contact_id:
            context.contact = Contact.objects.filter(id=conversation.contact_id).first()
            if context.contact:
                context.company = context.contact.company
        elif conversation.deal_id:
            context.deal = Deal.objects.filter(id=conversation.deal_id).first()
            if context.deal:
                context.company = context.deal.company

        return context
