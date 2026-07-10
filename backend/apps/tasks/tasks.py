"""
Celery tasks for the Tasks module.
"""

import logging

from celery import shared_task
from django.utils import timezone

logger = logging.getLogger(__name__)


@shared_task(name="apps.tasks.tasks.send_task_reminders")
def send_task_reminders():
    """
    Check for tasks with upcoming reminders or due dates in the next 1 hour 15 minutes and notify owners via db Notifications.
    Runs every 15 minutes via Celery Beat.
    """
    from django.db.models import Q
    from apps.common.enums import TaskStatus
    from apps.tasks.models import Task, Notification

    now = timezone.now()
    window = now + timezone.timedelta(minutes=75)

    # Query tasks due in the next 1 hour 15 minutes or having a reminder in the next 1 hour 15 minutes
    tasks_to_remind = Task.objects.filter(
        Q(due_date__gte=now, due_date__lt=window) | Q(reminder_at__gte=now, reminder_at__lt=window),
        status__in=[TaskStatus.PENDING, TaskStatus.IN_PROGRESS],
        is_deleted=False,
        owner__isnull=False,
    ).select_related("owner")

    reminded_count = 0
    for task in tasks_to_remind:
        # Check if notification already exists to avoid duplicates
        exists = Notification.objects.filter(
            user=task.owner,
            related_entity_id=task.id,
            notification_type="task_reminder",
        ).exists()

        if not exists:
            # Format time in local timezone (Kolkata)
            local_tz = timezone.get_current_timezone()
            local_due_time = task.due_date.astimezone(local_tz).strftime("%I:%M %p") if task.due_date else "soon"
            
            Notification.objects.create(
                user=task.owner,
                title="Upcoming Task Reminder",
                message=f"Task '{task.title}' is due at {local_due_time}.",
                notification_type="task_reminder",
                related_entity_id=task.id,
                related_entity_type="task",
            )
            logger.info("Created notification for task: %s (owner: %s)", task.title, task.owner.email)
            reminded_count += 1

    logger.info("Sent %d task reminders / notifications", reminded_count)
    return reminded_count


@shared_task(name="apps.tasks.tasks.check_task_email_reminders")
def check_task_email_reminders():
    """
    Check for tasks due in 1 hour and email owners if they haven't logged in last 6 hours.
    """
    from apps.tasks.models import Task, Notification
    from apps.common.email import send_branded_email
    from apps.common.enums import TaskStatus
    from django.utils import timezone
    from django.conf import settings

    now = timezone.now()
    window_start = now + timezone.timedelta(minutes=50)
    window_end = now + timezone.timedelta(minutes=65)

    # Find tasks due in the 1 hour window
    tasks = Task.objects.filter(
        due_date__gte=window_start,
        due_date__lt=window_end,
        status__in=[TaskStatus.PENDING, TaskStatus.IN_PROGRESS],
        is_deleted=False,
        owner__isnull=False,
    ).select_related("owner")

    emails_sent = 0
    for task in tasks:
        # Check login in last 6 hours
        last_login_limit = now - timezone.timedelta(hours=6)
        if task.owner.last_login is None or task.owner.last_login < last_login_limit:
            # Check if email reminder already sent
            already_sent = Notification.objects.filter(
                user=task.owner,
                related_entity_id=task.id,
                notification_type="task_email_reminder",
            ).exists()

            if not already_sent:
                local_tz = timezone.get_current_timezone()
                local_due_time = task.due_date.astimezone(local_tz).strftime("%I:%M %p")
                
                frontend_base = getattr(settings, "FRONTEND_URL", "http://localhost:4200").rstrip("/")
                task_url = f"{frontend_base}/tasks"
                
                subject = f"Upcoming Task: {task.title}"
                title = "Task Reminder"
                content_html = f"""Hi {task.owner.first_name or 'there'},<br><br>
This is a reminder that the task <strong>"{task.title}"</strong> is due at <strong>{local_due_time}</strong> (in about 1 hour).<br><br>
<strong>Description:</strong><br>{task.description or 'No description provided.'}"""
                
                success = send_branded_email(
                    subject=subject,
                    title=title,
                    content_html=content_html,
                    recipient_list=[task.owner.email],
                    cta_text="View Tasks",
                    cta_url=task_url,
                )
                if success:
                    Notification.objects.create(
                        user=task.owner,
                        title="Task Email Reminder Sent",
                        message=f"Email reminder sent for task: '{task.title}'",
                        notification_type="task_email_reminder",
                        related_entity_id=task.id,
                        related_entity_type="task",
                    )
                    emails_sent += 1

    logger.info("Sent %d task email reminders", emails_sent)
    return emails_sent

