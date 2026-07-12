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
    import time
    from django.utils import timezone
    from django.core.cache import cache
    from apps.conversation_intelligence.models import Conversation
    from apps.telephony.models import Call, CallSummary
    from apps.telephony.services import TelephonyAIService

    try:
        try:
            call = Call.objects.select_related("user", "contact", "company", "deal").get(id=call_id)
        except Call.DoesNotExist:
            logger.error("Call %s not found for summarization task.", call_id)
            return {"status": "not_found", "call_id": call_id}

        # Update status
        call.summary_status = "generating"
        call.save(update_fields=["summary_status"])

        # Check if this call is linked to a Conversation Intelligence session
        try:
            conversation = Conversation.objects.get(call_id=call_id)
            conversation_id = str(conversation.id)
        except Conversation.DoesNotExist:
            conversation = None
            conversation_id = None

        total_failed = 0
        if conversation_id:
            # 1. Wait until BOTH WebSockets are disconnected
            # We poll every 1 second, waiting up to 10 minutes (600 seconds)
            start_wait = time.time()
            while time.time() - start_wait < 600:
                agent_disconnected = cache.get(f"ci:{conversation_id}:sales_rep:disconnected", False)
                customer_disconnected = cache.get(f"ci:{conversation_id}:customer:disconnected", False)
                
                from apps.conversation_intelligence.models import ConversationSession
                active_sessions = ConversationSession.objects.filter(conversation_id=conversation_id, is_active=True)
                
                if (agent_disconnected and customer_disconnected) or not active_sessions.exists():
                    break
                time.sleep(1.0)

            # 2. Wait until all received segments are processed
            while time.time() - start_wait < 600:
                agent_rec = cache.get(f"ci:{conversation_id}:sales_rep:received", 0) or 0
                agent_prc = cache.get(f"ci:{conversation_id}:sales_rep:processed", 0) or 0
                agent_fal = cache.get(f"ci:{conversation_id}:sales_rep:failed", 0) or 0
                
                cust_rec = cache.get(f"ci:{conversation_id}:customer:received", 0) or 0
                cust_prc = cache.get(f"ci:{conversation_id}:customer:processed", 0) or 0
                cust_fal = cache.get(f"ci:{conversation_id}:customer:failed", 0) or 0
                
                total_received = agent_rec + cust_rec
                total_completed = agent_prc + agent_fal + cust_prc + cust_fal
                
                if total_completed >= total_received:
                    break
                time.sleep(1.0)

            # 3. Retrieve final counts to check for failures
            agent_rec = cache.get(f"ci:{conversation_id}:sales_rep:received", 0) or 0
            agent_fal = cache.get(f"ci:{conversation_id}:sales_rep:failed", 0) or 0
            cust_rec = cache.get(f"ci:{conversation_id}:customer:received", 0) or 0
            cust_fal = cache.get(f"ci:{conversation_id}:customer:failed", 0) or 0
            
            total_failed = agent_fal + cust_fal

            # 4. Synchronize transcript to telephony CallTranscript
            try:
                from apps.telephony.models import CallTranscript as TelephonyCallTranscript
                ci_transcript = getattr(conversation, "transcript", None)
                if ci_transcript and ci_transcript.data:
                    telephony_transcript, _ = TelephonyCallTranscript.objects.get_or_create(call=call)
                    synced_data = []
                    full_lines = []
                    for seg in sorted(ci_transcript.data, key=lambda x: x.get("start_time", 0)):
                        speaker = seg.get("speaker")
                        tel_speaker = "agent" if speaker == "sales_rep" else "contact"
                        text = seg.get("text", "")
                        
                        synced_data.append({
                            "speaker": tel_speaker,
                            "text": text,
                            "timestamp": time.time() + seg.get("start_time", 0)
                        })
                        
                        display_speaker = "Agent" if tel_speaker == "agent" else "Customer"
                        full_lines.append(f"{display_speaker}: {text}")
                        
                    telephony_transcript.transcript_data = synced_data
                    telephony_transcript.full_text = "\n".join(full_lines)
                    telephony_transcript.save()
                    
                    call.transcript_status = "completed"
                    call.save(update_fields=["transcript_status"])
                    logger.info("Successfully synced conversation %s transcript to telephony call %s in Celery task", conversation.id, call.id)
            except Exception:
                logger.exception("Failed to sync transcript to telephony CallTranscript in background task")

        # If AI analysis is not enabled, we terminate early after successful transcript sync
        if not call.ai_analysis_enabled:
            call.summary_status = "none"
            call.save(update_fields=["summary_status"])
            logger.info("Successfully synced transcript. Skipping AI analysis as configured.")
            return {"status": "skipped_ai_analysis", "call_id": call_id}

        if total_failed > 0:
            logger.error("Failed to run AI analysis: %s segments failed to transcribe.", total_failed)
            summary_obj, _ = CallSummary.objects.get_or_create(call=call)
            summary_obj.summary = "some error while transcribing hence didn't ran ai analysis."
            summary_obj.save()
            call.summary_status = "failed"
            call.save(update_fields=["summary_status"])
            return {"status": "failed", "call_id": call_id}

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
            call = Call.objects.get(id=call_id)
            call.summary_status = "failed"
            call.save(update_fields=["summary_status"])
        except Exception:
            pass
        raise self.retry(exc=exc)
