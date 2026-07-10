from uuid import UUID
from apps.agent.tools.base import BaseTool, ToolParameter, ToolResult
from apps.agent.tools.registry import register_tool
from apps.notes.models import Note


@register_tool
class NotesTool(BaseTool):
    name = "manage_notes"
    description = "List, create, or update notes associated with a company, contact, or deal in the CRM."
    parameters = [
        ToolParameter(
            name="action",
            type="string",
            description="The action to perform: 'list', 'create', or 'update'.",
            required=True,
            enum=["list", "create", "update"],
        ),
        ToolParameter(
            name="entity_type",
            type="string",
            description="The type of entity: 'company', 'contact', or 'deal'. (Required for list/create)",
            required=False,
            enum=["company", "contact", "deal"],
        ),
        ToolParameter(
            name="entity_id",
            type="string",
            description="The UUID of the company, contact, or deal.",
            required=False,
        ),
        ToolParameter(
            name="note_id",
            type="string",
            description="The UUID of the note to update (Required for update).",
            required=False,
        ),
        ToolParameter(
            name="content",
            type="string",
            description="The content of the note (Markdown format supported. Required for create).",
            required=False,
        ),
        ToolParameter(
            name="is_pinned",
            type="boolean",
            description="Pin the note to the top of the detail page.",
            required=False,
        ),
    ]

    def _resolve_entity(self, context, entity_type: str, entity_id: str) -> UUID:
        # 1. Check context
        if entity_type == "company" and hasattr(context, "company") and context.company:
            return context.company.id
        elif entity_type == "contact" and hasattr(context, "contact") and context.contact:
            return context.contact.id
        elif entity_type == "deal" and hasattr(context, "deal") and context.deal:
            return context.deal.id

        # 2. Try to parse as UUID
        if entity_id:
            try:
                return UUID(entity_id)
            except ValueError:
                pass

        # 3. Fallback name search
        if entity_id:
            if entity_type == "company":
                from apps.companies.models import Company
                obj = Company.objects.filter(name__icontains=entity_id).first()
                if obj:
                    return obj.id
            elif entity_type == "contact":
                from apps.contacts.models import Contact
                parts = entity_id.split()
                if len(parts) >= 2:
                    obj = Contact.objects.filter(first_name__icontains=parts[0], last_name__icontains=parts[1]).first()
                else:
                    obj = Contact.objects.filter(first_name__icontains=entity_id).first() or Contact.objects.filter(last_name__icontains=entity_id).first()
                if obj:
                    return obj.id
            elif entity_type == "deal":
                from apps.deals.models import Deal
                obj = Deal.objects.filter(name__icontains=entity_id).first()
                if obj:
                    return obj.id
        return None

    def execute(self, context, action: str, **kwargs) -> ToolResult:
        try:
            if action == "list":
                entity_type = kwargs.get("entity_type")
                entity_id = kwargs.get("entity_id")
                if not entity_type or not entity_id:
                    return ToolResult(success=False, error="entity_type and entity_id are required to list notes.")

                uuid_val = self._resolve_entity(context, entity_type, entity_id)
                if not uuid_val:
                    return ToolResult(
                        success=False,
                        error=f"Could not find {entity_type} matching '{entity_id}'. Please make sure to pass a valid UUID."
                    )

                qs = Note.objects.filter(is_deleted=False).order_by("-is_pinned", "-created_at")

                if entity_type == "company":
                    qs = qs.filter(company_id=uuid_val)
                elif entity_type == "contact":
                    qs = qs.filter(contact_id=uuid_val)
                elif entity_type == "deal":
                    qs = qs.filter(deal_id=uuid_val)

                notes_list = []
                for n in qs:
                    notes_list.append({
                        "id": str(n.id),
                        "content": n.content,
                        "is_pinned": n.is_pinned,
                        "created_at": n.created_at.strftime("%Y-%m-%d %H:%M:%S"),
                        "created_by": n.created_by.get_full_name() if n.created_by else "Unknown",
                    })

                return ToolResult(
                    success=True,
                    data={"notes": notes_list},
                    summary=f"Found {len(notes_list)} notes for {entity_type} {entity_id}",
                )

            elif action == "create":
                entity_type = kwargs.get("entity_type")
                entity_id = kwargs.get("entity_id")
                content = kwargs.get("content")
                if not entity_type or not entity_id or not content:
                    return ToolResult(success=False, error="entity_type, entity_id, and content are required to create a note.")

                uuid_val = self._resolve_entity(context, entity_type, entity_id)
                if not uuid_val:
                    return ToolResult(
                        success=False,
                        error=f"Could not find {entity_type} matching '{entity_id}'. Please make sure to pass a valid UUID."
                    )
                note_kwargs = {
                    "content": content,
                    "is_pinned": kwargs.get("is_pinned", False),
                    "created_by": context.user,
                    "updated_by": context.user,
                }

                if entity_type == "company":
                    note_kwargs["company_id"] = uuid_val
                elif entity_type == "contact":
                    note_kwargs["contact_id"] = uuid_val
                elif entity_type == "deal":
                    note_kwargs["deal_id"] = uuid_val

                note = Note.objects.create(**note_kwargs)

                # Log activity
                from apps.activities.models import Activity
                from apps.common.enums import ActivityType
                Activity.objects.create(
                    activity_type=ActivityType.NOTE,
                    title=f"Note added",
                    description=note.content[:200] + ("..." if len(note.content) > 200 else ""),
                    company_id=note.company_id,
                    contact_id=note.contact_id,
                    deal_id=note.deal_id,
                    created_by=context.user,
                )

                return ToolResult(
                    success=True,
                    data={"note_id": str(note.id)},
                    summary="Note created successfully.",
                )

            elif action == "update":
                note_id = kwargs.get("note_id")
                if not note_id:
                    return ToolResult(success=False, error="note_id is required to update a note.")

                note = Note.objects.get(id=UUID(note_id))
                updated_fields = ["updated_at"]

                if "content" in kwargs:
                    note.content = kwargs["content"]
                    updated_fields.append("content")
                if "is_pinned" in kwargs:
                    note.is_pinned = kwargs["is_pinned"]
                    updated_fields.append("is_pinned")

                note.updated_by = context.user
                updated_fields.append("updated_by")
                note.save(update_fields=updated_fields)

                return ToolResult(
                    success=True,
                    data={"note_id": str(note.id)},
                    summary="Note updated successfully.",
                )

        except Exception as e:
            return ToolResult(success=False, error=str(e))
