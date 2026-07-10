"""
Serializers for the Deals module.
"""

from rest_framework import serializers

from apps.common.serializers import AuditFieldsMixin, OwnerFieldMixin
from apps.deals.models import Deal, DealContact


class DealContactSerializer(serializers.ModelSerializer):
    """Serializer for DealContact bridge records."""

    contact_name = serializers.SerializerMethodField()
    contact_email = serializers.CharField(source="contact.email", read_only=True)
    contact_job_title = serializers.CharField(source="contact.job_title", read_only=True)

    class Meta:
        model = DealContact
        fields = [
            "id",
            "deal",
            "contact",
            "contact_name",
            "contact_email",
            "contact_job_title",
            "role",
            "is_primary",
            "created_at",
        ]
        read_only_fields = ["id", "created_at"]

    def get_contact_name(self, obj):
        return obj.contact.full_name


class DealListSerializer(AuditFieldsMixin, OwnerFieldMixin, serializers.ModelSerializer):
    """Lightweight serializer for deal list and pipeline views."""

    company_name = serializers.CharField(source="company.name", read_only=True)
    contact_count = serializers.SerializerMethodField()

    class Meta:
        model = Deal
        fields = [
            "id",
            "name",
            "company",
            "company_name",
            "expected_revenue",
            "owner",
            "owner_detail",
            "stage",
            "priority",
            "expected_close_date",
            "risk",
            "probability",
            "contact_count",
            "created_at",
        ]

    def get_contact_count(self, obj):
        return obj.deal_contacts.count()


class DealDetailSerializer(AuditFieldsMixin, OwnerFieldMixin, serializers.ModelSerializer):
    """Full serializer for deal detail view."""

    company_name = serializers.CharField(source="company.name", read_only=True)
    deal_contacts = DealContactSerializer(many=True, read_only=True)

    class Meta:
        model = Deal
        fields = [
            "id",
            "name",
            "company",
            "company_name",
            "expected_revenue",
            "owner",
            "owner_detail",
            "stage",
            "priority",
            "expected_close_date",
            "risk",
            "probability",
            "description",
            "internal_notes",
            "ai_analysis",
            "deal_contacts",
            "created_at",
            "updated_at",
            "created_by",
            "updated_by",
        ]


class DealCreateUpdateSerializer(serializers.ModelSerializer):
    """Serializer for creating/updating deals."""

    id = serializers.UUIDField(read_only=True)
    company_name = serializers.CharField(source="company.name", read_only=True)

    class Meta:
        model = Deal
        fields = [
            "id",
            "name",
            "company",
            "company_name",
            "expected_revenue",
            "owner",
            "stage",
            "priority",
            "expected_close_date",
            "risk",
            "probability",
            "description",
            "internal_notes",
        ]


class DealContactCreateSerializer(serializers.ModelSerializer):
    """Serializer for adding a contact to a deal."""

    class Meta:
        model = DealContact
        fields = ["contact", "role", "is_primary"]
