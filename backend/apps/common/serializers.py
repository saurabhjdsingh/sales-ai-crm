"""
Reusable serializer mixins and base serializers for the CRM API.
"""

from rest_framework import serializers


class AuditFieldsMixin(serializers.Serializer):
    """Read-only audit fields included on all entity responses."""

    id = serializers.UUIDField(read_only=True)
    created_at = serializers.DateTimeField(read_only=True)
    updated_at = serializers.DateTimeField(read_only=True)
    created_by = serializers.SerializerMethodField()
    updated_by = serializers.SerializerMethodField()

    def get_created_by(self, obj):
        if obj.created_by:
            return {
                "id": str(obj.created_by.id),
                "name": obj.created_by.get_full_name(),
            }
        return None

    def get_updated_by(self, obj):
        if obj.updated_by:
            return {
                "id": str(obj.updated_by.id),
                "name": obj.updated_by.get_full_name(),
            }
        return None


class OwnerFieldMixin(serializers.Serializer):
    """Provides a nested owner representation for read, UUID for write."""

    owner_detail = serializers.SerializerMethodField(read_only=True)

    def get_owner_detail(self, obj):
        if obj.owner:
            return {
                "id": str(obj.owner.id),
                "name": obj.owner.get_full_name(),
                "email": obj.owner.email,
            }
        return None
