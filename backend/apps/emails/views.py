import logging
import uuid
from datetime import datetime, timezone, timedelta

from django.conf import settings
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.emails.models import EmailAccount, EmailThread
from apps.emails.serializers import EmailAccountSerializer, EmailThreadSerializer
from apps.emails.providers.factory import ProviderFactory

logger = logging.getLogger(__name__)


class GoogleAuthUrlView(APIView):
    """
    Generates the Google OAuth 2.0 authorization URL.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        redirect_uri = request.query_params.get("redirect_uri")
        if not redirect_uri:
            # Fallback to frontend URL
            frontend_url = getattr(settings, "FRONTEND_URL", "http://localhost:4200")
            redirect_uri = f"{frontend_url}/integrations"

        # Unique state parameter for OAuth CSRF protection
        state = str(uuid.uuid4())
        
        try:
            provider = ProviderFactory.get_provider("gmail")
            auth_url = provider.get_auth_url(state, redirect_uri)
            return Response({"url": auth_url, "state": state})
        except ValueError as e:
            return Response(
                {"error": str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
        except Exception as e:
            logger.error(f"Error generating Google OAuth URL: {e}", exc_info=True)
            return Response(
                {"error": "Failed to generate authorization URL"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class GoogleCallbackView(APIView):
    """
    Exchanges the OAuth authorization code for tokens, retrieves the email,
    and stores/updates the EmailAccount record.
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        code = request.data.get("code")
        redirect_uri = request.data.get("redirect_uri")
        
        if not code:
            return Response(
                {"error": "Authorization code is required"},
                status=status.HTTP_400_BAD_REQUEST
            )
            
        if not redirect_uri:
            frontend_url = getattr(settings, "FRONTEND_URL", "http://localhost:4200")
            redirect_uri = f"{frontend_url}/integrations"

        try:
            provider = ProviderFactory.get_provider("gmail")
            
            # Exchange code for tokens
            tokens = provider.exchange_code(code, redirect_uri)
            access_token = tokens["access_token"]
            refresh_token = tokens.get("refresh_token")
            expires_in = tokens.get("expires_in", 3600)
            
            # Calculate token expiry
            expiry_datetime = datetime.now(timezone.utc) + timedelta(seconds=expires_in)

            # Get user's Google email
            google_email = provider.get_user_email(access_token)
            if not google_email:
                return Response(
                    {"error": "Failed to retrieve email address from Google"},
                    status=status.HTTP_400_BAD_REQUEST
                )

            # Save or update EmailAccount
            account, created = EmailAccount.objects.get_or_create(
                user=request.user,
                defaults={
                    "email": google_email,
                    "provider_type": "gmail",
                    "token_expiry": expiry_datetime,
                    "status": "connected",
                    "created_by": request.user,
                    "updated_by": request.user,
                }
            )

            # Encrypt and set tokens
            account.email = google_email
            account.set_access_token(access_token)
            if refresh_token:
                account.set_refresh_token(refresh_token)
            account.token_expiry = expiry_datetime
            account.status = "connected"
            account.save()

            return Response({
                "status": "connected",
                "email": google_email,
                "created": created
            })

        except Exception as e:
            logger.error(f"Error processing Google OAuth callback: {e}", exc_info=True)
            return Response(
                {"error": "Failed to complete email integration setup"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class DisconnectEmailAccountView(APIView):
    """
    Disconnects the Google account and deletes the EmailAccount model record.
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        try:
            account = EmailAccount.objects.get(user=request.user)
            account.soft_delete(user=request.user) # Wait, standard BaseModel uses soft_delete! Let's delete completely or soft_delete.
            # To perform clean disconnect, we should hard delete or soft delete. Let's do hard delete to clean up credentials completely.
            account.delete()
            return Response({"status": "disconnected"})
        except EmailAccount.DoesNotExist:
            return Response(
                {"error": "No connected email account found"},
                status=status.HTTP_404_NOT_FOUND
            )
        except Exception as e:
            logger.error(f"Error disconnecting email account: {e}", exc_info=True)
            return Response(
                {"error": "Failed to disconnect email account"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class EmailAccountStatusView(APIView):
    """
    Retrieves the status of the current user's email integration.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        try:
            account = EmailAccount.objects.get(user=request.user)
            return Response({
                "connected": True,
                "email": account.email,
                "status": account.status,
                "provider": account.provider_type
            })
        except EmailAccount.DoesNotExist:
            return Response({"connected": False})


class SyncEmailsView(APIView):
    """
    Triggers a background email sync for a Company, Contact, or Deal.
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        company_id = request.data.get("company_id")
        contact_id = request.data.get("contact_id")
        deal_id = request.data.get("deal_id")

        if not any([company_id, contact_id, deal_id]):
            return Response(
                {"error": "At least one of company_id, contact_id, or deal_id is required"},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Check if the user has a connected EmailAccount
        try:
            account = EmailAccount.objects.get(user=request.user)
            if account.status != "connected":
                return Response(
                    {"status": "not_integrated", "message": "Please integrate Gmail"},
                    status=status.HTTP_400_BAD_REQUEST
                )
        except EmailAccount.DoesNotExist:
            return Response(
                {"status": "not_integrated", "message": "Please integrate Gmail"},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Trigger Celery background sync
        from apps.emails.tasks import sync_emails_task
        sync_emails_task.delay(
            user_id=str(request.user.id),
            company_id=str(company_id) if company_id else None,
            contact_id=str(contact_id) if contact_id else None,
            deal_id=str(deal_id) if deal_id else None
        )

        return Response({"status": "syncing"})


class EmailThreadDetailView(APIView):
    """
    Retrieves the full email thread details and its nested messages.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, thread_id):
        try:
            thread = EmailThread.objects.prefetch_related("messages__attachments").get(id=thread_id)
            serializer = EmailThreadSerializer(thread)
            return Response(serializer.data)
        except EmailThread.DoesNotExist:
            return Response(
                {"error": "Email thread not found"},
                status=status.HTTP_404_NOT_FOUND
            )
        except Exception as e:
            logger.error(f"Error retrieving email thread: {e}", exc_info=True)
            return Response(
                {"error": "Failed to retrieve email thread"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class GoogleOauthConfigView(APIView):
    """
    Manages organization-level Google OAuth client configurations (Admin only).
    """
    permission_classes = [permissions.IsAuthenticated]

    def _check_admin(self, user) -> bool:
        return user.is_superuser or getattr(user, "role", "") == "admin"

    def get(self, request):
        if not self._check_admin(request.user):
            return Response(
                {"error": "Only administrators can access Gmail API settings."},
                status=status.HTTP_403_FORBIDDEN
            )
        
        from apps.emails.models import GoogleOauthConfig
        from apps.emails.serializers import GoogleOauthConfigSerializer

        config = GoogleOauthConfig.objects.first()
        if not config:
            return Response(None, status=status.HTTP_204_NO_CONTENT)

        serializer = GoogleOauthConfigSerializer(config)
        return Response(serializer.data)

    def post(self, request):
        if not self._check_admin(request.user):
            return Response(
                {"error": "Only administrators can configure Gmail API settings."},
                status=status.HTTP_403_FORBIDDEN
            )

        from apps.emails.models import GoogleOauthConfig

        client_id = request.data.get("client_id")
        client_secret = request.data.get("client_secret")
        should_delete = request.data.get("delete", False)

        config = GoogleOauthConfig.objects.first()

        if should_delete:
            if config:
                config.delete()
            return Response({"status": "deleted"})

        if not client_id:
            return Response(
                {"error": "Google Client ID is required."},
                status=status.HTTP_400_BAD_REQUEST
            )

        if not config:
            if not client_secret:
                return Response(
                    {"error": "Google Client Secret is required for initial configuration."},
                    status=status.HTTP_400_BAD_REQUEST
                )
            config = GoogleOauthConfig(
                client_id=client_id,
                created_by=request.user,
                updated_by=request.user
            )
            config.set_client_secret(client_secret)
            config.save()
        else:
            config.client_id = client_id
            if client_secret:
                config.set_client_secret(client_secret)
            config.updated_by = request.user
            config.save()

        return Response({"status": "saved", "client_id": config.client_id})


class GoogleOauthConfigStatusView(APIView):
    """
    Returns whether organization-wide Google OAuth is configured.
    Accessible to all authenticated users.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        from apps.emails.models import GoogleOauthConfig
        config = GoogleOauthConfig.objects.first()
        has_db_config = bool(config and config.client_id and config.client_secret_encrypted)
        has_settings_config = bool(getattr(settings, "GOOGLE_CLIENT_ID", None) and getattr(settings, "GOOGLE_CLIENT_SECRET", None))
        return Response({"configured": has_db_config or has_settings_config})


