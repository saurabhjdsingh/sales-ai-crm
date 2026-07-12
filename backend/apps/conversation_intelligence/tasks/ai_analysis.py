import json
import logging
from celery import shared_task
from django.utils import timezone
from django.conf import settings
from apps.ai_engine.services.copilot import get_llm_provider
from apps.common.enums import DealStage, TaskType, TaskPriority
from apps.conversation_intelligence.models import (
    Conversation,
    ConversationSummary,
    ConversationInsight
)

logger = logging.getLogger(__name__)


@shared_task(name="apps.conversation_intelligence.tasks.generate_conversation_summary_task")
def generate_conversation_summary_task(conversation_id: str):
    import time
    from django.core.cache import cache
    
    # 1. Wait until BOTH WebSockets are disconnected (either they disconnect, or we hit a timeout)
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

    # 2. Wait until all received segments are processed (either successfully or failed)
    # We check: received <= processed + failed
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
    
    total_received = agent_rec + cust_rec
    total_failed = agent_fal + cust_fal

    try:
        conversation = Conversation.objects.get(id=conversation_id)
    except Conversation.DoesNotExist:
        logger.error("Conversation %s does not exist for AI summarization.", conversation_id)
        return

    # If any segments failed to transcribe (or if no segments were processed and we had errors)
    if total_failed > 0:
        logger.error("Failed to run AI analysis: %s segments failed to transcribe.", total_failed)
        summary, _ = ConversationSummary.objects.get_or_create(conversation=conversation)
        summary.executive_summary = "some error while transcribing hence didn't ran ai analysis."
        summary.save()
        
        conversation.status = "failed"
        conversation.save(update_fields=["status", "updated_at"])
        return

    # Check status
    if conversation.status == "completed" or conversation.status == "failed":
        logger.warning("Conversation %s is in state %s, skipping AI analysis.", conversation_id, conversation.status)
        return

    transcript = getattr(conversation, "transcript", None)
    if not transcript or not transcript.data:
        logger.warning("No transcript segments found for conversation %s, creating blank summary.", conversation_id)
        summary, _ = ConversationSummary.objects.get_or_create(conversation=conversation)
        summary.executive_summary = "Call completed. No transcript was captured."
        summary.save()
        conversation.status = "completed"
        conversation.save(update_fields=["status", "updated_at"])
        return

    transcript_text = transcript.export_to_text()

    # Load default LLM provider
    provider = get_llm_provider(user=conversation.user)

    deal_stages = ", ".join([choice[0] for choice in DealStage.choices])
    task_types = ", ".join([choice[0] for choice in TaskType.choices])
    task_priorities = ", ".join([choice[0] for choice in TaskPriority.choices])

    prompt = f"""
You are an expert AI sales director. Analyze this conversation transcript between a Sales Rep and a Customer.
Generate a complete structured post-call analysis in JSON.

Extract the following parameters:
1. Executive Summary: High-level overview of the call.
2. Conversation Summary: Detailed summary of key discussion points.
3. Pain Points: Bullet points of customer challenges.
4. Buying Signals: Customer indicators showing intent to buy or interest.
5. Competitors: Any current or named competitors mentioned.
6. Requirements: Specific requirements mentioned by the client.
7. Timeline: Customer's timeline for implementation or decisions.
8. Budget: Mentions of budget limits or cost considerations.
9. Decision Makers: Identified stakeholders and their roles.
10. Sentiment: General conversation sentiment (e.g., positive, neutral, negative, interested).
11. Objections: Customer objections raised during the call.
12. Suggested Follow-up Tasks: Specific next actions.
13. Follow-up Email: A professional draft email matching the tone of conversation.
14. LinkedIn Message: A direct personalized follow-up message.
15. Suggested Deal Stage: Must be one of: {deal_stages}
16. Suggested CRM Updates: Dictionary of other CRM metadata updates (e.g. {{ "contact_job_title": "...", "company_industry": "..." }}).

Return ONLY a valid JSON object matching this schema exactly:
{{
  "executive_summary": "Detailed executive summary...",
  "conversation_summary": "Detailed chronological discussion summary...",
  "pain_points": ["string"],
  "buying_signals": ["string"],
  "competitors": ["string"],
  "requirements": ["string"],
  "timeline": ["string"],
  "budget": ["string"],
  "decision_makers": ["string"],
  "sentiment": "positive|neutral|negative|interested",
  "objections": ["string"],
  "tasks": [
    {{
      "title": "Task title",
      "description": "Task description...",
      "due_days_offset": 1,
      "priority": "low|medium|high|urgent",
      "task_type": "call|email|linkedin|follow_up|meeting|review_proposal|other"
    }}
  ],
  "follow_up_email": "Subject: ...\\n\\nDear...",
  "linkedin_message": "Draft message...",
  "suggested_deal_stage": "stage_key",
  "suggested_crm_updates": {{
    "job_title": "string",
    "industry": "string"
  }}
}}

Guidelines:
- If a task type doesn't fit, use 'other' or 'follow_up'.
- 'suggested_deal_stage' must be exactly one of: {deal_stages} (or leave blank if no change is recommended).
- Tasks priority must be one of: {task_priorities}.
- Tasks type must be one of: {task_types}.

Context:
- Sales Rep (Agent): {conversation.user.get_full_name()}
- Lead (Customer): {conversation.contact.full_name if conversation.contact else "Unknown"}
- Company: {conversation.company.name if conversation.company else "Unknown"}
- Current Deal: {conversation.deal.name if conversation.deal else "None"}

Transcript:
{transcript_text}

JSON:
"""
    try:
        response = provider.chat(
            messages=[{"role": "user", "content": prompt}],
            system_prompt="You are a post-call conversational analyst. Always output valid JSON only.",
            purpose="conversation_intelligence"
        )
        cleaned_content = response.content.strip()
        # Handle markdown blocks if returned
        if cleaned_content.startswith("```json"):
            cleaned_content = cleaned_content[7:]
        if cleaned_content.endswith("```"):
            cleaned_content = cleaned_content[:-3]
        
        data = json.loads(cleaned_content.strip())
        
        # Save summary
        summary, _ = ConversationSummary.objects.get_or_create(conversation=conversation)
        summary.executive_summary = data.get("executive_summary", "")
        summary.conversation_summary = data.get("conversation_summary", "")
        summary.pain_points = data.get("pain_points", [])
        summary.buying_signals = data.get("buying_signals", [])
        summary.competitors = data.get("competitors", [])
        summary.requirements = data.get("requirements", [])
        summary.timeline = data.get("timeline", [])
        summary.budget = data.get("budget", [])
        summary.decision_makers = data.get("decision_makers", [])
        summary.sentiment = data.get("sentiment", "neutral")
        summary.objections = data.get("objections", [])
        summary.tasks = data.get("tasks", [])
        summary.follow_up_email = data.get("follow_up_email", "")
        summary.linkedin_message = data.get("linkedin_message", "")
        summary.suggested_deal_stage = data.get("suggested_deal_stage", "")
        summary.suggested_crm_updates = data.get("suggested_crm_updates", {})
        summary.save()

        # Save insights
        insight_map = {
            "pain_point": data.get("pain_points", []),
            "buying_signal": data.get("buying_signals", []),
            "competitor": data.get("competitors", []),
            "objection": data.get("objections", []),
        }

        # Clear previous insights and populate new ones
        conversation.insights.all().delete()
        for insight_type, items in insight_map.items():
            for item in items:
                ConversationInsight.objects.create(
                    conversation=conversation,
                    insight_type=insight_type,
                    content=item,
                    timestamp=0.0,
                    created_by=conversation.user,
                    updated_by=conversation.user
                )

        conversation.status = "completed"
        conversation.save(update_fields=["status", "updated_at"])
        logger.info("Successfully completed post-call AI analysis for conversation %s", conversation_id)

    except Exception as e:
        logger.exception("Failed to run post-call AI analysis for conversation %s: %s", conversation_id, str(e))
        conversation.status = "failed"
        conversation.save(update_fields=["status", "updated_at"])
        
        # Write failure note to summary
        summary, _ = ConversationSummary.objects.get_or_create(conversation=conversation)
        summary.executive_summary = "AI processing failed. Please write summary manually."
        summary.save()
