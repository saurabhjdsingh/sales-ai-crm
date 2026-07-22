import logging
from django.utils import timezone
from apps.sequences.actions.base import ActionResult, BaseActionHandler
from apps.sequences.models import ExecutionStatus, EnrollmentStatus
from apps.tasks.models import Task, Notification
from apps.activities.models import Activity
from apps.common.enums import ActivityType, TaskStatus, TaskPriority, TaskType

logger = logging.getLogger(__name__)


class ManualTaskActionHandler(BaseActionHandler):
    """
    Action Handler for Manual Task steps inside a sequence.
    Creates a Task in the CRM. Sequence waits until rep completes task (and records outcome if required).
    """

    def execute(self, execution) -> ActionResult:
        enrollment = execution.enrollment
        step = execution.step
        contact = enrollment.contact
        sequence = enrollment.sequence
        if sequence and getattr(sequence, "task_assignment_strategy", None) == "sequence_owner":
            user = sequence.created_by or enrollment.enrolled_by or (contact.owner if contact else None)
        else:
            user = enrollment.enrolled_by or (sequence.created_by if sequence else None) or (contact.owner if contact else None)

        # Guard against duplicate execution / task creation
        if execution.status == ExecutionStatus.EXECUTING or getattr(execution, "task", None) or Task.objects.filter(sequence_execution_id=execution.id).exists():
            logger.info("Manual Task already created for execution %s, skipping duplicate creation", execution.id)
            return ActionResult(should_advance=False)

        logger.info("Executing Manual Task step %d for enrollment %s", step.step_number, enrollment.id)

        try:
            config = step.configuration or {}
            task_title = config.get("title", f"Sequence Task: Follow up with {contact.full_name}")
            task_desc = config.get("description", f"Sequence step {step.step_number} task for contact {contact.full_name}.")
            task_priority = config.get("priority", TaskPriority.MEDIUM)
            task_type = config.get("task_type", TaskType.CALL)
            requires_outcome = config.get("requires_outcome", True)

            # Compute due date based on config or default to 24 hours from now
            due_in_hours = config.get("due_in_hours", 24)
            due_date = timezone.now() + timezone.timedelta(hours=due_in_hours)

            # Create CRM Task
            task = Task.objects.create(
                title=task_title,
                description=task_desc,
                due_date=due_date,
                priority=task_priority,
                task_type=task_type,
                owner=user,
                status=TaskStatus.PENDING,
                requires_outcome=requires_outcome,
                sequence_execution_id=execution.id,
                contact=contact,
                company=enrollment.company or (contact.company if contact else None),
                deal=enrollment.deal,
                created_by=user,
                updated_by=user,
            )

            # Update step execution
            execution.task = task
            execution.status = ExecutionStatus.EXECUTING
            execution.executed_at = timezone.now()
            execution.save(update_fields=["task", "status", "executed_at", "updated_at"])

            enrollment.status = EnrollmentStatus.WAITING
            enrollment.save(update_fields=["status", "updated_at"])

            # In-app notification for rep
            if user:
                Notification.objects.create(
                    user=user,
                    title="Sequence Task Created",
                    message=f"Sequence '{enrollment.sequence.name}': New task '{task_title}' assigned for {contact.full_name}.",
                    notification_type="sequence_task_due",
                    related_entity_id=task.id,
                    related_entity_type="task",
                )

            # Log Activity
            Activity.objects.create(
                activity_type=ActivityType.SEQUENCE_TASK_CREATED,
                title=f"Sequence Task Created: '{task_title}'",
                description=task_desc,
                contact=contact,
                company=enrollment.company,
                deal=enrollment.deal,
                performed_by=user,
                metadata={"task_id": str(task.id), "sequence_id": str(enrollment.sequence.id)},
                created_by=user,
            )

            return ActionResult(
                success=True,
                should_advance=False,
                status=ExecutionStatus.EXECUTING,
                message=f"Task '{task_title}' created successfully."
            )

        except Exception as e:
            logger.error("Error creating Manual Task for execution %s: %s", execution.id, e, exc_info=True)
            execution.status = ExecutionStatus.FAILED
            execution.error_message = str(e)
            execution.save(update_fields=["status", "error_message", "updated_at"])

            enrollment.status = EnrollmentStatus.FAILED
            enrollment.stop_reason = f"Manual Task creation error: {str(e)}"
            enrollment.save(update_fields=["status", "stop_reason", "updated_at"])

            return ActionResult(success=False, should_advance=False, status=ExecutionStatus.FAILED, message=str(e))

    def can_advance(self, execution) -> bool:
        if execution.task:
            return execution.task.status == TaskStatus.COMPLETED
        return False
