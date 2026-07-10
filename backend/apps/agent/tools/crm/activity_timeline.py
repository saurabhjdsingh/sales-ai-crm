from uuid import UUID
from apps.agent.tools.base import BaseTool, ToolParameter, ToolResult
from apps.agent.tools.registry import register_tool
from apps.activities.models import Activity


@register_tool
class ActivityTimelineTool(BaseTool):
    name = "retrieve_activity_timeline"
    description = "Retrieve the recent activity timeline/history for a specific company, contact, or deal in the CRM."
    parameters = [
        ToolParameter(
            name="entity_type",
            type="string",
            description="The type of entity: 'company', 'contact', or 'deal'.",
            required=True,
            enum=["company", "contact", "deal"],
        ),
        ToolParameter(
            name="entity_id",
            type="string",
            description="The UUID of the entity.",
            required=True,
        ),
        ToolParameter(
            name="limit",
            type="integer",
            description="Maximum number of activities to return (default 20).",
            required=False,
        ),
    ]

    def execute(self, context, entity_type: str, entity_id: str, limit: int = 20, **kwargs) -> ToolResult:
        try:
            target_id = None

            # 1. Check context
            if entity_type == "company" and hasattr(context, "company") and context.company:
                target_id = context.company.id
            elif entity_type == "contact" and hasattr(context, "contact") and context.contact:
                target_id = context.contact.id
            elif entity_type == "deal" and hasattr(context, "deal") and context.deal:
                target_id = context.deal.id

            # 2. Try to parse as UUID
            if not target_id:
                try:
                    target_id = UUID(entity_id)
                except ValueError:
                    pass

            # 3. Fallback name search
            if not target_id and entity_id:
                if entity_type == "company":
                    from apps.companies.models import Company
                    obj = Company.objects.filter(name__icontains=entity_id).first()
                    if obj:
                        target_id = obj.id
                elif entity_type == "contact":
                    from apps.contacts.models import Contact
                    parts = entity_id.split()
                    if len(parts) >= 2:
                        obj = Contact.objects.filter(first_name__icontains=parts[0], last_name__icontains=parts[1]).first()
                    else:
                        obj = Contact.objects.filter(first_name__icontains=entity_id).first() or Contact.objects.filter(last_name__icontains=entity_id).first()
                    if obj:
                        target_id = obj.id
                elif entity_type == "deal":
                    from apps.deals.models import Deal
                    obj = Deal.objects.filter(name__icontains=entity_id).first()
                    if obj:
                        target_id = obj.id

            if not target_id:
                return ToolResult(
                    success=False,
                    error=f"Could not find {entity_type} matching '{entity_id}'. Please make sure to pass a valid UUID."
                )

            qs = Activity.objects.select_related("performed_by").order_by("-created_at")

            if entity_type == "company":
                qs = qs.filter(company_id=target_id)
            elif entity_type == "contact":
                qs = qs.filter(contact_id=target_id)
            elif entity_type == "deal":
                qs = qs.filter(deal_id=target_id)

            activities = qs[:limit]
            serialized_activities = []
            for act in activities:
                serialized_activities.append({
                    "id": str(act.id),
                    "activity_type": act.activity_type,
                    "title": act.title,
                    "description": act.description,
                    "metadata": act.metadata,
                    "performed_by": act.performed_by.get_full_name() if act.performed_by else "System",
                    "created_at": act.created_at.strftime("%Y-%m-%d %H:%M:%S"),
                })

            summary = f"Retrieved {len(serialized_activities)} activities for {entity_type} {entity_id}"
            return ToolResult(
                success=True,
                data={"activities": serialized_activities},
                summary=summary,
            )
        except Exception as e:
            return ToolResult(success=False, error=str(e))
