from django.contrib import admin
from apps.telephony.models import (
    TelephonyProvider,
    Call,
    CallParticipant,
    CallTranscript,
    CallSummary,
    CallTask,
    CallEvent
)


@admin.register(TelephonyProvider)
class TelephonyProviderAdmin(admin.ModelAdmin):
    list_display = ("id", "user", "provider_type", "name", "phone_number", "connection_status")
    search_fields = ("user__email", "name", "phone_number")
    list_filter = ("provider_type", "connection_status")


@admin.register(Call)
class CallAdmin(admin.ModelAdmin):
    list_display = ("id", "sid", "user", "contact", "direction", "status", "start_time", "duration")
    search_fields = ("sid", "user__email", "contact__last_name", "contact__first_name")
    list_filter = ("direction", "status", "ai_assist_enabled")


admin.site.register(CallParticipant)
admin.site.register(CallTranscript)
admin.site.register(CallSummary)
admin.site.register(CallTask)
admin.site.register(CallEvent)
