import json
import logging
from uuid import UUID

from apps.agent.models import ResearchRun, ResearchSummary
from apps.agent.tools.base import BaseTool, ToolParameter, ToolResult
from apps.agent.tools.registry import register_tool
from apps.ai_engine.services.copilot import get_llm_provider
from apps.common.enums import ResearchStatus
from apps.companies.models import Company

logger = logging.getLogger(__name__)


@register_tool
class SalesStrategyTool(BaseTool):
    name = "generate_sales_strategy"
    description = "Generate a comprehensive outbound sales strategy, Objections, DEMO checklist, Outreach copy, and follow-up cadence for a target company."
    parameters = [
        ToolParameter(
            name="company_id",
            type="string",
            description="The UUID of the company to build a strategy for.",
            required=True,
        )
    ]

    def execute(self, context, company_id: str, **kwargs) -> ToolResult:
        try:
            company = None

            # 1. Try to resolve via context
            if hasattr(context, "company") and context.company:
                company = context.company

            # 2. Try to resolve via company_id as UUID
            if not company:
                try:
                    company = Company.objects.get(id=UUID(company_id))
                except (ValueError, Company.DoesNotExist):
                    pass

            # 3. Try to resolve via company_id as name search
            if not company and company_id:
                company = Company.objects.filter(name__icontains=company_id).first()

            if not company:
                return ToolResult(
                    success=False,
                    error=f"Could not find company with ID or name '{company_id}'. Please make sure to pass a valid company UUID."
                )

            # Compile research
            insights_str = ""
            run = ResearchRun.objects.filter(
                company=company,
                status=ResearchStatus.COMPLETED
            ).first()
            if not run:
                # If completed not found, check in-progress/pending
                run = ResearchRun.objects.filter(
                    company=company
                ).order_by("-created_at").first()

            if run:
                insights = run.insights.all()
                insights_str = "\n".join(f"- [{i.category}] {i.content}" for i in insights)

            # Build prompt
            user_prompt = (
                f"Generate a customized sales strategy for:\n"
                f"Company: {company.name}\n"
                f"Industry: {company.industry or 'Unknown'}\n"
                f"ICP Score: {company.icp_score or 'Not scored'}\n"
                f"Description: {company.description or 'No description'}\n\n"
                f"Available Research Insights:\n{insights_str or 'None'}"
            )

            system_prompt = (
                "You are an enterprise B2B sales strategist specializing in cybersecurity tools.\n"
                "Analyze the target company details and generate a JSON response with the following fields:\n"
                "{\n"
                "  \"decision_makers\": [\"list of roles/departments to target\"],\n"
                "  \"likely_objections\": [\n"
                "     {\"objection\": \"Objection text\", \"counter_strategy\": \"How to answer\"}\n"
                "  ],\n"
                "  \"pain_points\": [\"specific pain points related to security operations or reporting\"],\n"
                "  \"discovery_questions\": [\"suggested questions for a sales call\"],\n"
                "  \"outreach_channels\": [\"recommended outreach channels\"],\n"
                "  \"demo_strategy\": \"special customized demo focus points\",\n"
                "  \"closing_strategy\": \"strategy to win the contract\",\n"
                "  \"email_copy\": \"outbound email draft matching pain points\",\n"
                "  \"linkedin_copy\": \"short connection note draft matching pain points\",\n"
                "  \"follow_up_cadence\": [\"day 1, day 3, day 7 touchpoint instructions\"]\n"
                "}\n"
                "Return ONLY valid raw JSON without markdown blocks."
            )

            provider = get_llm_provider(user=context.user)
            response = provider.chat(
                messages=[{"role": "user", "content": user_prompt}],
                system_prompt=system_prompt,
            )

            content = response.content.strip()
            if content.startswith("```"):
                lines = content.split("\n")
                content = "\n".join(lines[1:-1]) if lines[-1].strip() == "```" else "\n".join(lines[1:])
                content = content.strip()

            try:
                strategy_data = json.loads(content)
            except json.JSONDecodeError:
                logger.warning("Failed to decode strategy response JSON")
                strategy_data = {}

            # Save ResearchSummary
            if run:
                summary_record, created = ResearchSummary.objects.get_or_create(
                    run=run,
                    defaults={
                        "executive_summary": strategy_data.get("closing_strategy", ""),
                        "sales_strategy": strategy_data,
                        "created_by": context.user,
                    }
                )
                if not created:
                    summary_record.executive_summary = strategy_data.get("closing_strategy", "")
                    summary_record.sales_strategy = strategy_data
                    summary_record.updated_by = context.user
                    summary_record.save()

            return ToolResult(
                success=True,
                data=strategy_data,
                summary=f"Sales strategy generated successfully for {company.name}.",
            )

        except Exception as e:
            logger.exception("Sales strategy tool failed")
            return ToolResult(success=False, error=str(e))
