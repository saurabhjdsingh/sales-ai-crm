from uuid import UUID
from apps.agent.tools.base import BaseTool, ToolParameter, ToolResult
from apps.agent.tools.registry import register_tool
from apps.ai_engine.services.context_builder import ContextBuilder


@register_tool
class CompanyContextTool(BaseTool):
    name = "retrieve_company_context"
    description = "Retrieve the complete context, details, contacts, deals, tasks, notes, and activity timeline of a company from the CRM."
    parameters = [
        ToolParameter(
            name="company_id",
            type="string",
            description="The UUID of the company to retrieve context for.",
            required=True,
        )
    ]

    def execute(self, context, company_id: str, **kwargs) -> ToolResult:
        try:
            from apps.companies.models import Company
            company = None

            # 1. Check context
            if hasattr(context, "company") and context.company:
                company = context.company

            # 2. Parse UUID
            if not company:
                try:
                    company = Company.objects.get(id=UUID(company_id))
                except (ValueError, Company.DoesNotExist):
                    pass

            # 3. Fallback name search
            if not company and company_id:
                company = Company.objects.filter(name__icontains=company_id).first()

            if not company:
                return ToolResult(
                    success=False,
                    error=f"Could not find company with ID or name '{company_id}' in CRM. Please make sure to pass a valid UUID."
                )

            cb = ContextBuilder()
            info = cb.build_company_context(company.id)
            return ToolResult(
                success=True,
                data={"context": info},
                summary=f"Retrieved CRM context for company {company.name} ({company.id})",
            )
        except Exception as e:
            return ToolResult(success=False, error=str(e))
