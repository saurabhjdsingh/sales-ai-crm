from django.urls import include, path
from rest_framework.routers import DefaultRouter

from apps.sequences.views import (
    ApprovalQueueViewSet,
    EmailOpenPixelView,
    SequenceDashboardView,
    SequenceEnrollmentViewSet,
    SequenceViewSet,
)

router = DefaultRouter()
router.register(r"enrollments", SequenceEnrollmentViewSet, basename="sequence-enrollments")
router.register(r"approvals", ApprovalQueueViewSet, basename="sequence-approvals")
router.register(r"", SequenceViewSet, basename="sequences")

urlpatterns = [
    path("dashboard/", SequenceDashboardView.as_view(), name="sequence-dashboard"),
    path(
        "track/open/<str:tracking_token>/pixel.png",
        EmailOpenPixelView.as_view(),
        name="sequence-open-pixel",
    ),
    path("", include(router.urls)),
]
