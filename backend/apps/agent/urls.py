from django.urls import path

from apps.agent.views import (
    CompanyResearchRefreshView,
    CompanyResearchView,
    PendingApprovalActionView,
    PendingApprovalListView,
    ToolExecuteView,
    ToolExecutionHistoryView,
    ToolListView,
    UserLinkedInConfigView,
    LLMStatsView,
)

app_name = "agent"

urlpatterns = [
    path("tools/", ToolListView.as_view(), name="tool-list"),
    path("tools/<str:name>/execute/", ToolExecuteView.as_view(), name="tool-execute"),
    path("research/<uuid:company_id>/", CompanyResearchView.as_view(), name="company-research"),
    path("research/<uuid:company_id>/refresh/", CompanyResearchRefreshView.as_view(), name="company-research-refresh"),
    path("approvals/", PendingApprovalListView.as_view(), name="approval-list"),
    path("approvals/<uuid:id>/<str:action>/", PendingApprovalActionView.as_view(), name="approval-action"),
    path("executions/", ToolExecutionHistoryView.as_view(), name="execution-history"),
    path("linkedin-config/", UserLinkedInConfigView.as_view(), name="linkedin-config"),
    path("llm-stats/", LLMStatsView.as_view(), name="llm-stats"),
]
