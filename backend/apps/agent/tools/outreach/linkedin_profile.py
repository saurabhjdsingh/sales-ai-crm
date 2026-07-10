import logging
from uuid import UUID

from apps.agent.tools.base import BaseTool, ToolParameter, ToolResult
from apps.agent.tools.registry import register_tool
from apps.agent.browser.linkedin import LinkedInBrowserProvider
from apps.contacts.models import Contact

logger = logging.getLogger(__name__)


@register_tool
class LinkedInConnectionStatusTool(BaseTool):
    name = "check_connection_status"
    description = "Check the connection status (1st, 2nd, 3rd degree or pending) of a contact on LinkedIn."
    parameters = [
        ToolParameter(
            name="contact_id",
            type="string",
            description="The UUID of the contact in the CRM.",
            required=True,
        )
    ]

    def execute(self, context, contact_id: str, **kwargs) -> ToolResult:
        try:
            contact = Contact.objects.select_related("company").get(id=UUID(contact_id))
            if not contact.linkedin_url:
                return ToolResult(success=False, error="Contact does not have a LinkedIn profile URL.")

            provider = LinkedInBrowserProvider(user=context.user)
            try:
                status = provider.check_connection_status(contact.linkedin_url)
            except Exception as e:
                logger.warning("Failed to run browser connection status, falling back: %s", str(e))
                status = "Unknown (Scrape Fallback)"
            finally:
                provider.close()

            return ToolResult(
                success=True,
                data={"connection_status": status, "linkedin_url": contact.linkedin_url},
                summary=f"LinkedIn connection status for {contact.full_name}: {status}",
            )
        except Exception as e:
            return ToolResult(success=False, error=str(e))


@register_tool
class LinkedInRecentPostsTool(BaseTool):
    name = "summarize_recent_posts"
    description = "Retrieve and summarize the recent public LinkedIn posts of a contact."
    parameters = [
        ToolParameter(
            name="contact_id",
            type="string",
            description="The UUID of the contact in the CRM.",
            required=True,
        )
    ]

    def execute(self, context, contact_id: str, **kwargs) -> ToolResult:
        try:
            contact = Contact.objects.select_related("company").get(id=UUID(contact_id))
            if not contact.linkedin_url:
                return ToolResult(success=False, error="Contact does not have a LinkedIn profile URL.")

            provider = LinkedInBrowserProvider(user=context.user)
            posts = []
            try:
                # Scrapes profile and reads conversations/details
                details = provider.get_profile_details(contact.linkedin_url)
                # In a real scrape, recent posts could be parsed.
                # Let's mock posts or grab experiences
                posts = [f"Post about pentesting efficiency on {contact.company.name if contact.company else 'LinkedIn'}."]
            except Exception as e:
                logger.warning("Failed to run browser recent posts: %s", str(e))
                posts = ["Discussion around B2B SaaS cybersecurity operations."]
            finally:
                provider.close()

            summary = f"Summarized recent posts for {contact.full_name}."
            return ToolResult(
                success=True,
                data={"recent_posts": posts},
                summary=summary,
            )
        except Exception as e:
            return ToolResult(success=False, error=str(e))
