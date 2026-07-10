"""
Celery tasks for common operations.
"""

import logging
from datetime import timedelta

from celery import shared_task
from django.apps import apps
from django.utils import timezone

logger = logging.getLogger(__name__)

SOFT_DELETE_RETENTION_DAYS = 30


@shared_task(name="apps.common.tasks.cleanup_soft_deleted_records")
def cleanup_soft_deleted_records():
    """
    Permanently delete records that were soft-deleted more than
    SOFT_DELETE_RETENTION_DAYS ago. Runs weekly via Celery Beat.
    """
    cutoff = timezone.now() - timedelta(days=SOFT_DELETE_RETENTION_DAYS)
    models_to_clean = [
        "companies.Company",
        "contacts.Contact",
        "deals.Deal",
        "tasks.Task",
        "notes.Note",
    ]

    total_deleted = 0
    for model_path in models_to_clean:
        try:
            model = apps.get_model(model_path)
            count, _ = model.all_objects.filter(
                is_deleted=True,
                deleted_at__lt=cutoff,
            ).delete()
            total_deleted += count
            if count > 0:
                logger.info("Cleaned up %d soft-deleted %s records", count, model_path)
        except Exception:
            logger.exception("Failed to clean up %s", model_path)

    logger.info("Total soft-deleted records cleaned: %d", total_deleted)
    return total_deleted
