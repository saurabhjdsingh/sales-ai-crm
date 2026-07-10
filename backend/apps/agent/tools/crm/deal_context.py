from uuid import UUID
from apps.agent.tools.base import BaseTool, ToolParameter, ToolResult
from apps.agent.tools.registry import register_tool
from apps.ai_engine.services.context_builder import ContextBuilder


@register_tool
class DealContextTool(BaseTool):
    name = "retrieve_deal_context"
    description = "Retrieve the complete context, details, and linked contacts of a deal from the CRM."
    parameters = [
        ToolParameter(
            name="deal_id",
            type="string",
            description="The UUID of the deal to retrieve context for.",
            required=True,
        )
    ]

    def execute(self, context, deal_id: str, **kwargs) -> ToolResult:
        try:
            from apps.deals.models import Deal
            deal = None

            # 1. Check context
            if hasattr(context, "deal") and context.deal:
                deal = context.deal

            # 2. Parse UUID
            if not deal:
                try:
                    deal = Deal.objects.get(id=UUID(deal_id))
                except (ValueError, Deal.DoesNotExist):
                    pass

            # 3. Fallback search by name
            if not deal and deal_id:
                deal = Deal.objects.filter(name__icontains=deal_id).first()

            if not deal:
                return ToolResult(
                    success=False,
                    error=f"Could not find deal with ID or name '{deal_id}' in CRM. Please make sure to pass a valid UUID."
                )

            cb = ContextBuilder()
            info = cb.build_deal_context(deal.id)
            return ToolResult(
                success=True,
                data={"context": info},
                summary=f"Retrieved CRM context for deal {deal.name} ({deal.id})",
            )
        except Exception as e:
            return ToolResult(success=False, error=str(e))
