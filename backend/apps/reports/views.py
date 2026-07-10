"""
Views for Reports.
"""

from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.reports.services import ReportService


class PipelineReportView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(ReportService.pipeline_report())


class RevenueReportView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(ReportService.revenue_forecast())


class PerformanceReportView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(ReportService.sales_performance())


class TaskReportView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(ReportService.task_completion())
