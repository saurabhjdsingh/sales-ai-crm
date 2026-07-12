import uuid
import logging
from django.db import transaction
from django.utils import timezone
from django.shortcuts import get_object_or_404
from apps.common.enums import ActivityType, DealStage, TaskType, TaskPriority
from apps.tasks.models import Task
from apps.activities.models import Activity
from apps.companies.models import Company
from apps.contacts.models import Contact
from apps.conversation_intelligence.models import (
    Conversation,
    ConversationSession,
    Transcript,
    ConversationState,
    ConversationSummary,
    ConversationMetadata
)
from apps.conversation_intelligence.tasks.ai_analysis import generate_conversation_summary_task

logger = logging.getLogger(__name__)


class ConversationService:
    @staticmethod
    @transaction.atomic
    def initiate_conversation(user, contact_id=None, deal_id=None, company_id=None, call_id=None) -> dict:
        # Validate AI setup first
        from apps.ai_engine.services.copilot import get_llm_provider
        from rest_framework.exceptions import ValidationError
        try:
            get_llm_provider(user=user)
        except Exception as e:
            logger.warning("Attempted to start CI session but AI model is not configured: %s", str(e))
            raise ValidationError(
                "AI Assist model is not configured. Please set up your AI Provider (Anthropic/OpenAI) in the Settings page."
            )

        contact = None
        company = None
        deal = None

        if contact_id:
            contact = Contact.objects.filter(id=contact_id, is_deleted=False).first()
            if contact:
                company = contact.company
        if company_id and not company:
            company = Company.objects.filter(id=company_id, is_deleted=False).first()
        if deal_id:
            from apps.deals.models import Deal
            deal = Deal.objects.filter(id=deal_id, is_deleted=False).first()
            if deal and not company:
                company = deal.company

        # Create the Conversation record
        conversation = Conversation.objects.create(
            user=user,
            contact=contact,
            company=company,
            deal=deal,
            call_id=call_id,
            status="active",
            created_by=user,
            updated_by=user
        )

        # Generate a unique WebSocket Session Auth Key
        session_key = f"ci_{uuid.uuid4().hex}"
        ConversationSession.objects.create(
            conversation=conversation,
            session_key=session_key,
            is_active=True,
            created_by=user,
            updated_by=user
        )

        # Initialize structured sub-models
        Transcript.objects.create(conversation=conversation, created_by=user, updated_by=user)
        ConversationState.objects.create(conversation=conversation, current_state="active", created_by=user, updated_by=user)
        ConversationMetadata.objects.create(conversation=conversation, created_by=user, updated_by=user)
        ConversationSummary.objects.create(conversation=conversation, created_by=user, updated_by=user)

        return {
            "conversation_id": str(conversation.id),
            "session_key": session_key,
            "websocket_url": f"/ws/conversation/stream/{conversation.id}/"
        }

    @staticmethod
    @transaction.atomic
    def end_conversation(conversation_id, user) -> Conversation:
        conversation = get_object_or_404(Conversation, id=conversation_id, user=user)
        
        # Update status
        conversation.status = "processing"
        conversation.save(update_fields=["status", "updated_at"])

        session = ConversationSession.objects.filter(conversation=conversation, is_active=True).first()
        if session:
            # If it's a WebSocket session, let the disconnect handler deactivate it after final chunk transcribing.
            # Otherwise (like API or unit test sessions), deactivate immediately.
            if not session.session_key or not session.session_key.startswith("ws_"):
                session.is_active = False
                session.ended_at = timezone.now()
                session.save(update_fields=["is_active", "ended_at", "updated_at"])
                
                # Compute duration
                metadata = getattr(conversation, "metadata", None)
                if metadata:
                    duration_sec = int((session.ended_at - session.started_at).total_seconds()) if session.started_at else 0
                    metadata.duration = max(duration_sec, 0)
                    metadata.save(update_fields=["duration", "updated_at"])

        # Synchronize transcript to telephony CallTranscript so history lists display correctly
        if conversation.call_id:
            try:
                from apps.telephony.models import Call, CallTranscript as TelephonyCallTranscript
                call = Call.objects.filter(id=conversation.call_id).first()
                if call:
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
                                "timestamp": timezone.now().timestamp() + seg.get("start_time", 0)
                            })
                            
                            display_speaker = "Agent" if tel_speaker == "agent" else "Customer"
                            full_lines.append(f"{display_speaker}: {text}")
                            
                        telephony_transcript.transcript_data = synced_data
                        telephony_transcript.full_text = "\n".join(full_lines)
                        telephony_transcript.save()
                        
                        call.transcript_status = "completed"
                        call.save(update_fields=["transcript_status"])
                        logger.info("Successfully synced conversation %s transcript to telephony call %s", conversation.id, call.id)
            except Exception:
                logger.exception("Failed to sync transcript to telephony CallTranscript")

        # Enqueue the Celery post-call analysis only if ai_analysis_enabled is True on the call
        try:
            from apps.telephony.models import Call
            call_obj = Call.objects.filter(id=conversation.call_id).first() if conversation.call_id else None
            ai_analysis_enabled = call_obj.ai_analysis_enabled if call_obj else True
        except Exception:
            ai_analysis_enabled = True

        if ai_analysis_enabled:
            generate_conversation_summary_task.delay(str(conversation.id))
        else:
            conversation.status = "completed"
            conversation.save(update_fields=["status", "updated_at"])
        
        return conversation

    @staticmethod
    @transaction.atomic
    def confirm_post_call_review(conversation_id, review_data, user) -> Activity:
        conversation = get_object_or_404(Conversation, id=conversation_id, user=user)
        summary, _ = ConversationSummary.objects.get_or_create(conversation=conversation)

        # 1. Update summary overrides
        summary.executive_summary = review_data.get("executive_summary", summary.executive_summary)
        summary.conversation_summary = review_data.get("conversation_summary", summary.conversation_summary)
        summary.confirmed = True
        summary.save()

        # 2. Update Deal stage
        suggested_stage = review_data.get("suggested_deal_stage")
        if suggested_stage and conversation.deal:
            conversation.deal.stage = suggested_stage
            conversation.deal.save(update_fields=["stage", "updated_at"])

            Activity.objects.create(
                activity_type=ActivityType.STAGE_CHANGED,
                title=f"Deal Stage changed to {conversation.deal.get_stage_display()}",
                description=f"Stage updated following call review on {timezone.now():%Y-%m-%d}.",
                performed_by=user,
                company=conversation.company,
                contact=conversation.contact,
                deal=conversation.deal,
            )

        # 3. Create approved follow-up tasks
        tasks_list = review_data.get("tasks", [])
        for task_item in tasks_list:
            if not task_item.get("approved", True):
                continue
            
            due_date = task_item.get("due_date")
            if not due_date:
                offset_days = int(task_item.get("due_days_offset", 1))
                due_date = timezone.now() + timezone.timedelta(days=offset_days)

            Task.objects.create(
                title=task_item.get("title", "Call follow-up task"),
                description=task_item.get("description", ""),
                due_date=due_date,
                priority=task_item.get("priority", "medium"),
                task_type=task_item.get("task_type", "follow_up"),
                owner=user,
                company=conversation.company,
                contact=conversation.contact,
                deal=conversation.deal,
                status="pending"
            )

        # 4. Compile descriptions
        duration_desc = ""
        metadata = getattr(conversation, "metadata", None)
        if metadata:
            duration_desc = f"Call Duration: {metadata.duration}s\n"

        activity_desc = f"{duration_desc}Direction: Outbound\nStatus: Completed\n\n"
        if summary.executive_summary:
            activity_desc += f"Executive Summary:\n{summary.executive_summary}\n\n"
        if summary.conversation_summary:
            activity_desc += f"Detailed Summary:\n{summary.conversation_summary}\n\n"
        
        # Append plain text transcript
        transcript = getattr(conversation, "transcript", None)
        if transcript:
            activity_desc += f"Transcript:\n{transcript.export_to_text()}"

        # 5. Create timeline activity
        activity = Activity.objects.create(
            activity_type=ActivityType.CALL,
            title=f"Conversation log with {conversation.contact.full_name if conversation.contact else 'External Phone'}",
            description=activity_desc,
            metadata={
                "conversation_id": str(conversation.id),
                "duration": metadata.duration if metadata else 0,
            },
            performed_by=user,
            company=conversation.company,
            contact=conversation.contact,
            deal=conversation.deal
        )

        conversation.status = "completed"
        conversation.save(update_fields=["status", "updated_at"])

        return activity
