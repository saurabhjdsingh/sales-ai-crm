from django.db import models
from django.conf import settings
from apps.common.models import BaseModel


class AccountRole(models.TextChoices):
    PRIMARY = "primary", "Primary Inbox"
    SECONDARY_OUTBOUND = "secondary_outbound", "Secondary Outbound Sender"


class EmailAccount(BaseModel):
    """
    Stores credentials and status of a user's connected email provider account.
    Supports Primary Inbox (Gmail/Outlook) and Secondary Outbound Sender (Gmail/SMTP).
    """
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="email_accounts"
    )
    email = models.EmailField(unique=True)
    provider_type = models.CharField(max_length=50, default="gmail")  # gmail, outlook, smtp
    account_role = models.CharField(
        max_length=30,
        choices=AccountRole.choices,
        default=AccountRole.PRIMARY
    )
    is_default_outbound = models.BooleanField(default=False)

    # OAuth Tokens
    access_token_encrypted = models.TextField(blank=True, default="")
    refresh_token_encrypted = models.TextField(blank=True, default="")
    token_expiry = models.DateTimeField(null=True, blank=True)

    # Custom SMTP Credentials
    smtp_host = models.CharField(max_length=255, blank=True, default="")
    smtp_port = models.IntegerField(default=587, blank=True, null=True)
    smtp_username = models.CharField(max_length=255, blank=True, default="")
    smtp_password_encrypted = models.TextField(blank=True, default="")
    smtp_use_tls = models.BooleanField(default=True)
    smtp_use_ssl = models.BooleanField(default=False)

    status = models.CharField(
        max_length=50,
        default="connected"
    )  # connected, disconnected, error

    class Meta:
        db_table = "emails_emailaccount"
        verbose_name = "Email Account"
        verbose_name_plural = "Email Accounts"

    def __str__(self):
        return f"{self.email} ({self.provider_type} - {self.account_role}) - {self.user.username}"

    def get_access_token(self) -> str:
        if not self.access_token_encrypted:
            return ""
        from apps.common.encryption import decrypt_api_key
        return decrypt_api_key(self.access_token_encrypted)

    def set_access_token(self, token: str):
        from apps.common.encryption import encrypt_api_key
        self.access_token_encrypted = encrypt_api_key(token)

    def get_refresh_token(self) -> str:
        if not self.refresh_token_encrypted:
            return ""
        from apps.common.encryption import decrypt_api_key
        return decrypt_api_key(self.refresh_token_encrypted)

    def set_refresh_token(self, token: str):
        from apps.common.encryption import encrypt_api_key
        self.refresh_token_encrypted = encrypt_api_key(token)

    def get_smtp_password(self) -> str:
        if not self.smtp_password_encrypted:
            return ""
        from apps.common.encryption import decrypt_api_key
        return decrypt_api_key(self.smtp_password_encrypted)

    def set_smtp_password(self, password: str):
        from apps.common.encryption import encrypt_api_key
        self.smtp_password_encrypted = encrypt_api_key(password)


class EmailThread(BaseModel):
    """
    Represents a provider-independent thread (conversation containing messages).
    Directly links to Company, Contact, and Deal for unified CRM context.
    """
    gmail_thread_id = models.CharField(max_length=255, unique=True, db_index=True)
    subject = models.CharField(max_length=255, blank=True, default="")
    participants = models.JSONField(default=list, blank=True)  # List of emails/names
    snippet = models.TextField(blank=True, default="")
    last_message_time = models.DateTimeField(db_index=True)

    company = models.ForeignKey(
        "companies.Company",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="email_threads"
    )
    contact = models.ForeignKey(
        "contacts.Contact",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="email_threads"
    )
    deal = models.ForeignKey(
        "deals.Deal",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="email_threads"
    )

    # Telemetry tracking metrics
    open_count = models.IntegerField(default=0)
    click_count = models.IntegerField(default=0)
    has_replied = models.BooleanField(default=False)
    last_opened_at = models.DateTimeField(null=True, blank=True)
    last_clicked_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "emails_emailthread"
        verbose_name = "Email Thread"
        verbose_name_plural = "Email Threads"
        ordering = ["-last_message_time"]

    def __str__(self):
        return f"{self.subject or '(No Subject)'} ({self.gmail_thread_id})"


class EmailMessage(BaseModel):
    """
    Represents an individual message in a thread.
    Stores the body contents (plain/html) and standard headers.
    """
    gmail_message_id = models.CharField(max_length=255, unique=True, db_index=True)
    thread = models.ForeignKey(
        EmailThread,
        on_delete=models.CASCADE,
        related_name="messages"
    )
    sender = models.TextField()  # e.g., "John Doe <john@example.com>"
    recipients = models.JSONField(default=list, blank=True)  # List of "To" addresses
    cc = models.JSONField(default=list, blank=True)
    bcc = models.JSONField(default=list, blank=True)
    direction = models.CharField(max_length=20)  # incoming, outgoing
    subject = models.CharField(max_length=255, blank=True, default="")
    plain_text_body = models.TextField(blank=True, default="")
    html_body = models.TextField(blank=True, default="")
    internal_date = models.DateTimeField(db_index=True)
    labels = models.JSONField(default=list, blank=True)
    imported_at = models.DateTimeField(auto_now_add=True)

    # Telemetry tracking metrics for outbound contact emails
    tracking_token = models.CharField(max_length=100, blank=True, null=True, db_index=True)
    open_count = models.IntegerField(default=0)
    click_count = models.IntegerField(default=0)
    has_replied = models.BooleanField(default=False)
    last_opened_at = models.DateTimeField(null=True, blank=True)
    last_clicked_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "emails_emailmessage"
        verbose_name = "Email Message"
        verbose_name_plural = "Email Messages"
        ordering = ["internal_date"]

    def __str__(self):
        return f"{self.subject or '(No Subject)'} from {self.sender[:50]}"


class EmailAttachment(BaseModel):
    """
    Stores metadata for an email attachment.
    Files are not downloaded to conserve storage.
    """
    message = models.ForeignKey(
        EmailMessage,
        on_delete=models.CASCADE,
        related_name="attachments"
    )
    filename = models.CharField(max_length=255)
    mime_type = models.CharField(max_length=100)
    size = models.IntegerField()  # size in bytes
    attachment_id = models.TextField()

    class Meta:
        db_table = "emails_emailattachment"
        verbose_name = "Email Attachment"
        verbose_name_plural = "Email Attachments"

    def __str__(self):
        return f"{self.filename} ({self.mime_type})"


class GoogleOauthConfig(BaseModel):
    """
    Stores global organization-level Google OAuth Client credentials.
    """
    client_id = models.CharField(max_length=255)
    client_secret_encrypted = models.TextField()

    class Meta:
        db_table = "emails_googleoauthconfig"
        verbose_name = "Google OAuth Config"
        verbose_name_plural = "Google OAuth Configs"

    def __str__(self):
        return f"Google OAuth Config - Client ID: {self.client_id[:15]}..."

    def get_client_secret(self) -> str:
        from apps.common.encryption import decrypt_api_key
        return decrypt_api_key(self.client_secret_encrypted)

    def set_client_secret(self, secret: str):
        from apps.common.encryption import encrypt_api_key
        self.client_secret_encrypted = encrypt_api_key(secret)

