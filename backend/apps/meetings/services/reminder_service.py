import logging
from datetime import datetime
from typing import Any, Dict, List

from django.conf import settings
from django.utils import timezone

from apps.accounts.services.branding import BrandingService
from apps.activities.models import Activity, ActivityType
from apps.emails.models import EmailAccount
from apps.emails.providers.factory import ProviderFactory
from apps.meetings.models import Meeting, MeetingStatus

logger = logging.getLogger(__name__)

MEETING_REMINDER_EMAIL_TEMPLATE = """<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Meeting Reminder: {title}</title>
    <style>
        body {{
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            background-color: #f8fafc;
            color: #1e293b;
            margin: 0;
            padding: 0;
        }}
        .container {{
            max-width: 600px;
            margin: 0 auto;
            padding: 40px 20px;
        }}
        .header {{
            text-align: center;
            margin-bottom: 24px;
        }}
        .logo {{
            max-height: 56px;
            margin-bottom: 12px;
        }}
        .org-name {{
            font-size: 20px;
            font-weight: 700;
            color: #0f172a;
        }}
        .card {{
            background-color: #ffffff;
            border-radius: 12px;
            padding: 32px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
            border: 1px solid #e2e8f0;
        }}
        .badge {{
            display: inline-block;
            font-size: 12px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            padding: 4px 10px;
            border-radius: 6px;
            background-color: #eff6ff;
            color: #2563eb;
            margin-bottom: 16px;
        }}
        h1 {{
            font-size: 22px;
            font-weight: 700;
            color: #0f172a;
            margin-top: 0;
            margin-bottom: 12px;
            line-height: 1.3;
        }}
        .meeting-time-box {{
            background: #f1f5f9;
            border-left: 4px solid #2563eb;
            border-radius: 6px;
            padding: 16px;
            margin: 20px 0;
        }}
        .time-label {{
            font-size: 12px;
            font-weight: 600;
            color: #64748b;
            text-transform: uppercase;
            margin-bottom: 4px;
        }}
        .time-val {{
            font-size: 16px;
            font-weight: 700;
            color: #0f172a;
        }}
        .time-hint {{
            font-size: 12px;
            color: #64748b;
            margin-top: 6px;
        }}
        .btn-wrapper {{
            text-align: center;
            margin: 28px 0 20px 0;
        }}
        .btn-primary {{
            display: inline-block;
            background: linear-gradient(135deg, #2563eb, #1d4ed8);
            color: #ffffff !important;
            text-decoration: none;
            padding: 12px 24px;
            font-weight: 600;
            border-radius: 8px;
            font-size: 15px;
            box-shadow: 0 2px 8px rgba(37, 99, 235, 0.3);
            margin: 6px 4px;
        }}
        .btn-secondary {{
            display: inline-block;
            background: #ffffff;
            color: #1e293b !important;
            text-decoration: none;
            padding: 11px 22px;
            font-weight: 600;
            border-radius: 8px;
            font-size: 15px;
            border: 1px solid #cbd5e1;
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
            margin: 6px 4px;
        }}
        .details-list {{
            margin: 20px 0 0 0;
            padding: 0;
            list-style: none;
            font-size: 14px;
            color: #475569;
        }}
        .details-list li {{
            margin-bottom: 8px;
        }}
        .footer {{
            text-align: center;
            margin-top: 32px;
            font-size: 13px;
            color: #94a3b8;
        }}
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            {logo_html}
            <div class="org-name">{org_name}</div>
        </div>
        <div class="card">
            <span class="badge">{window_label}</span>
            <h1>{title}</h1>
            <p style="color: #475569; font-size: 15px; margin: 0 0 16px 0;">
                This is a quick reminder for our upcoming meeting scheduled with <strong>{host_name}</strong>.
            </p>

            <div class="meeting-time-box">
                <div class="time-label">Date & Time</div>
                <div class="time-val">{formatted_time}</div>
                <div class="time-hint">Organizer scheduled timezone shown. Click "View in Google Calendar" below to open in your local timezone.</div>
            </div>

            {action_buttons_html}

            <ul class="details-list">
                {host_item_html}
                {location_item_html}
            </ul>
        </div>
        <div class="footer">
            Sent on behalf of {host_name} via {org_name} CRM.
        </div>
    </div>
</body>
</html>
"""


class MeetingReminderService:
    """Dispatches automated branded reminders via the user's Gmail API connection."""

    @classmethod
    def format_meeting_time(cls, start_time: datetime, timezone_str: str = "") -> str:
        """
        Converts UTC database start_time to the meeting's native timezone
        and formats a human-readable string with timezone abbreviation and label.
        e.g. 'Saturday, Oct 10, 2026 at 12:00 PM IST (Asia/Kolkata)'
        """
        try:
            from zoneinfo import ZoneInfo
            tz_str = timezone_str or getattr(settings, "TIME_ZONE", "UTC") or "UTC"
            target_tz = ZoneInfo(tz_str)
            local_dt = start_time.astimezone(target_tz)

            tz_abbrev = local_dt.strftime("%Z")
            if tz_abbrev and tz_abbrev != tz_str:
                tz_label = f"{tz_abbrev} ({tz_str})"
            else:
                tz_label = tz_str
            return f"{local_dt.strftime('%A, %b %d, %Y at %I:%M %p')} {tz_label}"
        except Exception as e:
            logger.warning(f"Failed to convert start_time to timezone '{timezone_str}': {e}")
            return start_time.strftime("%A, %b %d, %Y at %I:%M %p UTC")

    @classmethod
    def get_recipient_emails(cls, meeting: Meeting) -> List[str]:
        """
        Extracts participant emails to notify (excluding the host/user email).
        """
        user_email = (meeting.user.email or "").strip().lower()
        recipients = set()

        for att in meeting.attendees:
            att_email = att.get("email", "").strip().lower()
            if att_email and att_email != user_email and "@" in att_email and not att_email.endswith("calendar.google.com"):
                recipients.add(att_email)

        # If no external attendees found in payload, check linked contact
        if not recipients and meeting.contact and meeting.contact.email:
            contact_email = meeting.contact.email.strip().lower()
            if contact_email != user_email:
                recipients.add(contact_email)

        return list(recipients)

    @classmethod
    def send_meeting_reminder(cls, meeting: Meeting, window_type: str = "24h") -> bool:
        """
        Sends a branded reminder email to meeting attendees.
        window_type: '24h' or '1h'
        """
        now = timezone.now()
        # Hard safety guard: Never send reminders for past meetings
        if meeting.start_time <= now:
            logger.info(
                f"Skipping reminder for meeting {meeting.id} ({meeting.title}): "
                f"meeting start_time ({meeting.start_time}) is in the past."
            )
            return False

        if not meeting.send_reminders or meeting.status != MeetingStatus.CONFIRMED:
            logger.info(f"Skipping reminder for meeting {meeting.id} (send_reminders={meeting.send_reminders}, status={meeting.status})")
            return False

        recipients = cls.get_recipient_emails(meeting)
        if not recipients:
            logger.info(f"No external recipients found to remind for meeting {meeting.id} ({meeting.title})")
            return False

        # Retrieve branding
        branding = BrandingService.get_branding_data()
        org_name = branding.get("organization_name") or "Sales AI CRM"
        logo_url = branding.get("logo_url")

        if logo_url:
            if not logo_url.startswith("http"):
                backend_url = getattr(settings, "BACKEND_URL", "http://localhost:8000").rstrip("/")
                logo_url = f"{backend_url}/{logo_url.lstrip('/')}"
            logo_html = f'<img class="logo" src="{logo_url}" alt="{org_name} Logo" />'
        else:
            logo_html = ""

        host_name = meeting.user.get_full_name() or meeting.user.username or org_name
        window_label = "Meeting Tomorrow" if window_type == "24h" else "Meeting in 1 Hour"

        # Format clean date & time in meeting's native timezone
        formatted_time = cls.format_meeting_time(meeting.start_time, meeting.timezone)

        # Build Action Buttons (Join Video Call + View in Google Calendar)
        join_url = meeting.meeting_url
        calendar_url = meeting.html_link

        buttons_html = []
        if join_url:
            buttons_html.append(f'<a href="{join_url}" class="btn-primary" target="_blank">Join Video Call</a>')
        if calendar_url:
            buttons_html.append(f'<a href="{calendar_url}" class="btn-secondary" target="_blank">View in Google Calendar</a>')

        action_buttons_html = f'<div class="btn-wrapper">{"".join(buttons_html)}</div>' if buttons_html else ""

        host_item_html = f"<li><strong>Organizer:</strong> {host_name} ({meeting.user.email})</li>"
        location_item_html = f"<li><strong>Location:</strong> {meeting.location}</li>" if meeting.location else ""

        html_body = MEETING_REMINDER_EMAIL_TEMPLATE.format(
            title=meeting.title,
            org_name=org_name,
            logo_html=logo_html,
            window_label=window_label,
            host_name=host_name,
            formatted_time=formatted_time,
            action_buttons_html=action_buttons_html,
            host_item_html=host_item_html,
            location_item_html=location_item_html,
        )

        plain_text = (
            f"Reminder: {window_label} - {meeting.title}\n\n"
            f"When: {formatted_time}\n"
            f"Organizer: {host_name} ({meeting.user.email})\n"
        )
        if join_url:
            plain_text += f"Join Call: {join_url}\n"
        if calendar_url:
            plain_text += f"View in Google Calendar: {calendar_url}\n"

        subject = f"Reminder: {meeting.title} ({'Tomorrow' if window_type == '24h' else 'in 1 Hour'})"

        # Obtain User's Gmail Account
        gmail_account = EmailAccount.objects.filter(
            user=meeting.user,
            provider_type="gmail",
            status="connected",
        ).first()

        sent_success = False

        if gmail_account and gmail_account.refresh_token_encrypted:
            try:
                provider = ProviderFactory.get_provider("gmail")
                for recipient in recipients:
                    provider.send_email(
                        account=gmail_account,
                        to_email=recipient,
                        subject=subject,
                        body_html=html_body,
                        body_text=plain_text,
                    )
                sent_success = True
                logger.info(f"Successfully sent {window_type} reminder via Gmail to {recipients} for meeting '{meeting.title}'")
            except Exception as e:
                logger.error(f"Failed to send reminder via Gmail for meeting {meeting.id}: {e}", exc_info=True)

        if not sent_success:
            # Fallback to SMTP / standard system email
            try:
                from apps.common.email import send_branded_email
                sent_success = send_branded_email(
                    subject=subject,
                    title=f"Reminder: {meeting.title}",
                    content_html=f"<p>Your meeting with <strong>{host_name}</strong> is scheduled for <strong>{formatted_time}</strong>.</p>",
                    recipient_list=recipients,
                    cta_text="Join Meeting" if join_url else None,
                    cta_url=join_url if join_url else None,
                )
                logger.info(f"Sent {window_type} reminder via fallback branded email for meeting '{meeting.title}'")
            except Exception as e:
                logger.error(f"Failed fallback reminder for meeting {meeting.id}: {e}", exc_info=True)

        if sent_success:
            now = timezone.now()
            if window_type == "24h":
                meeting.reminder_24h_sent = True
                meeting.reminder_24h_sent_at = now
                meeting.reminder_24h_sent_for_time = meeting.start_time
            else:
                meeting.reminder_1h_sent = True
                meeting.reminder_1h_sent_at = now
                meeting.reminder_1h_sent_for_time = meeting.start_time
            meeting.save()

            # Log to CRM Timeline
            cls._log_timeline_activity(meeting, window_type, recipients)
            return True

        return False

    @classmethod
    def _log_timeline_activity(cls, meeting: Meeting, window_type: str, recipients: List[str]):
        """Logs reminder dispatch as an activity on Contact & Company timelines."""
        try:
            window_str = "24-hour" if window_type == "24h" else "1-hour"
            recipients_str = ", ".join(recipients)
            subject = f"Sent {window_str} meeting reminder for '{meeting.title}'"
            description = f"Automated branded reminder email sent to: {recipients_str} for meeting starting at {meeting.start_time.strftime('%Y-%m-%d %H:%M UTC')}."

            Activity.objects.create(
                user=meeting.user,
                activity_type=ActivityType.EMAIL,
                subject=subject,
                description=description,
                company=meeting.company,
                contact=meeting.contact,
                deal=meeting.deal,
                metadata={
                    "meeting_id": str(meeting.id),
                    "google_event_id": meeting.google_event_id,
                    "window_type": window_type,
                    "recipients": recipients,
                },
                created_by=meeting.user,
                updated_by=meeting.user,
            )
        except Exception as e:
            logger.warning(f"Failed to log timeline activity for meeting reminder {meeting.id}: {e}")
