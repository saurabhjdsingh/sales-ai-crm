import calendar
import logging
from datetime import datetime, timedelta, timezone as dt_timezone
from typing import Any, Dict, List, Optional, Tuple

from django.contrib.auth import get_user_model
from django.utils import timezone

from apps.accounts.models import OrganizationSettings
from apps.emails.models import EmailAccount
from apps.meetings.models import IgnoredMeetingEvent, Meeting, MeetingStatus
from apps.meetings.services.google_calendar import GoogleCalendarService
from apps.meetings.services.meeting_matcher import resolve_meeting_crm_entities
from apps.meetings.services.timeline_sync import sync_meeting_to_timeline

logger = logging.getLogger(__name__)


class MeetingSyncService:
    """
    Production-grade synchronization engine for Google Calendar events:
    - Calculates dynamic fetch time ranges (end of next month default, or N days).
    - Filters out internal / mentor / personal events using configured excluded domains.
    - Oplocks and skips user-discarded events recorded in IgnoredMeetingEvent.
    - Intelligently detects reschedules and automatically resets reminder state.
    """

    @classmethod
    def calculate_sync_range(cls, time_range: str = "next_month") -> Tuple[datetime, datetime]:
        """
        Computes (time_min, time_max) for calendar event querying.
        time_min is 7 days in the past (to capture recent completed meetings).
        """
        now = timezone.now()
        time_min = now - timedelta(days=7)

        if time_range == "14_days":
            time_max = now + timedelta(days=14)
        elif time_range == "30_days":
            time_max = now + timedelta(days=30)
        elif time_range == "60_days":
            time_max = now + timedelta(days=60)
        elif time_range == "90_days":
            time_max = now + timedelta(days=90)
        else:
            # Default: End of Next Month
            if now.month == 12:
                next_month_year = now.year + 1
                next_month = 1
            else:
                next_month_year = now.year
                next_month = now.month + 1

            _, last_day = calendar.monthrange(next_month_year, next_month)
            time_max = datetime(
                next_month_year, next_month, last_day, 23, 59, 59, tzinfo=dt_timezone.utc
            )

        return time_min, time_max

    @classmethod
    def get_excluded_domains(cls) -> List[str]:
        """Returns normalized list of lowercase domains configured in OrganizationSettings."""
        try:
            settings_obj = OrganizationSettings.get_solo()
            raw = settings_obj.excluded_meeting_domains or ""
            domains = [
                d.strip().lower().lstrip("@")
                for d in raw.replace("\n", ",").split(",")
                if d.strip()
            ]
            return [d for d in domains if "." in d]
        except Exception as e:
            logger.warning(f"Could not retrieve excluded domains: {e}")
            return []

    @classmethod
    def get_excluded_titles(cls) -> List[str]:
        """Returns normalized list of lowercase title keywords configured in OrganizationSettings."""
        try:
            settings_obj = OrganizationSettings.get_solo()
            raw = settings_obj.excluded_meeting_titles or ""
            titles = [
                t.strip().lower()
                for t in raw.replace("\n", ",").split(",")
                if t.strip()
            ]
            return titles
        except Exception as e:
            logger.warning(f"Could not retrieve excluded titles: {e}")
            return []

    @classmethod
    def purge_excluded_meetings_for_user(
        cls, user, excluded_domains: List[str] | None = None, excluded_titles: List[str] | None = None
    ) -> int:
        """
        Deletes any existing database meetings for this user that match the excluded
        domain or title criteria, and adds their google_event_ids to IgnoredMeetingEvent.
        """
        if excluded_domains is None:
            excluded_domains = cls.get_excluded_domains()
        if excluded_titles is None:
            excluded_titles = cls.get_excluded_titles()

        if not excluded_domains and not excluded_titles:
            return 0

        user_email = (user.email or "").strip().lower()
        user_domain = user_email.split("@")[1] if "@" in user_email else ""

        meetings_to_delete = []
        for m in Meeting.objects.filter(user=user):
            # 1. Check title match (case-insensitive substring)
            m_title = (m.title or "").strip().lower()
            if excluded_titles:
                if any(t in m_title for t in excluded_titles):
                    meetings_to_delete.append(m)
                    continue

            # 2. Check domains / solo
            if excluded_domains:
                emails = set()
                org_email = (m.organizer or {}).get("email", "").strip().lower()
                if org_email and "@" in org_email and not org_email.endswith("calendar.google.com"):
                    emails.add(org_email)
                for att in (m.attendees or []):
                    att_email = att.get("email", "").strip().lower()
                    if att_email and "@" in att_email and not att_email.endswith("calendar.google.com"):
                        emails.add(att_email)

                other_emails = {e for e in emails if e != user_email}
                if not other_emails:
                    meetings_to_delete.append(m)
                    continue

                participant_domains = {e.split("@")[1].strip().lower() for e in emails if "@" in e}
                all_internal = all(
                    (d in excluded_domains or (user_domain and d == user_domain))
                    for d in participant_domains
                )
                if all_internal:
                    meetings_to_delete.append(m)

        count = len(meetings_to_delete)
        if count > 0:
            for m in meetings_to_delete:
                if m.google_event_id:
                    IgnoredMeetingEvent.objects.get_or_create(
                        user=user,
                        google_event_id=m.google_event_id,
                        defaults={
                            "reason": "Purged by exclusion filter",
                            "title": m.title,
                        },
                    )
                m.delete()
            logger.info(f"Purged {count} existing meetings for {user.email} based on exclusion filters.")

        return count

    @classmethod
    def purge_all_excluded_meetings(cls) -> int:
        """Global retroactive purge across all users in the CRM."""
        from apps.accounts.models import User
        excluded_domains = cls.get_excluded_domains()
        excluded_titles = cls.get_excluded_titles()
        if not excluded_domains and not excluded_titles:
            return 0

        total = 0
        for u in User.objects.all():
            total += cls.purge_excluded_meetings_for_user(u, excluded_domains, excluded_titles)
        return total

    @classmethod
    def should_sync_meeting(
        cls,
        event: Dict[str, Any],
        user,
        excluded_domains: List[str],
        excluded_titles: List[str],
        ignored_event_ids: set,
    ) -> Tuple[bool, str]:
        """
        Evaluates whether a Google Calendar event should be saved in the CRM.
        Returns (should_sync: bool, reason: str).
        """
        event_id = event.get("google_event_id")
        if not event_id:
            return False, "Missing event ID"

        # 1. Check if previously discarded by user
        if event_id in ignored_event_ids:
            return False, "Manually removed from CRM by user"

        # 2. Check title against excluded keywords
        title = (event.get("title") or event.get("summary") or "").strip().lower()
        if excluded_titles:
            for excl in excluded_titles:
                if excl in title:
                    return False, f"Title matched excluded keyword: '{excl}'"

        # 3. Extract attendee and organizer emails
        attendees = event.get("attendees", [])
        organizer = event.get("organizer", {})

        emails = set()
        user_email = (user.email or "").strip().lower()

        org_email = organizer.get("email", "").strip().lower()
        if org_email and "@" in org_email and not org_email.endswith("calendar.google.com"):
            emails.add(org_email)

        for att in attendees:
            att_email = att.get("email", "").strip().lower()
            if att_email and "@" in att_email and not att_email.endswith("calendar.google.com"):
                emails.add(att_email)

        # 4. Solo / Personal calendar block (no other attendees)
        # If the only email is the user's email, or no valid attendees
        other_emails = {e for e in emails if e != user_email}
        if not other_emails:
            return False, "Personal or solo calendar event (no external attendees)"

        # 5. Domain Blacklisting / Internal exclusion check
        if excluded_domains:
            # Extract domains of all participants
            participant_domains = {e.split("@")[1].strip().lower() for e in emails if "@" in e}
            user_domain = user_email.split("@")[1] if "@" in user_email else ""

            # Check if every participant belongs to either the user's own domain or the excluded domains
            all_internal = all(
                (d in excluded_domains or (user_domain and d == user_domain))
                for d in participant_domains
            )
            if all_internal:
                return (
                    False,
                    f"Internal/excluded meeting strictly within {participant_domains}",
                )

        return True, "Valid sales meeting"

    @classmethod
    def sync_user_calendar(
        cls, user, time_range: str = "next_month"
    ) -> Dict[str, Any]:
        """
        Main synchronization runner for an individual CRM user's primary calendar.
        """
        account = (
            EmailAccount.objects.filter(
                user=user,
                provider_type="gmail",
                status="connected",
            ).first()
            or EmailAccount.objects.filter(
                user=user,
                status="connected",
            ).first()
        )

        if not account or not account.refresh_token_encrypted:
            return {
                "success": False,
                "error": "No connected Google account found.",
                "connected": False,
            }

        calendar_service = GoogleCalendarService(account)
        time_min, time_max = cls.calculate_sync_range(time_range)

        events = calendar_service.fetch_events(time_min=time_min, time_max=time_max)
        excluded_domains = cls.get_excluded_domains()
        excluded_titles = cls.get_excluded_titles()

        # Retroactive purge: Clean any existing DB meetings that match updated excluded domains or titles
        cls.purge_excluded_meetings_for_user(user, excluded_domains, excluded_titles)

        # Cache ignored event IDs in memory for fast lookup
        ignored_event_ids = set(
            IgnoredMeetingEvent.objects.filter(user=user).values_list(
                "google_event_id", flat=True
            )
        )

        synced_count = 0
        matched_count = 0
        filtered_count = 0
        now = timezone.now()

        for ev in events:
            should_sync, reason = cls.should_sync_meeting(
                ev, user, excluded_domains, excluded_titles, ignored_event_ids
            )
            if not should_sync:
                filtered_count += 1
                logger.debug(
                    f"Skipping meeting '{ev.get('title')}' for {user.username}: {reason}"
                )
                # Ensure existing record is deleted from DB if it previously got synced
                existing = Meeting.objects.filter(user=user, google_event_id=ev["google_event_id"]).first()
                if existing:
                    existing.delete()
                continue

            meeting, created = Meeting.objects.get_or_create(
                user=user,
                google_event_id=ev["google_event_id"],
                defaults={
                    "title": ev["title"],
                    "description": ev["description"],
                    "start_time": ev["start_time"],
                    "end_time": ev["end_time"],
                    "timezone": ev["timezone"],
                    "location": ev["location"],
                    "meeting_url": ev["meeting_url"],
                    "html_link": ev["html_link"],
                    "status": ev["status"],
                    "organizer": ev["organizer"],
                    "attendees": ev["attendees"],
                    "send_reminders": ev["start_time"] > now,
                    "created_by": user,
                    "updated_by": user,
                },
            )

            if created:
                contact, company, matched_email = resolve_meeting_crm_entities(
                    ev, user.email
                )
                meeting.contact = contact
                meeting.company = company
                meeting.matched_attendee_email = matched_email or ""
                meeting.is_auto_matched = bool(contact or company)
                meeting.save()
                if meeting.is_auto_matched:
                    matched_count += 1
            else:
                # Detect Reschedule / Time Change
                time_changed = (
                    abs((meeting.start_time - ev["start_time"]).total_seconds()) > 900
                )
                old_start = meeting.start_time

                # Update core fields
                meeting.title = ev["title"]
                meeting.start_time = ev["start_time"]
                meeting.end_time = ev["end_time"]
                meeting.timezone = ev["timezone"]
                meeting.location = ev["location"]
                meeting.meeting_url = ev["meeting_url"]
                meeting.html_link = ev["html_link"]
                meeting.status = ev["status"]
                meeting.organizer = ev["organizer"]
                meeting.attendees = ev["attendees"]

                # Ensure past meetings never have reminders enabled
                if meeting.start_time <= now:
                    meeting.send_reminders = False

                if time_changed:
                    logger.info(
                        f"Meeting '{meeting.title}' rescheduled from {old_start} to {meeting.start_time}. Updating reminder states."
                    )
                    # If rescheduled to a future date, reset reminder flags so reminders fire for new time
                    delta_seconds = (meeting.start_time - now).total_seconds()
                    if delta_seconds > 86400:  # > 24 hours away
                        meeting.reminder_24h_sent = False
                        meeting.reminder_1h_sent = False
                    elif delta_seconds > 3600:  # > 1 hour away
                        meeting.reminder_1h_sent = False

                if not meeting.is_manually_edited and not meeting.contact:
                    contact, company, matched_email = resolve_meeting_crm_entities(
                        ev, user.email
                    )
                    if contact:
                        meeting.contact = contact
                        meeting.company = company
                        meeting.matched_attendee_email = matched_email or ""
                        meeting.is_auto_matched = True
                        matched_count += 1

                meeting.save()

            sync_meeting_to_timeline(meeting)
            synced_count += 1

        return {
            "success": True,
            "synced_count": synced_count,
            "matched_count": matched_count,
            "filtered_count": filtered_count,
            "time_range": time_range,
        }
