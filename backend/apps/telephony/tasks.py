import logging
from celery import shared_task

logger = logging.getLogger(__name__)


@shared_task(
    name="apps.telephony.tasks.process_call_ai_summary",
    bind=True,
    max_retries=2,
    default_retry_delay=60,
)
def process_call_ai_summary(self, call_id: str):
    """
    Celery task to run the complete post-call LLM prompt, extracting summary,
    pain points, objections, buying signals, email/LinkedIn drafts, and tasks.
    """
    try:
        from apps.telephony.models import Call
        from apps.telephony.services import TelephonyAIService

        try:
            call = Call.objects.select_related("user", "contact", "company", "deal").get(id=call_id)
        except Call.DoesNotExist:
            logger.error("Call %s not found for summarization task.", call_id)
            return {"status": "not_found", "call_id": call_id}

        # Update status
        call.summary_status = "generating"
        call.save(update_fields=["summary_status"])

        # Execute AI summarization service
        TelephonyAIService.generate_full_summary(call)

        # Update status
        call.summary_status = "completed"
        call.save(update_fields=["summary_status"])

        logger.info("Successfully completed AI summarization task for call %s", call_id)
        return {"status": "completed", "call_id": call_id}

    except Exception as exc:
        logger.exception("AI summarization task failed for call %s", call_id)
        try:
            from apps.telephony.models import Call
            call = Call.objects.get(id=call_id)
            call.summary_status = "failed"
            call.save(update_fields=["summary_status"])
        except Exception:
            pass
        raise self.retry(exc=exc)
