"""
Serializers for the Notes module.
"""

from rest_framework import serializers

from apps.common.serializers import AuditFieldsMixin
from apps.notes.models import Note


class NoteSerializer(AuditFieldsMixin, serializers.ModelSerializer):
    class Meta:
        model = Note
        fields = [
            "id",
            "content",
            "is_pinned",
            "company",
            "contact",
            "deal",
            "created_at",
            "updated_at",
            "created_by",
            "updated_by",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class NoteCreateUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Note
        fields = ["content", "is_pinned", "company", "contact", "deal"]
