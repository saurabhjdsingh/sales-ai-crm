"""
Serializers for the Contacts module.
"""

from rest_framework import serializers

from apps.common.countries import get_country_display_name, normalize_country_code
from apps.common.serializers import AuditFieldsMixin, OwnerFieldMixin
from apps.contacts.models import Contact
from apps.prospect_lists.models import ProspectList
from apps.prospect_lists.serializers import ProspectListSimpleSerializer


class ContactListSerializer(AuditFieldsMixin, OwnerFieldMixin, serializers.ModelSerializer):
    """Lightweight serializer for contact list view."""

    full_name = serializers.CharField(read_only=True)
    company_name = serializers.CharField(source="company.name", read_only=True, default="", allow_null=True)
    company_website = serializers.CharField(source="company.website", read_only=True, default="", allow_null=True)
    company_size = serializers.CharField(source="company.company_size", read_only=True, default="", allow_null=True)
    country_display = serializers.SerializerMethodField()
    lists = ProspectListSimpleSerializer(many=True, read_only=True)
    sequence_status = serializers.SerializerMethodField(read_only=True)
    sequence_name = serializers.SerializerMethodField(read_only=True)
    sequence_id = serializers.SerializerMethodField(read_only=True)

    def _get_latest_enrollment(self, obj):
        if not hasattr(obj, "_cached_latest_enrollment"):
            enrollments = sorted(list(obj.sequence_enrollments.all()), key=lambda e: e.created_at, reverse=True)
            obj._cached_latest_enrollment = enrollments[0] if enrollments else None
        return obj._cached_latest_enrollment

    def get_country_display(self, obj) -> str:
        return get_country_display_name(obj.country)

    def get_sequence_status(self, obj):
        enrollment = self._get_latest_enrollment(obj)
        if not enrollment:
            return "not_enrolled"

        status = enrollment.status

        # Green: Completed or Stopped
        if status in ["completed", "stopped"]:
            return "completed"

        # Blue: Paused by rep (not requiring active attention)
        if status == "paused":
            return "active"

        # Yellow: Waiting for rep action or AI email approval
        if status == "waiting_approval":
            return "action_required"

        # Blue: Actively running or waiting step delay
        if status in ["running", "waiting"]:
            return "active"

        return "not_enrolled"

    def get_sequence_name(self, obj):
        enrollment = self._get_latest_enrollment(obj)
        return enrollment.sequence.name if enrollment and enrollment.sequence else None

    def get_sequence_id(self, obj):
        enrollment = self._get_latest_enrollment(obj)
        return str(enrollment.sequence_id) if enrollment else None

    class Meta:
        model = Contact
        fields = [
            "id",
            "first_name",
            "last_name",
            "full_name",
            "email",
            "phone",
            "job_title",
            "company",
            "company_name",
            "company_website",
            "company_size",
            "stage",
            "sequence_status",
            "sequence_name",
            "sequence_id",
            "owner",
            "owner_detail",
            "country",
            "country_display",
            "city",
            "state",
            "timezone",
            "timezone_source",
            "timezone_confidence",
            "lists",
            "created_at",
        ]


class ContactDetailSerializer(AuditFieldsMixin, OwnerFieldMixin, serializers.ModelSerializer):
    """Full serializer for contact detail view."""

    full_name = serializers.CharField(read_only=True)
    company_name = serializers.CharField(source="company.name", read_only=True, default="", allow_null=True)
    company_website = serializers.CharField(source="company.website", read_only=True, default="", allow_null=True)
    company_size = serializers.CharField(source="company.company_size", read_only=True, default="", allow_null=True)
    country_display = serializers.SerializerMethodField()
    lists = ProspectListSimpleSerializer(many=True, read_only=True)
    sequence_status = serializers.SerializerMethodField(read_only=True)
    sequence_name = serializers.SerializerMethodField(read_only=True)
    sequence_id = serializers.SerializerMethodField(read_only=True)

    def _get_latest_enrollment(self, obj):
        if not hasattr(obj, "_cached_latest_enrollment"):
            enrollments = sorted(list(obj.sequence_enrollments.all()), key=lambda e: e.created_at, reverse=True)
            obj._cached_latest_enrollment = enrollments[0] if enrollments else None
        return obj._cached_latest_enrollment

    def get_country_display(self, obj) -> str:
        return get_country_display_name(obj.country)

    def get_sequence_status(self, obj):
        enrollment = self._get_latest_enrollment(obj)
        if not enrollment:
            return "not_enrolled"

        status = enrollment.status

        # Green: Completed or Stopped
        if status in ["completed", "stopped"]:
            return "completed"

        # Blue: Paused by rep (not requiring active attention)
        if status == "paused":
            return "active"

        # Yellow: Waiting for rep action or AI email approval
        if status == "waiting_approval":
            return "action_required"

        # Blue: Actively running or waiting step delay
        if status in ["running", "waiting"]:
            return "active"

        return "not_enrolled"

    def get_sequence_name(self, obj):
        enrollment = self._get_latest_enrollment(obj)
        return enrollment.sequence.name if enrollment and enrollment.sequence else None

    def get_sequence_id(self, obj):
        enrollment = self._get_latest_enrollment(obj)
        return str(enrollment.sequence_id) if enrollment else None

    class Meta:
        model = Contact
        fields = [
            "id",
            "first_name",
            "last_name",
            "full_name",
            "email",
            "phone",
            "job_title",
            "department",
            "linkedin_url",
            "apollo_id",
            "timezone",
            "timezone_source",
            "timezone_confidence",
            "country",
            "country_display",
            "city",
            "state",
            "company",
            "company_name",
            "company_website",
            "company_size",
            "stage",
            "sequence_status",
            "sequence_name",
            "sequence_id",
            "owner",
            "owner_detail",
            "lists",
            "ai_summary",
            "created_at",
            "updated_at",
            "created_by",
            "updated_by",
        ]


class ContactCreateUpdateSerializer(serializers.ModelSerializer):
    """Serializer for creating/updating contacts."""

    id = serializers.UUIDField(read_only=True)
    company_name = serializers.CharField(source="company.name", read_only=True)
    list_ids = serializers.PrimaryKeyRelatedField(
        many=True, queryset=ProspectList.objects.all(), source="lists", required=False
    )

    class Meta:
        model = Contact
        fields = [
            "id",
            "company",
            "company_name",
            "first_name",
            "last_name",
            "email",
            "phone",
            "job_title",
            "department",
            "linkedin_url",
            "apollo_id",
            "timezone",
            "timezone_source",
            "timezone_confidence",
            "country",
            "city",
            "state",
            "owner",
            "stage",
            "list_ids",
        ]

    def validate_country(self, value):
        if value:
            return normalize_country_code(value)
        return ""

    def validate_apollo_id(self, value):
        if value:
            value = value.strip()
            existing = Contact.objects.filter(apollo_id=value)
            if self.instance:
                existing = existing.exclude(pk=self.instance.pk)
            if existing.exists():
                raise serializers.ValidationError(
                    "A contact with this Apollo ID already exists."
                )
        return value or None
