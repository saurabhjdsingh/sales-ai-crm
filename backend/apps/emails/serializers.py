from rest_framework import serializers
from apps.emails.models import EmailAccount, EmailThread, EmailMessage, EmailAttachment


class EmailAccountSerializer(serializers.ModelSerializer):
    class Meta:
        model = EmailAccount
        fields = [
            "id",
            "email",
            "provider_type",
            "account_role",
            "is_default_outbound",
            "smtp_host",
            "smtp_port",
            "smtp_username",
            "smtp_use_tls",
            "smtp_use_ssl",
            "status",
            "created_at",
        ]
        read_only_fields = ["id", "created_at"]


class EmailAttachmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = EmailAttachment
        fields = ["id", "filename", "mime_type", "size", "attachment_id"]


class EmailMessageSerializer(serializers.ModelSerializer):
    attachments = EmailAttachmentSerializer(many=True, read_only=True)

    class Meta:
        model = EmailMessage
        fields = [
            "id",
            "gmail_message_id",
            "sender",
            "recipients",
            "cc",
            "bcc",
            "direction",
            "subject",
            "plain_text_body",
            "html_body",
            "internal_date",
            "labels",
            "attachments",
            "imported_at",
            "tracking_token",
            "open_count",
            "click_count",
            "has_replied",
            "last_opened_at",
            "last_clicked_at",
        ]


class EmailThreadSerializer(serializers.ModelSerializer):
    messages = EmailMessageSerializer(many=True, read_only=True)
    company_name = serializers.CharField(source="company.name", read_only=True, default=None)
    contact_name = serializers.CharField(source="contact.full_name", read_only=True, default=None)

    class Meta:
        model = EmailThread
        fields = [
            "id",
            "gmail_thread_id",
            "subject",
            "participants",
            "snippet",
            "last_message_time",
            "company",
            "company_name",
            "contact",
            "contact_name",
            "deal",
            "messages",
            "open_count",
            "click_count",
            "has_replied",
            "last_opened_at",
            "last_clicked_at",
        ]
        read_only_fields = ["id", "gmail_thread_id"]


class GoogleOauthConfigSerializer(serializers.ModelSerializer):
    client_secret = serializers.CharField(write_only=True, required=False, allow_blank=True)
    has_secret = serializers.SerializerMethodField()

    class Meta:
        from apps.emails.models import GoogleOauthConfig
        model = GoogleOauthConfig
        fields = ["id", "client_id", "client_secret", "has_secret", "created_at", "updated_at"]
        read_only_fields = ["id", "created_at", "updated_at"]

    def get_has_secret(self, obj) -> bool:
        return bool(obj.client_secret_encrypted)

