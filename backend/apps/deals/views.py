"""
Views for the Deals module.
"""

from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.common.mixins import CRMViewMixin
from apps.deals.filters import DealFilter
from apps.deals.models import Deal
from apps.deals.serializers import (
    DealContactCreateSerializer,
    DealContactSerializer,
    DealCreateUpdateSerializer,
    DealDetailSerializer,
    DealListSerializer,
)
from apps.deals.services import DealService


class DealViewSet(CRMViewMixin, viewsets.ModelViewSet):
    """
    ViewSet for Deal CRUD + pipeline view + contact management.
    """

    filterset_class = DealFilter
    search_fields = ["name", "company__name", "description"]
    ordering_fields = ["name", "created_at", "expected_revenue", "expected_close_date", "stage"]
    ordering = ["-created_at"]

    def get_queryset(self):
        return DealService.get_deals_queryset()

    def get_serializer_class(self):
        if self.action == "list":
            return DealListSerializer
        if self.action in ("create", "update", "partial_update"):
            return DealCreateUpdateSerializer
        return DealDetailSerializer

    def perform_create(self, serializer):
        DealService.create_deal(
            data=serializer.validated_data,
            user=self.request.user,
        )

    def perform_update(self, serializer):
        DealService.update_deal(
            deal=self.get_object(),
            data=serializer.validated_data,
            user=self.request.user,
        )

    @action(detail=False, methods=["get"], url_path="pipeline")
    def pipeline(self, request):
        """Return deals grouped by stage for the pipeline/kanban view."""
        pipeline_data = DealService.get_pipeline()
        result = {}
        for stage, deals in pipeline_data.items():
            result[stage] = DealListSerializer(deals, many=True).data
        return Response(result)

    @action(detail=True, methods=["get", "post"], url_path="contacts")
    def deal_contacts(self, request, pk=None):
        """Manage contacts associated with a deal."""
        deal = self.get_object()

        if request.method == "GET":
            contacts = deal.deal_contacts.select_related("contact").all()
            serializer = DealContactSerializer(contacts, many=True)
            return Response(serializer.data)

        serializer = DealContactCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        deal_contact = DealService.add_contact_to_deal(
            deal=deal,
            contact_id=serializer.validated_data["contact"].id,
            role=serializer.validated_data.get("role", ""),
            is_primary=serializer.validated_data.get("is_primary", False),
            user=request.user,
        )
        return Response(
            DealContactSerializer(deal_contact).data,
            status=status.HTTP_201_CREATED,
        )

    @action(
        detail=True,
        methods=["delete"],
        url_path="contacts/(?P<contact_id>[^/.]+)",
    )
    def remove_deal_contact(self, request, pk=None, contact_id=None):
        """Remove a contact from a deal."""
        deal = self.get_object()
        DealService.remove_contact_from_deal(deal, contact_id)
        return Response(status=status.HTTP_204_NO_CONTENT)
