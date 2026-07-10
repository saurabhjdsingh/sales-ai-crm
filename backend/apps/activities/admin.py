from django.contrib import admin
from apps.activities.models import Activity


@admin.register(Activity)
class ActivityAdmin(admin.ModelAdmin):
    list_display = ["activity_type", "title", "performed_by", "company", "created_at"]
    list_filter = ["activity_type"]
    search_fields = ["title"]
    readonly_fields = ["id", "created_at"]
