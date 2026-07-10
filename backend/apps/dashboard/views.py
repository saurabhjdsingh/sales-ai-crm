"""
Views for the Dashboard.
"""

from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.dashboard.services import DashboardService


class DashboardView(APIView):
    """
    GET /dashboard/
    Returns all dashboard data in a single response.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        data = DashboardService.get_dashboard_data(request.user)
        return Response(data)
