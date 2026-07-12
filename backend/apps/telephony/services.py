import json
import logging
from typing import Dict, Any, List
from django.db import transaction
from django.utils import timezone
from apps.ai_engine.services.copilot import get_llm_provider
from apps.telephony.models import Call, CallSummary, CallTask, CallTranscript, CallParticipant, CallEvent
from apps.common.enums import DealStage, TaskType, TaskPriority
from apps.tasks.models import Task
from apps.activities.models import Activity
from apps.common.enums import ActivityType

logger = logging.getLogger(__name__)


class TelephonyAIService:
    """
    Handles LLM summarization, live analysis, and suggestion extraction for call transcripts.
    """

    @staticmethod
    def analyze_call_incrementally(call: Call) -> Dict[str, Any]:
        """
        Analyze current transcript segments to extract real-time insights:
        objections, buying signals, pain points, and suggested next questions.
        """
        if not call.ai_assist_enabled:
            return {}

        try:
            transcript = call.transcript
            if not transcript.full_text.strip():
                return {}
        except CallTranscript.DoesNotExist:
            return {}

        provider = get_llm_provider(user=call.user)

        prompt = f"""
You are an AI Sales Assistant. Analyze the active call transcript below.
Extract any newly detected buying signals, customer pain points, objections, and suggest 2-3 specific, open-ended questions the sales rep can ask next.

Return ONLY a valid JSON object matching this schema:
{{
  "pain_points": ["string"],
  "buying_signals": ["string"],
  "objections": ["string"],
  "suggested_questions": ["string"]
}}

Context:
- Lead Name: {call.contact.full_name if call.contact else "Unknown"}
- Company: {call.company.name if call.company else "Unknown"}
- Deal Name: {call.deal.name if call.deal else "Unknown"}

Transcript:
{transcript.full_text}

JSON:
"""
        try:
            response = provider.chat(
                messages=[{"role": "user", "content": prompt}],
                system_prompt="You are a real-time sales helper. Always output valid JSON only.",
                purpose="calls"
            )
            data = json.loads(response.content.strip())
            
            # Save analysis results to CallSummary
            summary_obj, _ = CallSummary.objects.get_or_create(call=call)
            summary_obj.pain_points = list(set(summary_obj.pain_points + data.get("pain_points", [])))
            summary_obj.buying_signals = list(set(summary_obj.buying_signals + data.get("buying_signals", [])))
            summary_obj.objections = list(set(summary_obj.objections + data.get("objections", [])))
            summary_obj.suggested_questions = data.get("suggested_questions", [])
            summary_obj.save()

            return data
        except Exception as e:
            logger.exception("Failed to run incremental AI analysis: %s", str(e))
            return {}

    @staticmethod
    def generate_full_summary(call: Call) -> CallSummary:
        """
        Runs the final post-call summarization prompt. Extracts summary, draft communications,
        tasks offset, and suggested deal stage.
        """
        try:
            transcript = call.transcript
            transcript_text = transcript.full_text
        except CallTranscript.DoesNotExist:
            transcript_text = "No transcript available. (Standard manual logging or audio unavailable)."

        # Fetch or create summary
        summary_obj, _ = CallSummary.objects.get_or_create(call=call)
        
        if not call.ai_assist_enabled:
            # AI assist was disabled; return empty summary to be filled manually
            summary_obj.summary = f"Call completed on {timezone.now():%Y-%m-%d}. (AI Assist was disabled)"
            summary_obj.save()
            return summary_obj

        provider = get_llm_provider(user=call.user)

        deal_stages = ", ".join([choice[0] for choice in DealStage.choices])
        task_types = ", ".join([choice[0] for choice in TaskType.choices])
        task_priorities = ", ".join([choice[0] for choice in TaskPriority.choices])

        prompt = f"""
You are an expert AI sales director. Analyze this call transcript and generate a complete post-call review.
Provide a high-quality conversation summary, extract buying signals, pain points, objections, and suggest:
1. An email draft to follow up with the lead.
2. A personalized LinkedIn connection/follow-up message draft.
3. Next steps.
4. Suggested CRM deal stage change (must be one of: {deal_stages}).
5. Recommended follow-up tasks (e.g. 'Send proposal', 'Book technical demo').

Return ONLY a valid JSON object matching this schema exactly:
{{
  "summary": "Detailed overall call summary",
  "pain_points": ["string"],
  "buying_signals": ["string"],
  "objections": ["string"],
  "next_steps": ["string"],
  "suggested_email": "Subject: ...\\n\\nDear...",
  "suggested_linkedin": "Draft LinkedIn message...",
  "suggested_deal_stage": "stage_key",
  "tasks": [
    {{
      "title": "Task title",
      "description": "Task description details",
      "due_days_offset": 1,
      "priority": "low|medium|high|urgent",
      "task_type": "call|email|linkedin|follow_up|meeting|review_proposal|other"
    }}
  ]
}}

Guidelines:
- If a task type doesn't fit, use 'other' or 'follow_up'.
- 'suggested_deal_stage' must be exactly one of: {deal_stages} (or leave blank if no change is recommended).
- Tasks priority must be one of: {task_priorities}.
- Tasks type must be one of: {task_types}.

Context:
- Agent: {call.user.get_full_name()}
- Lead: {call.contact.full_name if call.contact else "Unknown"}
- Company: {call.company.name if call.company else "Unknown"}
- Current Deal: {call.deal.name if call.deal else "None"}

Transcript:
{transcript_text}

JSON:
"""
        try:
            response = provider.chat(
                messages=[{"role": "user", "content": prompt}],
                system_prompt="You are a post-call analyst. Always output valid JSON only.",
                purpose="calls"
            )
            cleaned_content = response.content.strip()
            # Handle markdown code blocks wrapper
            if cleaned_content.startswith("```json"):
                cleaned_content = cleaned_content[7:]
            if cleaned_content.endswith("```"):
                cleaned_content = cleaned_content[:-3]
            
            data = json.loads(cleaned_content.strip())
            
            # Save CallSummary fields
            summary_obj.summary = data.get("summary", "")
            summary_obj.pain_points = data.get("pain_points", [])
            summary_obj.buying_signals = data.get("buying_signals", [])
            summary_obj.objections = data.get("objections", [])
            summary_obj.next_steps = data.get("next_steps", [])
            summary_obj.suggested_email = data.get("suggested_email", "")
            summary_obj.suggested_linkedin = data.get("suggested_linkedin", "")
            summary_obj.suggested_deal_stage = data.get("suggested_deal_stage", "")
            summary_obj.save()

            # Create suggested CallTask items
            # Clear previous suggested tasks first
            call.suggested_tasks.all().delete()
            for t in data.get("tasks", []):
                due_date = None
                offset = t.get("due_days_offset", 1)
                if offset is not None:
                    due_date = timezone.now() + timezone.timedelta(days=int(offset))

                CallTask.objects.create(
                    call=call,
                    title=t.get("title", "Follow up task"),
                    description=t.get("description", ""),
                    due_date=due_date,
                    priority=t.get("priority", "medium"),
                    task_type=t.get("task_type", "follow_up"),
                    status="pending"
                )
            
            return summary_obj
        except Exception as e:
            logger.exception("Failed to generate full AI summary: %s", str(e))
            summary_obj.summary = "Failed to generate AI summary automatically. Please write summary manually."
            summary_obj.save()
            return summary_obj


class TelephonyService:
    """
    Handles call logging, webhook processing, and CRM activity creation.
    """

    @staticmethod
    @transaction.atomic
    def record_call_event(call: Call, event_type: str, payload: Dict[str, Any]) -> CallEvent:
        """Add event to audit trail and update Call status."""
        event = CallEvent.objects.create(
            call=call,
            event_type=event_type,
            payload=payload
        )
        
        status_map = {
            "ringing": "ringing",
            "in-progress": "in-progress",
            "completed": "completed",
            "failed": "failed",
            "busy": "busy",
            "no-answer": "no-answer",
            "canceled": "canceled",
        }
        
        new_status = status_map.get(event_type)
        if new_status:
            call.status = new_status
            if new_status == "in-progress" and not call.start_time:
                call.start_time = timezone.now()
            elif new_status in ["completed", "failed", "busy", "no-answer", "canceled"]:
                call.end_time = timezone.now()
                
                # Use Twilio's authoritative call duration from payload (supports both CallDuration and DialCallDuration)
                twilio_duration = payload.get("CallDuration") or payload.get("DialCallDuration")
                if twilio_duration:
                    try:
                        call.duration = int(twilio_duration)
                    except (ValueError, TypeError):
                        pass
                elif call.start_time:
                    call.duration = int((call.end_time - call.start_time).total_seconds())
            call.save()

        return event

    @staticmethod
    @transaction.atomic
    def confirm_post_call_review(call: Call, review_data: Dict[str, Any]) -> Activity:
        """
        Permanently writes the call outcomes to the CRM:
        - Creates a CRM Activity in the timeline.
        - Creates approved Task objects in the database.
        - Updates Deal stage if requested.
        """
        # Save summary overrides
        summary, _ = CallSummary.objects.get_or_create(call=call)
        summary.summary = review_data.get("summary", summary.summary)
        summary.pain_points = review_data.get("pain_points", summary.pain_points)
        summary.next_steps = review_data.get("next_steps", summary.next_steps)
        summary.confirmed = True
        summary.save()

        # Update deal stage if provided and linked
        suggested_stage = review_data.get("suggested_deal_stage")
        if suggested_stage and call.deal:
            call.deal.stage = suggested_stage
            call.deal.save(update_fields=["stage", "updated_at"])

            # Create stage changed activity
            Activity.objects.create(
                activity_type=ActivityType.STAGE_CHANGED,
                title=f"Deal Stage changed to {call.deal.get_stage_display()}",
                description=f"Stage updated following call on {timezone.now():%Y-%m-%d}.",
                performed_by=call.user,
                company=call.company,
                contact=call.contact,
                deal=call.deal,
            )

        # Create approved tasks in CRM
        tasks_data = review_data.get("tasks", [])
        for task_item in tasks_data:
            # Create actual Task in the CRM
            t_obj = Task.objects.create(
                title=task_item.get("title"),
                description=task_item.get("description", ""),
                due_date=task_item.get("due_date"),
                priority=task_item.get("priority", "medium"),
                task_type=task_item.get("task_type", "follow_up"),
                owner=call.user,
                company=call.company,
                contact=call.contact,
                deal=call.deal,
                status="pending"
            )
            
            # Link back in suggested tasks
            try:
                call_task = CallTask.objects.get(id=task_item.get("id"), call=call)
                call_task.created_task = t_obj
                call_task.status = "created"
                call_task.save()
            except CallTask.DoesNotExist:
                pass

        # Formulate Description for Timeline Activity
        activity_desc = f"Call Duration: {call.duration or 0}s\nDirection: {call.direction.capitalize()}\nStatus: {call.status.capitalize()}\n\n"
        if call.notes:
            activity_desc += f"Agent Notes:\n{call.notes}\n\n"
        if summary.summary:
            activity_desc += f"AI Summary:\n{summary.summary}"

        # Create timeline activity
        activity = Activity.objects.create(
            activity_type=ActivityType.CALL,
            title=f"{call.direction.capitalize()} Call to {call.contact.full_name if call.contact else 'External Phone'}",
            description=activity_desc,
            metadata={
                "call_id": str(call.id),
                "duration": call.duration,
                "direction": call.direction,
                "recording_enabled": call.recording_enabled,
                "ai_assist_enabled": call.ai_assist_enabled,
            },
            performed_by=call.user,
            company=call.company,
            contact=call.contact,
            deal=call.deal
        )

        return activity
