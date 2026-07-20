"""
Serializers for the Dashboard app.
"""

from rest_framework import serializers

from apps.dashboard.models import DailyProductivity


class DailyProductivitySerializer(serializers.ModelSerializer):
    """Read-only serializer for daily productivity snapshots."""

    total_actions = serializers.IntegerField(read_only=True)

    class Meta:
        model = DailyProductivity
        fields = [
            "id",
            "date",
            "companies_worked",
            "contacts_worked",
            "deals_worked",
            "tasks_worked",
            "activities_logged",
            "notes_added",
            "calls_completed",
            "emails_imported",
            "extra_metrics",
            "total_actions",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields
