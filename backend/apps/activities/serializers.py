"""
Serializers for the Activities module.
"""

from rest_framework import serializers

from apps.activities.models import Activity


class ActivitySerializer(serializers.ModelSerializer):
    """Serializer for activity timeline entries."""

    performed_by_name = serializers.SerializerMethodField()
    company_name = serializers.CharField(source="company.name", read_only=True, default=None)

    class Meta:
        model = Activity
        fields = [
            "id",
            "activity_type",
            "title",
            "description",
            "metadata",
            "performed_by",
            "performed_by_name",
            "company",
            "company_name",
            "contact",
            "deal",
            "created_at",
        ]
        read_only_fields = ["id", "created_at"]

    def get_performed_by_name(self, obj):
        return obj.performed_by.get_full_name() if obj.performed_by else None


class ActivityCreateSerializer(serializers.ModelSerializer):
    """Serializer for manually creating activities (e.g., log a call)."""

    class Meta:
        model = Activity
        fields = [
            "activity_type",
            "title",
            "description",
            "metadata",
            "company",
            "contact",
            "deal",
        ]
