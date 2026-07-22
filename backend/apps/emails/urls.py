from django.urls import path
from apps.emails.views import (
    GoogleAuthUrlView,
    GoogleCallbackView,
    DisconnectEmailAccountView,
    EmailAccountStatusView,
    SyncEmailsView,
    EmailThreadDetailView,
    GoogleOauthConfigView,
    GoogleOauthConfigStatusView,
    ContactEmailThreadsView,
    GenerateContactAIDraftView,
    SendContactEmailView,
    ConnectSmtpAccountView,
    SetAccountRoleView,
)

app_name = "emails"

urlpatterns = [
    path("google/auth-url/", GoogleAuthUrlView.as_view(), name="google-auth-url"),
    path("google/callback/", GoogleCallbackView.as_view(), name="google-callback"),
    path("google/disconnect/", DisconnectEmailAccountView.as_view(), name="google-disconnect"),
    path("google/oauth-config/", GoogleOauthConfigView.as_view(), name="google-oauth-config"),
    path("google/oauth-config/status/", GoogleOauthConfigStatusView.as_view(), name="google-oauth-config-status"),
    path("account/", EmailAccountStatusView.as_view(), name="account-status"),
    path("smtp/connect/", ConnectSmtpAccountView.as_view(), name="smtp-connect"),
    path("accounts/<uuid:account_id>/role/", SetAccountRoleView.as_view(), name="account-role"),
    path("sync/", SyncEmailsView.as_view(), name="sync-emails"),
    path("threads/<uuid:thread_id>/", EmailThreadDetailView.as_view(), name="thread-detail"),
    path("contact-threads/", ContactEmailThreadsView.as_view(), name="contact-threads"),
    path("generate-draft/", GenerateContactAIDraftView.as_view(), name="generate-draft"),
    path("send-contact-email/", SendContactEmailView.as_view(), name="send-contact-email"),
]
