"""
Task model for Radar 36 CRM.
Tasks can belong to a company, contact, or deal.
"""

from django.conf import settings
from django.db import models

from apps.common.enums import TaskPriority, TaskRepeat, TaskStatus, TaskType
from apps.common.models import BaseModel


class Task(BaseModel):
    """
    Represents a task/to-do item in the CRM.
    Polymorphic association — can link to company, contact, or deal.
    """

    title = models.CharField(max_length=255)
    description = models.TextField(blank=True, default="")
    due_date = models.DateTimeField(null=True, blank=True, db_index=True)
    reminder_at = models.DateTimeField(null=True, blank=True, db_index=True)
    priority = models.CharField(
        max_length=10,
        choices=TaskPriority.choices,
        default=TaskPriority.MEDIUM,
    )
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="assigned_tasks",
    )
    status = models.CharField(
        max_length=15,
        choices=TaskStatus.choices,
        default=TaskStatus.PENDING,
        db_index=True,
    )
    task_type = models.CharField(
        max_length=20,
        choices=TaskType.choices,
        default=TaskType.OTHER,
    )
    repeat = models.CharField(
        max_length=10,
        choices=TaskRepeat.choices,
        default=TaskRepeat.NONE,
    )
    completed_at = models.DateTimeField(null=True, blank=True)

    # Task Outcome support for Sequences and Sales Workflow
    outcome = models.CharField(
        max_length=50,
        blank=True,
        null=True,
        db_index=True,
        help_text="Structured task completion outcome (e.g. Answered, Voicemail, Requested Callback)",
    )
    outcome_notes = models.TextField(blank=True, default="")
    requires_outcome = models.BooleanField(default=False)
    sequence_execution_id = models.UUIDField(null=True, blank=True, db_index=True)

    # Polymorphic association to parent entities
    company = models.ForeignKey(
        "companies.Company",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="tasks",
    )
    contact = models.ForeignKey(
        "contacts.Contact",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="tasks",
    )
    deal = models.ForeignKey(
        "deals.Deal",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="tasks",
    )

    class Meta:
        db_table = "tasks_task"
        verbose_name = "Task"
        verbose_name_plural = "Tasks"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["owner", "status"]),
            models.Index(fields=["due_date"]),
            models.Index(fields=["reminder_at"]),
            models.Index(fields=["company"]),
            models.Index(fields=["contact"]),
            models.Index(fields=["deal"]),
        ]

    def __str__(self):
        return self.title

    @property
    def is_overdue(self):
        if self.due_date and self.status != TaskStatus.COMPLETED:
            from django.utils import timezone

            return self.due_date < timezone.now()
        return False

    def save(self, *args, **kwargs):
        super().save(*args, **kwargs)

        # Immediately create notification if task is due or reminder in next 1 hour 15 minutes
        from apps.common.enums import TaskStatus
        if not self.is_deleted and self.owner and self.status in [TaskStatus.PENDING, TaskStatus.IN_PROGRESS]:
            from django.utils import timezone
            now = timezone.now()
            window = now + timezone.timedelta(minutes=75)

            is_upcoming = False
            if self.due_date and now <= self.due_date < window:
                is_upcoming = True
            if self.reminder_at and now <= self.reminder_at < window:
                is_upcoming = True

            if is_upcoming:
                exists = Notification.objects.filter(
                    user=self.owner,
                    related_entity_id=self.id,
                    notification_type="task_reminder",
                ).exists()

                if not exists:
                    local_tz = timezone.get_current_timezone()
                    local_due_time = self.due_date.astimezone(local_tz).strftime("%I:%M %p") if self.due_date else "soon"
                    
                    Notification.objects.create(
                        user=self.owner,
                        title="Upcoming Task Reminder",
                        message=f"Task '{self.title}' is due at {local_due_time}.",
                        notification_type="task_reminder",
                        related_entity_id=self.id,
                        related_entity_type="task",
                    )


class Notification(BaseModel):
    """
    In-app notification for CRM users (e.g. task reminders).
    """
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="notifications",
    )
    title = models.CharField(max_length=255)
    message = models.TextField()
    is_read = models.BooleanField(default=False, db_index=True)
    notification_type = models.CharField(max_length=50, default="task_reminder")
    related_entity_id = models.UUIDField(null=True, blank=True)
    related_entity_type = models.CharField(max_length=50, null=True, blank=True)

    class Meta:
        db_table = "tasks_notification"
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.user.email} - {self.title}"
