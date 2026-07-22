"""
Service layer for task operations.
"""

import logging
from uuid import UUID

from django.db import transaction
from django.utils import timezone

from apps.common.enums import ActivityType, TaskStatus
from apps.common.exceptions import EntityNotFoundException
from apps.tasks.models import Task

logger = logging.getLogger(__name__)


class TaskService:
    """Business logic for task operations."""

    @staticmethod
    def get_task(task_id: UUID) -> Task:
        try:
            return Task.objects.select_related(
                "company", "contact", "deal", "owner"
            ).get(id=task_id)
        except Task.DoesNotExist:
            raise EntityNotFoundException(f"Task with id {task_id} not found.")

    @staticmethod
    def get_tasks_queryset():
        return Task.objects.select_related("company", "contact", "deal", "owner")

    @staticmethod
    @transaction.atomic
    def complete_task(task: Task, user, outcome: str = None, outcome_notes: str = "", stop_sequence: bool = False, stop_reason: str = None) -> Task:
        """Mark a task as completed with optional outcome, log activity, and trigger sequence advancement or stopping."""
        task.status = TaskStatus.COMPLETED
        task.completed_at = timezone.now()
        task.updated_by = user
        if outcome:
            task.outcome = outcome
        if outcome_notes:
            task.outcome_notes = outcome_notes
        
        task.save(update_fields=["status", "completed_at", "outcome", "outcome_notes", "updated_by", "updated_at"])

        # Log activity on the parent entity
        from apps.activities.models import Activity

        meta = {"task_id": str(task.id), "task_type": task.task_type}
        if task.outcome:
            meta["outcome"] = task.outcome
        if task.outcome_notes:
            meta["outcome_notes"] = task.outcome_notes
        if task.sequence_execution_id:
            meta["sequence_execution_id"] = str(task.sequence_execution_id)

        activity_title = f"Task completed: {task.title}"
        if task.outcome:
            activity_title += f" (Outcome: {task.get_outcome_display() if hasattr(task, 'get_outcome_display') else task.outcome})"

        Activity.objects.create(
            activity_type=ActivityType.SEQUENCE_TASK_COMPLETED if task.sequence_execution_id else ActivityType.TASK_COMPLETED,
            title=activity_title,
            description=task.outcome_notes or "",
            company=task.company,
            contact=task.contact,
            deal=task.deal,
            performed_by=user,
            metadata=meta,
            created_by=user,
        )
        logger.info("Task completed: %s (Outcome: %s) by %s", task.title, task.outcome, user.email)

        # Notify Sequence Engine if task belongs to a sequence execution
        if task.sequence_execution_id:
            try:
                from apps.sequences.services.sequence_engine import SequenceEngineService
                SequenceEngineService.handle_task_completion(task, stop_sequence=stop_sequence, stop_reason=stop_reason)
            except Exception as e:
                logger.error("Error updating sequence step on task completion: %s", e, exc_info=True)

        return task

    @staticmethod
    def get_today_tasks(user):
        """Get tasks due today for a user."""
        today = timezone.localdate()
        return Task.objects.filter(
            owner=user,
            status__in=[TaskStatus.PENDING, TaskStatus.IN_PROGRESS],
            due_date__date=today,
        ).select_related("company", "contact", "deal")

    @staticmethod
    def get_overdue_tasks(user):
        """Get overdue tasks for a user."""
        now = timezone.now()
        return Task.objects.filter(
            owner=user,
            status__in=[TaskStatus.PENDING, TaskStatus.IN_PROGRESS],
            due_date__lt=now,
        ).select_related("company", "contact", "deal")
