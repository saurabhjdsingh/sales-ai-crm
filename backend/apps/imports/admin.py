from django.contrib import admin
from apps.imports.models import ImportJob, ImportRecord


class ImportRecordInline(admin.TabularInline):
    model = ImportRecord
    extra = 0
    readonly_fields = ["row_number", "status", "error_message", "entity_id"]


@admin.register(ImportJob)
class ImportJobAdmin(admin.ModelAdmin):
    list_display = ["file_name", "entity_type", "status", "total_rows", "success_count", "error_count", "created_at"]
    list_filter = ["status", "entity_type"]
    readonly_fields = ["id", "created_at", "updated_at"]
    inlines = [ImportRecordInline]
