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

        return Response(AIMessageSerializer(ai_message).data)


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
        encrypted_key = encrypt_api_key(data["api_key"])

        config, created = UserAIConfig.all_objects.get_or_create(
            user=request.user,
            defaults={
                "provider": data["provider"],
                "config_type": data["config_type"],
                "api_key_encrypted": encrypted_key,
                "model_name": data["model_name"],
                "base_url": data.get("base_url", ""),
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
