from django.contrib import admin
from apps.meetings.models import Meeting


@admin.register(Meeting)
class MeetingAdmin(admin.ModelAdmin):
    list_display = (
        "title",
        "user",
        "start_time",
        "end_time",
        "contact",
        "company",
        "status",
        "is_auto_matched",
        "has_post_meeting_notes",
    )
    list_filter = ("status", "is_auto_matched", "has_post_meeting_notes", "start_time")
    search_fields = ("title", "description", "contact__first_name", "contact__last_name", "company__name", "matched_attendee_email")
    raw_id_fields = ("user", "contact", "company", "deal", "activity", "synced_note")
