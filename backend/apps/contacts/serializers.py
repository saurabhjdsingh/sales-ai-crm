"""
Serializers for the Contacts module.
"""

from rest_framework import serializers

from apps.common.serializers import AuditFieldsMixin, OwnerFieldMixin
from apps.contacts.models import Contact


class ContactListSerializer(AuditFieldsMixin, OwnerFieldMixin, serializers.ModelSerializer):
    """Lightweight serializer for contact list view."""

    full_name = serializers.CharField(read_only=True)
    company_name = serializers.CharField(source="company.name", read_only=True, default="", allow_null=True)
    company_website = serializers.CharField(source="company.website", read_only=True, default="", allow_null=True)
    company_size = serializers.CharField(source="company.company_size", read_only=True, default="", allow_null=True)

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
            "owner",
            "owner_detail",
            "country",
            "created_at",
        ]


class ContactDetailSerializer(AuditFieldsMixin, OwnerFieldMixin, serializers.ModelSerializer):
    """Full serializer for contact detail view."""

    full_name = serializers.CharField(read_only=True)
    company_name = serializers.CharField(source="company.name", read_only=True, default="", allow_null=True)
    company_website = serializers.CharField(source="company.website", read_only=True, default="", allow_null=True)
    company_size = serializers.CharField(source="company.company_size", read_only=True, default="", allow_null=True)

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
            "country",
            "company",
            "company_name",
            "company_website",
            "company_size",
            "stage",
            "owner",
            "owner_detail",
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
            "country",
            "owner",
            "stage",
        ]

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
