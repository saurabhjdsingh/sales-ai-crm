from django.conf import settings
from django.db import models
from django.utils import timezone

from apps.common.models import BaseModel


class MeetingStatus(models.TextChoices):
    CONFIRMED = "confirmed", "Confirmed"
    TENTATIVE = "tentative", "Tentative"
    CANCELLED = "cancelled", "Cancelled"
    COMPLETED = "completed", "Completed"


class Meeting(BaseModel):
    """
    Stores synchronized Google Calendar events and post-meeting documentation.
    Can be linked to Contact, Company, and Deal in the CRM.
    """

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="meetings",
        help_text="CRM user who owns this calendar.",
    )
    google_event_id = models.CharField(max_length=255, db_index=True)
    calendar_id = models.CharField(max_length=255, default="primary")

    # Event details
    title = models.CharField(max_length=255, default="No Title")
    description = models.TextField(blank=True, default="")
    start_time = models.DateTimeField(db_index=True)
    end_time = models.DateTimeField(db_index=True)
    timezone = models.CharField(max_length=64, blank=True, default="UTC")
    location = models.CharField(max_length=500, blank=True, default="")
    meeting_url = models.URLField(
        max_length=1000,
        blank=True,
        default="",
        help_text="Google Meet / Zoom link",
    )
    html_link = models.URLField(
        max_length=1000,
        blank=True,
        default="",
        help_text="Link to Google Calendar event",
    )
    status = models.CharField(
        max_length=30,
        choices=MeetingStatus.choices,
        default=MeetingStatus.CONFIRMED,
    )

    # Attendees payload
    organizer = models.JSONField(default=dict, blank=True)
    attendees = models.JSONField(
        default=list,
        blank=True,
        help_text="List of {email, displayName, responseStatus, self}",
    )

    # CRM Associations (Nullable with manual override)
    contact = models.ForeignKey(
        "contacts.Contact",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="meetings",
    )
    company = models.ForeignKey(
        "companies.Company",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="meetings",
    )
    deal = models.ForeignKey(
        "deals.Deal",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="meetings",
    )

    # Matching metadata
    is_auto_matched = models.BooleanField(default=False)
    matched_attendee_email = models.EmailField(blank=True, default="")
    is_manually_edited = models.BooleanField(default=False)

    # Post-meeting intelligence & documentation
    meeting_notes = models.TextField(
        blank=True,
        default="",
        help_text="Manual meeting notes or executive minutes.",
    )
    transcript = models.TextField(
        blank=True,
        default="",
        help_text="Raw meeting transcript text.",
    )
    transcript_source = models.CharField(
        max_length=50,
        blank=True,
        default="manual",
        help_text="Source e.g. google_meet, zoom, otter, fireflies, manual",
    )
    analysis = models.JSONField(
        default=dict,
        blank=True,
        help_text="Structured AI analysis: summary, key_takeaways, action_items, objections, sentiment.",
    )
    has_post_meeting_notes = models.BooleanField(default=False)
    post_meeting_updated_at = models.DateTimeField(null=True, blank=True)

    # Universal Activity & Note references
    activity = models.OneToOneField(
        "activities.Activity",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="meeting_event",
    )
    synced_note = models.OneToOneField(
        "notes.Note",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="meeting_source",
    )

    # Automated Branded Reminders
    send_reminders = models.BooleanField(
        default=True,
        help_text="Whether to send automated branded reminders (24h and 1h prior).",
    )
    reminder_24h_sent = models.BooleanField(default=False)
    reminder_24h_sent_at = models.DateTimeField(null=True, blank=True)
    reminder_24h_sent_for_time = models.DateTimeField(
        null=True,
        blank=True,
        help_text="Meeting start time for which 24h reminder was sent.",
    )
    reminder_1h_sent = models.BooleanField(default=False)
    reminder_1h_sent_at = models.DateTimeField(null=True, blank=True)
    reminder_1h_sent_for_time = models.DateTimeField(
        null=True,
        blank=True,
        help_text="Meeting start time for which 1h reminder was sent.",
    )

    class Meta:
        db_table = "meetings_meeting"
        ordering = ["start_time"]
        unique_together = ("user", "google_event_id")
        indexes = [
            models.Index(fields=["user", "start_time"]),
            models.Index(fields=["company", "start_time"]),
            models.Index(fields=["contact", "start_time"]),
            models.Index(fields=["deal", "start_time"]),
            models.Index(fields=["status", "send_reminders", "start_time"]),
        ]

    def __str__(self):
        return f"{self.title} ({self.start_time.strftime('%Y-%m-%d %H:%M')})"

    @property
    def is_finished(self) -> bool:
        return timezone.now() > self.end_time


class IgnoredMeetingEvent(BaseModel):
    """
    Stores Google Calendar events manually deleted/discarded by the user
    to prevent future synchronization runs from re-importing them into the CRM.
    """

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="ignored_meeting_events",
    )
    google_event_id = models.CharField(max_length=255, db_index=True)
    title = models.CharField(max_length=255, blank=True, default="")
    reason = models.CharField(max_length=255, blank=True, default="user_discarded")

    class Meta:
        db_table = "meetings_ignored_event"
        unique_together = ("user", "google_event_id")

    def __str__(self):
        return f"Ignored: {self.title} ({self.google_event_id})"

