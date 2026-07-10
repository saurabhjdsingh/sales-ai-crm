"""
Serializers for the Companies module.
"""

from rest_framework import serializers

from apps.common.serializers import AuditFieldsMixin, OwnerFieldMixin
from apps.companies.models import Company


class CompanyListSerializer(AuditFieldsMixin, OwnerFieldMixin, serializers.ModelSerializer):
    """Serializer for company list view — lightweight, includes counts."""

    contact_count = serializers.IntegerField(read_only=True)
    deal_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = Company
        fields = [
            "id",
            "name",
            "website",
            "industry",
            "company_size",
            "country",
            "stage",
            "owner",
            "owner_detail",
            "tags",
            "source",
            "icp_score",
            "ai_summary",
            "contact_count",
            "deal_count",
            "created_at",
            "updated_at",
        ]


class CompanyDetailSerializer(AuditFieldsMixin, OwnerFieldMixin, serializers.ModelSerializer):
    """Serializer for company detail view — includes all fields."""

    contact_count = serializers.IntegerField(read_only=True)
    deal_count = serializers.IntegerField(read_only=True)
    open_deal_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = Company
        fields = [
            "id",
            "name",
            "website",
            "industry",
            "company_size",
            "country",
            "linkedin_url",
            "apollo_id",
            "description",
            "stage",
            "owner",
            "owner_detail",
            "tags",
            "source",
            "icp_score",
            "icp_explanation",
            "ai_summary",
            "contact_count",
            "deal_count",
            "open_deal_count",
            "created_at",
            "updated_at",
            "created_by",
            "updated_by",
        ]


class CompanyCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating a company."""

    id = serializers.UUIDField(read_only=True)

    class Meta:
        model = Company
        fields = [
            "id",
            "name",
            "website",
            "industry",
            "company_size",
            "country",
            "linkedin_url",
            "apollo_id",
            "description",
            "stage",
            "owner",
            "tags",
            "source",
        ]

    def validate_name(self, value):
        if not value or not value.strip():
            raise serializers.ValidationError("Company name is required.")
        return value.strip()

    def validate_apollo_id(self, value):
        if value:
            value = value.strip()
            existing = Company.objects.filter(apollo_id=value)
            if self.instance:
                existing = existing.exclude(pk=self.instance.pk)
            if existing.exists():
                raise serializers.ValidationError(
                    "A company with this Apollo ID already exists."
                )
        return value or None


class CompanyUpdateSerializer(serializers.ModelSerializer):
    """Serializer for updating a company."""

    id = serializers.UUIDField(read_only=True)

    class Meta:
        model = Company
        fields = [
            "id",
            "name",
            "website",
            "industry",
            "company_size",
            "country",
            "linkedin_url",
            "apollo_id",
            "description",
            "stage",
            "owner",
            "tags",
            "source",
        ]

    def validate_apollo_id(self, value):
        if value:
            value = value.strip()
            existing = Company.objects.filter(apollo_id=value).exclude(
                pk=self.instance.pk
            )
            if existing.exists():
                raise serializers.ValidationError(
                    "A company with this Apollo ID already exists."
                )
        return value or None
