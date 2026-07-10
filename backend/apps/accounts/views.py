"""
Views for authentication and user management.
"""

from django.contrib.auth import get_user_model
from rest_framework import generics, status
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from apps.accounts.serializers import (
    ChangePasswordSerializer,
    CustomTokenObtainPairSerializer,
    OrganizationBrandingSerializer,
    OrganizationBrandingUpdateSerializer,
    UserCreateSerializer,
    UserListSerializer,
    UserSerializer,
    UserUpdateSerializer,
    TeamMemberUpdateSerializer,
)
from apps.accounts.services.branding import BrandingService
from apps.common.permissions import CanManageTeam, IsAdmin

User = get_user_model()


class LoginView(TokenObtainPairView):
    """
    POST /api/v1/auth/login/
    Authenticate user and return JWT tokens + user data.
    """

    serializer_class = CustomTokenObtainPairSerializer
    permission_classes = [AllowAny]


class TokenRefreshAPIView(TokenRefreshView):
    """
    POST /api/v1/auth/refresh/
    Refresh an expired access token using the refresh token.
    """

    permission_classes = [AllowAny]


class RegisterView(generics.CreateAPIView):
    """
    POST /api/v1/auth/register/
    Create a new user account (admin only).
    """

    serializer_class = UserCreateSerializer
    permission_classes = [IsAdmin]

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        return Response(
            UserSerializer(user).data,
            status=status.HTTP_201_CREATED,
        )


class MeView(APIView):
    """
    GET /api/v1/auth/me/     → Current user profile
    PATCH /api/v1/auth/me/   → Update profile
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(UserSerializer(request.user).data)

    def patch(self, request):
        serializer = UserUpdateSerializer(
            request.user, data=request.data, partial=True
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(UserSerializer(request.user).data)


class ChangePasswordView(APIView):
    """
    POST /api/v1/auth/change-password/
    Change the current user's password.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = ChangePasswordSerializer(
            data=request.data, context={"request": request}
        )
        serializer.is_valid(raise_exception=True)
        request.user.set_password(serializer.validated_data["new_password"])
        request.user.save()
        return Response(
            {"message": "Password changed successfully."},
            status=status.HTTP_200_OK,
        )


class TeamListView(generics.ListAPIView):
    """
    GET /api/v1/auth/team/
    List all team members.
    """

    serializer_class = UserListSerializer
    permission_classes = [CanManageTeam]
    pagination_class = None

    def get_queryset(self):
        user = self.request.user
        if user.is_superuser or user.role == "admin":
            return User.objects.all().order_by("first_name")
        return User.objects.filter(is_active=True, status="active").order_by("first_name")


class InviteUserView(APIView):
    """
    POST /api/v1/auth/team/invite/
    Invite a new team member (admin only).
    """
    permission_classes = [IsAdmin]

    def post(self, request):
        email = request.data.get("email")
        first_name = request.data.get("first_name", "")
        last_name = request.data.get("last_name", "")
        role = request.data.get("role", "sales_rep")
        job_title = request.data.get("job_title", "")

        if not email:
            return Response({"error": "Email is required."}, status=status.HTTP_400_BAD_REQUEST)

        if User.objects.filter(email=email).exists():
            return Response({"error": "User with this email already exists."}, status=status.HTTP_400_BAD_REQUEST)

        # Generate simple temp password
        import secrets
        temp_pwd = f"Welcome{secrets.token_hex(3).upper()}!"

        # Create user
        user = User.objects.create(
            username=email,
            email=email,
            first_name=first_name,
            last_name=last_name,
            role=role,
            job_title=job_title,
            status="pending",
            is_active=True
        )
        user.set_password(temp_pwd)
        user.save()

        # Send invite email
        self._send_invite_email(user)

        return Response({
            "message": "User invited successfully.",
            "user": UserListSerializer(user).data,
            "temp_password": temp_pwd
        }, status=status.HTTP_201_CREATED)

    def _send_invite_email(self, user):
        from django.contrib.auth.tokens import default_token_generator
        from django.utils.encoding import force_bytes
        from django.utils.http import urlsafe_base64_encode
        from django.conf import settings
        from apps.common.email import send_branded_email
        from apps.accounts.services.branding import BrandingService

        uid = urlsafe_base64_encode(force_bytes(user.pk))
        token = default_token_generator.make_token(user)
        
        frontend_base = getattr(settings, "FRONTEND_URL", "http://localhost:4200").rstrip("/")
        invite_url = f"{frontend_base}/accept-invite?uid={uid}&token={token}"
        
        branding = BrandingService.get_branding_data()
        org_name = branding.get("organization_name")

        subject = f"Invitation to join {org_name}"
        title = "Accept Invitation"
        content_html = f"""Hi {user.first_name or 'there'},<br><br>
You have been invited to join the <strong>{org_name}</strong> sales team on Sales AI CRM.<br><br>
Please click the button below to set your password and accept the invitation:"""

        send_branded_email(
            subject=subject,
            title=title,
            content_html=content_html,
            recipient_list=[user.email],
            cta_text="Accept Invitation & Set Password",
            cta_url=invite_url,
        )


class ResendInviteView(APIView):
    """
    POST /api/v1/auth/team/<uuid:pk>/resend-invite/
    Resend invitation email to a pending team member (admin only).
    """
    permission_classes = [IsAdmin]

    def post(self, request, pk):
        try:
            target_user = User.objects.get(pk=pk)
        except User.DoesNotExist:
            return Response({"error": "User not found."}, status=status.HTTP_404_NOT_FOUND)

        if target_user.status != "pending":
            return Response({"error": "This user is already active or inactive, not pending."}, status=status.HTTP_400_BAD_REQUEST)

        # Regene temp password and send email again
        import secrets
        temp_pwd = f"Welcome{secrets.token_hex(3).upper()}!"
        target_user.set_password(temp_pwd)
        target_user.save()

        # Send invite email
        InviteUserView()._send_invite_email(target_user)

        return Response({
            "message": "Invitation email resent successfully.",
            "temp_password": temp_pwd
        }, status=status.HTTP_200_OK)


class AcceptInviteView(APIView):
    """
    POST /api/v1/auth/team/accept-invite/
    Validate uid/token and set password for a new team member.
    """
    permission_classes = [AllowAny]

    def post(self, request):
        uidb64 = request.data.get("uid")
        token = request.data.get("token")
        password = request.data.get("password")

        if not uidb64 or not token or not password:
            return Response({"error": "uid, token, and password are required."}, status=status.HTTP_400_BAD_REQUEST)

        from django.contrib.auth.tokens import default_token_generator
        from django.utils.http import urlsafe_base64_decode
        from django.utils.encoding import force_str

        try:
            uid = force_str(urlsafe_base64_decode(uidb64))
            user = User.objects.get(pk=uid)
        except (TypeError, ValueError, OverflowError, User.DoesNotExist):
            return Response({"error": "Invalid invitation link."}, status=status.HTTP_400_BAD_REQUEST)

        # Verify token
        if not default_token_generator.check_token(user, token):
            return Response({"error": "The invitation link is invalid or has expired."}, status=status.HTTP_400_BAD_REQUEST)

        # Validate password length
        if len(password) < 8:
            return Response({"error": "Password must be at least 8 characters long."}, status=status.HTTP_400_BAD_REQUEST)

        # Update password and status
        user.set_password(password)
        user.status = "active"
        user.is_active = True
        user.save()

        return Response({"message": "Password set and invitation accepted successfully."}, status=status.HTTP_200_OK)



class ToggleUserActiveView(APIView):
    """
    POST /api/v1/auth/team/<uuid:pk>/toggle-active/
    Activate/Deactivate a team member (admin only).
    """
    permission_classes = [IsAdmin]

    def post(self, request, pk):
        try:
            target_user = User.objects.get(pk=pk)
        except User.DoesNotExist:
            return Response({"error": "User not found."}, status=status.HTTP_404_NOT_FOUND)

        if target_user == request.user:
            return Response({"error": "You cannot deactivate your own account."}, status=status.HTTP_400_BAD_REQUEST)

        if target_user.is_active:
            target_user.is_active = False
            target_user.status = "inactive"
        else:
            target_user.is_active = True
            target_user.status = "active"
        
        target_user.save()

        return Response({
            "message": "User status updated successfully.",
            "user": UserListSerializer(target_user).data
        }, status=status.HTTP_200_OK)


class UpdateTeamMemberView(APIView):
    """
    PUT /api/v1/auth/team/<uuid:pk>/
    Update team member profile details (admin only).
    """
    permission_classes = [IsAdmin]

    def put(self, request, pk):
        try:
            target_user = User.objects.get(pk=pk)
        except User.DoesNotExist:
            return Response({"error": "User not found."}, status=status.HTTP_404_NOT_FOUND)

        serializer = TeamMemberUpdateSerializer(target_user, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response({
                "message": "Team member updated successfully.",
                "user": UserListSerializer(target_user).data
            }, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class SetTempPasswordView(APIView):
    """
    POST /api/v1/auth/team/<uuid:pk>/temp-password/
    Set a temporary password for a team member (admin only).
    """
    permission_classes = [IsAdmin]

    def post(self, request, pk):
        try:
            target_user = User.objects.get(pk=pk)
        except User.DoesNotExist:
            return Response({"error": "User not found."}, status=status.HTTP_404_NOT_FOUND)

        import secrets
        temp_pwd = f"Temp{secrets.token_hex(4).upper()}!"
        target_user.set_password(temp_pwd)
        target_user.save()

        return Response({
            "message": "Temporary password set successfully.",
            "temp_password": temp_pwd
        }, status=status.HTTP_200_OK)


class OrganizationBrandingView(APIView):
    """
    GET /api/v1/organization/branding/  → Public branding (name + logo)
    PUT /api/v1/organization/branding/  → Admin update branding
    """

    parser_classes = [MultiPartParser, FormParser]

    def get_permissions(self):
        if self.request.method == "GET":
            return [AllowAny()]
        return [IsAdmin()]

    def get(self, request):
        data = BrandingService.get_branding_data(request)
        return Response(OrganizationBrandingSerializer(data).data)

    def put(self, request):
        serializer = OrganizationBrandingUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        data = serializer.validated_data
        try:
            BrandingService.update_branding(
                user=request.user,
                organization_name=data.get("organization_name"),
                logo_file=data.get("logo"),
                remove_logo=data.get("remove_logo", False),
                smtp_host=data.get("smtp_host"),
                smtp_port=data.get("smtp_port"),
                smtp_username=data.get("smtp_username"),
                smtp_password=data.get("smtp_password"),
                smtp_use_tls=data.get("smtp_use_tls"),
                smtp_use_ssl=data.get("smtp_use_ssl"),
                smtp_from_email=data.get("smtp_from_email"),
            )
        except ValueError as exc:
            return Response(
                {"error": {"code": "validation_error", "message": str(exc)}},
                status=status.HTTP_400_BAD_REQUEST,
            )

        branding = BrandingService.get_branding_data(request)
        return Response(OrganizationBrandingSerializer(branding).data)

