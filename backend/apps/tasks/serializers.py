"""
Serializers for the Tasks module.
"""

from rest_framework import serializers

from apps.common.serializers import AuditFieldsMixin, OwnerFieldMixin
from apps.tasks.models import Task


class TaskListSerializer(AuditFieldsMixin, OwnerFieldMixin, serializers.ModelSerializer):
    company_name = serializers.CharField(source="company.name", read_only=True, default=None)
    contact_name = serializers.SerializerMethodField()
    deal_name = serializers.CharField(source="deal.name", read_only=True, default=None)
    is_overdue = serializers.BooleanField(read_only=True)

    class Meta:
        model = Task
        fields = [
            "id",
            "title",
            "due_date",
            "priority",
            "owner",
            "owner_detail",
            "status",
            "task_type",
            "outcome",
            "outcome_notes",
            "requires_outcome",
            "sequence_execution_id",
            "company",
            "company_name",
            "contact",
            "contact_name",
            "deal",
            "deal_name",
            "is_overdue",
            "created_at",
        ]

    def get_contact_name(self, obj):
        return obj.contact.full_name if obj.contact else None


class TaskDetailSerializer(AuditFieldsMixin, OwnerFieldMixin, serializers.ModelSerializer):
    company_name = serializers.CharField(source="company.name", read_only=True, default=None)
    contact_name = serializers.SerializerMethodField()
    deal_name = serializers.CharField(source="deal.name", read_only=True, default=None)
    is_overdue = serializers.BooleanField(read_only=True)

    class Meta:
        model = Task
        fields = [
            "id",
            "title",
            "description",
            "due_date",
            "reminder_at",
            "priority",
            "owner",
            "owner_detail",
            "status",
            "task_type",
            "repeat",
            "completed_at",
            "outcome",
            "outcome_notes",
            "requires_outcome",
            "sequence_execution_id",
            "company",
            "company_name",
            "contact",
            "contact_name",
            "deal",
            "deal_name",
            "is_overdue",
            "created_at",
            "updated_at",
            "created_by",
            "updated_by",
        ]

    def get_contact_name(self, obj):
        return obj.contact.full_name if obj.contact else None


class TaskCreateUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Task
        fields = [
            "title",
            "description",
            "due_date",
            "reminder_at",
            "priority",
            "owner",
            "status",
            "task_type",
            "repeat",
            "outcome",
            "outcome_notes",
            "requires_outcome",
            "sequence_execution_id",
            "company",
            "contact",
            "deal",
        ]


from apps.tasks.models import Notification

class NotificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Notification
        fields = [
            "id",
            "title",
            "message",
            "is_read",
            "notification_type",
            "related_entity_id",
            "related_entity_type",
            "created_at",
        ]
        read_only_fields = ["id", "title", "message", "notification_type", "related_entity_id", "related_entity_type", "created_at"]
