"""
CRM Knowledge Layer — internal read-only tools for the AI agent.
Provides fine-grained data retrieval tools for companies, contacts, deals,
notes, tasks, timeline activities, emails, calls, research, and CRM search.
"""

import re
import logging
from uuid import UUID
from typing import Any, Dict, List, Optional
from django.db.models import Q
from django.utils.dateparse import parse_datetime, parse_date

from apps.agent.enums import PermissionLevel
from apps.agent.tools.base import BaseTool, ToolParameter, ToolResult
from apps.agent.tools.registry import register_tool

logger = logging.getLogger(__name__)


def clean_text(text: str) -> str:
    """Helper to strip raw HTML tags and clean up whitespace."""
    if not text:
        return ""
    # Strip HTML tags
    clean = re.sub(r"<[^>]+>", " ", text)
    # Collapse whitespace
    return re.sub(r"\s+", " ", clean).strip()


def resolve_uuid(val: Optional[str]) -> Optional[UUID]:
    """Helper to parse a string UUID safely."""
    if not val:
        return None
    try:
        return UUID(str(val))
    except (ValueError, TypeError):
        return None


# ============================================================================
# 1. CRM TOOLS
# ============================================================================

@register_tool
class GetCompanyTool(BaseTool):
    name = "get_company"
    description = "Retrieve structured information for a CRM company by ID or use context company."
    parameters = [
        ToolParameter(name="company_id", type="string", description="UUID of the company (optional if company in context)", required=False)
    ]
    permission_level = PermissionLevel.READ_ONLY

    def execute(self, context, company_id: Optional[str] = None, **kwargs) -> ToolResult:
        from apps.companies.models import Company
        cid = resolve_uuid(company_id) or getattr(context, "company_id", None)
        if not cid and hasattr(context, "company") and context.company:
            cid = context.company.id

        if not cid:
            return ToolResult(success=False, error="No company_id provided or available in context.")

        company = Company.objects.filter(id=cid).select_related("owner").first()
        if not company:
            return ToolResult(success=False, error=f"Company '{cid}' not found.")

        data = {
            "id": str(company.id),
            "name": company.name,
            "website": company.website,
            "industry": company.industry,
            "company_size": company.company_size,
            "country": company.country,
            "stage": company.get_stage_display(),
            "owner": company.owner.get_full_name() if company.owner else "Unassigned",
            "icp_score": company.icp_score,
            "icp_explanation": company.icp_explanation,
            "ai_summary": company.ai_summary,
            "description": company.description,
            "tags": company.tags,
            "source": company.source,
            "contact_count": company.contact_count,
            "deal_count": company.deal_count,
        }
        return ToolResult(success=True, data=data, summary=f"Retrieved company profile for {company.name}")


@register_tool
class GetContactTool(BaseTool):
    name = "get_contact"
    description = "Retrieve structured contact information by ID or use context contact."
    parameters = [
        ToolParameter(name="contact_id", type="string", description="UUID of the contact (optional if contact in context)", required=False)
    ]
    permission_level = PermissionLevel.READ_ONLY

    def execute(self, context, contact_id: Optional[str] = None, **kwargs) -> ToolResult:
        from apps.contacts.models import Contact
        cid = resolve_uuid(contact_id) or getattr(context, "contact_id", None)
        if not cid and hasattr(context, "contact") and context.contact:
            cid = context.contact.id

        if not cid:
            return ToolResult(success=False, error="No contact_id provided or available in context.")

        contact = Contact.objects.filter(id=cid).select_related("company", "owner").first()
        if not contact:
            return ToolResult(success=False, error=f"Contact '{cid}' not found.")

        data = {
            "id": str(contact.id),
            "full_name": contact.full_name,
            "email": contact.email,
            "phone": contact.phone,
            "job_title": contact.job_title,
            "department": contact.department,
            "company_id": str(contact.company.id) if contact.company else None,
            "company_name": contact.company.name if contact.company else None,
            "stage": contact.get_stage_display(),
            "country": contact.country,
            "linkedin_url": contact.linkedin_url,
            "ai_summary": contact.ai_summary,
            "owner": contact.owner.get_full_name() if contact.owner else "Unassigned",
        }
        return ToolResult(success=True, data=data, summary=f"Retrieved contact profile for {contact.full_name}")


@register_tool
class GetDealTool(BaseTool):
    name = "get_deal"
    description = "Retrieve structured deal information by ID or use context deal."
    parameters = [
        ToolParameter(name="deal_id", type="string", description="UUID of the deal (optional if deal in context)", required=False)
    ]
    permission_level = PermissionLevel.READ_ONLY

    def execute(self, context, deal_id: Optional[str] = None, **kwargs) -> ToolResult:
        from apps.deals.models import Deal
        did = resolve_uuid(deal_id) or getattr(context, "deal_id", None)
        if not did and hasattr(context, "deal") and context.deal:
            did = context.deal.id

        if not did:
            return ToolResult(success=False, error="No deal_id provided or available in context.")

        deal = Deal.objects.filter(id=did).select_related("company", "owner").first()
        if not deal:
            return ToolResult(success=False, error=f"Deal '{did}' not found.")

        data = {
            "id": str(deal.id),
            "name": deal.name,
            "company_id": str(deal.company.id) if deal.company else None,
            "company_name": deal.company.name if deal.company else None,
            "stage": deal.get_stage_display(),
            "expected_revenue": float(deal.expected_revenue) if deal.expected_revenue else 0.0,
            "priority": deal.get_priority_display(),
            "risk": deal.get_risk_display(),
            "probability": deal.probability,
            "expected_close_date": deal.expected_close_date.strftime("%Y-%m-%d") if deal.expected_close_date else None,
            "owner": deal.owner.get_full_name() if deal.owner else "Unassigned",
            "description": deal.description,
            "internal_notes": deal.internal_notes,
        }
        return ToolResult(success=True, data=data, summary=f"Retrieved deal details for {deal.name}")


@register_tool
class GetNotesTool(BaseTool):
    name = "get_notes"
    description = "Retrieve recent notes for a company, contact, or deal."
    parameters = [
        ToolParameter(name="company_id", type="string", description="Optional Company UUID", required=False),
        ToolParameter(name="contact_id", type="string", description="Optional Contact UUID", required=False),
        ToolParameter(name="deal_id", type="string", description="Optional Deal UUID", required=False),
        ToolParameter(name="limit", type="integer", description="Max number of notes to return (default 10)", required=False),
    ]
    permission_level = PermissionLevel.READ_ONLY

    def execute(
        self,
        context,
        company_id: Optional[str] = None,
        contact_id: Optional[str] = None,
        deal_id: Optional[str] = None,
        limit: int = 10,
        **kwargs
    ) -> ToolResult:
        from apps.notes.models import Note
        comp_id = resolve_uuid(company_id) or (context.company.id if hasattr(context, "company") and context.company else None)
        cont_id = resolve_uuid(contact_id) or (context.contact.id if hasattr(context, "contact") and context.contact else None)
        dl_id = resolve_uuid(deal_id) or (context.deal.id if hasattr(context, "deal") and context.deal else None)

        qs = Note.objects.select_related("created_by")
        if comp_id:
            qs = qs.filter(company_id=comp_id)
        elif cont_id:
            qs = qs.filter(contact_id=cont_id)
        elif dl_id:
            qs = qs.filter(deal_id=dl_id)

        notes = qs.order_by("-created_at")[: min(limit, 50)]
        results = [
            {
                "id": str(n.id),
                "created_at": n.created_at.strftime("%Y-%m-%d %H:%M"),
                "author": n.created_by.get_full_name() if n.created_by else "Unknown",
                "content": clean_text(n.content[:500]),
            }
            for n in notes
        ]
        return ToolResult(success=True, data={"notes": results, "count": len(results)}, summary=f"Retrieved {len(results)} notes")


@register_tool
class GetTasksTool(BaseTool):
    name = "get_tasks"
    description = "Retrieve tasks scoped to a company, contact, or deal."
    parameters = [
        ToolParameter(name="company_id", type="string", description="Optional Company UUID", required=False),
        ToolParameter(name="contact_id", type="string", description="Optional Contact UUID", required=False),
        ToolParameter(name="deal_id", type="string", description="Optional Deal UUID", required=False),
        ToolParameter(name="limit", type="integer", description="Max tasks to return (default 10)", required=False),
    ]
    permission_level = PermissionLevel.READ_ONLY

    def execute(
        self,
        context,
        company_id: Optional[str] = None,
        contact_id: Optional[str] = None,
        deal_id: Optional[str] = None,
        limit: int = 10,
        **kwargs
    ) -> ToolResult:
        from apps.tasks.models import Task
        comp_id = resolve_uuid(company_id) or (context.company.id if hasattr(context, "company") and context.company else None)
        cont_id = resolve_uuid(contact_id) or (context.contact.id if hasattr(context, "contact") and context.contact else None)
        dl_id = resolve_uuid(deal_id) or (context.deal.id if hasattr(context, "deal") and context.deal else None)

        qs = Task.objects.select_related("owner")
        if comp_id:
            qs = qs.filter(company_id=comp_id)
        elif cont_id:
            qs = qs.filter(contact_id=cont_id)
        elif dl_id:
            qs = qs.filter(deal_id=dl_id)

        tasks = qs.order_by("-created_at")[: min(limit, 50)]
        results = [
            {
                "id": str(t.id),
                "title": t.title,
                "status": t.get_status_display(),
                "priority": t.get_priority_display() if hasattr(t, "get_priority_display") else getattr(t, "priority", ""),
                "due_date": t.due_date.strftime("%Y-%m-%d") if t.due_date else None,
                "assigned_to": t.owner.get_full_name() if t.owner else "Unassigned",
                "description": clean_text(t.description[:300]) if hasattr(t, "description") and t.description else "",
            }
            for t in tasks
        ]
        return ToolResult(success=True, data={"tasks": results, "count": len(results)}, summary=f"Retrieved {len(results)} tasks")


@register_tool
class GetRecentTasksTool(BaseTool):
    name = "get_recent_tasks"
    description = "Retrieve recent open or pending tasks across the organization."
    parameters = [
        ToolParameter(name="limit", type="integer", description="Max tasks to return (default 10)", required=False)
    ]
    permission_level = PermissionLevel.READ_ONLY

    def execute(self, context, limit: int = 10, **kwargs) -> ToolResult:
        from apps.tasks.models import Task
        tasks = Task.objects.select_related("owner", "company").order_by("-created_at")[: min(limit, 50)]
        results = [
            {
                "id": str(t.id),
                "title": t.title,
                "status": t.get_status_display(),
                "due_date": t.due_date.strftime("%Y-%m-%d") if t.due_date else None,
                "assigned_to": t.owner.get_full_name() if t.owner else "Unassigned",
                "company_name": t.company.name if t.company else None,
            }
            for t in tasks
        ]
        return ToolResult(success=True, data={"tasks": results, "count": len(results)}, summary=f"Retrieved {len(results)} recent tasks")


# ============================================================================
# 2. TIMELINE ACTIVITIES TOOLS
# ============================================================================

@register_tool
class GetRecentTimelineActivitiesTool(BaseTool):
    name = "get_recent_timeline_activities"
    description = "Retrieve recent activity timeline events (meetings, legal review, budget decisions, objections, custom activities)."
    parameters = [
        ToolParameter(name="company_id", type="string", description="Optional Company UUID", required=False),
        ToolParameter(name="contact_id", type="string", description="Optional Contact UUID", required=False),
        ToolParameter(name="deal_id", type="string", description="Optional Deal UUID", required=False),
        ToolParameter(name="limit", type="integer", description="Max activities to return (default 10)", required=False),
    ]
    permission_level = PermissionLevel.READ_ONLY

    def execute(
        self,
        context,
        company_id: Optional[str] = None,
        contact_id: Optional[str] = None,
        deal_id: Optional[str] = None,
        limit: int = 10,
        **kwargs
    ) -> ToolResult:
        from apps.activities.models import Activity
        comp_id = resolve_uuid(company_id) or (context.company.id if hasattr(context, "company") and context.company else None)
        cont_id = resolve_uuid(contact_id) or (context.contact.id if hasattr(context, "contact") and context.contact else None)
        dl_id = resolve_uuid(deal_id) or (context.deal.id if hasattr(context, "deal") and context.deal else None)

        qs = Activity.objects.select_related("performed_by")
        if comp_id:
            qs = qs.filter(company_id=comp_id)
        elif cont_id:
            qs = qs.filter(contact_id=cont_id)
        elif dl_id:
            qs = qs.filter(deal_id=dl_id)

        activities = qs.order_by("-created_at")[: min(limit, 50)]
        results = [
            {
                "id": str(a.id),
                "date": a.created_at.strftime("%Y-%m-%d %H:%M"),
                "activity_type": a.get_activity_type_display(),
                "title": a.title,
                "description": clean_text(a.description[:300]) if a.description else "",
                "performed_by": a.performed_by.get_full_name() if a.performed_by else "System",
            }
            for a in activities
        ]
        return ToolResult(
            success=True,
            data={"timeline_activities": results, "count": len(results)},
            summary=f"Retrieved {len(results)} timeline activities",
        )


@register_tool
class GetActivityDetailsTool(BaseTool):
    name = "get_activity_details"
    description = "Retrieve full details and metadata for a specific timeline activity."
    parameters = [
        ToolParameter(name="activity_id", type="string", description="UUID of the timeline activity", required=True)
    ]
    permission_level = PermissionLevel.READ_ONLY

    def execute(self, context, activity_id: str, **kwargs) -> ToolResult:
        from apps.activities.models import Activity
        aid = resolve_uuid(activity_id)
        if not aid:
            return ToolResult(success=False, error="Invalid activity_id provided.")

        activity = Activity.objects.filter(id=aid).select_related("performed_by", "company", "contact", "deal").first()
        if not activity:
            return ToolResult(success=False, error=f"Activity '{activity_id}' not found.")

        data = {
            "id": str(activity.id),
            "date": activity.created_at.strftime("%Y-%m-%d %H:%M:%S"),
            "activity_type": activity.get_activity_type_display(),
            "title": activity.title,
            "description": clean_text(activity.description),
            "performed_by": activity.performed_by.get_full_name() if activity.performed_by else "System",
            "company_name": activity.company.name if activity.company else None,
            "contact_name": activity.contact.full_name if activity.contact else None,
            "deal_name": activity.deal.name if activity.deal else None,
            "metadata": getattr(activity, "metadata", {}),
        }
        return ToolResult(success=True, data=data, summary=f"Retrieved details for activity '{activity.title}'")


@register_tool
class SearchTimelineActivitiesTool(BaseTool):
    name = "search_timeline_activities"
    description = "Search custom timeline activities by keyword, date range, or entity."
    parameters = [
        ToolParameter(name="query", type="string", description="Keyword to search in title or description", required=False),
        ToolParameter(name="company_id", type="string", description="Optional Company UUID", required=False),
        ToolParameter(name="contact_id", type="string", description="Optional Contact UUID", required=False),
        ToolParameter(name="deal_id", type="string", description="Optional Deal UUID", required=False),
        ToolParameter(name="start_date", type="string", description="Filter from date (YYYY-MM-DD)", required=False),
        ToolParameter(name="end_date", type="string", description="Filter to date (YYYY-MM-DD)", required=False),
        ToolParameter(name="limit", type="integer", description="Max activities to return (default 10)", required=False),
    ]
    permission_level = PermissionLevel.READ_ONLY

    def execute(
        self,
        context,
        query: Optional[str] = None,
        company_id: Optional[str] = None,
        contact_id: Optional[str] = None,
        deal_id: Optional[str] = None,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
        limit: int = 10,
        **kwargs
    ) -> ToolResult:
        from apps.activities.models import Activity
        qs = Activity.objects.select_related("performed_by")

        comp_id = resolve_uuid(company_id) or (context.company.id if hasattr(context, "company") and context.company else None)
        cont_id = resolve_uuid(contact_id) or (context.contact.id if hasattr(context, "contact") and context.contact else None)
        dl_id = resolve_uuid(deal_id) or (context.deal.id if hasattr(context, "deal") and context.deal else None)

        if comp_id:
            qs = qs.filter(company_id=comp_id)
        elif cont_id:
            qs = qs.filter(contact_id=cont_id)
        elif dl_id:
            qs = qs.filter(deal_id=dl_id)

        if query and query.strip():
            q_clean = query.strip()
            qs = qs.filter(Q(title__icontains=q_clean) | Q(description__icontains=q_clean))

        if start_date:
            d_start = parse_date(start_date)
            if d_start:
                qs = qs.filter(created_at__date__gte=d_start)
        if end_date:
            d_end = parse_date(end_date)
            if d_end:
                qs = qs.filter(created_at__date__lte=d_end)

        activities = qs.order_by("-created_at")[: min(limit, 50)]
        results = [
            {
                "id": str(a.id),
                "date": a.created_at.strftime("%Y-%m-%d %H:%M"),
                "activity_type": a.get_activity_type_display(),
                "title": a.title,
                "snippet": clean_text(a.description[:250]) if a.description else "",
                "performed_by": a.performed_by.get_full_name() if a.performed_by else "System",
            }
            for a in activities
        ]
        return ToolResult(
            success=True,
            data={"timeline_activities": results, "count": len(results)},
            summary=f"Found {len(results)} matching timeline activities",
        )


# ============================================================================
# 3. EMAIL TOOLS
# ============================================================================

@register_tool
class GetRecentEmailThreadsTool(BaseTool):
    name = "get_recent_email_threads"
    description = "Retrieve recent email thread headers and metadata for a company, contact, or deal."
    parameters = [
        ToolParameter(name="company_id", type="string", description="Optional Company UUID", required=False),
        ToolParameter(name="contact_id", type="string", description="Optional Contact UUID", required=False),
        ToolParameter(name="deal_id", type="string", description="Optional Deal UUID", required=False),
        ToolParameter(name="limit", type="integer", description="Max threads to return (default 10)", required=False),
    ]
    permission_level = PermissionLevel.READ_ONLY

    def execute(
        self,
        context,
        company_id: Optional[str] = None,
        contact_id: Optional[str] = None,
        deal_id: Optional[str] = None,
        limit: int = 10,
        **kwargs
    ) -> ToolResult:
        from apps.emails.models import EmailThread
        comp_id = resolve_uuid(company_id) or (context.company.id if hasattr(context, "company") and context.company else None)
        cont_id = resolve_uuid(contact_id) or (context.contact.id if hasattr(context, "contact") and context.contact else None)
        dl_id = resolve_uuid(deal_id) or (context.deal.id if hasattr(context, "deal") and context.deal else None)

        qs = EmailThread.objects.prefetch_related("messages")
        if comp_id:
            qs = qs.filter(Q(company_id=comp_id) | Q(contact__company_id=comp_id))
        elif cont_id:
            qs = qs.filter(contact_id=cont_id)
        elif dl_id:
            qs = qs.filter(deal_id=dl_id)

        threads = qs.distinct().order_by("-last_message_time")[: min(limit, 20)]
        results = []
        for t in threads:
            snippet = clean_text(t.snippet)
            if not snippet:
                last_msg = t.messages.order_by("-internal_date").first()
                if last_msg:
                    snippet = clean_text(last_msg.plain_text_body)
            results.append({
                "thread_id": str(t.id),
                "gmail_thread_id": t.gmail_thread_id,
                "subject": t.subject or "(No Subject)",
                "snippet": snippet[:200],
                "last_message_time": t.last_message_time.strftime("%Y-%m-%d %H:%M") if t.last_message_time else None,
                "message_count": t.messages.count(),
            })

        return ToolResult(success=True, data={"threads": results, "count": len(results)}, summary=f"Retrieved {len(results)} email threads")


@register_tool
class GetEmailThreadTool(BaseTool):
    name = "get_email_thread"
    description = "Retrieve full messages within an email thread by thread_id or gmail_thread_id."
    parameters = [
        ToolParameter(name="thread_id", type="string", description="UUID or Gmail Thread ID of the email thread", required=True)
    ]
    permission_level = PermissionLevel.READ_ONLY

    def execute(self, context, thread_id: str, **kwargs) -> ToolResult:
        from apps.emails.models import EmailThread
        tid = resolve_uuid(thread_id)
        if tid:
            thread = EmailThread.objects.filter(id=tid).prefetch_related("messages").first()
        else:
            thread = EmailThread.objects.filter(gmail_thread_id=thread_id).prefetch_related("messages").first()

        if not thread:
            return ToolResult(success=False, error=f"Email thread '{thread_id}' not found.")

        messages = thread.messages.order_by("internal_date")[:20]
        msg_list = []
        for m in messages:
            body = clean_text(m.plain_text_body or m.html_body)
            msg_list.append({
                "id": str(m.id),
                "sender": m.sender,
                "recipients": m.recipients,
                "direction": m.direction,
                "date": m.internal_date.strftime("%Y-%m-%d %H:%M:%S UTC") if m.internal_date else "",
                "body": body[:1000],
            })

        return ToolResult(
            success=True,
            data={
                "thread_id": str(thread.id),
                "subject": thread.subject,
                "messages": msg_list,
            },
            summary=f"Retrieved email thread '{thread.subject}' with {len(msg_list)} messages",
        )


@register_tool
class SearchEmailThreadsTool(BaseTool):
    name = "search_email_threads"
    description = "Search email threads by subject or message content."
    parameters = [
        ToolParameter(name="query", type="string", description="Keyword to search in emails", required=True),
        ToolParameter(name="limit", type="integer", description="Max threads to return (default 10)", required=False),
    ]
    permission_level = PermissionLevel.READ_ONLY

    def execute(self, context, query: str, limit: int = 10, **kwargs) -> ToolResult:
        from apps.emails.models import EmailThread
        q_clean = query.strip()
        if not q_clean:
            return ToolResult(success=False, error="Search query cannot be empty.")

        threads = EmailThread.objects.filter(
            Q(subject__icontains=q_clean) | Q(snippet__icontains=q_clean) | Q(messages__plain_text_body__icontains=q_clean) | Q(messages__html_body__icontains=q_clean)
        ).distinct().order_by("-last_message_time")[: min(limit, 20)]

        results = [
            {
                "thread_id": str(t.id),
                "subject": t.subject or "(No Subject)",
                "last_message_time": t.last_message_time.strftime("%Y-%m-%d %H:%M") if t.last_message_time else None,
            }
            for t in threads
        ]
        return ToolResult(success=True, data={"threads": results, "count": len(results)}, summary=f"Found {len(results)} email threads matching '{query}'")


# ============================================================================
# 4. CALL TOOLS
# ============================================================================

@register_tool
class GetRecentCallTranscriptsTool(BaseTool):
    name = "get_recent_call_transcripts"
    description = "Retrieve recent call transcripts and call logs."
    parameters = [
        ToolParameter(name="company_id", type="string", description="Optional Company UUID", required=False),
        ToolParameter(name="contact_id", type="string", description="Optional Contact UUID", required=False),
        ToolParameter(name="deal_id", type="string", description="Optional Deal UUID", required=False),
        ToolParameter(name="limit", type="integer", description="Max calls to return (default 5)", required=False),
    ]
    permission_level = PermissionLevel.READ_ONLY

    def execute(
        self,
        context,
        company_id: Optional[str] = None,
        contact_id: Optional[str] = None,
        deal_id: Optional[str] = None,
        limit: int = 5,
        **kwargs
    ) -> ToolResult:
        from apps.telephony.models import Call
        comp_id = resolve_uuid(company_id) or (context.company.id if hasattr(context, "company") and context.company else None)
        cont_id = resolve_uuid(contact_id) or (context.contact.id if hasattr(context, "contact") and context.contact else None)
        dl_id = resolve_uuid(deal_id) or (context.deal.id if hasattr(context, "deal") and context.deal else None)

        qs = Call.objects.select_related("contact", "company", "deal")
        if comp_id:
            qs = qs.filter(company_id=comp_id)
        elif cont_id:
            qs = qs.filter(contact_id=cont_id)
        elif dl_id:
            qs = qs.filter(deal_id=dl_id)

        calls = qs.order_by("-created_at")[: min(limit, 20)]
        results = []
        for c in calls:
            has_transcript = hasattr(c, "transcript") and c.transcript and bool(c.transcript.full_text)
            results.append({
                "call_id": str(c.id),
                "direction": c.direction,
                "status": c.status,
                "created_at": c.created_at.strftime("%Y-%m-%d %H:%M"),
                "contact_name": c.contact.full_name if c.contact else "Unknown",
                "company_name": c.company.name if c.company else "Unknown",
                "has_transcript": has_transcript,
                "transcript_snippet": clean_text(c.transcript.full_text[:200]) if has_transcript else "",
            })

        return ToolResult(success=True, data={"calls": results, "count": len(results)}, summary=f"Retrieved {len(results)} recent call logs")


@register_tool
class GetCallSummaryTool(BaseTool):
    name = "get_call_summary"
    description = "Retrieve the full transcript and AI summary for a specific call."
    parameters = [
        ToolParameter(name="call_id", type="string", description="UUID of the call", required=True)
    ]
    permission_level = PermissionLevel.READ_ONLY

    def execute(self, context, call_id: str, **kwargs) -> ToolResult:
        from apps.telephony.models import Call
        cid = resolve_uuid(call_id)
        if not cid:
            return ToolResult(success=False, error="Invalid call_id provided.")

        call = Call.objects.filter(id=cid).select_related("contact", "company", "deal").first()
        if not call:
            return ToolResult(success=False, error=f"Call '{call_id}' not found.")

        transcript_text = ""
        summary = ""
        if hasattr(call, "transcript") and call.transcript:
            transcript_text = clean_text(call.transcript.full_text)
            summary = getattr(call.transcript, "summary", "")

        data = {
            "call_id": str(call.id),
            "direction": call.direction,
            "status": call.status,
            "contact_name": call.contact.full_name if call.contact else "Unknown",
            "company_name": call.company.name if call.company else "Unknown",
            "summary": summary,
            "transcript": transcript_text[:3000],
        }
        return ToolResult(success=True, data=data, summary=f"Retrieved call transcript and summary for call '{call_id}'")


# ============================================================================
# 5. RESEARCH TOOLS
# ============================================================================

@register_tool
class GetWebsiteResearchTool(BaseTool):
    name = "get_website_research"
    description = "Retrieve AI website research data (pain points, tech stack, buying signals, objections, services) for a company."
    parameters = [
        ToolParameter(name="company_id", type="string", description="UUID of the company (optional if in context)", required=False)
    ]
    permission_level = PermissionLevel.READ_ONLY

    def execute(self, context, company_id: Optional[str] = None, **kwargs) -> ToolResult:
        from apps.companies.models import Company
        cid = resolve_uuid(company_id) or (context.company.id if hasattr(context, "company") and context.company else None)
        if not cid:
            return ToolResult(success=False, error="No company_id provided or available in context.")

        company = Company.objects.filter(id=cid).first()
        if not company:
            return ToolResult(success=False, error=f"Company '{cid}' not found.")

        try:
            res = company.research
        except Exception:
            res = None

        if not res:
            return ToolResult(
                success=True,
                data={
                    "company_id": str(company.id),
                    "company_name": company.name,
                    "website": company.website,
                    "description": company.description,
                    "status": "NO_RESEARCH_YET",
                    "note": f"AI website research has not been generated for {company.name} yet.",
                },
                summary=f"No website research available yet for {company.name}.",
            )

        data = {
            "company_id": str(company.id),
            "company_name": company.name,
            "business_summary": res.business_summary or company.description,
            "estimated_size": res.estimated_size,
            "icp_match": res.icp_match,
            "security_maturity": res.security_maturity,
            "why_radar36_fits": res.why_radar36_fits,
            "pain_points": res.pain_points,
            "technology_stack": res.technology_stack,
            "buying_signals": res.buying_signals,
            "potential_objections": res.potential_objections,
            "services": res.services,
            "products": res.products,
        }
        return ToolResult(success=True, data=data, summary=f"Retrieved website research for {company.name}")


@register_tool
class GetLinkedinResearchTool(BaseTool):
    name = "get_linkedin_research"
    description = "Retrieve LinkedIn intelligence and executive profile research."
    parameters = [
        ToolParameter(name="company_id", type="string", description="Optional Company UUID", required=False),
        ToolParameter(name="contact_id", type="string", description="Optional Contact UUID", required=False),
    ]
    permission_level = PermissionLevel.READ_ONLY

    def execute(
        self,
        context,
        company_id: Optional[str] = None,
        contact_id: Optional[str] = None,
        **kwargs
    ) -> ToolResult:
        from apps.companies.models import Company
        from apps.contacts.models import Contact

        comp_id = resolve_uuid(company_id) or (context.company.id if hasattr(context, "company") and context.company else None)
        cont_id = resolve_uuid(contact_id) or (context.contact.id if hasattr(context, "contact") and context.contact else None)

        data = {}
        if cont_id:
            contact = Contact.objects.filter(id=cont_id).first()
            if contact:
                data["contact_name"] = contact.full_name
                data["linkedin_url"] = contact.linkedin_url
                data["job_title"] = contact.job_title

        if comp_id:
            company = Company.objects.filter(id=comp_id).first()
            if company:
                data["company_name"] = company.name
                data["linkedin_url"] = company.linkedin_url
                try:
                    res = company.research
                    if res:
                        data["linkedin_summary"] = getattr(res, "linkedin_summary", "")
                except Exception:
                    data["linkedin_summary"] = ""

        return ToolResult(success=True, data=data, summary="Retrieved LinkedIn research data")


# ============================================================================
# 6. SEARCH TOOLS
# ============================================================================

@register_tool
class SearchNotesTool(BaseTool):
    name = "search_notes"
    description = "Search notes by keyword across the CRM."
    parameters = [
        ToolParameter(name="query", type="string", description="Keyword search query", required=True),
        ToolParameter(name="company_id", type="string", description="Optional Company UUID", required=False),
        ToolParameter(name="contact_id", type="string", description="Optional Contact UUID", required=False),
        ToolParameter(name="deal_id", type="string", description="Optional Deal UUID", required=False),
        ToolParameter(name="limit", type="integer", description="Max notes to return (default 10)", required=False),
    ]
    permission_level = PermissionLevel.READ_ONLY

    def execute(
        self,
        context,
        query: str,
        company_id: Optional[str] = None,
        contact_id: Optional[str] = None,
        deal_id: Optional[str] = None,
        limit: int = 10,
        **kwargs
    ) -> ToolResult:
        from apps.notes.models import Note
        q_clean = query.strip()
        if not q_clean:
            return ToolResult(success=False, error="Search query cannot be empty.")

        qs = Note.objects.filter(content__icontains=q_clean).select_related("created_by")
        comp_id = resolve_uuid(company_id)
        cont_id = resolve_uuid(contact_id)
        dl_id = resolve_uuid(deal_id)

        if comp_id:
            qs = qs.filter(company_id=comp_id)
        elif cont_id:
            qs = qs.filter(contact_id=cont_id)
        elif dl_id:
            qs = qs.filter(deal_id=dl_id)

        notes = qs.order_by("-created_at")[: min(limit, 50)]
        results = [
            {
                "id": str(n.id),
                "author": n.created_by.get_full_name() if n.created_by else "Unknown",
                "date": n.created_at.strftime("%Y-%m-%d"),
                "snippet": clean_text(n.content[:300]),
            }
            for n in notes
        ]
        return ToolResult(success=True, data={"notes": results, "count": len(results)}, summary=f"Found {len(results)} notes matching '{query}'")


@register_tool
class SearchContactsTool(BaseTool):
    name = "search_contacts"
    description = "Search CRM contacts by name, email, or job title."
    parameters = [
        ToolParameter(name="query", type="string", description="Keyword search query", required=True),
        ToolParameter(name="limit", type="integer", description="Max contacts to return (default 10)", required=False),
    ]
    permission_level = PermissionLevel.READ_ONLY

    def execute(self, context, query: str, limit: int = 10, **kwargs) -> ToolResult:
        from apps.contacts.models import Contact
        q_clean = query.strip()
        if not q_clean:
            return ToolResult(success=False, error="Search query cannot be empty.")

        contacts = Contact.objects.filter(
            Q(first_name__icontains=q_clean) |
            Q(last_name__icontains=q_clean) |
            Q(email__icontains=q_clean) |
            Q(job_title__icontains=q_clean)
        ).select_related("company")[: min(limit, 50)]

        results = [
            {
                "id": str(c.id),
                "full_name": c.full_name,
                "email": c.email,
                "job_title": c.job_title,
                "company_name": c.company.name if c.company else None,
            }
            for c in contacts
        ]
        return ToolResult(success=True, data={"contacts": results, "count": len(results)}, summary=f"Found {len(results)} contacts matching '{query}'")


@register_tool
class SearchCompaniesTool(BaseTool):
    name = "search_companies"
    description = "Search CRM companies by name, industry, or website."
    parameters = [
        ToolParameter(name="query", type="string", description="Keyword search query", required=True),
        ToolParameter(name="limit", type="integer", description="Max companies to return (default 10)", required=False),
    ]
    permission_level = PermissionLevel.READ_ONLY

    def execute(self, context, query: str, limit: int = 10, **kwargs) -> ToolResult:
        from apps.companies.models import Company
        q_clean = query.strip()
        if not q_clean:
            return ToolResult(success=False, error="Search query cannot be empty.")

        companies = Company.objects.filter(
            Q(name__icontains=q_clean) | Q(industry__icontains=q_clean) | Q(website__icontains=q_clean)
        )[: min(limit, 50)]

        results = [
            {
                "id": str(c.id),
                "name": c.name,
                "industry": c.industry,
                "stage": c.get_stage_display(),
                "icp_score": c.icp_score,
            }
            for c in companies
        ]
        return ToolResult(success=True, data={"companies": results, "count": len(results)}, summary=f"Found {len(results)} companies matching '{query}'")


@register_tool
class SearchDealsTool(BaseTool):
    name = "search_deals"
    description = "Search CRM deals by name or description."
    parameters = [
        ToolParameter(name="query", type="string", description="Keyword search query", required=True),
        ToolParameter(name="limit", type="integer", description="Max deals to return (default 10)", required=False),
    ]
    permission_level = PermissionLevel.READ_ONLY

    def execute(self, context, query: str, limit: int = 10, **kwargs) -> ToolResult:
        from apps.deals.models import Deal
        q_clean = query.strip()
        if not q_clean:
            return ToolResult(success=False, error="Search query cannot be empty.")

        deals = Deal.objects.filter(
            Q(name__icontains=q_clean) | Q(description__icontains=q_clean)
        ).select_related("company")[: min(limit, 50)]

        results = [
            {
                "id": str(d.id),
                "name": d.name,
                "company_name": d.company.name if d.company else None,
                "stage": d.get_stage_display(),
                "expected_revenue": float(d.expected_revenue) if d.expected_revenue else 0.0,
            }
            for d in deals
        ]
        return ToolResult(success=True, data={"deals": results, "count": len(results)}, summary=f"Found {len(results)} deals matching '{query}'")
