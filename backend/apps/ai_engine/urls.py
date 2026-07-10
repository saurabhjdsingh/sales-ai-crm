from django.urls import path

from apps.ai_engine.views import (
    AIConversationDetailView,
    AIConversationListCreateView,
    AIPromptDetailView,
    AIPromptListView,
    AIPromptResetAllView,
    AISendMessageView,
    UserAIConfigView,
)

app_name = "ai_engine"

urlpatterns = [
    path("conversations/", AIConversationListCreateView.as_view(), name="conversation-list"),
    path("conversations/<uuid:id>/", AIConversationDetailView.as_view(), name="conversation-detail"),
    path("conversations/<uuid:id>/messages/", AISendMessageView.as_view(), name="send-message"),
    path("config/", UserAIConfigView.as_view(), name="ai-config"),
    path("prompts/", AIPromptListView.as_view(), name="ai-prompt-list"),
    path("prompts/reset/", AIPromptResetAllView.as_view(), name="ai-prompt-reset-all"),
    path("prompts/<str:key>/", AIPromptDetailView.as_view(), name="ai-prompt-detail"),
]
