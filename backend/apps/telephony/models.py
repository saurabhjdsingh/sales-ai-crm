import uuid
from django.conf import settings
from django.db import models
from django.utils import timezone
from apps.common.models import BaseModel
from apps.common.encryption import encrypt_api_key, decrypt_api_key


class TelephonyProvider(BaseModel):
    """
    User telephony integration settings (Bring Your Own Twilio).
    API key/secret and transcription keys are encrypted at rest.
    """
    PROVIDER_CHOICES = [
        ("twilio", "Twilio"),
    ]

    TRANSCRIPTION_CHOICES = [
        ("none", "None / Local Only"),
        ("deepgram", "Deepgram"),
        ("whisper", "OpenAI Whisper"),
    ]

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="telephony_providers",
    )
    provider_type = models.CharField(
        max_length=20,
        choices=PROVIDER_CHOICES,
        default="twilio",
    )
    name = models.CharField(max_length=100, default="My Twilio Integration")
    
    # Twilio specific credentials (encrypted at rest)
    account_sid = models.CharField(max_length=100, blank=True)
    api_key_encrypted = models.CharField(max_length=512, blank=True)
    api_secret_encrypted = models.CharField(max_length=512, blank=True)
    application_sid = models.CharField(max_length=100, blank=True)
    phone_number = models.CharField(max_length=50, blank=True)
    connection_status = models.CharField(max_length=20, default="disconnected")

    # Transcription integrations (encrypted at rest)
    transcription_provider = models.CharField(
        max_length=20,
        choices=TRANSCRIPTION_CHOICES,
        default="none",
    )
    transcription_key_encrypted = models.CharField(max_length=512, blank=True)

    class Meta:
        db_table = "telephony_provider"
        verbose_name = "Telephony Provider"
        verbose_name_plural = "Telephony Providers"

    def __str__(self):
        return f"{self.name} ({self.user.email})"

    @property
    def api_key(self) -> str:
        return decrypt_api_key(self.api_key_encrypted)

    @api_key.setter
    def api_key(self, value: str):
        self.api_key_encrypted = encrypt_api_key(value)

    @property
    def api_secret(self) -> str:
        return decrypt_api_key(self.api_secret_encrypted)

    @api_secret.setter
    def api_secret(self, value: str):
        self.api_secret_encrypted = encrypt_api_key(value)

    @property
    def transcription_key(self) -> str:
        return decrypt_api_key(self.transcription_key_encrypted)

    @transcription_key.setter
    def transcription_key(self, value: str):
        self.transcription_key_encrypted = encrypt_api_key(value)


class Call(BaseModel):
    """
    Call record. Links to contact, company, deal, and user.
    """
    DIRECTION_CHOICES = [
        ("inbound", "Inbound"),
        ("outbound", "Outbound"),
    ]

    STATUS_CHOICES = [
        ("queued", "Queued"),
        ("ringing", "Ringing"),
        ("in-progress", "In Progress"),
        ("completed", "Completed"),
        ("failed", "Failed"),
        ("busy", "Busy"),
        ("no-answer", "No Answer"),
        ("canceled", "Canceled"),
    ]

    sid = models.CharField(max_length=100, blank=True, null=True, unique=True)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="calls",
    )
    provider = models.ForeignKey(
        TelephonyProvider,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="calls",
    )
    contact = models.ForeignKey(
        "contacts.Contact",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="calls",
    )
    company = models.ForeignKey(
        "companies.Company",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="calls",
    )
    deal = models.ForeignKey(
        "deals.Deal",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="calls",
    )
    direction = models.CharField(max_length=10, choices=DIRECTION_CHOICES)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="queued")
    
    start_time = models.DateTimeField(null=True, blank=True)
    end_time = models.DateTimeField(null=True, blank=True)
    duration = models.IntegerField(null=True, blank=True) # in seconds
    
    recording_enabled = models.BooleanField(default=False)
    ai_assist_enabled = models.BooleanField(default=False)
    
    transcript_status = models.CharField(
        max_length=20,
        default="none",
        choices=[
            ("none", "None"),
            ("transcribing", "Transcribing"),
            ("completed", "Completed"),
            ("failed", "Failed"),
        ]
    )
    summary_status = models.CharField(
        max_length=20,
        default="none",
        choices=[
            ("none", "None"),
            ("generating", "Generating"),
            ("completed", "Completed"),
            ("failed", "Failed"),
        ]
    )

    notes = models.TextField(blank=True, default="") # manual notes

    class Meta:
        db_table = "telephony_call"
        verbose_name = "Call"
        verbose_name_plural = "Calls"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["user", "-created_at"]),
            models.Index(fields=["contact", "-created_at"]),
            models.Index(fields=["company", "-created_at"]),
            models.Index(fields=["deal", "-created_at"]),
            models.Index(fields=["sid"]),
        ]

    def __str__(self):
        return f"{self.direction.capitalize()} call: {self.status} ({self.created_at:%Y-%m-%d %H:%M})"


class CallParticipant(models.Model):
    """
    Call participant phone numbers and details.
    """
    PARTICIPANT_CHOICES = [
        ("agent", "Agent"),
        ("contact", "Contact"),
        ("external", "External"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    call = models.ForeignKey(
        Call,
        on_delete=models.CASCADE,
        related_name="participants",
    )
    participant_type = models.CharField(max_length=20, choices=PARTICIPANT_CHOICES)
    phone_number = models.CharField(max_length=50)
    name = models.CharField(max_length=100, blank=True)

    class Meta:
        db_table = "telephony_call_participant"


class CallTranscript(models.Model):
    """
    Call transcript logs. Stores full text and chronological dialog segments.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    call = models.OneToOneField(
        Call,
        on_delete=models.CASCADE,
        related_name="transcript",
    )
    full_text = models.TextField(blank=True, default="")
    # [{speaker: 'agent'|'contact', text: '...', timestamp: float}]
    transcript_data = models.JSONField(default=list, blank=True)

    class Meta:
        db_table = "telephony_call_transcript"


class CallSummary(models.Model):
    """
    AI-generated call summary, insights, follow-up actions.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    call = models.OneToOneField(
        Call,
        on_delete=models.CASCADE,
        related_name="summary",
    )
    summary = models.TextField(blank=True, default="")
    pain_points = models.JSONField(default=list, blank=True)
    buying_signals = models.JSONField(default=list, blank=True)
    objections = models.JSONField(default=list, blank=True)
    suggested_questions = models.JSONField(default=list, blank=True)
    next_steps = models.JSONField(default=list, blank=True)
    suggested_email = models.TextField(blank=True, default="")
    suggested_linkedin = models.TextField(blank=True, default="")
    suggested_deal_stage = models.CharField(max_length=50, blank=True, default="")
    confirmed = models.BooleanField(default=False)

    class Meta:
        db_table = "telephony_call_summary"


class CallTask(models.Model):
    """
    Suggested tasks created from call analysis.
    Wait for user confirmation before creating actual Task records.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    call = models.ForeignKey(
        Call,
        on_delete=models.CASCADE,
        related_name="suggested_tasks",
    )
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True, default="")
    due_date = models.DateTimeField(null=True, blank=True)
    priority = models.CharField(max_length=20, default="medium")
    status = models.CharField(max_length=20, default="pending")
    task_type = models.CharField(max_length=20, default="follow_up")
    created_task = models.ForeignKey(
        "tasks.Task",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="telephony_call_tasks",
    )

    class Meta:
        db_table = "telephony_call_task"


class CallEvent(models.Model):
    """
    Audit log of state changes and telephony signals.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    call = models.ForeignKey(
        Call,
        on_delete=models.CASCADE,
        related_name="events",
    )
    event_type = models.CharField(max_length=50)
    timestamp = models.DateTimeField(auto_now_add=True)
    payload = models.JSONField(default=dict, blank=True)

    class Meta:
        db_table = "telephony_call_event"
        ordering = ["timestamp"]
