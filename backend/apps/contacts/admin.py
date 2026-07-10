from django.contrib import admin
from apps.contacts.models import Contact


@admin.register(Contact)
class ContactAdmin(admin.ModelAdmin):
    list_display = ["first_name", "last_name", "email", "company", "stage", "owner"]
    list_filter = ["stage", "department"]
    search_fields = ["first_name", "last_name", "email"]
    readonly_fields = ["id", "created_at", "updated_at"]
