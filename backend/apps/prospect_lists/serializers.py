"""
Serializers for the Prospect Lists module.
"""

from rest_framework import serializers

from apps.accounts.serializers import UserListSerializer
from apps.prospect_lists.models import ProspectList, ProspectListSource


class ProspectListSimpleSerializer(serializers.ModelSerializer):
    """Minimal representation of a ProspectList for embedding in entity responses."""

    class Meta:
        model = ProspectList
        fields = ["id", "name", "source"]


class ProspectListSerializer(serializers.ModelSerializer):
    """Detailed serializer for ProspectList."""

    company_count = serializers.IntegerField(read_only=True)
    contact_count = serializers.IntegerField(read_only=True)
    created_by_detail = UserListSerializer(source="created_by", read_only=True)

    class Meta:
        model = ProspectList
        fields = [
            "id",
            "name",
            "name_normalized",
            "description",
            "source",
            "is_active",
            "import_job",
            "company_count",
            "contact_count",
            "created_at",
            "updated_at",
            "created_by",
            "created_by_detail",
        ]
        read_only_fields = [
            "id",
            "name_normalized",
            "company_count",
            "contact_count",
            "created_at",
            "updated_at",
            "created_by",
        ]


class ProspectListCreateUpdateSerializer(serializers.ModelSerializer):
    """Serializer for creating and updating ProspectList records."""

    class Meta:
        model = ProspectList
        fields = ["name", "description", "source", "is_active"]

    def validate_name(self, value):
        val = value.strip()
        if not val:
            raise serializers.ValidationError("List name cannot be empty.")

        norm = val.lower()
        qs = ProspectList.objects.filter(name_normalized=norm, is_deleted=False)
        if self.instance:
            qs = qs.exclude(id=self.instance.id)
        if qs.exists():
            raise serializers.ValidationError(f"A prospect list named '{val}' already exists.")

        return val
