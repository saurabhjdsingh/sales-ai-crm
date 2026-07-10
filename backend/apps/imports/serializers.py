"""
Serializers for the Imports module.
"""

from rest_framework import serializers

from apps.imports.models import ImportJob, ImportRecord


class ImportJobListSerializer(serializers.ModelSerializer):
    started_by_name = serializers.SerializerMethodField()
    progress_percent = serializers.FloatField(read_only=True)

    class Meta:
        model = ImportJob
        fields = [
            "id",
            "file_name",
            "entity_type",
            "status",
            "total_rows",
            "processed_rows",
            "success_count",
            "error_count",
            "duplicate_count",
            "progress_percent",
            "started_by",
            "started_by_name",
            "created_at",
        ]

    def get_started_by_name(self, obj):
        return obj.started_by.get_full_name() if obj.started_by else None


class ImportJobDetailSerializer(ImportJobListSerializer):
    class Meta(ImportJobListSerializer.Meta):
        fields = ImportJobListSerializer.Meta.fields + [
            "column_mapping",
            "errors",
            "updated_at",
        ]


from apps.common.enums import ImportEntityType

class ImportUploadSerializer(serializers.Serializer):
    """Serializer for CSV file upload."""

    file = serializers.FileField()
    entity_type = serializers.ChoiceField(
        choices=ImportEntityType.choices
    )


class ImportProcessSerializer(serializers.Serializer):
    """Serializer for starting the import process with column mapping."""

    import_job_id = serializers.UUIDField()
    column_mapping = serializers.DictField(child=serializers.CharField())


class ImportRecordSerializer(serializers.ModelSerializer):
    class Meta:
        model = ImportRecord
        fields = [
            "id",
            "row_number",
            "status",
            "raw_data",
            "error_message",
            "entity_id",
            "created_at",
        ]
