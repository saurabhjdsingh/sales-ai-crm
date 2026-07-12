import uuid
from django.db import models
from django.conf import settings
from django.utils import timezone
from apps.common.models import BaseModel


class Conversation(BaseModel):
    STATUS_CHOICES = [
        ("active", "Active"),
        ("processing", "Processing"),
        ("completed", "Completed"),
        ("failed", "Failed"),
    ]
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="conversations",
    )
    contact = models.ForeignKey(
        "contacts.Contact",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="conversations",
    )
    company = models.ForeignKey(
        "companies.Company",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="conversations",
    )
    deal = models.ForeignKey(
        "deals.Deal",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="conversations",
    )
    # Reference to the telephony Call ID if correlated
    call_id = models.CharField(max_length=100, blank=True, null=True, db_index=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="active")

    class Meta:
        db_table = "conversation_intelligence_conversation"
        verbose_name = "Conversation"
        verbose_name_plural = "Conversations"

    def __str__(self):
        return f"Conversation {self.id} ({self.status})"


class ConversationSession(BaseModel):
    conversation = models.ForeignKey(
        Conversation,
        on_delete=models.CASCADE,
        related_name="sessions",
    )
    session_key = models.CharField(max_length=100, unique=True, db_index=True)
    is_active = models.BooleanField(default=True)
    started_at = models.DateTimeField(default=timezone.now)
    ended_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "conversation_intelligence_session"

    def __str__(self):
        return f"Session {self.session_key} - Active: {self.is_active}"


class Transcript(BaseModel):
    conversation = models.OneToOneField(
        Conversation,
        on_delete=models.CASCADE,
        related_name="transcript",
    )
    # Primary storage: structured JSON data representing segments
    # Format: [{"speaker": "sales_rep"|"customer", "start_time": float, "end_time": float, "text": "..."}]
    data = models.JSONField(default=list, blank=True)

    class Meta:
        db_table = "conversation_intelligence_transcript"

    def export_to_text(self) -> str:
        """
        Generate plain text chronologically from structured JSON.
        """
        lines = []
        for segment in sorted(self.data, key=lambda x: x.get("start_time", 0)):
            speaker = "Sales Rep" if segment.get("speaker") == "sales_rep" else "Customer"
            start_time = segment.get("start_time", 0)
            mins = int(start_time // 60)
            secs = int(start_time % 60)
            timestamp = f"{mins:02d}:{secs:02d}"
            text = segment.get("text", "").strip()
            if text:
                lines.append(f"[{timestamp}] {speaker}: {text}")
        return "\n".join(lines)

    def __str__(self):
        return f"Transcript for {self.conversation_id}"


class TranscriptSegment(BaseModel):
    transcript = models.ForeignKey(
        Transcript,
        on_delete=models.CASCADE,
        related_name="segments",
    )
    speaker = models.CharField(max_length=20)  # 'sales_rep' or 'customer'
    start_time = models.FloatField()
    end_time = models.FloatField()
    text = models.TextField()

    class Meta:
        db_table = "conversation_intelligence_transcript_segment"
        ordering = ["start_time"]

    def __str__(self):
        return f"[{self.start_time}-{self.end_time}] {self.speaker}: {self.text[:30]}"


class ConversationState(BaseModel):
    conversation = models.OneToOneField(
        Conversation,
        on_delete=models.CASCADE,
        related_name="state",
    )
    current_state = models.CharField(max_length=50, default="active")
    live_copilot_data = models.JSONField(default=dict, blank=True)

    class Meta:
        db_table = "conversation_intelligence_state"

    def __str__(self):
        return f"State for {self.conversation_id}: {self.current_state}"


class ConversationInsight(BaseModel):
    INSIGHT_TYPE_CHOICES = [
        ("pain_point", "Pain Point"),
        ("buying_signal", "Buying Signal"),
        ("competitor", "Competitor"),
        ("objection", "Objection"),
        ("budget", "Budget"),
        ("decision_maker", "Decision Maker"),
        ("sentiment", "Sentiment"),
        ("timeline", "Timeline"),
        ("requirement", "Requirement"),
    ]
    conversation = models.ForeignKey(
        Conversation,
        on_delete=models.CASCADE,
        related_name="insights",
    )
    insight_type = models.CharField(max_length=50, choices=INSIGHT_TYPE_CHOICES)
    content = models.TextField()
    timestamp = models.FloatField()  # Call relative offset in seconds

    class Meta:
        db_table = "conversation_intelligence_insight"
        ordering = ["timestamp"]

    def __str__(self):
        return f"[{self.insight_type}] at {self.timestamp}s: {self.content[:30]}"


class ConversationSummary(BaseModel):
    conversation = models.OneToOneField(
        Conversation,
        on_delete=models.CASCADE,
        related_name="summary",
    )
    executive_summary = models.TextField(blank=True, default="")
    conversation_summary = models.TextField(blank=True, default="")
    pain_points = models.JSONField(default=list, blank=True)
    buying_signals = models.JSONField(default=list, blank=True)
    competitors = models.JSONField(default=list, blank=True)
    requirements = models.JSONField(default=list, blank=True)
    timeline = models.JSONField(default=list, blank=True)
    budget = models.JSONField(default=list, blank=True)
    decision_makers = models.JSONField(default=list, blank=True)
    sentiment = models.CharField(max_length=50, blank=True, default="")
    objections = models.JSONField(default=list, blank=True)
    tasks = models.JSONField(default=list, blank=True)  # suggested follow-up tasks (checklist)
    follow_up_email = models.TextField(blank=True, default="")
    linkedin_message = models.TextField(blank=True, default="")
    suggested_deal_stage = models.CharField(max_length=50, blank=True, default="")
    suggested_crm_updates = models.JSONField(default=dict, blank=True)
    confirmed = models.BooleanField(default=False)

    class Meta:
        db_table = "conversation_intelligence_summary"

    def __str__(self):
        return f"Summary for {self.conversation_id} (Confirmed: {self.confirmed})"


class ConversationMetadata(BaseModel):
    conversation = models.OneToOneField(
        Conversation,
        on_delete=models.CASCADE,
        related_name="metadata",
    )
    duration = models.IntegerField(default=0)  # in seconds
    sample_rate = models.IntegerField(default=16000)
    language = models.CharField(max_length=10, default="en")
    audio_channels = models.IntegerField(default=2)

    class Meta:
        db_table = "conversation_intelligence_metadata"

    def __str__(self):
        return f"Metadata for {self.conversation_id}"
