"""
Celery tasks for the Dashboard.
"""

import logging

from celery import shared_task

logger = logging.getLogger(__name__)


@shared_task(name="apps.dashboard.tasks.generate_daily_digest")
def generate_daily_digest():
    """
    Generate a daily digest for each active sales rep.
    For MVP: logs the digest. Future: sends via email/Slack.
    """
    from django.contrib.auth import get_user_model

    from apps.tasks.services import TaskService

    User = get_user_model()
    users = User.objects.filter(is_active=True)

    for user in users:
        today_tasks = TaskService.get_today_tasks(user)
        overdue_tasks = TaskService.get_overdue_tasks(user)

        logger.info(
            "Daily digest for %s: %d tasks today, %d overdue",
            user.email,
            today_tasks.count(),
            overdue_tasks.count(),
        )

    return {"users_processed": users.count()}


@shared_task(name="apps.dashboard.tasks.snapshot_daily_productivity")
def snapshot_daily_productivity():
    """
    Nightly task to freeze daily productivity snapshots for all active users.
    Runs at 23:55 each day to capture end-of-day totals.
    """
    from django.utils import timezone

    from apps.dashboard.services import ProductivityService

    today = timezone.localdate()
    count = ProductivityService.snapshot_all_users_for_date(today)

    return {"date": today.isoformat(), "users_snapshotted": count}
