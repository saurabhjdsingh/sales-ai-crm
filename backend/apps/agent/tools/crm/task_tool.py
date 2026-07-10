from uuid import UUID
from apps.agent.tools.base import BaseTool, ToolParameter, ToolResult
from apps.agent.tools.registry import register_tool
from apps.tasks.models import Task
from apps.common.enums import TaskPriority, TaskStatus, TaskType
from django.utils import dateparse


@register_tool
class TaskTool(BaseTool):
    name = "manage_tasks"
    description = "List, create, or update task details in the CRM."
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
            name="task_id",
            type="string",
            description="The UUID of the task to update (Required for update).",
            required=False,
        ),
        ToolParameter(
            name="title",
            type="string",
            description="The title of the task (Required for create).",
            required=False,
        ),
        ToolParameter(
            name="description",
            type="string",
            description="Detailed task description.",
            required=False,
        ),
        ToolParameter(
            name="due_date",
            type="string",
            description="Due date in ISO-8601 format (YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS).",
            required=False,
        ),
        ToolParameter(
            name="priority",
            type="string",
            description="Task priority: 'low', 'medium', 'high', 'urgent'.",
            required=False,
            enum=["low", "medium", "high", "urgent"],
        ),
        ToolParameter(
            name="status",
            type="string",
            description="Task status: 'pending', 'in_progress', 'completed', 'cancelled'.",
            required=False,
            enum=["pending", "in_progress", "completed", "cancelled"],
        ),
        ToolParameter(
            name="task_type",
            type="string",
            description="Task type: 'call', 'email', 'linkedin', 'follow_up', 'meeting', 'review_proposal', 'other'.",
            required=False,
            enum=["call", "email", "linkedin", "follow_up", "meeting", "review_proposal", "other"],
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
                    return ToolResult(success=False, error="entity_type and entity_id are required to list tasks.")

                uuid_val = self._resolve_entity(context, entity_type, entity_id)
                if not uuid_val:
                    return ToolResult(
                        success=False,
                        error=f"Could not find {entity_type} matching '{entity_id}'. Please make sure to pass a valid UUID."
                    )

                qs = Task.objects.filter(is_deleted=False).order_by("-created_at")
                if entity_type == "company":
                    qs = qs.filter(company_id=uuid_val)
                elif entity_type == "contact":
                    qs = qs.filter(contact_id=uuid_val)
                elif entity_type == "deal":
                    qs = qs.filter(deal_id=uuid_val)

                tasks_list = []
                for t in qs:
                    tasks_list.append({
                        "id": str(t.id),
                        "title": t.title,
                        "description": t.description,
                        "due_date": t.due_date.isoformat() if t.due_date else None,
                        "priority": t.priority,
                        "status": t.status,
                        "task_type": t.task_type,
                    })

                return ToolResult(
                    success=True,
                    data={"tasks": tasks_list},
                    summary=f"Found {len(tasks_list)} tasks for {entity_type} {entity_id}",
                )

            elif action == "create":
                entity_type = kwargs.get("entity_type")
                entity_id = kwargs.get("entity_id")
                title = kwargs.get("title")
                if not entity_type or not entity_id or not title:
                    return ToolResult(success=False, error="entity_type, entity_id, and title are required to create a task.")

                uuid_val = self._resolve_entity(context, entity_type, entity_id)
                if not uuid_val:
                    return ToolResult(
                        success=False,
                        error=f"Could not find {entity_type} matching '{entity_id}'. Please make sure to pass a valid UUID."
                    )
                due_val = None
                if kwargs.get("due_date"):
                    due_val = dateparse.parse_datetime(kwargs["due_date"])
                    if not due_val:
                        due_val = dateparse.parse_date(kwargs["due_date"])

                task_kwargs = {
                    "title": title,
                    "description": kwargs.get("description", ""),
                    "due_date": due_val,
                    "priority": kwargs.get("priority", TaskPriority.MEDIUM),
                    "status": kwargs.get("status", TaskStatus.PENDING),
                    "task_type": kwargs.get("task_type", TaskType.OTHER),
                    "owner": context.user,
                    "created_by": context.user,
                }

                if entity_type == "company":
                    task_kwargs["company_id"] = uuid_val
                elif entity_type == "contact":
                    task_kwargs["contact_id"] = uuid_val
                elif entity_type == "deal":
                    task_kwargs["deal_id"] = uuid_val

                task = Task.objects.create(**task_kwargs)

                # Log activity
                from apps.activities.models import Activity
                from apps.common.enums import ActivityType
                Activity.objects.create(
                    activity_type=ActivityType.TASK_COMPLETED,  # Or standard task logging
                    title=f"Task created: {task.title}",
                    description=task.description,
                    company_id=task.company_id,
                    contact_id=task.contact_id,
                    deal_id=task.deal_id,
                    created_by=context.user,
                )

                return ToolResult(
                    success=True,
                    data={"task_id": str(task.id), "title": task.title},
                    summary=f"Task '{task.title}' created successfully.",
                )

            elif action == "update":
                task_id = kwargs.get("task_id")
                if not task_id:
                    return ToolResult(success=False, error="task_id is required to update a task.")

                task = Task.objects.get(id=UUID(task_id))
                updated_fields = ["updated_at"]

                if "title" in kwargs:
                    task.title = kwargs["title"]
                    updated_fields.append("title")
                if "description" in kwargs:
                    task.description = kwargs["description"]
                    updated_fields.append("description")
                if "due_date" in kwargs:
                    due_val = dateparse.parse_datetime(kwargs["due_date"]) if kwargs["due_date"] else None
                    task.due_date = due_val
                    updated_fields.append("due_date")
                if "priority" in kwargs:
                    task.priority = kwargs["priority"]
                    updated_fields.append("priority")
                if "status" in kwargs:
                    task.status = kwargs["status"]
                    updated_fields.append("status")
                    if task.status == TaskStatus.COMPLETED:
                        import django.utils.timezone
                        task.completed_at = django.utils.timezone.now()
                        updated_fields.append("completed_at")
                if "task_type" in kwargs:
                    task.task_type = kwargs["task_type"]
                    updated_fields.append("task_type")

                task.updated_by = context.user
                updated_fields.append("updated_by")
                task.save(update_fields=updated_fields)

                return ToolResult(
                    success=True,
                    data={"task_id": str(task.id), "status": task.status},
                    summary=f"Task '{task.title}' updated successfully.",
                )

        except Exception as e:
            return ToolResult(success=False, error=str(e))
