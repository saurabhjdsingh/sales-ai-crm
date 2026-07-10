from django.urls import path

from apps.activities.views import ActivityListCreateView

app_name = "activities"

urlpatterns = [
    path("", ActivityListCreateView.as_view(), name="activity-list"),
]
