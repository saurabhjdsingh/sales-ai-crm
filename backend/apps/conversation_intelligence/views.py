from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from apps.conversation_intelligence.models import Conversation
from apps.conversation_intelligence.serializers import ConversationSerializer, ConversationDetailSerializer
from apps.conversation_intelligence.services import ConversationService


class ConversationViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        # Organization boundary: scope queries to the authenticated user's records
        return Conversation.objects.filter(user=self.request.user, is_deleted=False).order_by("-created_at")

    def get_serializer_class(self):
        if self.action in ["retrieve", "end", "confirm"]:
            return ConversationDetailSerializer
        return ConversationSerializer

    @action(detail=False, methods=["post"], url_path="initiate")
    def initiate_conversation(self, request):
        """
        POST /api/v1/conversation-intelligence/conversations/initiate/
        Initializes a conversation record and returns the WebSocket stream tokens.
        """
        contact_id = request.data.get("contact_id")
        deal_id = request.data.get("deal_id")
        company_id = request.data.get("company_id")
        call_id = request.data.get("call_id")

        init_data = ConversationService.initiate_conversation(
            user=request.user,
            contact_id=contact_id,
            deal_id=deal_id,
            company_id=company_id,
            call_id=call_id
        )
        return Response(init_data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"], url_path="end")
    def end_conversation(self, request, pk=None):
        """
        POST /api/v1/conversation-intelligence/conversations/<id>/end/
        Ends the active session and triggers Celery background AI analysis.
        """
        conversation = ConversationService.end_conversation(conversation_id=pk, user=request.user)
        return Response(ConversationDetailSerializer(conversation).data)

    @action(detail=True, methods=["post"], url_path="confirm")
    def confirm_review(self, request, pk=None):
        """
        POST /api/v1/conversation-intelligence/conversations/<id>/confirm/
        Saves user-modified summaries and permanently logs follow-up activities and tasks.
        """
        review_data = request.data
        activity = ConversationService.confirm_post_call_review(
            conversation_id=pk,
            review_data=review_data,
            user=request.user
        )
        return Response({
            "status": "success",
            "activity_id": str(activity.id)
        })
