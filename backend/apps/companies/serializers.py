"""
Serializers for the Companies module.
"""

from rest_framework import serializers

from apps.common.countries import get_country_display_name, normalize_country_code
from apps.common.serializers import AuditFieldsMixin, OwnerFieldMixin
from apps.companies.models import Company
from apps.prospect_lists.models import ProspectList
from apps.prospect_lists.serializers import ProspectListSimpleSerializer


class CompanyListSerializer(AuditFieldsMixin, OwnerFieldMixin, serializers.ModelSerializer):
    """Serializer for company list view — lightweight, includes counts."""

    contact_count = serializers.IntegerField(read_only=True)
    deal_count = serializers.IntegerField(read_only=True)
    country_display = serializers.SerializerMethodField()
    lists = ProspectListSimpleSerializer(many=True, read_only=True)

    class Meta:
        model = Company
        fields = [
            "id",
            "name",
            "website",
            "industry",
            "company_size",
            "country",
            "country_display",
            "stage",
            "owner",
            "owner_detail",
            "tags",
            "source",
            "icp_score",
            "ai_summary",
            "contact_count",
            "deal_count",
            "lists",
            "created_at",
            "updated_at",
        ]

    def get_country_display(self, obj) -> str:
        return get_country_display_name(obj.country)


class CompanyDetailSerializer(AuditFieldsMixin, OwnerFieldMixin, serializers.ModelSerializer):
    """Serializer for company detail view — includes all fields."""

    contact_count = serializers.IntegerField(read_only=True)
    deal_count = serializers.IntegerField(read_only=True)
    open_deal_count = serializers.IntegerField(read_only=True)
    country_display = serializers.SerializerMethodField()
    lists = ProspectListSimpleSerializer(many=True, read_only=True)

    class Meta:
        model = Company
        fields = [
            "id",
            "name",
            "website",
            "industry",
            "company_size",
            "country",
            "country_display",
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
            "lists",
            "created_at",
            "updated_at",
            "created_by",
            "updated_by",
        ]

    def get_country_display(self, obj) -> str:
        return get_country_display_name(obj.country)


class CompanyCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating a company."""

    id = serializers.UUIDField(read_only=True)
    list_ids = serializers.PrimaryKeyRelatedField(
        many=True, queryset=ProspectList.objects.all(), source="lists", required=False
    )

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
            "list_ids",
        ]

    def validate_name(self, value):
        if not value or not value.strip():
            raise serializers.ValidationError("Company name is required.")
        return value.strip()

    def validate_country(self, value):
        if value:
            return normalize_country_code(value)
        return ""

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
    list_ids = serializers.PrimaryKeyRelatedField(
        many=True, queryset=ProspectList.objects.all(), source="lists", required=False
    )

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
            "list_ids",
        ]

    def validate_country(self, value):
        if value:
            return normalize_country_code(value)
        return ""

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
