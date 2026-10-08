from rest_framework import serializers

from apps.companies.models import Company
from apps.contacts.models import Contact
from apps.deals.models import Deal
from apps.meetings.models import Meeting


class MeetingSerializer(serializers.ModelSerializer):
    """Serializer for displaying and updating Meeting records."""

    contact_name = serializers.SerializerMethodField()
    contact_email = serializers.SerializerMethodField()
    company_name = serializers.SerializerMethodField()
    deal_name = serializers.SerializerMethodField()
    is_finished = serializers.BooleanField(read_only=True)

    class Meta:
        model = Meeting
        fields = [
            "id",
            "google_event_id",
            "calendar_id",
            "title",
            "description",
            "start_time",
            "end_time",
            "timezone",
            "location",
            "meeting_url",
            "html_link",
            "status",
            "organizer",
            "attendees",
            "contact",
            "contact_name",
            "contact_email",
            "company",
            "company_name",
            "deal",
            "deal_name",
            "is_auto_matched",
            "matched_attendee_email",
            "is_manually_edited",
            "meeting_notes",
            "transcript",
            "transcript_source",
            "analysis",
            "has_post_meeting_notes",
            "post_meeting_updated_at",
            "send_reminders",
            "reminder_24h_sent",
            "reminder_24h_sent_at",
            "reminder_1h_sent",
            "reminder_1h_sent_at",
            "is_finished",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "google_event_id",
            "calendar_id",
            "reminder_24h_sent",
            "reminder_24h_sent_at",
            "reminder_1h_sent",
            "reminder_1h_sent_at",
            "created_at",
            "updated_at",
            "is_auto_matched",
            "matched_attendee_email",
            "is_finished",
        ]

    def get_contact_name(self, obj) -> str:
        if obj.contact:
            return obj.contact.full_name
        return ""

    def get_contact_email(self, obj) -> str:
        if obj.contact:
            return obj.contact.email
        return ""

    def get_company_name(self, obj) -> str:
        if obj.company:
            return obj.company.name
        return ""

    def get_deal_name(self, obj) -> str:
        if obj.deal:
            return obj.deal.name
        return ""


class MeetingUpdateSerializer(serializers.ModelSerializer):
    """Allows manual editing of CRM entities, notes, and transcript."""

    contact = serializers.PrimaryKeyRelatedField(
        queryset=Contact.objects.filter(is_deleted=False),
        allow_null=True,
        required=False,
    )
    company = serializers.PrimaryKeyRelatedField(
        queryset=Company.objects.filter(is_deleted=False),
        allow_null=True,
        required=False,
    )
    deal = serializers.PrimaryKeyRelatedField(
        queryset=Deal.objects.filter(is_deleted=False),
        allow_null=True,
        required=False,
    )

    class Meta:
        model = Meeting
        fields = [
            "contact",
            "company",
            "deal",
            "title",
            "meeting_notes",
            "transcript",
            "transcript_source",
            "analysis",
        ]


class MeetingAnalyzeRequestSerializer(serializers.Serializer):
    """Payload for triggering AI analysis on a meeting."""

    notes = serializers.CharField(required=False, allow_blank=True)
    transcript = serializers.CharField(required=False, allow_blank=True)
