from django.contrib import admin

from apps.companies.models import Company


@admin.register(Company)
class CompanyAdmin(admin.ModelAdmin):
    list_display = ["name", "industry", "stage", "owner", "icp_score", "created_at"]
    list_filter = ["stage", "industry", "company_size", "source"]
    search_fields = ["name", "website", "industry"]
    readonly_fields = ["id", "created_at", "updated_at", "created_by", "updated_by"]
    ordering = ["-created_at"]
