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
    def complete_task(task: Task, user) -> Task:
        """Mark a task as completed and log the activity."""
        task.status = TaskStatus.COMPLETED
        task.completed_at = timezone.now()
        task.updated_by = user
        task.save(update_fields=["status", "completed_at", "updated_by", "updated_at"])

        # Log activity on the parent entity
        from apps.activities.models import Activity

        Activity.objects.create(
            activity_type=ActivityType.TASK_COMPLETED,
            title=f"Task completed: {task.title}",
            company=task.company,
            contact=task.contact,
            deal=task.deal,
            performed_by=user,
            metadata={"task_id": str(task.id), "task_type": task.task_type},
            created_by=user,
        )
        logger.info("Task completed: %s by %s", task.title, user.email)
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
