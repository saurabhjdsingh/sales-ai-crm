import json
import logging
from uuid import UUID

from apps.contacts.models import Contact

from django.utils import timezone
from rest_framework import generics, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.agent.enums import ApprovalStatus
from apps.agent.models import PendingApproval, ResearchRun, ToolExecution, UserLinkedInConfig
from apps.agent.serializers import (
    PendingApprovalSerializer,
    ResearchRunSerializer,
    ToolExecutionSerializer,
    UserLinkedInConfigSerializer,
    UserLinkedInConfigWriteSerializer,
)
from apps.agent.services.context import AgentContext
from apps.agent.services.tool_router import ToolRouter
from apps.agent.tasks import execute_approved_action, execute_research_pipeline
from apps.agent.tools.registry import tool_registry
from apps.common.encryption import encrypt_api_key
from apps.common.enums import ResearchStatus
from apps.common.pagination import StandardPagination
from apps.companies.models import Company

logger = logging.getLogger(__name__)


class ToolListView(APIView):
    """
    GET /agent/tools/ -> Lists all registered tools with their schema schemas.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        tools = tool_registry.get_all_tools()
        definitions = [tool.get_schema() for tool in tools]
        return Response({"tools": definitions})


class ToolExecuteView(APIView):
    """
    POST /agent/tools/<name>/execute/ -> Manually run a tool for testing or debug.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request, name):
        try:
            tool = tool_registry.get_tool(name)
        except KeyError:
            return Response({"error": f"Tool '{name}' not found."}, status=status.HTTP_404_NOT_FOUND)

        # Parse context parameters
        company_id = request.data.get("company_id")
        contact_id = request.data.get("contact_id")
        params = request.data.get("parameters", {})

        company = None
        contact = None
        if company_id:
            company = Company.objects.filter(id=UUID(company_id)).first()
        if contact_id:
            contact = Contact.objects.filter(id=UUID(contact_id)).first()

        context = AgentContext(
            user=request.user,
            conversation=None,
            entity_type="company" if company else ("contact" if contact else "unknown"),
            entity_id=company.id if company else (contact.id if contact else None),
            company=company,
            contact=contact,
        )

        router = ToolRouter()
        result = router.route_tool_call(name, params, context)

        return Response({
            "success": result.success,
            "data": result.data,
            "summary": result.summary,
            "error": result.error,
            "requires_approval": result.requires_approval,
        })


class CompanyResearchView(generics.RetrieveAPIView):
    """
    GET /agent/research/:company_id/ -> Get latest completed research run details.
    """

    serializer_class = ResearchRunSerializer
    permission_classes = [IsAuthenticated]

    def get_object(self):
        company_id = self.kwargs.get("company_id")
        run = ResearchRun.objects.filter(
            company_id=UUID(company_id),
            status=ResearchStatus.COMPLETED
        ).first()
        if not run:
            # Fallback to any run
            run = ResearchRun.objects.filter(
                company_id=UUID(company_id)
            ).first()
        return run


class CompanyResearchRefreshView(APIView):
    """
    POST /agent/research/:company_id/refresh/ -> Triggers celery task to re-run research.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request, company_id):
        try:
            Company.objects.get(id=UUID(company_id))
        except Company.DoesNotExist:
            return Response({"error": "Company not found"}, status=status.HTTP_404_NOT_FOUND)

        # Schedule async task
        sources = [
            "website",
            "linkedin_company",
            "news"
        ]
        task = execute_research_pipeline.delay(
            company_id=company_id,
            sources=sources,
            user_id=str(request.user.id)
        )

        return Response({
            "status": "triggered",
            "task_id": task.id,
            "message": "Research pipeline refresh scheduled in the background."
        }, status=status.HTTP_202_ACCEPTED)


class PendingApprovalListView(generics.ListAPIView):
    """
    GET /agent/approvals/ -> List pending approvals.
    """

    serializer_class = PendingApprovalSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = StandardPagination

    def get_queryset(self):
        return PendingApproval.objects.filter(
            status=ApprovalStatus.PENDING
        ).order_by("-created_at")


class PendingApprovalActionView(APIView):
    """
    POST /agent/approvals/:id/approve/ -> Approve and trigger background action execution.
    POST /agent/approvals/:id/reject/  -> Reject approval action.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request, id, action):
        try:
            approval = PendingApproval.objects.get(id=id)
        except PendingApproval.DoesNotExist:
            return Response({"error": "Pending approval action not found."}, status=status.HTTP_404_NOT_FOUND)

        if approval.status != ApprovalStatus.PENDING:
            return Response({"error": "Action is already processed."}, status=status.HTTP_400_BAD_REQUEST)

        if action == "approve":
            approval.status = ApprovalStatus.APPROVED
            approval.approved_at = timezone.now()
            approval.approved_by = request.user
            approval.save()

            # Trigger background browser action execution
            execute_approved_action.delay(str(approval.id))

            return Response({
                "status": "approved",
                "message": "Action approved and queued for execution."
            })
        elif action == "reject":
            approval.status = ApprovalStatus.REJECTED
            approval.save()
            return Response({
                "status": "rejected",
                "message": "Action rejected."
            })
        else:
            return Response({"error": "Invalid action parameter."}, status=status.HTTP_400_BAD_REQUEST)


class ToolExecutionHistoryView(generics.ListAPIView):
    """
    GET /agent/executions/ -> View detailed logs of tool executions.
    """

    serializer_class = ToolExecutionSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = StandardPagination

    def get_queryset(self):
        return ToolExecution.objects.all().order_by("-created_at")


class UserLinkedInConfigView(APIView):
    """
    GET    /agent/linkedin-config/ -> View masked configuration settings.
    PUT    /agent/linkedin-config/ -> Update secure credentials and profile URL.
    DELETE /agent/linkedin-config/ -> Clear settings.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            config = UserLinkedInConfig.objects.get(user=request.user)
            return Response(UserLinkedInConfigSerializer(config).data)
        except UserLinkedInConfig.DoesNotExist:
            return Response({"configured": False}, status=status.HTTP_200_OK)

    def put(self, request):
        serializer = UserLinkedInConfigWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        data = serializer.validated_data
        encrypted_cookies = encrypt_api_key(json.dumps(data["cookies"]))

        config, created = UserLinkedInConfig.all_objects.get_or_create(
            user=request.user,
            defaults={
                "cookies_json_encrypted": encrypted_cookies,
                "linkedin_url": data.get("linkedin_url", ""),
                "is_active": data.get("is_active", True),
                "created_by": request.user,
            }
        )

        if not created:
            config.cookies_json_encrypted = encrypted_cookies
            config.linkedin_url = data.get("linkedin_url", "")
            config.is_active = data.get("is_active", True)
            config.updated_by = request.user
            config.save()

        return Response(
            UserLinkedInConfigSerializer(config).data,
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK
        )

    def delete(self, request):
        try:
            config = UserLinkedInConfig.objects.get(user=request.user)
            config.soft_delete(user=request.user)
            return Response({"message": "LinkedIn configuration removed successfully."}, status=status.HTTP_200_OK)
        except UserLinkedInConfig.DoesNotExist:
            return Response({"error": "LinkedIn config not found."}, status=status.HTTP_404_NOT_FOUND)


class LLMStatsView(APIView):
    """
    GET /agent/llm-stats/ -> Retrieve aggregated token usage and LLM costs.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from django.db.models import Sum, Count
        from apps.ai_engine.models import LLMCallLog

        # Total aggregates
        totals = LLMCallLog.objects.aggregate(
            total_calls=Count("id"),
            total_input=Sum("input_tokens"),
            total_output=Sum("output_tokens"),
            total_tokens=Sum("total_tokens"),
            total_cost=Sum("cost")
        )

        # Usage by model
        by_model_qs = LLMCallLog.objects.values("model_name").annotate(
            calls=Count("id"),
            input_tokens=Sum("input_tokens"),
            output_tokens=Sum("output_tokens"),
            total_tokens=Sum("total_tokens"),
            cost=Sum("cost")
        ).order_by("-cost")

        # Usage by purpose
        by_purpose_qs = LLMCallLog.objects.values("prompt_purpose").annotate(
            calls=Count("id"),
            input_tokens=Sum("input_tokens"),
            output_tokens=Sum("output_tokens"),
            total_tokens=Sum("total_tokens"),
            cost=Sum("cost")
        ).order_by("-cost")

        data = {
            "total_calls": totals["total_calls"] or 0,
            "total_input_tokens": totals["total_input"] or 0,
            "total_output_tokens": totals["total_output"] or 0,
            "total_tokens": totals["total_tokens"] or 0,
            "total_cost": float(totals["total_cost"] or 0.0),
            "usage_by_model": [
                {
                    "model_name": item["model_name"],
                    "calls": item["calls"],
                    "input_tokens": item["input_tokens"],
                    "output_tokens": item["output_tokens"],
                    "total_tokens": item["total_tokens"],
                    "cost": float(item["cost"] or 0.0)
                } for item in by_model_qs
            ],
            "usage_by_purpose": [
                {
                    "purpose": item["prompt_purpose"],
                    "calls": item["calls"],
                    "input_tokens": item["input_tokens"],
                    "output_tokens": item["output_tokens"],
                    "total_tokens": item["total_tokens"],
                    "cost": float(item["cost"] or 0.0)
                } for item in by_purpose_qs
            ]
        }

        return Response(data)

