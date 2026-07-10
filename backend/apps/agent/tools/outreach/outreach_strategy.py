import logging
from uuid import UUID

from apps.agent.tools.base import BaseTool, ToolParameter, ToolResult
from apps.agent.tools.registry import register_tool
from apps.ai_engine.services.copilot import get_llm_provider
from apps.companies.models import Company
from apps.contacts.models import Contact

logger = logging.getLogger(__name__)


@register_tool
class OutreachStrategyTool(BaseTool):
    name = "prepare_outreach_strategy"
    description = "Generate a personalized outreach sequence and strategy (emails, messages) for a company or contact."
    parameters = [
        ToolParameter(
            name="entity_type",
            type="string",
            description="The type of entity: 'company' or 'contact'.",
            required=True,
            enum=["company", "contact"],
        ),
        ToolParameter(
            name="entity_id",
            type="string",
            description="The UUID of the company or contact.",
            required=True,
        )
    ]

    def execute(self, context, entity_type: str, entity_id: str, **kwargs) -> ToolResult:
        try:
            target_name = ""
            details_str = ""

            if entity_type == "company":
                company = Company.objects.get(id=UUID(entity_id))
                target_name = company.name
                details_str = (
                    f"Company: {company.name}\n"
                    f"Industry: {company.industry or 'Unknown'}\n"
                    f"Size: {company.company_size or 'Unknown'}\n"
                    f"Description: {company.description or 'No description'}\n"
                    f"ICP Score: {company.icp_score or 'Not scored'}\n"
                )
            else:
                contact = Contact.objects.select_related("company").get(id=UUID(entity_id))
                target_name = contact.full_name
                details_str = (
                    f"Contact Name: {contact.full_name}\n"
                    f"Job Title: {contact.job_title or 'Unknown'}\n"
                    f"Company: {contact.company.name if contact.company else 'N/A'}\n"
                    f"Email: {contact.email or 'N/A'}\n"
                )

            user_prompt = (
                f"Prepare a multi-step outreach sequence for {target_name}.\n"
                f"Details:\n{details_str}\n"
                f"Please generate a Day 1 LinkedIn request, a Day 3 Email outreach, and a Day 7 Follow-up phone script."
            )

            system_prompt = (
                "You are an expert sales outreach coach for Radar 36.\n"
                "Radar 36 provides vulnerability management software to security consulting firms, MSSPs, and pentest teams.\n"
                "Generate a highly tailored multi-step sales outreach sequence.\n"
                "Structure the output in markdown format with clear headings."
            )

            provider = get_llm_provider(user=context.user)
            response = provider.chat(
                messages=[{"role": "user", "content": user_prompt}],
                system_prompt=system_prompt,
            )

            strategy_text = response.content.strip()

            return ToolResult(
                success=True,
                data={"outreach_strategy": strategy_text},
                summary=f"Outreach strategy sequence prepared for {target_name}.",
            )

        except Exception as e:
            logger.exception("Outreach strategy tool failed")
            return ToolResult(success=False, error=str(e))
