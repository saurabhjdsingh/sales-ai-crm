"""
URL patterns for authentication and user management.
"""

from django.urls import path

from apps.accounts.views import (
    ChangePasswordView,
    LoginView,
    MeView,
    OrganizationBrandingView,
    RegisterView,
    TeamListView,
    TokenRefreshAPIView,
    InviteUserView,
    ToggleUserActiveView,
    UpdateTeamMemberView,
    SetTempPasswordView,
    ResendInviteView,
    AcceptInviteView,
)

app_name = "accounts"

urlpatterns = [
    path("login/", LoginView.as_view(), name="login"),
    path("refresh/", TokenRefreshAPIView.as_view(), name="token-refresh"),
    path("register/", RegisterView.as_view(), name="register"),
    path("me/", MeView.as_view(), name="me"),
    path("change-password/", ChangePasswordView.as_view(), name="change-password"),
    path("team/", TeamListView.as_view(), name="team-list"),
    path("team/invite/", InviteUserView.as_view(), name="team-invite"),
    path("team/accept-invite/", AcceptInviteView.as_view(), name="team-accept-invite"),
    path("team/<uuid:pk>/toggle-active/", ToggleUserActiveView.as_view(), name="team-toggle-active"),
    path("team/<uuid:pk>/resend-invite/", ResendInviteView.as_view(), name="team-resend-invite"),
    path("team/<uuid:pk>/", UpdateTeamMemberView.as_view(), name="team-member-update"),
    path("team/<uuid:pk>/temp-password/", SetTempPasswordView.as_view(), name="team-member-temp-password"),
    path("organization/branding/", OrganizationBrandingView.as_view(), name="organization-branding"),
]
