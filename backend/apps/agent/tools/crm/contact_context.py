from uuid import UUID
from apps.agent.tools.base import BaseTool, ToolParameter, ToolResult
from apps.agent.tools.registry import register_tool
from apps.ai_engine.services.context_builder import ContextBuilder


@register_tool
class ContactContextTool(BaseTool):
    name = "retrieve_contact_context"
    description = "Retrieve the complete context and details of a contact from the CRM."
    parameters = [
        ToolParameter(
            name="contact_id",
            type="string",
            description="The UUID of the contact to retrieve context for.",
            required=True,
        )
    ]

    def execute(self, context, contact_id: str, **kwargs) -> ToolResult:
        try:
            from apps.contacts.models import Contact
            contact = None

            # 1. Check context
            if hasattr(context, "contact") and context.contact:
                contact = context.contact

            # 2. Parse UUID
            if not contact:
                try:
                    contact = Contact.objects.get(id=UUID(contact_id))
                except (ValueError, Contact.DoesNotExist):
                    pass

            # 3. Fallback search by first name, last name or full name
            if not contact and contact_id:
                parts = contact_id.split()
                if len(parts) >= 2:
                    contact = Contact.objects.filter(first_name__icontains=parts[0], last_name__icontains=parts[1]).first()
                if not contact:
                    contact = Contact.objects.filter(first_name__icontains=contact_id).first()
                if not contact:
                    contact = Contact.objects.filter(last_name__icontains=contact_id).first()

            if not contact:
                return ToolResult(
                    success=False,
                    error=f"Could not find contact with ID or name '{contact_id}' in CRM. Please make sure to pass a valid UUID."
                )

            cb = ContextBuilder()
            info = cb.build_contact_context(contact.id)
            return ToolResult(
                success=True,
                data={"context": info},
                summary=f"Retrieved CRM context for contact {contact.full_name} ({contact.id})",
            )
        except Exception as e:
            return ToolResult(success=False, error=str(e))
