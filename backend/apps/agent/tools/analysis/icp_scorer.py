import json
import logging
from uuid import UUID

from apps.agent.enums import InsightCategory
from apps.agent.models import ResearchInsight, ResearchRun
from apps.agent.tools.base import BaseTool, ToolParameter, ToolResult
from apps.agent.tools.registry import register_tool
from apps.ai_engine.services.copilot import get_llm_provider
from apps.ai_engine.services.prompt_service import PromptService
from apps.common.enums import ResearchStatus
from apps.companies.models import Company

logger = logging.getLogger(__name__)


@register_tool
class ICPScorerTool(BaseTool):
    name = "score_company_icp"
    description = "Analyze all available research insights to calculate and write the ICP match score (0-100) and fit explanations for a company."
    parameters = [
        ToolParameter(
            name="company_id",
            type="string",
            description="The UUID of the company to evaluate.",
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

            # Compile all compiled insights
            insights_str = ""
            run = ResearchRun.objects.filter(
                company=company,
                status=ResearchStatus.COMPLETED
            ).first()
            
            if run:
                insights = run.insights.all()
                insights_str = "\n".join(f"- [{i.category}] {i.content}" for i in insights)

            # Build prompt
            user_prompt = (
                f"Score this company based on the available information:\n"
                f"Name: {company.name}\n"
                f"Industry: {company.industry or 'Unknown'}\n"
                f"Size: {company.company_size or 'Unknown'}\n"
                f"Country: {company.country or 'Unknown'}\n"
                f"Description: {company.description or 'No description'}\n"
                f"Website: {company.website or 'No website'}\n\n"
                f"Compiled Research Insights:\n{insights_str or 'None'}"
            )

            provider = get_llm_provider(user=context.user)
            icp_system = PromptService.get_prompt(context.user, "icp_system")
            response = provider.chat(
                messages=[{"role": "user", "content": user_prompt}],
                system_prompt=icp_system,
            )

            content = response.content.strip()
            if content.startswith("```"):
                lines = content.split("\n")
                content = "\n".join(lines[1:-1]) if lines[-1].strip() == "```" else "\n".join(lines[1:])
                content = content.strip()

            try:
                data = json.loads(content)
            except json.JSONDecodeError:
                logger.warning("Failed to parse ICP scoring response as JSON")
                return ToolResult(success=False, error="Could not parse ICP score JSON response.")

            score = min(max(int(data.get("score", 0)), 0), 100)
            explanation = data.get("explanation", "")

            # Save to Company
            company.icp_score = score
            company.icp_explanation = explanation
            company.save(update_fields=["icp_score", "icp_explanation", "updated_at"])

            # Save insight to the run if active
            if run:
                ResearchInsight.objects.create(
                    run=run,
                    category=InsightCategory.GROWTH_SIGNALS,
                    content=f"ICP Fit Score: {score}/100. Reason: {explanation}",
                    confidence=1.0,
                    created_by=context.user,
                )

            summary = f"Calculated ICP score for {company.name}: {score}/100"
            return ToolResult(
                success=True,
                data={
                    "score": score,
                    "explanation": explanation,
                    "breakdown": data.get("breakdown", {}),
                },
                summary=summary,
            )

        except Exception as e:
            logger.exception("ICP scoring tool failed")
            return ToolResult(success=False, error=str(e))
