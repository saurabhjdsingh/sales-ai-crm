"""
Celery tasks for imports.
"""

import logging

from celery import shared_task

logger = logging.getLogger(__name__)


@shared_task(name="apps.imports.tasks.process_import_job")
def process_import_job(import_job_id: str):
    """
    Process an import job asynchronously.
    Called after the user confirms the column mapping.
    """
    from apps.common.enums import ImportStatus
    from apps.imports.models import ImportJob
    from apps.imports.services import ImportService

    try:
        import_job = ImportJob.objects.get(id=import_job_id)
        user = import_job.started_by

        ImportService.process_import(
            import_job=import_job,
            column_mapping=import_job.column_mapping,
            user=user,
        )

        logger.info(
            "Import completed: %s — %d success, %d errors, %d duplicates",
            import_job.file_name,
            import_job.success_count,
            import_job.error_count,
            import_job.duplicate_count,
        )
    except ImportJob.DoesNotExist:
        logger.error("Import job %s not found", import_job_id)
    except Exception:
        logger.exception("Import job %s failed", import_job_id)
        ImportJob.objects.filter(id=import_job_id).update(status=ImportStatus.FAILED)
