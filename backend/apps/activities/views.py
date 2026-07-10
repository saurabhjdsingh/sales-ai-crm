"""
Views for the Activities module.
"""

from rest_framework import generics, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.activities.models import Activity
from apps.activities.serializers import ActivityCreateSerializer, ActivitySerializer
from apps.activities.services import ActivityService
from apps.common.pagination import StandardPagination


class ActivityListCreateView(generics.ListCreateAPIView):
    """
    GET  /activities/       → List activities (filterable by company/contact/deal)
    POST /activities/       → Manually log an activity (e.g., log a call)
    """

    serializer_class = ActivitySerializer
    pagination_class = StandardPagination
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = Activity.objects.select_related("performed_by", "company").order_by("-created_at")

        company_id = self.request.query_params.get("company")
        contact_id = self.request.query_params.get("contact")
        deal_id = self.request.query_params.get("deal")
        activity_type = self.request.query_params.get("type")

        if company_id:
            qs = qs.filter(company_id=company_id)
        if contact_id:
            qs = qs.filter(contact_id=contact_id)
        if deal_id:
            qs = qs.filter(deal_id=deal_id)
        if activity_type:
            qs = qs.filter(activity_type=activity_type)

        return qs

    def get_serializer_class(self):
        if self.request.method == "POST":
            return ActivityCreateSerializer
        return ActivitySerializer

    def perform_create(self, serializer):
        serializer.save(
            performed_by=self.request.user,
            created_by=self.request.user,
        )
