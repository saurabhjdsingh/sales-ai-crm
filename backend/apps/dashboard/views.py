"""
Views for the Dashboard.
"""

import logging
from datetime import date, datetime, timedelta

from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.dashboard.serializers import DailyProductivitySerializer
from apps.dashboard.services import DashboardService, ProductivityService

logger = logging.getLogger(__name__)


class DashboardView(APIView):
    """
    GET /dashboard/
    Returns all dashboard data in a single response.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        data = DashboardService.get_dashboard_data(request.user)
        return Response(data)


# ──────────────────────────────────────────────
# Productivity Endpoints
# ──────────────────────────────────────────────


class ProductivityTodayView(APIView):
    """
    GET /dashboard/productivity/today/
    Returns the current user's productivity snapshot for today.
    Always recomputes since the day is ongoing.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        from django.utils import timezone

        today = timezone.localdate()
        snapshot = ProductivityService.get_or_compute_snapshot(request.user, today)
        serializer = DailyProductivitySerializer(snapshot)
        return Response(serializer.data)


class ProductivityByDateView(APIView):
    """
    GET /dashboard/productivity/<date>/
    Returns the current user's productivity for a specific date (YYYY-MM-DD).
    """

    permission_classes = [IsAuthenticated]

    def get(self, request, target_date):
        try:
            parsed_date = date.fromisoformat(target_date)
        except (ValueError, TypeError):
            return Response(
                {"error": "Invalid date format. Use YYYY-MM-DD."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        snapshot = ProductivityService.get_or_compute_snapshot(
            request.user, parsed_date
        )
        serializer = DailyProductivitySerializer(snapshot)
        return Response(serializer.data)


class ProductivityRangeView(APIView):
    """
    GET /dashboard/productivity/range/?start=YYYY-MM-DD&end=YYYY-MM-DD
    Returns daily productivity snapshots for the given date range.
    """

    permission_classes = [IsAuthenticated]

    MAX_RANGE_DAYS = 90

    def get(self, request):
        start_str = request.query_params.get("start")
        end_str = request.query_params.get("end")

        if not start_str or not end_str:
            return Response(
                {"error": "Both 'start' and 'end' query parameters are required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            start_date = date.fromisoformat(start_str)
            end_date = date.fromisoformat(end_str)
        except (ValueError, TypeError):
            return Response(
                {"error": "Invalid date format. Use YYYY-MM-DD."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if start_date > end_date:
            return Response(
                {"error": "'start' must be before or equal to 'end'."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if (end_date - start_date).days > self.MAX_RANGE_DAYS:
            return Response(
                {"error": f"Date range cannot exceed {self.MAX_RANGE_DAYS} days."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        data = ProductivityService.get_date_range(request.user, start_date, end_date)
        return Response(data)


class ProductivityGraphView(APIView):
    """
    GET /dashboard/productivity/graph/?start=YYYY-MM-DD&end=YYYY-MM-DD
    Returns time-series data formatted for charting.
    """

    permission_classes = [IsAuthenticated]

    MAX_RANGE_DAYS = 90

    def get(self, request):
        start_str = request.query_params.get("start")
        end_str = request.query_params.get("end")

        if not start_str or not end_str:
            return Response(
                {"error": "Both 'start' and 'end' query parameters are required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            start_date = date.fromisoformat(start_str)
            end_date = date.fromisoformat(end_str)
        except (ValueError, TypeError):
            return Response(
                {"error": "Invalid date format. Use YYYY-MM-DD."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if start_date > end_date:
            return Response(
                {"error": "'start' must be before or equal to 'end'."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if (end_date - start_date).days > self.MAX_RANGE_DAYS:
            return Response(
                {"error": f"Date range cannot exceed {self.MAX_RANGE_DAYS} days."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        data = ProductivityService.get_graph_data(request.user, start_date, end_date)
        return Response(data)
