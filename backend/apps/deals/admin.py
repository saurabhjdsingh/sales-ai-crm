from django.contrib import admin
from apps.deals.models import Deal, DealContact


class DealContactInline(admin.TabularInline):
    model = DealContact
    extra = 0


@admin.register(Deal)
class DealAdmin(admin.ModelAdmin):
    list_display = ["name", "company", "stage", "expected_revenue", "owner", "priority"]
    list_filter = ["stage", "priority", "risk"]
    search_fields = ["name", "company__name"]
    readonly_fields = ["id", "created_at", "updated_at"]
    inlines = [DealContactInline]
