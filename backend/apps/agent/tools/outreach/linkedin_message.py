import logging
from uuid import UUID

from apps.agent.enums import PermissionLevel
from apps.agent.tools.base import BaseTool, ToolParameter, ToolResult
from apps.agent.tools.registry import register_tool
from apps.ai_engine.services.copilot import get_llm_provider
from apps.contacts.models import Contact

logger = logging.getLogger(__name__)


@register_tool
class LinkedInMessageTool(BaseTool):
    name = "generate_linkedin_message"
    description = "Generate a personalized direct message for a LinkedIn connection and draft the direct message action for user approval."
    parameters = [
        ToolParameter(
            name="contact_id",
            type="string",
            description="The UUID of the contact in the CRM.",
            required=True,
        ),
        ToolParameter(
            name="custom_prompt",
            type="string",
            description="Optional specific instructions, guidelines, or points to emphasize in the message.",
            required=False,
        )
    ]
    permission_level = PermissionLevel.EXTERNAL_ACTION

    def execute(self, context, contact_id: str, custom_prompt: str = "", **kwargs) -> ToolResult:
        try:
            contact = Contact.objects.select_related("company").get(id=UUID(contact_id))
            if not contact.linkedin_url:
                return ToolResult(success=False, error=f"Contact '{contact.full_name}' does not have a LinkedIn profile URL in CRM.")

            # Compile context
            company_info = f"Company: {contact.company.name}. Industry: {contact.company.industry}. Description: {contact.company.description[:200]}" if contact.company else ""
            
            user_prompt = (
                f"Write a personalized LinkedIn Direct Message (DM) to:\n"
                f"Prospect: {contact.full_name}\n"
                f"Job Title: {contact.job_title}\n"
                f"{company_info}\n"
                f"Additional context/instructions: {custom_prompt or 'None'}\n\n"
                f"Format it as a short, high-conversion outbound message. Speak to cybersecurity challenges or pentesting operations. Keep it under 1000 characters."
            )

            system_prompt = (
                "You are an expert sales representative writing outbound LinkedIn DMs.\n"
                "Write a concise, engaging message that invites a conversation.\n"
                "Do not include placeholders. Write the actual message body."
            )

            provider = get_llm_provider(user=context.user)
            response = provider.chat(
                messages=[{"role": "user", "content": user_prompt}],
                system_prompt=system_prompt,
            )

            generated_message = response.content.strip()

            # Construct action payload for background execution upon approval
            approval_payload = {
                "action_type": "send_linkedin_message",
                "contact_id": str(contact.id),
                "linkedin_url": contact.linkedin_url,
                "message": generated_message,
            }

            summary = f"Prepared personalized LinkedIn direct message for {contact.full_name}."
            
            return ToolResult(
                success=True,
                data={
                    "draft": generated_message,
                    "linkedin_url": contact.linkedin_url,
                    "contact_name": contact.full_name,
                },
                summary=summary,
                requires_approval=True,
                approval_payload=approval_payload,
            )

        except Exception as e:
            logger.exception("LinkedIn message tool failed")
            return ToolResult(success=False, error=str(e))
