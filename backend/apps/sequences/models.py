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
    SENT = "sent", "Sent"
    REJECTED = "rejected", "Rejected"
    CANCELLED = "cancelled", "Cancelled"


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

    class Meta:
        db_table = "sequences_sequenceemaildraft"
        verbose_name = "Sequence Email Draft"
        verbose_name_plural = "Sequence Email Drafts"
        ordering = ["-created_at"]

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
