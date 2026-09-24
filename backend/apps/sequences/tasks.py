import logging
import redis
from celery import shared_task
from django.conf import settings
from apps.sequences.services.sequence_engine import SequenceEngineService

logger = logging.getLogger(__name__)


def _get_redis_client():
    url = getattr(settings, "REDIS_URL", None) or getattr(settings, "CELERY_BROKER_URL", "redis://redis:6379/0")
    return redis.from_url(url, socket_connect_timeout=3)


@shared_task(name="apps.sequences.tasks.process_sequence_engine")
def process_sequence_engine():
    """
    Celery task that runs periodically (every minute) to process due sequence executions.
    Uses a Redis lock to ensure only one worker processes executions at any time.
    """
    lock = None
    try:
        r = _get_redis_client()
        lock = r.lock("lock:process_sequence_engine", timeout=55, blocking=False)
        if not lock.acquire():
            logger.info("Another process_sequence_engine task is already active. Skipping duplicate task.")
            return 0
    except Exception as lock_err:
        logger.debug("Redis lock check skipped for process_sequence_engine: %s", lock_err)

    try:
        count = SequenceEngineService.process_due_executions()
        if count > 0:
            logger.info("Processed %d due sequence step executions.", count)
        return count
    except Exception as e:
        logger.error("Error running process_sequence_engine periodic task: %s", e, exc_info=True)
        return 0
    finally:
        if lock:
            try:
                lock.release()
            except Exception:
                pass


@shared_task(name="apps.sequences.tasks.process_scheduled_emails")
def process_scheduled_emails():
    """
    Celery task that runs periodically (every minute) to send scheduled email drafts
    whose scheduled_at_utc <= now.
    Uses a Redis distributed lock to prevent duplicate email dispatch across worker processes.
    """
    lock = None
    try:
        r = _get_redis_client()
        lock = r.lock("lock:process_scheduled_emails", timeout=55, blocking=False)
        if not lock.acquire():
            logger.info("Another process_scheduled_emails task is already active. Skipping duplicate task.")
            return 0
    except Exception as lock_err:
        logger.debug("Redis lock check skipped for process_scheduled_emails: %s", lock_err)

    try:
        count = SequenceEngineService.process_scheduled_email_drafts()
        if count > 0:
            logger.info("Sent %d scheduled sequence email drafts.", count)
        return count
    except Exception as e:
        logger.error("Error running process_scheduled_emails periodic task: %s", e, exc_info=True)
        return 0
    finally:
        if lock:
            try:
                lock.release()
            except Exception:
                pass

