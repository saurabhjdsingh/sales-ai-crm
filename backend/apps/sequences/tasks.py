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
