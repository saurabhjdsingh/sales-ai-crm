from django.urls import path

from apps.meetings.views import (
    MeetingAnalyzeView,
    MeetingCreateTasksView,
    MeetingDetailView,
    MeetingListCreateView,
    MeetingSyncView,
    MeetingToggleRemindersView,
    UpcomingMeetingsSummaryView,
)

app_name = "meetings"

urlpatterns = [
    path("", MeetingListCreateView.as_view(), name="meeting_list"),
    path("sync/", MeetingSyncView.as_view(), name="meeting_sync"),
    path("upcoming/", UpcomingMeetingsSummaryView.as_view(), name="meeting_upcoming"),
    path("<uuid:pk>/", MeetingDetailView.as_view(), name="meeting_detail"),
    path("<uuid:pk>/toggle-reminders/", MeetingToggleRemindersView.as_view(), name="meeting_toggle_reminders"),
    path("<uuid:pk>/analyze/", MeetingAnalyzeView.as_view(), name="meeting_analyze"),
    path("<uuid:pk>/create-tasks/", MeetingCreateTasksView.as_view(), name="meeting_create_tasks"),
]
