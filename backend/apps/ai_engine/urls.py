from django.urls import path

from apps.ai_engine.views import (
    AIConversationDetailView,
    AIConversationListCreateView,
    AIPromptDetailView,
    AIPromptListView,
    AIPromptResetAllView,
    AISendMessageView,
    UserAIConfigView,
    ChatGPTSyncTokensView,
    ChatGPTSessionStatusView,
    ChatGPTModelsListView,
    ChatGPTIntelligenceStreamView,
    ChatGPTTestAndSaveView,
    ApolloConfigView,
    ApolloTestView,
    ApolloDisconnectView,
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
    # ChatGPT Plan OAuth & Token Sharing
    path("chatgpt/sync-tokens/", ChatGPTSyncTokensView.as_view(), name="chatgpt-sync-tokens"),
    path("chatgpt/status/", ChatGPTSessionStatusView.as_view(), name="chatgpt-status"),
    path("chatgpt/models/", ChatGPTModelsListView.as_view(), name="chatgpt-models"),
    path("chatgpt/test-and-save/", ChatGPTTestAndSaveView.as_view(), name="chatgpt-test-and-save"),
    path("chatgpt/account-intelligence/stream/", ChatGPTIntelligenceStreamView.as_view(), name="chatgpt-intelligence-stream"),
    # Apollo.io Integration Endpoints
    path("integrations/apollo/status/", ApolloConfigView.as_view(), name="apollo-status"),
    path("integrations/apollo/save/", ApolloConfigView.as_view(), name="apollo-save"),
    path("integrations/apollo/test/", ApolloTestView.as_view(), name="apollo-test"),
    path("integrations/apollo/disconnect/", ApolloDisconnectView.as_view(), name="apollo-disconnect"),
]

