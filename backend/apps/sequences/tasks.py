import logging
from celery import shared_task
from apps.sequences.services.sequence_engine import SequenceEngineService

logger = logging.getLogger(__name__)


@shared_task(name="apps.sequences.tasks.process_sequence_engine")
def process_sequence_engine():
    """
    Celery task that runs periodically (every minute) to process due sequence executions.
    """
    try:
        count = SequenceEngineService.process_due_executions()
        if count > 0:
            logger.info("Processed %d due sequence step executions.", count)
        return count
    except Exception as e:
        logger.error("Error running process_sequence_engine periodic task: %s", e, exc_info=True)
        return 0


@shared_task(name="apps.sequences.tasks.process_scheduled_emails")
def process_scheduled_emails():
    """
    Celery task that runs periodically (every minute) to send scheduled email drafts
    whose scheduled_at_utc <= now.
    """
    try:
        count = SequenceEngineService.process_scheduled_email_drafts()
        if count > 0:
            logger.info("Sent %d scheduled sequence email drafts.", count)
        return count
    except Exception as e:
        logger.error("Error running process_scheduled_emails periodic task: %s", e, exc_info=True)
        return 0

