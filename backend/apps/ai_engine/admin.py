from django.contrib import admin
from apps.ai_engine.models import AIConversation, AIMessage, CompanyResearch


@admin.register(CompanyResearch)
class CompanyResearchAdmin(admin.ModelAdmin):
    list_display = ["company", "research_status", "icp_match", "researched_at"]
    list_filter = ["research_status", "icp_match"]
    search_fields = ["company__name"]


@admin.register(AIConversation)
class AIConversationAdmin(admin.ModelAdmin):
    list_display = ["title", "entity_type", "user", "is_archived", "created_at"]
    list_filter = ["entity_type", "is_archived"]


@admin.register(AIMessage)
class AIMessageAdmin(admin.ModelAdmin):
    list_display = ["conversation", "role", "model_used", "tokens_used", "created_at"]
    list_filter = ["role", "model_used"]
