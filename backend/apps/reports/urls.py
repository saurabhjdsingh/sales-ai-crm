from django.urls import path

from apps.reports.views import (
    PerformanceReportView,
    PipelineReportView,
    RevenueReportView,
    TaskReportView,
)

app_name = "reports"

urlpatterns = [
    path("pipeline/", PipelineReportView.as_view(), name="pipeline"),
    path("revenue/", RevenueReportView.as_view(), name="revenue"),
    path("performance/", PerformanceReportView.as_view(), name="performance"),
    path("tasks/", TaskReportView.as_view(), name="tasks"),
]
