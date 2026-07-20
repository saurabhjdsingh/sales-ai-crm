from django.urls import path

from apps.dashboard.views import (
    DashboardView,
    ProductivityByDateView,
    ProductivityGraphView,
    ProductivityRangeView,
    ProductivityTodayView,
)

app_name = "dashboard"

urlpatterns = [
    path("", DashboardView.as_view(), name="dashboard"),
    # Productivity endpoints
    path("productivity/today/", ProductivityTodayView.as_view(), name="productivity-today"),
    path("productivity/range/", ProductivityRangeView.as_view(), name="productivity-range"),
    path("productivity/graph/", ProductivityGraphView.as_view(), name="productivity-graph"),
    path("productivity/<str:target_date>/", ProductivityByDateView.as_view(), name="productivity-by-date"),
]
