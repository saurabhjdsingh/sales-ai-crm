from django.contrib import admin

from apps.agent.models import (
    PendingApproval,
    ResearchArtifact,
    ResearchInsight,
    ResearchRun,
    ResearchSource,
    ResearchSummary,
    ToolExecution,
    UserLinkedInConfig,
)


@admin.register(ResearchRun)
class ResearchRunAdmin(admin.ModelAdmin):
    list_display = ["id", "company", "contact", "status", "started_at", "completed_at"]
    list_filter = ["status"]
    search_fields = ["company__name", "contact__first_name", "contact__last_name"]


@admin.register(ResearchSource)
class ResearchSourceAdmin(admin.ModelAdmin):
    list_display = ["id", "run", "source_type", "url"]
    list_filter = ["source_type"]


@admin.register(ResearchInsight)
class ResearchInsightAdmin(admin.ModelAdmin):
    list_display = ["id", "run", "category", "confidence"]
    list_filter = ["category"]


@admin.register(ResearchSummary)
class ResearchSummaryAdmin(admin.ModelAdmin):
    list_display = ["run"]


@admin.register(ResearchArtifact)
class ResearchArtifactAdmin(admin.ModelAdmin):
    list_display = ["name", "run", "content_type"]


@admin.register(ToolExecution)
class ToolExecutionAdmin(admin.ModelAdmin):
    list_display = ["tool_name", "status", "duration_ms", "created_at"]
    list_filter = ["status", "tool_name"]
    search_fields = ["tool_name"]


@admin.register(PendingApproval)
class PendingApprovalAdmin(admin.ModelAdmin):
    list_display = ["tool_name", "status", "approved_by", "created_at"]
    list_filter = ["status", "tool_name"]


@admin.register(UserLinkedInConfig)
class UserLinkedInConfigAdmin(admin.ModelAdmin):
    list_display = ["user", "linkedin_url", "is_active"]
    list_filter = ["is_active"]
