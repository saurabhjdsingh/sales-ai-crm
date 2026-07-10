from rest_framework import serializers

from apps.agent.models import (
    PendingApproval,
    ResearchArtifact,
    ResearchInsight,
    ResearchRun,
    ResearchSource,
    ResearchSummary,
    ToolExecution,
    UserLinkedInConfig,
)


class ResearchInsightSerializer(serializers.ModelSerializer):
    class Meta:
        model = ResearchInsight
        fields = ["id", "category", "content", "confidence", "created_at"]


class ResearchSourceSerializer(serializers.ModelSerializer):
    class Meta:
        model = ResearchSource
        fields = ["id", "source_type", "url", "raw_data", "created_at"]


class ResearchSummarySerializer(serializers.ModelSerializer):
    class Meta:
        model = ResearchSummary
        fields = ["executive_summary", "sales_strategy"]


class ResearchRunSerializer(serializers.ModelSerializer):
    insights = ResearchInsightSerializer(many=True, read_only=True)
    sources = ResearchSourceSerializer(many=True, read_only=True)
    summary = ResearchSummarySerializer(read_only=True)
    company_name = serializers.CharField(source="company.name", read_only=True)
    contact_name = serializers.CharField(source="contact.full_name", read_only=True)

    class Meta:
        model = ResearchRun
        fields = [
            "id",
            "company",
            "company_name",
            "contact",
            "contact_name",
            "status",
            "started_at",
            "completed_at",
            "expires_at",
            "insights",
            "sources",
            "summary",
            "created_at",
        ]


class ToolExecutionSerializer(serializers.ModelSerializer):
    class Meta:
        model = ToolExecution
        fields = [
            "id",
            "tool_name",
            "parameters",
            "status",
            "result",
            "error_message",
            "duration_ms",
            "conversation",
            "created_at",
        ]


class PendingApprovalSerializer(serializers.ModelSerializer):
    created_by_name = serializers.CharField(source="created_by.get_full_name", read_only=True)

    class Meta:
        model = PendingApproval
        fields = [
            "id",
            "tool_name",
            "parameters",
            "status",
            "action_payload",
            "approved_at",
            "created_by_name",
            "conversation",
            "created_at",
        ]


class UserLinkedInConfigSerializer(serializers.ModelSerializer):
    """Masks session cookies, returning true/false indicator instead of real credentials."""

    has_cookies = serializers.SerializerMethodField()

    class Meta:
        model = UserLinkedInConfig
        fields = [
            "id",
            "linkedin_url",
            "has_cookies",
            "is_active",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def get_has_cookies(self, obj) -> bool:
        return bool(obj.cookies_json_encrypted)


class UserLinkedInConfigWriteSerializer(serializers.Serializer):
    """Handles secure encrypted update of LinkedIn config cookies & URL."""

    cookies = serializers.JSONField(required=True)
    linkedin_url = serializers.URLField(required=False, allow_blank=True, default="")
    is_active = serializers.BooleanField(required=False, default=True)
