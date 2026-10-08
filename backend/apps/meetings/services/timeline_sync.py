import logging
from typing import Any

from apps.activities.models import Activity
from apps.common.enums import ActivityType
from apps.notes.models import Note

logger = logging.getLogger(__name__)


def sync_meeting_to_timeline(meeting: Any) -> None:
    """
    Synchronizes meeting details, notes, and AI analysis to the CRM Activity timeline
    and attached CRM Note. Ensures contact and company detail pages reflect accurate history.
    """
    has_crm_link = bool(meeting.contact or meeting.company or meeting.deal)

    # ─────────────────────────────────────────────────────────────────────────
    # 1. Activity Timeline Synchronization
    # ─────────────────────────────────────────────────────────────────────────
    if has_crm_link:
        activity_title = f"Meeting: {meeting.title}"
        
        # Build structured metadata payload
        metadata = {
            "meeting_id": str(meeting.id),
            "google_event_id": meeting.google_event_id,
            "start_time": meeting.start_time.isoformat() if meeting.start_time else None,
            "end_time": meeting.end_time.isoformat() if meeting.end_time else None,
            "timezone": meeting.timezone,
            "meeting_url": meeting.meeting_url,
            "location": meeting.location,
            "status": meeting.status,
            "attendees": meeting.attendees,
            "has_notes": bool(meeting.meeting_notes),
            "has_transcript": bool(meeting.transcript),
            "has_analysis": bool(meeting.analysis),
            "is_finished": meeting.is_finished,
        }

        # Include summary and action items in metadata if available
        if meeting.analysis:
            metadata["summary"] = meeting.analysis.get("summary", "")
            metadata["action_items"] = meeting.analysis.get("action_items", [])
            metadata["key_takeaways"] = meeting.analysis.get("key_takeaways", [])
            metadata["sentiment"] = meeting.analysis.get("sentiment", "")

        description = (
            meeting.meeting_notes
            or (meeting.analysis.get("summary") if meeting.analysis else "")
            or meeting.description
            or ""
        )

        if meeting.activity:
            activity = meeting.activity
            activity.title = activity_title
            activity.description = description
            activity.performed_by = meeting.user
            activity.company = meeting.company
            activity.contact = meeting.contact
            activity.deal = meeting.deal
            activity.metadata = metadata
            activity.save(update_fields=[
                "title", "description", "performed_by", "company", "contact", "deal", "metadata", "updated_at"
            ])
        else:
            activity = Activity.objects.create(
                activity_type=ActivityType.MEETING,
                title=activity_title,
                description=description,
                performed_by=meeting.user,
                company=meeting.company,
                contact=meeting.contact,
                deal=meeting.deal,
                metadata=metadata,
                created_by=meeting.user,
                updated_by=meeting.user,
            )
            meeting.activity = activity
            meeting.save(update_fields=["activity"])
    else:
        # If unlinked from CRM, remove linked activity to keep timeline clean
        if meeting.activity:
            old_activity = meeting.activity
            meeting.activity = None
            meeting.save(update_fields=["activity"])
            old_activity.delete()

    # ─────────────────────────────────────────────────────────────────────────
    # 2. CRM Note Synchronization (Notes & Post-Meeting Analysis)
    # ─────────────────────────────────────────────────────────────────────────
    has_notes_content = bool(meeting.meeting_notes or (meeting.analysis and meeting.analysis.get("summary")))
    
    if has_crm_link and has_notes_content:
        note_content = _build_markdown_note(meeting)
        
        if meeting.synced_note:
            note = meeting.synced_note
            note.content = note_content
            note.company = meeting.company
            note.contact = meeting.contact
            note.deal = meeting.deal
            note.save(update_fields=["content", "company", "contact", "deal", "updated_at"])
        else:
            note = Note.objects.create(
                content=note_content,
                company=meeting.company,
                contact=meeting.contact,
                deal=meeting.deal,
                created_by=meeting.user,
                updated_by=meeting.user,
            )
            meeting.synced_note = note
            meeting.save(update_fields=["synced_note"])
    elif not has_crm_link or not has_notes_content:
        if meeting.synced_note:
            old_note = meeting.synced_note
            meeting.synced_note = None
            meeting.save(update_fields=["synced_note"])
            old_note.delete()


def _build_markdown_note(meeting: Any) -> str:
    """Formats meeting notes and structured AI analysis into crisp Markdown."""
    lines = [
        f"### 📅 Meeting Notes: {meeting.title}",
        f"**Date:** {meeting.start_time.strftime('%B %d, %Y at %I:%M %p %Z')}",
    ]

    if meeting.meeting_url:
        lines.append(f"**Call Link:** [{meeting.meeting_url}]({meeting.meeting_url})")

    if meeting.attendees:
        att_str = ", ".join([
            att.get("displayName") or att.get("email")
            for att in meeting.attendees if att.get("email")
        ])
        if att_str:
            lines.append(f"**Attendees:** {att_str}")

    lines.append("")

    if meeting.meeting_notes:
        lines.append("#### Notes & Discussion")
        lines.append(meeting.meeting_notes)
        lines.append("")

    if meeting.analysis:
        analysis = meeting.analysis
        if analysis.get("summary"):
            lines.append("#### Executive Summary")
            lines.append(analysis["summary"])
            lines.append("")

        if analysis.get("key_takeaways"):
            lines.append("#### Key Decisions & Highlights")
            for item in analysis["key_takeaways"]:
                lines.append(f"- {item}")
            lines.append("")

        if analysis.get("action_items"):
            lines.append("#### Action Items")
            for ai in analysis["action_items"]:
                task_desc = ai.get("task", "") if isinstance(ai, dict) else str(ai)
                owner = f" ({ai.get('owner')})" if isinstance(ai, dict) and ai.get("owner") else ""
                lines.append(f"- [ ] {task_desc}{owner}")
            lines.append("")

        if analysis.get("objections_raised"):
            lines.append("#### Objections / Questions")
            for obj in analysis["objections_raised"]:
                lines.append(f"- {obj}")
            lines.append("")

    return "\n".join(lines).strip()
