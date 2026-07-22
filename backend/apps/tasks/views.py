"""
Views for the Tasks module.
"""

from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.common.mixins import CRMViewMixin
from apps.tasks.filters import TaskFilter
from apps.tasks.models import Task
from apps.tasks.serializers import (
    TaskCreateUpdateSerializer,
    TaskDetailSerializer,
    TaskListSerializer,
)
from apps.tasks.services import TaskService


class TaskViewSet(CRMViewMixin, viewsets.ModelViewSet):
    """ViewSet for Task CRUD + completion action."""

    filterset_class = TaskFilter
    search_fields = ["title", "description"]
    ordering_fields = ["title", "due_date", "priority", "status", "created_at"]
    ordering = ["-created_at"]

    def get_queryset(self):
        return TaskService.get_tasks_queryset()

    def get_serializer_class(self):
        if self.action == "list":
            return TaskListSerializer
        if self.action in ("create", "update", "partial_update"):
            return TaskCreateUpdateSerializer
        return TaskDetailSerializer

    def perform_create(self, serializer):
        contact = serializer.validated_data.get("contact")
        company = serializer.validated_data.get("company")
        if contact and not company and getattr(contact, "company", None):
            serializer.save(created_by=self.request.user, updated_by=self.request.user, company=contact.company)
        else:
            serializer.save(created_by=self.request.user, updated_by=self.request.user)

    @action(detail=True, methods=["post"], url_path="complete")
    def complete(self, request, pk=None):
        """Mark a task as completed with optional outcome selection and sequence stopping."""
        task = self.get_object()
        outcome = request.data.get("outcome")
        outcome_notes = request.data.get("outcome_notes", "")
        stop_sequence = request.data.get("stop_sequence", False)
        stop_reason = request.data.get("stop_reason")
        task = TaskService.complete_task(
            task,
            request.user,
            outcome=outcome,
            outcome_notes=outcome_notes,
            stop_sequence=stop_sequence,
            stop_reason=stop_reason,
        )
        return Response(TaskDetailSerializer(task).data)

    @action(detail=False, methods=["get"], url_path="today")
    def today(self, request):
        """Get today's tasks for the current user."""
        tasks = TaskService.get_today_tasks(request.user)
        return Response(TaskListSerializer(tasks, many=True).data)

    @action(detail=False, methods=["get"], url_path="overdue")
    def overdue(self, request):
        """Get overdue tasks for the current user."""
        tasks = TaskService.get_overdue_tasks(request.user)
        return Response(TaskListSerializer(tasks, many=True).data)


from apps.tasks.models import Notification
from apps.tasks.serializers import NotificationSerializer

class NotificationViewSet(CRMViewMixin, viewsets.ModelViewSet):
    """ViewSet for Notification retrieval and marking read."""
    serializer_class = NotificationSerializer
    ordering = ["-created_at"]

    def get_queryset(self):
        return Notification.objects.filter(user=self.request.user)

    @action(detail=False, methods=["post"], url_path="mark-all-read")
    def mark_all_read(self, request):
        """Mark all unread notifications as read."""
        Notification.objects.filter(user=request.user, is_read=False).update(is_read=True)
        return Response({"status": "success", "message": "All notifications marked as read."})
