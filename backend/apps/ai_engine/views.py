"""
Views for the AI Engine module.
"""

import logging

from rest_framework import generics, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView


from apps.ai_engine.models import AIConversation, UserAIConfig
from apps.ai_engine.serializers import (
    AIConversationCreateSerializer,
    AIConversationDetailSerializer,
    AIConversationListSerializer,
    AIMessageSerializer,
    AIPromptBulkWriteSerializer,
    AIPromptSerializer,
    AIPromptWriteSerializer,
    AISendMessageSerializer,
    UserAIConfigSerializer,
    UserAIConfigWriteSerializer,
)
from apps.common.encryption import encrypt_api_key
from apps.ai_engine.services.copilot import CopilotService
from apps.ai_engine.services.prompt_service import PromptService
from apps.common.pagination import StandardPagination
from django.core.exceptions import ValidationError as DjangoValidationError

logger = logging.getLogger(__name__)


class AIConversationListCreateView(generics.ListCreateAPIView):
    """
    GET  /ai/conversations/       → List user's conversations
    POST /ai/conversations/       → Create a new conversation
    """

    permission_classes = [IsAuthenticated]
    pagination_class = StandardPagination

    def get_serializer_class(self):
        if self.request.method == "POST":
            return AIConversationCreateSerializer
        return AIConversationListSerializer

    def get_queryset(self):
        qs = AIConversation.objects.filter(
            user=self.request.user,
            is_archived=False,
            is_deleted=False,
        )

        entity_type = self.request.query_params.get("entity_type")
        entity_id = self.request.query_params.get("entity_id")

        if entity_type and entity_id:
            if entity_type == "company":
                qs = qs.filter(company_id=entity_id)
            elif entity_type == "contact":
                qs = qs.filter(contact_id=entity_id)
            elif entity_type == "deal":
                qs = qs.filter(deal_id=entity_id)
            elif entity_type == "call":
                qs = qs.filter(call_id=entity_id)

        return qs

    def create(self, request, *args, **kwargs):
        serializer = AIConversationCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        service = CopilotService(user=request.user)
        conversation = service.create_conversation(
            entity_type=serializer.validated_data["entity_type"],
            entity_id=str(serializer.validated_data["entity_id"]),
            user=request.user,
            title=serializer.validated_data.get("title", ""),
        )

        return Response(
            AIConversationDetailSerializer(conversation).data,
            status=status.HTTP_201_CREATED,
        )


class AIConversationDetailView(generics.RetrieveDestroyAPIView):
    """
    GET    /ai/conversations/:id/   → Get conversation with messages
    DELETE /ai/conversations/:id/   → Archive conversation
    """

    serializer_class = AIConversationDetailSerializer
    permission_classes = [IsAuthenticated]
    lookup_field = "id"

    def get_queryset(self):
        return AIConversation.objects.filter(user=self.request.user)

    def perform_destroy(self, instance):
        instance.is_archived = True
        instance.save(update_fields=["is_archived", "updated_at"])


class AISendMessageView(APIView):
    """
    POST /ai/conversations/:id/messages/
    Send a message to the AI copilot and get a response.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request, id):
        serializer = AISendMessageSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            conversation = AIConversation.objects.get(
                id=id, user=request.user
            )
        except AIConversation.DoesNotExist:
            return Response(
                {"error": {"code": "not_found", "message": "Conversation not found."}},
                status=status.HTTP_404_NOT_FOUND,
            )

        use_agent = conversation.entity_type != "call"
        service = CopilotService(user=request.user)
        ai_message = service.send_message(
            conversation=conversation,
            user_message=serializer.validated_data["message"],
            use_agent=use_agent,
        )

        return Response(AIMessageSerializer(ai_message, context={"request": request}).data)


class AIPromptListView(APIView):
    """
    GET  /ai/prompts/  → List all prompts with defaults and effective content
    PUT  /ai/prompts/  → Bulk save customized prompts
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        prompts = PromptService.list_prompts_for_user(request.user)
        return Response(AIPromptSerializer(prompts, many=True).data)

    def put(self, request):
        serializer = AIPromptBulkWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        saved = []
        for item in serializer.validated_data["prompts"]:
            try:
                PromptService.save_prompt(request.user, item["key"], item["content"])
                saved.append(item["key"])
            except DjangoValidationError as exc:
                messages = getattr(exc, "messages", None)
                message = messages[0] if messages else str(exc)
                return Response(
                    {
                        "error": {
                            "code": "validation_error",
                            "message": message,
                            "prompt_key": item["key"],
                        }
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

        prompts = PromptService.list_prompts_for_user(request.user)
        return Response(AIPromptSerializer(prompts, many=True).data)


class AIPromptDetailView(APIView):
    """
    PUT    /ai/prompts/<key>/  → Save a single customized prompt
    DELETE /ai/prompts/<key>/  → Reset prompt to hardcoded default
    """

    permission_classes = [IsAuthenticated]

    def put(self, request, key):
        serializer = AIPromptWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            PromptService.save_prompt(request.user, key, serializer.validated_data["content"])
        except KeyError:
            return Response(
                {"error": {"code": "not_found", "message": f"Unknown prompt key: {key}"}},
                status=status.HTTP_404_NOT_FOUND,
            )
        except DjangoValidationError as exc:
            messages = getattr(exc, "messages", None)
            message = messages[0] if messages else str(exc)
            return Response(
                {"error": {"code": "validation_error", "message": message}},
                status=status.HTTP_400_BAD_REQUEST,
            )

        prompts = PromptService.list_prompts_for_user(request.user)
        prompt_data = next(p for p in prompts if p["key"] == key)
        return Response(AIPromptSerializer(prompt_data).data)

    def delete(self, request, key):
        try:
            PromptService.reset_prompt(request.user, key)
        except KeyError:
            return Response(
                {"error": {"code": "not_found", "message": f"Unknown prompt key: {key}"}},
                status=status.HTTP_404_NOT_FOUND,
            )

        prompts = PromptService.list_prompts_for_user(request.user)
        prompt_data = next(p for p in prompts if p["key"] == key)
        return Response(AIPromptSerializer(prompt_data).data)


class AIPromptResetAllView(APIView):
    """POST /ai/prompts/reset/ → Reset all prompts to defaults."""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        PromptService.reset_all_prompts(request.user)
        prompts = PromptService.list_prompts_for_user(request.user)
        return Response(AIPromptSerializer(prompts, many=True).data)


class UserAIConfigView(APIView):
    """
    GET    /ai/config/  → Get current user's AI config (masked key)
    PUT    /ai/config/  → Create or update AI config
    DELETE /ai/config/  → Remove AI config (revert to system defaults)
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            config = UserAIConfig.objects.get(user=request.user, is_deleted=False)
            return Response(UserAIConfigSerializer(config).data)
        except UserAIConfig.DoesNotExist:
            return Response({"configured": False}, status=status.HTTP_200_OK)

    def put(self, request):
        serializer = UserAIConfigWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        data = serializer.validated_data
        raw_key = data.get("api_key", "").strip()
        encrypted_key = encrypt_api_key(raw_key) if raw_key else ""

        if data["provider"] == "chatgpt_plan":
            from apps.ai_engine.models import ChatGPTSession
            from apps.ai_engine.services.providers.chatgpt_plan import ChatGPTPlanProvider

            session = ChatGPTSession.objects.filter(user=request.user).first()
            if not session or not session.has_plan_usage:
                return Response(
                    {
                        "error": {
                            "code": "no_chatgpt_session",
                            "message": "No active ChatGPT subscription linked to your CRM account. Please link your subscription first.",
                        }
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

            # Test token send & receive probe
            try:
                provider = ChatGPTPlanProvider(user=request.user, model=data["model_name"])
                provider.chat(
                    messages=[{"role": "user", "content": "Respond with 'CONNECTED' in one word."}],
                    system_prompt="You are a system health probe. Respond with only one word.",
                )
            except Exception as e:
                logger.warning("Token verification failed for user %s, model %s: %s", request.user.email, data["model_name"], e)
                return Response(
                    {
                        "error": {
                            "code": "chatgpt_model_test_failed",
                            "message": f"Token verification failed for '{data['model_name']}': {str(e)}",
                        }
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

        config, created = UserAIConfig.all_objects.get_or_create(
            user=request.user,
            defaults={
                "provider": data["provider"],
                "config_type": data["config_type"],
                "api_key_encrypted": encrypted_key,
                "model_name": data["model_name"],
                "base_url": data.get("base_url", ""),
                "fallback_provider": data.get("fallback_provider", ""),
                "fallback_config_type": data.get("fallback_config_type", "cloud_api"),
                "fallback_api_key_encrypted": encrypt_api_key(data["fallback_api_key"].strip()) if data.get("fallback_api_key", "").strip() else "",
                "fallback_model_name": data.get("fallback_model_name", ""),
                "fallback_base_url": data.get("fallback_base_url", ""),
                "is_active": True,
                "is_deleted": False,
                "created_by": request.user,
            },
        )

        if not created:
            config.provider = data["provider"]
            config.config_type = data["config_type"]
            config.api_key_encrypted = encrypted_key
            config.model_name = data["model_name"]
            config.base_url = data.get("base_url", "")
            config.fallback_provider = data.get("fallback_provider", "")
            config.fallback_config_type = data.get("fallback_config_type", "cloud_api")
            if data.get("fallback_api_key", "").strip():
                config.fallback_api_key_encrypted = encrypt_api_key(data["fallback_api_key"].strip())
            elif not data.get("fallback_provider"):
                config.fallback_api_key_encrypted = ""
            config.fallback_model_name = data.get("fallback_model_name", "")
            config.fallback_base_url = data.get("fallback_base_url", "")
            config.is_active = True
            config.is_deleted = False
            config.updated_by = request.user
            config.save()

        return Response(
            UserAIConfigSerializer(config).data,
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )

    def delete(self, request):
        try:
            config = UserAIConfig.objects.get(user=request.user)
            config.soft_delete(user=request.user)
            return Response(
                {"message": "AI configuration removed. System defaults will be used."},
                status=status.HTTP_200_OK,
            )
        except UserAIConfig.DoesNotExist:
            return Response(
                {"error": {"code": "not_found", "message": "No AI configuration found."}},
                status=status.HTTP_404_NOT_FOUND,
            )


class ChatGPTSyncTokensView(APIView):
    """
    POST /ai/chatgpt/sync-tokens/
    Syncs ChatGPT OAuth tokens for the authenticated CRM user.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        user = request.user
        data = request.data

        client_id = data.get("client_id")
        access_token = data.get("access_token")
        refresh_token = data.get("refresh_token")
        id_token = data.get("id_token", "")
        expires_in = data.get("expires_in", 3600)
        scopes = data.get("scopes", [])
        host_id = data.get("ext_agent_host_id", "")
        chatgpt_email = data.get("chatgpt_email", "")

        if not client_id or not access_token:
            return Response(
                {"error": {"code": "invalid_payload", "message": "Missing client_id or access_token"}},
                status=status.HTTP_400_BAD_REQUEST,
            )

        from apps.ai_engine.models import ChatGPTSession
        from datetime import timedelta
        from django.utils import timezone

        session, created = ChatGPTSession.all_objects.get_or_create(
            user=user,
            defaults={
                "client_id": client_id,
                "ext_agent_host_id": host_id,
                "access_token": access_token,
                "refresh_token": refresh_token,
                "id_token": id_token,
                "expires_at": timezone.now() + timedelta(seconds=expires_in),
                "scopes": scopes,
                "chatgpt_email": chatgpt_email,
                "created_by": user,
            },
        )
        if not created:
            session.client_id = client_id
            session.ext_agent_host_id = host_id
            session.access_token = access_token
            session.refresh_token = refresh_token
            session.id_token = id_token
            session.expires_at = timezone.now() + timedelta(seconds=expires_in)
            session.scopes = scopes
            session.is_deleted = False
            if chatgpt_email:
                session.chatgpt_email = chatgpt_email
            session.updated_by = user
            session.save()

        # Automatically ensure UserAIConfig uses chatgpt_plan
        ai_config, _ = UserAIConfig.all_objects.get_or_create(
            user=user,
            defaults={
                "provider": "chatgpt_plan",
                "config_type": "chatgpt_oauth",
                "model_name": "gpt-4o",
                "is_active": True,
                "is_deleted": False,
                "created_by": user,
            },
        )
        if ai_config.is_deleted or ai_config.provider != "chatgpt_plan":
            ai_config.provider = "chatgpt_plan"
            ai_config.config_type = "chatgpt_oauth"
            ai_config.is_active = True
            ai_config.is_deleted = False
            ai_config.updated_by = user
            ai_config.save()

        return Response({
            "status": "success",
            "message": f"ChatGPT subscription successfully linked to CRM user {user.email}",
            "crm_user": user.email,
            "has_plan_usage": session.has_plan_usage,
            "active_model": ai_config.model_name,
        })


class ChatGPTSessionStatusView(APIView):
    """
    GET    /ai/chatgpt/status/ → Returns status of user's linked ChatGPT subscription
    DELETE /ai/chatgpt/status/ → Disconnects/revokes user's ChatGPT session
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from apps.ai_engine.models import ChatGPTSession
        session = ChatGPTSession.objects.filter(user=request.user).first()
        ai_config = UserAIConfig.objects.filter(user=request.user, is_deleted=False).first()

        if not session or not session.has_plan_usage:
            return Response({
                "connected": False,
                "provider_active": (ai_config.provider == "chatgpt_plan") if ai_config else False,
            })

        return Response({
            "connected": True,
            "provider_active": (ai_config.provider == "chatgpt_plan") if ai_config else False,
            "active_model": ai_config.model_name if ai_config else "gpt-4o",
            "chatgpt_email": session.chatgpt_email,
            "expires_at": session.expires_at,
            "has_plan_usage": session.has_plan_usage,
            "scopes": session.scopes,
        })

    def delete(self, request):
        from apps.ai_engine.models import ChatGPTSession
        from apps.ai_engine.services.chatgpt_oauth import ChatGPTOAuthService

        session = ChatGPTSession.objects.filter(user=request.user).first()
        if session:
            ChatGPTOAuthService.revoke_session(session)

        # If UserAIConfig was set to chatgpt_plan, soft-delete or reset
        ai_config = UserAIConfig.objects.filter(user=request.user, provider="chatgpt_plan").first()
        if ai_config:
            ai_config.soft_delete(user=request.user)

        return Response({"message": "ChatGPT subscription disconnected successfully."})


class ChatGPTModelsListView(APIView):
    """
    GET /ai/chatgpt/models/
    Fetches available models for this user's ChatGPT subscription.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        import requests
        from apps.ai_engine.services.chatgpt_oauth import get_valid_chatgpt_token

        fallback_models = [
            {"slug": "gpt-5.6-terra", "display_name": "GPT-5.6 Terra (High-Intelligence Flagship)"},
            {"slug": "gpt-5.6-luna", "display_name": "GPT-5.6 Luna (Fast & Efficient)"},
            {"slug": "gpt-reserve", "display_name": "GPT-Reserve (High Reliability)"},
            {"slug": "codex-auto-review", "display_name": "Codex Auto Review"},
        ]

        try:
            token = get_valid_chatgpt_token(request.user)
            resp = requests.get(
                "https://api.openai.com/v1/models",
                headers={"Authorization": f"Bearer {token}"},
                timeout=10,
            )
            if resp.ok:
                data = resp.json()
                raw_models = data.get("models", [])
                filtered = [
                    {
                        "slug": m.get("slug") or m.get("id"),
                        "display_name": m.get("display_name") or m.get("slug") or m.get("id"),
                    }
                    for m in raw_models
                    if (m.get("visibility") == "list" or not m.get("visibility"))
                    and (m.get("slug") or m.get("id")) != "gpt-5.5"  # Filter out 404 stub
                ]
                if filtered:
                    return Response({"models": filtered})
        except Exception as e:
            logger.warning("Could not fetch live models from OpenAI (%s), returning default catalog", e)

        return Response({"models": fallback_models})


class ChatGPTTestAndSaveView(APIView):
    """
    POST /ai/chatgpt/test-and-save/
    Live test of model token send & receive via user's ChatGPT plan.
    Saves UserAIConfig if probe succeeds, or returns detailed validation error.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        from apps.ai_engine.models import ChatGPTSession, UserAIConfig
        from apps.ai_engine.services.providers.chatgpt_plan import ChatGPTPlanProvider

        model = request.data.get("model") or request.data.get("model_name")
        if not model:
            return Response(
                {"error": {"code": "missing_model", "message": "Model parameter is required."}},
                status=status.HTTP_400_BAD_REQUEST,
            )

        session = ChatGPTSession.objects.filter(user=request.user).first()
        if not session or not session.has_plan_usage:
            return Response(
                {
                    "error": {
                        "code": "no_chatgpt_session",
                        "message": "No active ChatGPT subscription linked to your CRM account. Please link your subscription first.",
                    }
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        save_on_success = request.data.get("save", True)

        try:
            provider = ChatGPTPlanProvider(user=request.user, model=model)
            # Lightweight probe to verify send & receive token flow
            probe_resp = provider.chat(
                messages=[{"role": "user", "content": "Respond with 'CONNECTED' in one word."}],
                system_prompt="You are a system health probe. Respond with only one word.",
            )
            probe_reply = probe_resp.content.strip()
        except Exception as e:
            logger.warning("ChatGPT model test failed for user %s, model %s: %s", request.user.email, model, e)
            return Response(
                {
                    "error": {
                        "code": "chatgpt_model_test_failed",
                        "message": f"Token verification failed for '{model}': {str(e)}",
                        "model": model,
                    }
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Probe succeeded - save configuration
        if save_on_success:
            config, created = UserAIConfig.all_objects.get_or_create(
                user=request.user,
                defaults={
                    "provider": "chatgpt_plan",
                    "config_type": "chatgpt_oauth",
                    "model_name": model,
                    "api_key_encrypted": "",
                    "is_active": True,
                    "is_deleted": False,
                    "created_by": request.user,
                },
            )
            if not created:
                config.provider = "chatgpt_plan"
                config.config_type = "chatgpt_oauth"
                config.model_name = model
                config.api_key_encrypted = ""
                config.is_active = True
                config.is_deleted = False
                config.updated_by = request.user
                config.save()

        return Response({
            "success": True,
            "saved": save_on_success,
            "model": model,
            "probe_reply": probe_reply,
            "input_tokens": probe_resp.input_tokens,
            "output_tokens": probe_resp.output_tokens,
            "message": f"Successfully verified token roundtrip with '{model}' (Response: '{probe_reply}'). Model saved as platform default.",
        }, status=status.HTTP_200_OK)


class ChatGPTIntelligenceStreamView(APIView):
    """
    POST /ai/chatgpt/account-intelligence/stream/
    Streams real-time Account Intelligence via SSE using the user's ChatGPT plan.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        import json
        import requests
        from django.http import StreamingHttpResponse
        from apps.ai_engine.services.chatgpt_oauth import get_valid_chatgpt_token

        company_id = request.data.get("company_id")
        company_name = request.data.get("company_name")
        model = request.data.get("model")

        if not company_id and not company_name:
            return Response(
                {"error": {"code": "missing_company", "message": "Either company_id or company_name is required."}},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if company_id:
            from apps.companies.models import Company
            try:
                company = Company.objects.get(id=company_id)
                comp_name = company.name
                comp_website = company.website or "Not provided"
                comp_industry = company.industry or "Not provided"
                comp_description = company.description or "Not provided"
                comp_country = company.country or "Not provided"
                comp_size = company.company_size or "Not provided"
            except Company.DoesNotExist:
                return Response(
                    {"error": {"code": "not_found", "message": "Company not found."}},
                    status=status.HTTP_404_NOT_FOUND,
                )
        else:
            comp_name = company_name.strip()
            comp_website = request.data.get("website", "Not provided")
            comp_industry = request.data.get("industry", "Not provided")
            comp_description = request.data.get("description", "Not provided")
            comp_country = request.data.get("country", "Not provided")
            comp_size = request.data.get("company_size", "Not provided")

        # Get active model from UserAIConfig if not specified
        if not model:
            config = UserAIConfig.objects.filter(user=request.user, is_deleted=False).first()
            model = config.model_name if config else "gpt-5.6-terra"

        # Load customizable prompts from PromptService
        try:
            user_template = PromptService.get_prompt(request.user, "account_intelligence_user")
        except Exception:
            user_template = PromptService.get_prompt(request.user, "research_user")

        formatted_user_prompt = user_template.format(
            company_name=comp_name,
            website=comp_website,
            industry=comp_industry,
            description=comp_description,
            country=comp_country,
            company_size=comp_size,
        )

        # Phase 4: Crawl website live and fetch Apollo firmographics (zero credit)
        crawl_summary = ""
        if comp_website and comp_website != "Not provided":
            try:
                from apps.agent.tools.research.website_research import WebsiteResearchTool
                crawler = WebsiteResearchTool()
                url = comp_website if comp_website.startswith(("http://", "https://")) else f"https://{comp_website}"
                scraped = crawler._crawl_site(url)
                if scraped:
                    combined = []
                    for page_url, ptext in list(scraped.items())[:3]:
                        clean_text = ptext.strip()[:1000]
                        if clean_text:
                            combined.append(f"--- PAGE: {page_url} ---\n{clean_text}")
                    if combined:
                        crawl_summary = "\n\n".join(combined)
            except Exception as e:
                logger.warning("Could not crawl website %s for account intelligence: %s", comp_website, e)

        apollo_summary = ""
        try:
            from apps.ai_engine.services.apollo_client import get_user_apollo_client
            apollo_client = get_user_apollo_client(request.user)
            if apollo_client:
                domain = comp_website.replace("https://", "").replace("http://", "").split("/")[0].strip() if comp_website != "Not provided" else ""
                org_data = apollo_client.view_organization(domain=domain, name=comp_name)
                people_data = apollo_client.view_people(domain=domain, limit=6) if domain else []

                parts = []
                if org_data.get("success"):
                    parts.append(
                        f"APOLLO VERIFIED FIRMOGRAPHICS (0 CREDITS):\n"
                        f"- Legal Name: {org_data.get('name')}\n"
                        f"- Headcount: {org_data.get('estimated_num_employees')}\n"
                        f"- Annual Revenue: {org_data.get('annual_revenue')}\n"
                        f"- Total Funding: {org_data.get('total_funding')}\n"
                        f"- Tech Stack: {', '.join(org_data.get('technologies', [])[:10])}\n"
                        f"- Keywords: {', '.join(org_data.get('keywords', [])[:8])}\n"
                        f"- Location: {org_data.get('city')}, {org_data.get('country')}\n"
                        f"- Overview: {org_data.get('short_description')}"
                    )
                if people_data:
                    plist = [f"- {p.get('name')} ({p.get('title')})" for p in people_data[:6]]
                    parts.append("KEY LEADERSHIP / CONTACTS (VIEW ONLY - 0 CREDITS):\n" + "\n".join(plist))

                if parts:
                    apollo_summary = "\n\n".join(parts)
        except Exception as e:
            logger.warning("Could not fetch Apollo data for account intelligence: %s", e)

        if crawl_summary or apollo_summary:
            enrichment_context = []
            if crawl_summary:
                enrichment_context.append(f"LIVE WEBSITE CONTENT:\n{crawl_summary}")
            if apollo_summary:
                enrichment_context.append(apollo_summary)
            formatted_user_prompt += "\n\n### REAL-TIME VERIFIED DATA & LIVE CRAWL:\n" + "\n\n".join(enrichment_context)

        org_persona = PromptService.get_prompt(request.user, "copilot_system")
        try:
            rs_rules = PromptService.get_prompt(request.user, "account_intelligence_system")
        except Exception:
            rs_rules = PromptService.get_prompt(request.user, "research_system")

        instructions = f"{org_persona}\n\n{rs_rules}"

        user_cfg = UserAIConfig.objects.filter(user=request.user, is_deleted=False).first()

        def stream_fallback_model():
            try:
                from apps.ai_engine.services.copilot import get_llm_provider
                fallback_llm = get_llm_provider(request.user)
                fb_model = getattr(user_cfg, "fallback_model_name", None) or "fallback model"
                yield f"data: {json.dumps({'type': 'delta', 'delta': f'\n\n*(Note: Primary ChatGPT subscription unavailable. Seamlessly streamed via {fb_model})*\n\n'})}\n\n"
                fb_resp = fallback_llm.chat(
                    messages=[{"role": "user", "content": formatted_user_prompt}],
                    system_prompt=instructions,
                )
                yield f"data: {json.dumps({'type': 'delta', 'delta': fb_resp.content})}\n\n"
                yield f"data: {json.dumps({'type': 'completed', 'full_text': fb_resp.content})}\n\n"
            except Exception as fb_err:
                yield f"data: {json.dumps({'type': 'error', 'message': f'Fallback model failed: {str(fb_err)}'})}\n\n"

        def event_stream():
            token = None
            try:
                token = get_valid_chatgpt_token(request.user)
            except Exception as e:
                # If primary token fails and fallback is configured, stream fallback!
                if user_cfg and user_cfg.fallback_provider and user_cfg.fallback_api_key_encrypted:
                    yield from stream_fallback_model()
                    return
                yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"
                return

            headers = {
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
            }
            payload = {
                "model": model,
                "instructions": instructions,
                "input": [{"role": "user", "content": formatted_user_prompt}],
                "store": False,
                "stream": True,
            }

            accumulated = []

            try:
                with requests.post("https://api.openai.com/v1/responses", headers=headers, json=payload, stream=True, timeout=120) as resp:
                    if not resp.ok:
                        if user_cfg and user_cfg.fallback_provider and user_cfg.fallback_api_key_encrypted:
                            yield from stream_fallback_model()
                            return
                        yield f"data: {json.dumps({'type': 'error', 'message': resp.text})}\n\n"
                        return

                    for line in resp.iter_lines():
                        if not line:
                            continue
                        decoded = line.decode("utf-8")
                        if decoded.startswith("data: "):
                            raw_data = decoded[6:].strip()
                            if raw_data == "[DONE]":
                                break
                            try:
                                event = json.loads(raw_data)
                                if event.get("type") == "response.output_text.delta":
                                    delta = event.get("delta", "")
                                    accumulated.append(delta)
                                    yield f"data: {json.dumps({'type': 'delta', 'delta': delta})}\n\n"
                                elif event.get("type") == "response.completed":
                                    yield f"data: {json.dumps({'type': 'completed', 'full_text': ''.join(accumulated)})}\n\n"
                                    break
                                elif event.get("type") == "error":
                                    err_obj = event.get("error", {})
                                    code = err_obj.get("code", "")
                                    msg = err_obj.get("message", "OpenAI inference error")
                                    if user_cfg and user_cfg.fallback_provider and user_cfg.fallback_api_key_encrypted:
                                        yield from stream_fallback_model()
                                        return
                                    if code == "subscription_sharing_usage_limit_exceeded":
                                        msg = "ChatGPT Subscription Sharing usage limit reached on OpenAI. Please wait until your limit resets, or configure a Fallback API Key (e.g. OpenAI or Anthropic API key) in Settings -> AI Integrations for automatic failover."
                                    yield f"data: {json.dumps({'type': 'error', 'message': msg})}\n\n"
                                    break
                                elif event.get("type") == "response.failed":
                                    err = event.get("response", {}).get("error", {})
                                    code = err.get("code", "")
                                    msg = err.get("message", "Inference failed")
                                    if user_cfg and user_cfg.fallback_provider and user_cfg.fallback_api_key_encrypted:
                                        yield from stream_fallback_model()
                                        return
                                    if code == "subscription_sharing_usage_limit_exceeded":
                                        msg = "ChatGPT Subscription Sharing usage limit reached on OpenAI. Please wait until your limit resets, or configure a Fallback API Key in Settings -> AI Integrations for automatic failover."
                                    yield f"data: {json.dumps({'type': 'error', 'message': msg})}\n\n"
                                    break
                            except json.JSONDecodeError:
                                continue
            except Exception as e:
                if user_cfg and user_cfg.fallback_provider and user_cfg.fallback_api_key_encrypted:
                    yield from stream_fallback_model()
                    return
                yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"

        response = StreamingHttpResponse(event_stream(), content_type="text/event-stream")
        response["Cache-Control"] = "no-cache"
        response["X-Accel-Buffering"] = "no"
        return response


# ─── APOLLO.IO INTEGRATION VIEWS ─────────────────────────────────────────────

class ApolloConfigView(APIView):
    """
    GET  /integrations/apollo/status/ -> returns configured status & masked key
    POST /integrations/apollo/save/   -> saves & encrypts Apollo API key
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from apps.ai_engine.models import ApolloConfig
        from apps.common.encryption import mask_api_key

        config = ApolloConfig.objects.filter(user=request.user, is_active=True, is_deleted=False).first()
        if not config:
            config = ApolloConfig.objects.filter(is_active=True, is_deleted=False).first()

        if not config or not config.api_key_encrypted:
            return Response({"configured": False, "api_key_masked": "", "is_active": False, "last_verified_at": None})

        return Response({
            "configured": True,
            "api_key_masked": mask_api_key(config.api_key),
            "is_active": config.is_active,
            "last_verified_at": config.last_verified_at,
        })

    def post(self, request):
        from apps.ai_engine.models import ApolloConfig
        from apps.ai_engine.services.apollo_client import ApolloClient
        from django.utils import timezone

        api_key = request.data.get("api_key", "").strip()
        if not api_key:
            return Response(
                {"error": {"code": "invalid_key", "message": "API key cannot be empty"}},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Validate against Apollo MCP and REST
        client = ApolloClient(api_key=api_key)
        is_valid, msg = client.verify_api_key()
        if not is_valid:
            return Response(
                {"error": {"code": "verification_failed", "message": msg}},
                status=status.HTTP_400_BAD_REQUEST,
            )

        config, _ = ApolloConfig.all_objects.get_or_create(user=request.user)
        config.api_key = api_key
        config.is_active = True
        config.is_deleted = False
        config.last_verified_at = timezone.now()
        config.save()

        return Response({"success": True, "message": "Apollo API key verified and saved successfully."})


class ApolloTestView(APIView):
    """
    POST /integrations/apollo/test/
    Validates either the supplied api_key or the saved key against Apollo.io.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        from apps.ai_engine.models import ApolloConfig
        from apps.ai_engine.services.apollo_client import ApolloClient

        api_key = request.data.get("api_key", "").strip()
        if not api_key:
            config = ApolloConfig.objects.filter(user=request.user, is_active=True, is_deleted=False).first()
            if config and config.api_key:
                api_key = config.api_key
            else:
                return Response(
                    {"success": False, "message": "No Apollo API key provided or saved."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        client = ApolloClient(api_key=api_key)
        is_valid, msg = client.verify_api_key()
        return Response({"success": is_valid, "message": msg})


class ApolloDisconnectView(APIView):
    """
    POST /integrations/apollo/disconnect/
    Disconnects and removes the user's Apollo configuration.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        from apps.ai_engine.models import ApolloConfig

        configs = ApolloConfig.objects.filter(user=request.user)
        for cfg in configs:
            cfg.api_key_encrypted = ""
            cfg.is_active = False
            cfg.soft_delete(user=request.user)

        return Response({"success": True, "message": "Apollo integration disconnected."})

