"""
Celery configuration for Radar 36 Sales CRM.
Auto-discovers tasks from all installed apps.
"""

import os

from celery import Celery
from celery.schedules import crontab

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")

app = Celery("radar36_crm")
app.config_from_object("django.conf:settings", namespace="CELERY")
app.autodiscover_tasks()

# ──────────────────────────────────────────────
# Periodic Tasks (Celery Beat)
# ──────────────────────────────────────────────
app.conf.beat_schedule = {
    "send-task-reminders": {
        "task": "apps.tasks.tasks.send_task_reminders",
        "schedule": crontab(minute="*/15"),
    },
    "check-task-email-reminders": {
        "task": "apps.tasks.tasks.check_task_email_reminders",
        "schedule": crontab(minute="*/5"),
    },
    "generate-daily-digest": {
        "task": "apps.dashboard.tasks.generate_daily_digest",
        "schedule": crontab(hour=8, minute=0),
    },
    "cleanup-soft-deleted": {
        "task": "apps.common.tasks.cleanup_soft_deleted_records",
        "schedule": crontab(day_of_week=0, hour=2, minute=0),
    },
}
