import logging
import uuid
from datetime import datetime, timedelta, timezone as dt_timezone
from django.utils import timezone

from django.conf import settings
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.emails.models import EmailAccount, EmailThread, EmailMessage, AccountRole
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
        role = request.query_params.get("role", "primary")
        if not redirect_uri:
            # Fallback to frontend URL
            frontend_url = getattr(settings, "FRONTEND_URL", "http://localhost:4200")
            redirect_uri = f"{frontend_url}/integrations"

        # Unique state parameter containing role info
        state = f"{role}:{uuid.uuid4()}"
        
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
        state_param = request.data.get("state", "")
        
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
            expiry_datetime = datetime.now(dt_timezone.utc) + timedelta(seconds=expires_in)

            # Get user's Google email
            google_email = provider.get_user_email(access_token)
            if not google_email:
                return Response(
                    {"error": "Failed to retrieve email address from Google"},
                    status=status.HTTP_400_BAD_REQUEST
                )

            # Save or update EmailAccount
            role = "secondary_outbound" if "secondary_outbound" in state_param else (request.data.get("role") or request.data.get("account_role") or "primary")
            has_primary = EmailAccount.objects.filter(user=request.user, account_role=AccountRole.PRIMARY).exclude(email=google_email).exists()
            if has_primary or role == "secondary_outbound":
                assigned_role = AccountRole.SECONDARY_OUTBOUND
                is_def_outbound = True
            else:
                assigned_role = AccountRole.PRIMARY
                is_def_outbound = False

            account, created = EmailAccount.objects.get_or_create(
                user=request.user,
                email=google_email,
                defaults={
                    "provider_type": "gmail",
                    "account_role": assigned_role,
                    "is_default_outbound": is_def_outbound,
                    "token_expiry": expiry_datetime,
                    "status": "connected",
                    "created_by": request.user,
                    "updated_by": request.user,
                }
            )

            # Encrypt and set tokens
            account.email = google_email
            account.provider_type = "gmail"
            account.account_role = assigned_role
            if is_def_outbound:
                account.is_default_outbound = True
            account.set_access_token(access_token)
            if refresh_token:
                account.set_refresh_token(refresh_token)
            account.token_expiry = expiry_datetime
            account.status = "connected"
            account.save()

            return Response({
                "status": "connected",
                "email": google_email,
                "account_role": assigned_role,
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
    Disconnects a connected email account. If account_id is provided, deletes that specific account.
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        account_id = request.data.get("account_id")
        try:
            if account_id:
                account = EmailAccount.objects.get(id=account_id, user=request.user)
            else:
                account = EmailAccount.objects.filter(user=request.user).first()

            if account:
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
    Retrieves the status of all connected email accounts for the current user.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        accounts = EmailAccount.objects.filter(user=request.user)
        primary = accounts.filter(account_role=AccountRole.PRIMARY).first()
        secondary = accounts.filter(account_role=AccountRole.SECONDARY_OUTBOUND).first() or accounts.filter(is_default_outbound=True).first()

        return Response({
            "connected": accounts.exists(),
            "email": primary.email if primary else (accounts.first().email if accounts.exists() else ""),
            "status": primary.status if primary else (accounts.first().status if accounts.exists() else "disconnected"),
            "provider": primary.provider_type if primary else (accounts.first().provider_type if accounts.exists() else "none"),
            "accounts": EmailAccountSerializer(accounts, many=True).data,
            "primary_account": EmailAccountSerializer(primary).data if primary else None,
            "secondary_account": EmailAccountSerializer(secondary).data if secondary else None,
        })


class ConnectSmtpAccountView(APIView):
    """
    Validates SMTP server credentials and connects a secondary SMTP email account.
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        email = request.data.get("email", "").strip()
        smtp_host = request.data.get("smtp_host", "").strip()
        smtp_port = request.data.get("smtp_port", 587)
        smtp_username = request.data.get("smtp_username", "").strip() or email
        smtp_password = request.data.get("smtp_password", "").strip()
        smtp_use_tls = request.data.get("smtp_use_tls", True)
        smtp_use_ssl = request.data.get("smtp_use_ssl", False)
        account_role = request.data.get("account_role", AccountRole.SECONDARY_OUTBOUND)

        if not email or not smtp_host or not smtp_password:
            return Response(
                {"error": "Email address, SMTP host, and SMTP password are required."},
                status=status.HTTP_400_BAD_REQUEST
            )

        from apps.emails.providers.smtp import SmtpProvider
        smtp_prov = SmtpProvider()
        try:
            smtp_prov.test_connection(
                host=smtp_host,
                port=int(smtp_port),
                username=smtp_username,
                password=smtp_password,
                use_tls=bool(smtp_use_tls),
                use_ssl=bool(smtp_use_ssl)
            )
        except Exception as e:
            return Response({"error": f"SMTP Connection Test Failed: {str(e)}"}, status=status.HTTP_400_BAD_REQUEST)

        # Create or update EmailAccount
        account, _ = EmailAccount.objects.get_or_create(
            user=request.user,
            email=email,
            defaults={
                "provider_type": "smtp",
                "account_role": account_role,
                "is_default_outbound": True,
                "smtp_host": smtp_host,
                "smtp_port": int(smtp_port),
                "smtp_username": smtp_username,
                "smtp_use_tls": bool(smtp_use_tls),
                "smtp_use_ssl": bool(smtp_use_ssl),
                "status": "connected",
                "created_by": request.user,
                "updated_by": request.user,
            }
        )
        account.provider_type = "smtp"
        account.account_role = account_role
        account.is_default_outbound = True
        account.smtp_host = smtp_host
        account.smtp_port = int(smtp_port)
        account.smtp_username = smtp_username
        account.smtp_use_tls = bool(smtp_use_tls)
        account.smtp_use_ssl = bool(smtp_use_ssl)
        account.set_smtp_password(smtp_password)
        account.status = "connected"
        account.save()

        return Response(EmailAccountSerializer(account).data, status=status.HTTP_200_OK)


class SetAccountRoleView(APIView):
    """
    Sets account role ('primary' or 'secondary_outbound') for a user's connected account.
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, account_id):
        role = request.data.get("account_role")
        is_default = request.data.get("is_default_outbound", False)

        try:
            account = EmailAccount.objects.get(id=account_id, user=request.user)
            if role in [AccountRole.PRIMARY, AccountRole.SECONDARY_OUTBOUND]:
                EmailAccount.objects.filter(user=request.user, account_role=role).update(account_role=AccountRole.PRIMARY if role == AccountRole.SECONDARY_OUTBOUND else AccountRole.SECONDARY_OUTBOUND)
                account.account_role = role

            if is_default:
                EmailAccount.objects.filter(user=request.user).update(is_default_outbound=False)
                account.is_default_outbound = True

            account.save()
            return Response(EmailAccountSerializer(account).data)
        except EmailAccount.DoesNotExist:
            return Response({"error": "Email account not found"}, status=status.HTTP_404_NOT_FOUND)


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
        account = EmailAccount.objects.filter(
            user=request.user,
            status="connected",
            account_role=AccountRole.PRIMARY
        ).first() or EmailAccount.objects.filter(
            user=request.user,
            status="connected",
            provider_type="gmail"
        ).first() or EmailAccount.objects.filter(
            user=request.user,
            status="connected"
        ).first()

        if not account:
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


class ContactEmailThreadsView(APIView):
    """
    Returns all email threads associated with a contact, along with pre-fetched messages and telemetry.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        contact_id = request.query_params.get("contact_id")
        if not contact_id:
            return Response({"error": "contact_id is required"}, status=status.HTTP_400_BAD_REQUEST)

        threads = EmailThread.objects.filter(contact_id=contact_id).prefetch_related("messages__attachments").order_by("-last_message_time")
        serializer = EmailThreadSerializer(threads, many=True)
        return Response(serializer.data)


class GenerateContactAIDraftView(APIView):
    """
    Generates an AI email draft for a contact outreach or thread reply using CRM context and prompt instructions.
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        contact_id = request.data.get("contact_id")
        prompt_instruction = request.data.get("prompt", "Write a personalized outreach email.")
        thread_id = request.data.get("thread_id")

        if not contact_id:
            return Response({"error": "contact_id is required"}, status=status.HTTP_400_BAD_REQUEST)

        try:
            from apps.contacts.models import Contact
            contact = Contact.objects.get(id=contact_id)
        except Contact.DoesNotExist:
            return Response({"error": "Contact not found"}, status=status.HTTP_404_NOT_FOUND)

        from apps.ai_engine.services.context_builder import ContextBuilder
        builder = ContextBuilder()
        crm_context = builder.build_contact_context(contact.id)

        # Include previous thread messages if replying to an existing thread
        thread_context = ""
        thread_subject = f"Outreach for {contact.company.name if contact.company else 'our collaboration'}"
        if thread_id:
            try:
                thread = EmailThread.objects.prefetch_related("messages").get(id=thread_id)
                thread_subject = f"Re: {thread.subject}" if not thread.subject.lower().startswith("re:") else thread.subject
                msg_lines = []
                for m in thread.messages.all():
                    msg_lines.append(f"From: {m.sender}\nDate: {m.internal_date}\nBody:\n{m.plain_text_body or m.html_body}\n---")
                thread_context = "\n\n## Existing Email Thread History\n" + "\n".join(msg_lines)
            except EmailThread.DoesNotExist:
                pass

        system_prompt = (
            "You are an expert sales representative writing a 1-to-1 personalized email for a CRM contact.\n"
            "Format output strictly as JSON with keys: 'subject', 'body_html', 'body_text', 'context_rationale'.\n"
            "RULES:\n"
            "1. NEVER use generic corporate filler.\n"
            "2. Reference exact details from CRM context (company info, job title, notes, timeline activities).\n"
            "3. Keep the email concise (100-250 words), direct, and consultative.\n"
        )

        full_prompt = f"CRM Context:\n{crm_context}{thread_context}\n\nUser Instruction Prompt: {prompt_instruction}\n\nGenerate JSON response now."

        try:
            from apps.ai_engine.services.providers.factory import LLMProviderFactory
            provider = LLMProviderFactory.get_provider(user=request.user)
            res = provider.generate_response(system_prompt=system_prompt, prompt=full_prompt, response_format="json", purpose="contact_outreach")
        except Exception as e:
            logger.warning(f"AI draft generation failed: {e}. Using fallback template.")
            res = {
                "subject": thread_subject,
                "body_text": f"Hi {contact.first_name},\n\nI wanted to reach out regarding {contact.company.name if contact.company else 'our services'}.\n\nBest regards,\n{request.user.get_full_name()}",
                "context_rationale": f"Fallback draft due to AI service notice: {str(e)[:100]}"
            }

        body_text = res.get("body_text", "")
        body_html = res.get("body_html", f"<p>{body_text.replace(chr(10), '<br>')}</p>")
        subject = res.get("subject", thread_subject)

        return Response({
            "subject": subject,
            "body_html": body_html,
            "body_text": body_text,
            "reply_to": getattr(request.user, "email", ""),
            "context_summary": res.get("context_rationale", "Generated using contact context.")
        })


class SendContactEmailView(APIView):
    """
    Sends an outbound email directly to a contact strictly via connected Gmail/Mailbox account with tracking.
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        contact_id = request.data.get("contact_id")
        subject = request.data.get("subject", "").strip()
        body_html = request.data.get("body_html", "").strip()
        body_text = request.data.get("body_text", "").strip()
        reply_to = request.data.get("reply_to", "").strip()
        thread_id = request.data.get("thread_id")

        if not contact_id:
            return Response({"error": "contact_id is required"}, status=status.HTTP_400_BAD_REQUEST)

        # 1. Enforce Connected Mailbox Constraint & Select Outbound Account
        account_id = request.data.get("account_id")
        if account_id:
            account = EmailAccount.objects.filter(user=request.user, id=account_id, status="connected").first()
        else:
            account = EmailAccount.objects.filter(user=request.user, account_role=AccountRole.SECONDARY_OUTBOUND, status="connected").first()
            if not account:
                account = EmailAccount.objects.filter(user=request.user, is_default_outbound=True, status="connected").first()
            if not account:
                account = EmailAccount.objects.filter(user=request.user, account_role=AccountRole.PRIMARY, status="connected").first()
            if not account:
                account = EmailAccount.objects.filter(user=request.user, status="connected").first()

        if not account:
            return Response(
                {
                    "error": {
                        "code": "no_connected_account",
                        "message": "No active Gmail or Mailbox connected. Please connect your account in Integrations Settings before sending emails to contacts."
                    }
                },
                status=status.HTTP_400_BAD_REQUEST
            )

        primary_acc = EmailAccount.objects.filter(user=request.user, account_role=AccountRole.PRIMARY).first()
        primary_email = primary_acc.email if primary_acc else getattr(request.user, "email", None)
        effective_reply_to = reply_to or primary_email or account.email

        try:
            from apps.contacts.models import Contact
            contact = Contact.objects.get(id=contact_id)
        except Contact.DoesNotExist:
            return Response({"error": "Contact not found"}, status=status.HTTP_404_NOT_FOUND)

        if not contact.email:
            return Response({"error": f"Contact '{contact.full_name}' has no email address."}, status=status.HTTP_400_BAD_REQUEST)

        import uuid
        from apps.emails.serializers import EmailMessageSerializer
        tracking_token = str(uuid.uuid4())

        # 2. Inject Telemetry Open Pixel & Link Click Tracking
        from apps.sequences.services.sequence_engine import get_public_base_url
        from apps.sequences.services.link_tracker import LinkTrackerService
        from apps.sequences.models import SequenceLinkClick

        base_url = get_public_base_url(request)
        raw_html = body_html or f"<p>{body_text.replace(chr(10), '<br>')}</p>"
        tracking_start_time = timezone.now()

        final_html = LinkTrackerService.wrap_links_in_html(
            base_url=base_url,
            html_content=raw_html,
            user=request.user,
            track_clicks=True
        )
        pixel_url = f"{base_url.rstrip('/')}/api/v1/sequences/track/open/{tracking_token}/pixel.png"
        pixel_tag = f'<img src="{pixel_url}" width="1" height="1" style="display:none !important;" alt="" />'
        final_html += f"\n{pixel_tag}"

        # 3. Send Email via Connected Mailbox Provider
        try:
            from apps.emails.providers.factory import ProviderFactory
            provider = ProviderFactory.get_provider(account.provider_type)

            gmail_thread_id = None
            if thread_id:
                try:
                    t = EmailThread.objects.get(id=thread_id)
                    gmail_thread_id = t.gmail_thread_id
                except EmailThread.DoesNotExist:
                    pass

            sent_res = provider.send_email(
                account=account,
                to_email=contact.email,
                subject=subject,
                body_html=final_html,
                body_text=body_text,
                reply_to=effective_reply_to,
                thread_id=gmail_thread_id
            )
        except Exception as e:
            logger.error(f"Failed to send contact email via {account.provider_type}: {e}", exc_info=True)
            return Response({"error": f"Failed to send email via connected mailbox: {str(e)}"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        # 4. Save/Update EmailThread & EmailMessage
        g_thread_id = sent_res.get("gmail_thread_id") or str(uuid.uuid4())
        g_message_id = sent_res.get("gmail_message_id") or str(uuid.uuid4())

        now = timezone.now()
        thread, _ = EmailThread.objects.get_or_create(
            gmail_thread_id=g_thread_id,
            defaults={
                "subject": subject,
                "participants": [account.email, contact.email],
                "snippet": body_text[:150],
                "last_message_time": now,
                "contact": contact,
                "company": contact.company,
                "created_by": request.user,
                "updated_by": request.user,
            }
        )
        thread.last_message_time = now
        thread.save(update_fields=["last_message_time", "updated_at"])

        msg = EmailMessage.objects.create(
            gmail_message_id=g_message_id,
            thread=thread,
            sender=account.email,
            recipients=[contact.email],
            direction="outgoing",
            subject=subject,
            plain_text_body=body_text,
            html_body=final_html,
            internal_date=now,
            tracking_token=tracking_token,
            created_by=request.user,
            updated_by=request.user,
        )

        SequenceLinkClick.objects.filter(
            draft__isnull=True,
            email_message__isnull=True,
            created_by=request.user,
            created_at__gte=tracking_start_time
        ).update(email_message=msg)

        # 5. Log Timeline Activity
        from apps.activities.models import Activity
        from apps.common.enums import ActivityType
        Activity.objects.create(
            activity_type=ActivityType.EMAIL,
            title=f"Sent Email: '{subject}'",
            description=f"Direct email sent to {contact.full_name} via {account.email}.",
            contact=contact,
            company=contact.company,
            performed_by=request.user,
            metadata={"message_id": str(msg.id), "thread_id": str(thread.id)},
            created_by=request.user,
        )

        return Response(EmailMessageSerializer(msg).data)


