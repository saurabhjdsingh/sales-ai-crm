from django.contrib import admin
from apps.tasks.models import Task


@admin.register(Task)
class TaskAdmin(admin.ModelAdmin):
    list_display = ["title", "status", "priority", "task_type", "owner", "due_date"]
    list_filter = ["status", "priority", "task_type"]
    search_fields = ["title"]
    readonly_fields = ["id", "created_at", "updated_at"]
