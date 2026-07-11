from django.urls import path, include
from rest_framework.routers import DefaultRouter
from apps.telephony.views import (
    TelephonyProviderViewSet,
    TokenGenerationView,
    CRMLookupView,
    CallViewSet,
    TwilioIncomingCallWebhookView,
    TwilioVoiceWebhookView,
    TwilioStatusWebhookView
)

router = DefaultRouter()
router.register("settings", TelephonyProviderViewSet, basename="telephony-settings")
router.register("calls", CallViewSet, basename="telephony-calls")

urlpatterns = [
    path("", include(router.urls)),
    path("token/", TokenGenerationView.as_view(), name="telephony-token"),
    path("lookup/", CRMLookupView.as_view(), name="telephony-lookup"),
    
    # Webhooks (Provider ID UUID in URL for dynamic credentials loading)
    path("webhooks/incoming/<uuid:provider_id>/", TwilioIncomingCallWebhookView.as_view(), name="twilio-incoming-webhook"),
    path("webhooks/voice/<uuid:provider_id>/", TwilioVoiceWebhookView.as_view(), name="twilio-voice-webhook"),
    path("webhooks/status/<uuid:provider_id>/", TwilioStatusWebhookView.as_view(), name="twilio-status-webhook"),
]
