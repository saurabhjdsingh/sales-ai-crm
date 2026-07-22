"""
Enums used across the entire CRM.
Centralized here to avoid circular imports and ensure consistency.
"""

from django.db import models


class UserRole(models.TextChoices):
    ADMIN = "admin", "Admin"
    MANAGER = "manager", "Manager"
    SALES_REP = "sales_rep", "Sales Rep"


class CompanyStage(models.TextChoices):
    COLD = "cold", "Cold"
    CURRENT_CLIENT = "current_client", "Current Client"
    ACTIVE_OPPORTUNITY = "active_opportunity", "Active Opportunity"
    DEAD_OPPORTUNITY = "dead_opportunity", "Dead Opportunity"
    DO_NOT_PROSPECT = "do_not_prospect", "Do Not Prospect"


class ContactStage(models.TextChoices):
    COLD = "cold", "Cold"
    APPROACHING = "approaching", "Approaching"
    REPLIED = "replied", "Replied"
    FOLLOW_UP = "follow_up", "Follow Up"
    INTERESTED = "interested", "Interested"
    NOT_ICP = "not_icp", "Not ICP"
    NOT_INTERESTED = "not_interested", "Not Interested"
    UNRESPONSIVE = "unresponsive", "Unresponsive"
    DO_NOT_CONTACT = "do_not_contact", "Do Not Contact"
    BAD_DATA = "bad_data", "Bad Data"
    CHANGED_JOB = "changed_job", "Changed Job"
    WON = "won", "Won"


class DealStage(models.TextChoices):
    LEAD = "lead", "Lead"
    SALES_QUALIFIED = "sales_qualified", "Sales Qualified"
    MEETING_BOOKED = "meeting_booked", "Meeting Booked"
    NEGOTIATION = "negotiation", "Negotiation"
    POC = "poc", "POC"
    CONTRACT_SENT = "contract_sent", "Contract Sent"
    CLOSED_WON = "closed_won", "Closed Won"
    CLOSED_LOST = "closed_lost", "Closed Lost"
    ON_HOLD = "on_hold", "On Hold"


class DealPriority(models.TextChoices):
    LOW = "low", "Low"
    MEDIUM = "medium", "Medium"
    HIGH = "high", "High"
    CRITICAL = "critical", "Critical"


class DealRisk(models.TextChoices):
    LOW = "low", "Low"
    MEDIUM = "medium", "Medium"
    HIGH = "high", "High"


class DealContactRole(models.TextChoices):
    DECISION_MAKER = "decision_maker", "Decision Maker"
    CHAMPION = "champion", "Champion"
    INFLUENCER = "influencer", "Influencer"
    BLOCKER = "blocker", "Blocker"
    USER = "user", "User"
    EVALUATOR = "evaluator", "Evaluator"


class TaskStatus(models.TextChoices):
    PENDING = "pending", "Pending"
    IN_PROGRESS = "in_progress", "In Progress"
    COMPLETED = "completed", "Completed"
    CANCELLED = "cancelled", "Cancelled"


class TaskPriority(models.TextChoices):
    LOW = "low", "Low"
    MEDIUM = "medium", "Medium"
    HIGH = "high", "High"
    URGENT = "urgent", "Urgent"


class TaskType(models.TextChoices):
    CALL = "call", "Call"
    EMAIL = "email", "Email"
    LINKEDIN = "linkedin", "LinkedIn"
    FOLLOW_UP = "follow_up", "Follow Up"
    MEETING = "meeting", "Meeting"
    REVIEW_PROPOSAL = "review_proposal", "Review Proposal"
    OTHER = "other", "Other"


class TaskRepeat(models.TextChoices):
    NONE = "none", "None"
    DAILY = "daily", "Daily"
    WEEKLY = "weekly", "Weekly"
    MONTHLY = "monthly", "Monthly"


class TaskOutcome(models.TextChoices):
    ANSWERED = "answered", "Answered"
    NOT_PICKED_UP = "not_picked_up", "Not Picked Up"
    VOICEMAIL = "voicemail", "Voicemail"
    WRONG_NUMBER = "wrong_number", "Wrong Number"
    REQUESTED_CALLBACK = "requested_callback", "Requested Callback"
    NOT_INTERESTED = "not_interested", "Not Interested"
    MEETING_BOOKED = "meeting_booked", "Meeting Booked"
    PROPOSAL_SENT = "proposal_sent", "Proposal Sent"
    COMPLETED_OTHER = "completed_other", "Completed (Other)"


class ActivityType(models.TextChoices):
    IMPORT = "import", "Import"
    EMAIL = "email", "Email"
    CALL = "call", "Call"
    MEETING = "meeting", "Meeting"
    TASK_COMPLETED = "task_completed", "Task Completed"
    NOTE = "note", "Note"
    STAGE_CHANGED = "stage_changed", "Stage Changed"
    AI_RESEARCH = "ai_research", "AI Research"
    LINKEDIN_REQUEST = "linkedin_request", "LinkedIn Request"
    PROPOSAL_SENT = "proposal_sent", "Proposal Sent"
    DOCUMENT_UPLOADED = "document_uploaded", "Document Uploaded"
    WHATSAPP = "whatsapp", "WhatsApp Message"
    LINKEDIN_MESSAGE = "linkedin_message", "LinkedIn Message"
    SEQUENCE_ENROLLED = "sequence_enrolled", "Sequence Enrolled"
    SEQUENCE_EMAIL_DRAFTED = "sequence_email_drafted", "Sequence AI Draft Ready"
    SEQUENCE_EMAIL_SENT = "sequence_email_sent", "Sequence Email Sent"
    SEQUENCE_EMAIL_OPENED = "sequence_email_opened", "Sequence Email Opened"
    SEQUENCE_LINK_CLICKED = "sequence_link_clicked", "Sequence Link Clicked"
    SEQUENCE_TASK_CREATED = "sequence_task_created", "Sequence Task Created"
    SEQUENCE_TASK_COMPLETED = "sequence_task_completed", "Sequence Task Completed"
    SEQUENCE_PAUSED = "sequence_paused", "Sequence Paused"
    SEQUENCE_RESUMED = "sequence_resumed", "Sequence Resumed"
    SEQUENCE_COMPLETED = "sequence_completed", "Sequence Completed"
    SEQUENCE_STOPPED = "sequence_stopped", "Sequence Stopped"



class ImportEntityType(models.TextChoices):
    COMPANY = "company", "Company"
    CONTACT = "contact", "Contact"
    UNIFIED = "unified", "Unified"


class ImportStatus(models.TextChoices):
    PENDING = "pending", "Pending"
    MAPPING = "mapping", "Mapping"
    PROCESSING = "processing", "Processing"
    COMPLETED = "completed", "Completed"
    FAILED = "failed", "Failed"


class ImportRecordStatus(models.TextChoices):
    SUCCESS = "success", "Success"
    ERROR = "error", "Error"
    DUPLICATE = "duplicate", "Duplicate"
    SKIPPED = "skipped", "Skipped"


class AIEntityType(models.TextChoices):
    COMPANY = "company", "Company"
    CONTACT = "contact", "Contact"
    DEAL = "deal", "Deal"
    CALL = "call", "Call"


class AIMessageRole(models.TextChoices):
    USER = "user", "User"
    ASSISTANT = "assistant", "Assistant"
    SYSTEM = "system", "System"


class ResearchStatus(models.TextChoices):
    PENDING = "pending", "Pending"
    IN_PROGRESS = "in_progress", "In Progress"
    COMPLETED = "completed", "Completed"
    FAILED = "failed", "Failed"


class CompanySource(models.TextChoices):
    CSV_IMPORT = "csv_import", "CSV Import"
    MANUAL = "manual", "Manual"
    APOLLO = "apollo", "Apollo"
    LINKEDIN = "linkedin", "LinkedIn"
    REFERRAL = "referral", "Referral"
    WEBSITE = "website", "Website"


class CompanySize(models.TextChoices):
    SOLO = "1-10", "1-10"
    SMALL = "11-50", "11-50"
    MEDIUM_LOW = "51-100", "51-100"
    MEDIUM_HIGH = "101-200", "101-200"
    LARGE = "201-500", "201-500"
    ENTERPRISE = "500+", "500+"
