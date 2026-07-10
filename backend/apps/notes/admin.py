from django.contrib import admin
from apps.notes.models import Note


@admin.register(Note)
class NoteAdmin(admin.ModelAdmin):
    list_display = ["__str__", "company", "contact", "deal", "is_pinned", "created_at"]
    list_filter = ["is_pinned"]
    search_fields = ["content"]
    readonly_fields = ["id", "created_at", "updated_at"]
