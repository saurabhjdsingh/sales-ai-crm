import uuid
from django.conf import settings
from django.db import models

from apps.common.models import BaseModel


class SequenceActionType(models.TextChoices):
    AI_EMAIL = "ai_email", "AI Email"
    MANUAL_TASK = "manual_task", "Manual Task"
    WAIT = "wait", "Wait"
    UPDATE_STAGE = "update_stage", "Auto-update Contact Stage"
    # Extensible future action types:
    LINKEDIN_MESSAGE = "linkedin_message", "LinkedIn Message"
    LINKEDIN_CONNECT = "linkedin_connect", "LinkedIn Connection Request"
    PHONE_CALL = "phone_call", "Phone Call"
    SMS = "sms", "SMS"
    INTERNAL_REMINDER = "internal_reminder", "Internal Reminder"
    AI_DECISION = "ai_decision", "AI Branching Decision"
    WEBHOOK = "webhook", "Webhook Call"


class TaskAssignmentStrategy(models.TextChoices):
    ENROLLED_BY = "enrolled_by", "User who enrolled contact"
    SEQUENCE_OWNER = "sequence_owner", "Owner/Author of sequence"


class DelayUnit(models.TextChoices):
    MINUTES = "minutes", "Minutes"
    HOURS = "hours", "Hours"
    DAYS = "days", "Days"


class SendMode(models.TextChoices):
    SMART_SEND = "smart_send", "Smart Send (Timezone-Aware)"
    IMMEDIATE = "immediate", "Send Immediately"
    MANUAL = "manual", "Manual Schedule"


class EnrollmentStatus(models.TextChoices):
    DRAFT = "draft", "Draft"
    RUNNING = "running", "Running"
    WAITING = "waiting", "Waiting"
    WAITING_APPROVAL = "waiting_approval", "Waiting Approval"
    COMPLETED = "completed", "Completed"
    STOPPED = "stopped", "Stopped"
    PAUSED = "paused", "Paused"
    FAILED = "failed", "Failed"


class ExecutionStatus(models.TextChoices):
    PENDING = "pending", "Pending"
    SCHEDULED = "scheduled", "Scheduled"
    WAITING_APPROVAL = "waiting_approval", "Waiting Approval"
    EXECUTING = "executing", "Executing"
    COMPLETED = "completed", "Completed"
    SKIPPED = "skipped", "Skipped"
    FAILED = "failed", "Failed"


class DraftStatus(models.TextChoices):
    DRAFT_PENDING = "draft_pending", "Draft Pending Approval"
    APPROVED = "approved", "Approved"
    SCHEDULED = "scheduled", "Scheduled for Delivery"
    SENT = "sent", "Sent"
    REJECTED = "rejected", "Rejected"
    CANCELLED = "cancelled", "Cancelled"


class SequenceScheduleSetting(BaseModel):
    """
    Singleton/per-org sending schedule configuration.
    Defines permitted sending windows and days for timezone-aware email scheduling.
    """
    morning_start_time = models.TimeField(
        default="08:30",
        help_text="Start of morning sending window (local time)"
    )
    morning_end_time = models.TimeField(
        default="11:30",
        help_text="End of morning sending window (local time)"
    )
    afternoon_start_time = models.TimeField(
        default="13:30",
        help_text="Start of afternoon sending window (local time)"
    )
    afternoon_end_time = models.TimeField(
        default="15:30",
        help_text="End of afternoon sending window (local time)"
    )
    monday = models.BooleanField(default=True)
    tuesday = models.BooleanField(default=True)
    wednesday = models.BooleanField(default=True)
    thursday = models.BooleanField(default=True)
    friday = models.BooleanField(default=True)
    saturday = models.BooleanField(default=True)
    sunday = models.BooleanField(default=False)
    org_timezone = models.CharField(
        max_length=50,
        default="Asia/Kolkata",
        help_text="Organization default timezone (IANA identifier)"
    )

    class Meta:
        db_table = "sequences_schedulesetting"
        verbose_name = "Sequence Schedule Setting"
        verbose_name_plural = "Sequence Schedule Settings"

    def __str__(self):
        return f"Schedule Settings (Morning: {self.morning_start_time}-{self.morning_end_time}, Afternoon: {self.afternoon_start_time}-{self.afternoon_end_time})"

    def get_enabled_days(self) -> list[int]:
        """Returns list of enabled weekday numbers (0=Monday, 6=Sunday)."""
        days = []
        day_fields = [
            self.monday, self.tuesday, self.wednesday, self.thursday,
            self.friday, self.saturday, self.sunday,
        ]
        for i, enabled in enumerate(day_fields):
            if enabled:
                days.append(i)
        return days

    @classmethod
    def get_settings(cls):
        """Get or create the singleton schedule settings."""
        settings_obj = cls.objects.first()
        if not settings_obj:
            settings_obj = cls.objects.create()
        return settings_obj


class Sequence(BaseModel):
    """
    Represents a reusable multi-step sales outreach sequence.
    """
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True, default="")
    is_active = models.BooleanField(default=True, db_index=True)
    track_opens = models.BooleanField(default=True)
    track_clicks = models.BooleanField(default=True)

    # Telemetry Auto-Task Creation Settings
    auto_task_on_open_enabled = models.BooleanField(default=False)
    auto_task_open_count = models.PositiveIntegerField(default=2)
    auto_task_on_click_enabled = models.BooleanField(default=False)
    auto_task_click_count = models.PositiveIntegerField(default=2)
    task_assignment_strategy = models.CharField(
        max_length=30,
        choices=TaskAssignmentStrategy.choices,
        default=TaskAssignmentStrategy.ENROLLED_BY,
    )

    # Custom Exit & Auto-Stop Rules
    auto_stop_on_reply = models.BooleanField(default=True)
    auto_stop_contact_stages = models.JSONField(default=list, blank=True)
    auto_stop_deal_stages = models.JSONField(default=list, blank=True)

    # Outbound Email Configuration
    email_account_role = models.CharField(
        max_length=30,
        choices=[("primary", "Primary Email"), ("secondary_outbound", "Secondary Email")],
        default="primary",
        help_text="Which connected email account to use for sending sequence emails",
    )
    reply_to = models.EmailField(
        blank=True,
        default="",
        help_text="Default reply-to address auto-pushed to all sequence email drafts",
    )

    # Timezone-Aware Scheduling
    default_send_mode = models.CharField(
        max_length=30,
        choices=SendMode.choices,
        default=SendMode.SMART_SEND,
        help_text="Default send mode for AI email steps in this sequence",
    )

    class Meta:
        db_table = "sequences_sequence"
        verbose_name = "Sequence"
        verbose_name_plural = "Sequences"
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.name} ({'Active' if self.is_active else 'Inactive'})"


class SequenceStep(BaseModel):
    """
    An ordered step within a Sequence.
    """
    sequence = models.ForeignKey(
        Sequence,
        on_delete=models.CASCADE,
        related_name="steps"
    )
    step_number = models.PositiveIntegerField(db_index=True)
    action_type = models.CharField(
        max_length=40,
        choices=SequenceActionType.choices,
        default=SequenceActionType.AI_EMAIL
    )
    delay = models.PositiveIntegerField(default=0, help_text="Delay before executing this step")
    delay_unit = models.CharField(
        max_length=20,
        choices=DelayUnit.choices,
        default=DelayUnit.DAYS
    )
    configuration = models.JSONField(
        default=dict,
        blank=True,
        help_text="Configuration dictionary for AI prompts, task options, wait options, etc."
    )
    # Per-step send mode override (inherits from Sequence.default_send_mode if not set)
    send_mode = models.CharField(
        max_length=30,
        choices=SendMode.choices,
        default=SendMode.SMART_SEND,
        help_text="Send mode for this step (overrides sequence default for AI email steps)",
    )

    class Meta:
        db_table = "sequences_sequencestep"
        verbose_name = "Sequence Step"
        verbose_name_plural = "Sequence Steps"
        ordering = ["sequence", "step_number"]
        unique_together = ["sequence", "step_number"]

    def __str__(self):
        return f"Step {self.step_number} [{self.action_type}] - {self.sequence.name}"


class SequenceEnrollment(BaseModel):
    """
    Tracks progress of a specific contact enrolled in a Sequence.
    """
    sequence = models.ForeignKey(
        Sequence,
        on_delete=models.CASCADE,
        related_name="enrollments"
    )
    contact = models.ForeignKey(
        "contacts.Contact",
        on_delete=models.CASCADE,
        related_name="sequence_enrollments"
    )
    company = models.ForeignKey(
        "companies.Company",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="sequence_enrollments"
    )
    deal = models.ForeignKey(
        "deals.Deal",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="sequence_enrollments"
    )
    enrolled_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="enrolled_sequences"
    )
    status = models.CharField(
        max_length=30,
        choices=EnrollmentStatus.choices,
        default=EnrollmentStatus.RUNNING,
        db_index=True
    )
    current_step_number = models.PositiveIntegerField(default=1)
    next_execution_at = models.DateTimeField(null=True, blank=True, db_index=True)
    stop_reason = models.TextField(blank=True, null=True)
    stopped_at = models.DateTimeField(null=True, blank=True)

    # Per-enrollment tracking stats
    open_count = models.PositiveIntegerField(default=0)
    click_count = models.PositiveIntegerField(default=0)
    has_replied = models.BooleanField(default=False)
    last_opened_at = models.DateTimeField(null=True, blank=True)
    last_clicked_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "sequences_sequenceenrollment"
        verbose_name = "Sequence Enrollment"
        verbose_name_plural = "Sequence Enrollments"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["status", "next_execution_at"]),
            models.Index(fields=["contact", "status"]),
        ]

    def __str__(self):
        return f"{self.contact.full_name} in {self.sequence.name} ({self.status})"


class SequenceStepExecution(BaseModel):
    """
    Execution record for a single step within an enrollment.
    """
    enrollment = models.ForeignKey(
        SequenceEnrollment,
        on_delete=models.CASCADE,
        related_name="executions"
    )
    step = models.ForeignKey(
        SequenceStep,
        on_delete=models.CASCADE,
        related_name="executions"
    )
    status = models.CharField(
        max_length=30,
        choices=ExecutionStatus.choices,
        default=ExecutionStatus.PENDING,
        db_index=True
    )
    scheduled_at = models.DateTimeField(null=True, blank=True)
    executed_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    
    task = models.ForeignKey(
        "tasks.Task",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="sequence_executions"
    )
    task_outcome = models.CharField(max_length=50, blank=True, null=True)
    error_message = models.TextField(blank=True, default="")
    metadata = models.JSONField(default=dict, blank=True)

    class Meta:
        db_table = "sequences_sequencestepexecution"
        verbose_name = "Sequence Step Execution"
        verbose_name_plural = "Sequence Step Executions"
        ordering = ["enrollment", "step__step_number"]
        unique_together = [("enrollment", "step")]

    def __str__(self):
        return f"Execution of Step {self.step.step_number} for Enrollment {self.enrollment.id} ({self.status})"


class SequenceEmailDraft(BaseModel):
    """
    AI-generated email draft awaiting human approval.
    """
    execution = models.OneToOneField(
        SequenceStepExecution,
        on_delete=models.CASCADE,
        related_name="email_draft",
        null=True,
        blank=True
    )
    enrollment = models.ForeignKey(
        SequenceEnrollment,
        on_delete=models.CASCADE,
        related_name="email_drafts"
    )
    contact = models.ForeignKey(
        "contacts.Contact",
        on_delete=models.CASCADE,
        related_name="sequence_email_drafts"
    )
    sender = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="sequence_email_drafts"
    )
    subject = models.CharField(max_length=255)
    reply_to = models.EmailField(blank=True, default="")
    body_html = models.TextField()
    body_text = models.TextField()
    context_summary = models.TextField(
        blank=True,
        default="",
        help_text="Brief AI summary of CRM context used to personalize this draft"
    )
    status = models.CharField(
        max_length=30,
        choices=DraftStatus.choices,
        default=DraftStatus.DRAFT_PENDING,
        db_index=True
    )
    tracking_token = models.UUIDField(default=uuid.uuid4, unique=True, db_index=True)
    
    # Open & Click tracking stats
    open_count = models.PositiveIntegerField(default=0)
    first_opened_at = models.DateTimeField(null=True, blank=True)
    last_opened_at = models.DateTimeField(null=True, blank=True)
    
    click_count = models.PositiveIntegerField(default=0)
    first_clicked_at = models.DateTimeField(null=True, blank=True)
    last_clicked_at = models.DateTimeField(null=True, blank=True)
    
    gmail_thread_id = models.CharField(max_length=255, blank=True, null=True)
    gmail_message_id = models.CharField(max_length=255, blank=True, null=True)
    approved_at = models.DateTimeField(null=True, blank=True)
    sent_at = models.DateTimeField(null=True, blank=True)

    # Timezone-Aware Scheduling Fields
    scheduled_at_utc = models.DateTimeField(
        null=True,
        blank=True,
        db_index=True,
        help_text="UTC timestamp when this email is scheduled to be sent"
    )
    scheduled_timezone = models.CharField(
        max_length=50,
        blank=True,
        default="",
        help_text="IANA timezone used for scheduling (e.g. 'America/New_York')"
    )
    scheduled_local_time = models.CharField(
        max_length=100,
        blank=True,
        default="",
        help_text="Human-readable local time string (e.g. 'Monday, Aug 11 at 09:15 AM EST')"
    )
    sending_mode = models.CharField(
        max_length=30,
        blank=True,
        default="",
        help_text="Mode used: smart_send, immediate, manual"
    )
    sending_window = models.CharField(
        max_length=50,
        blank=True,
        default="",
        help_text="Window name: morning, afternoon, or immediate"
    )
    schedule_source = models.CharField(
        max_length=30,
        blank=True,
        default="",
        help_text="Source of schedule: automatic, manual, send_now"
    )

    class Meta:
        db_table = "sequences_sequenceemaildraft"
        verbose_name = "Sequence Email Draft"
        verbose_name_plural = "Sequence Email Drafts"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["status", "scheduled_at_utc"]),
        ]

    def __str__(self):
        return f"Draft: '{self.subject}' for {self.contact.full_name} ({self.status})"


class SequenceLinkClick(BaseModel):
    """
    Records individual link clicks via stealth router endpoint `/r/<click_token>`.
    """
    draft = models.ForeignKey(
        SequenceEmailDraft,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="link_clicks"
    )
    email_message = models.ForeignKey(
        "emails.EmailMessage",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="link_clicks"
    )
    click_token = models.CharField(max_length=64, unique=True, db_index=True)
    original_url = models.TextField()
    click_count = models.PositiveIntegerField(default=0)
    first_clicked_at = models.DateTimeField(null=True, blank=True)
    last_clicked_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "sequences_sequencelinkclick"
        verbose_name = "Sequence Link Click"
        verbose_name_plural = "Sequence Link Clicks"
        ordering = ["-created_at"]

    def __str__(self):
        return f"Click token {self.click_token} -> {self.original_url[:50]}"

