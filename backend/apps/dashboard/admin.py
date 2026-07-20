"""
Admin registration for Dashboard models.
"""

from django.contrib import admin

from apps.dashboard.models import DailyProductivity


@admin.register(DailyProductivity)
class DailyProductivityAdmin(admin.ModelAdmin):
    list_display = [
        "user",
        "date",
        "companies_worked",
        "contacts_worked",
        "deals_worked",
        "tasks_worked",
        "activities_logged",
        "notes_added",
        "calls_completed",
        "emails_imported",
        "total_actions",
        "updated_at",
    ]
    list_filter = ["date", "user"]
    search_fields = ["user__email", "user__first_name", "user__last_name"]
    readonly_fields = ["id", "created_at", "updated_at"]
    date_hierarchy = "date"
    ordering = ["-date", "user"]
