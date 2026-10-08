import logging
from datetime import timedelta
from typing import Any

from django.db.models import Q
from django.utils import timezone
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.common.enums import TaskPriority, TaskStatus, TaskType
from apps.emails.models import AccountRole, EmailAccount
from apps.meetings.models import IgnoredMeetingEvent, Meeting
from apps.meetings.serializers import (
    MeetingAnalyzeRequestSerializer,
    MeetingSerializer,
    MeetingUpdateSerializer,
)
from apps.meetings.services.google_calendar import GoogleCalendarService
from apps.meetings.services.meeting_ai_service import MeetingAIService
from apps.meetings.services.meeting_matcher import resolve_meeting_crm_entities
from apps.meetings.services.sync_service import MeetingSyncService
from apps.meetings.services.timeline_sync import sync_meeting_to_timeline
from apps.tasks.models import Task

logger = logging.getLogger(__name__)


class MeetingListCreateView(APIView):
    """
    GET  /meetings/  → List and filter meetings (upcoming, past, needs_review, all).
    """

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        now = timezone.now()
        filter_type = request.query_params.get("filter", "upcoming")
        search_query = request.query_params.get("search", "").strip()
        contact_id = request.query_params.get("contact_id")
        company_id = request.query_params.get("company_id")
        deal_id = request.query_params.get("deal_id")

        qs = Meeting.objects.filter(user=request.user).select_related(
            "contact", "company", "deal"
        )

        # Tab filters
        if filter_type == "upcoming":
            qs = qs.filter(end_time__gte=now).order_by("start_time")
        elif filter_type == "past":
            qs = qs.filter(end_time__lt=now).order_by("-start_time")
        elif filter_type == "needs_review":
            # Meetings where contact or company is null
            qs = qs.filter(Q(contact__isnull=True) | Q(company__isnull=True)).order_by("start_time")
        else:
            qs = qs.order_by("-start_time")

        # Entity filters
        if contact_id:
            qs = qs.filter(contact_id=contact_id)
        if company_id:
            qs = qs.filter(company_id=company_id)
        if deal_id:
            qs = qs.filter(deal_id=deal_id)

        # Search filter
        if search_query:
            qs = qs.filter(
                Q(title__icontains=search_query)
                | Q(description__icontains=search_query)
                | Q(meeting_notes__icontains=search_query)
                | Q(contact__first_name__icontains=search_query)
                | Q(contact__last_name__icontains=search_query)
                | Q(company__name__icontains=search_query)
                | Q(matched_attendee_email__icontains=search_query)
            )

        serializer = MeetingSerializer(qs[:100], many=True)
        return Response(serializer.data)


class MeetingDetailView(APIView):
    """
    GET   /meetings/<id>/ → Retrieve single meeting with full notes & intelligence.
    PATCH /meetings/<id>/ → Update CRM associations, notes, transcript, or details.
    DELETE /meetings/<id>/ → Delete meeting record.
    """

    permission_classes = [permissions.IsAuthenticated]

    def _get_meeting(self, request, pk: str) -> Meeting:
        return Meeting.objects.select_related("contact", "company", "deal", "activity", "synced_note").get(
            id=pk, user=request.user
        )

    def get(self, request, pk: str):
        try:
            meeting = self._get_meeting(request, pk)
            serializer = MeetingSerializer(meeting)
            return Response(serializer.data)
        except Meeting.DoesNotExist:
            return Response({"error": "Meeting not found."}, status=status.HTTP_404_NOT_FOUND)

    def patch(self, request, pk: str):
        try:
            meeting = self._get_meeting(request, pk)
        except Meeting.DoesNotExist:
            return Response({"error": "Meeting not found."}, status=status.HTTP_404_NOT_FOUND)

        serializer = MeetingUpdateSerializer(meeting, data=request.data, partial=True)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        # Check if CRM entities are explicitly changed
        crm_fields = ["contact", "company", "deal"]
        crm_changed = any(f in request.data for f in crm_fields)
        if crm_changed:
            meeting.is_manually_edited = True

        # If contact is updated and company wasn't explicitly supplied, inherit contact's company
        if "contact" in request.data and "company" not in request.data:
            new_contact = serializer.validated_data.get("contact")
            if new_contact and new_contact.company:
                serializer.validated_data["company"] = new_contact.company

        # If user explicitly passes None for company or contact, respect it
        if "company" in request.data and request.data["company"] is None:
            serializer.validated_data["company"] = None
        if "contact" in request.data and request.data["contact"] is None:
            serializer.validated_data["contact"] = None

        # Check notes update
        if "meeting_notes" in request.data or "transcript" in request.data:
            meeting.has_post_meeting_notes = bool(
                serializer.validated_data.get("meeting_notes") or serializer.validated_data.get("transcript")
            )
            meeting.post_meeting_updated_at = timezone.now()

        updated_meeting = serializer.save()

        # Synchronize changes to timeline and notes
        sync_meeting_to_timeline(updated_meeting)

        return Response(MeetingSerializer(updated_meeting).data)

    def delete(self, request, pk: str):
        try:
            meeting = self._get_meeting(request, pk)
            # Record in IgnoredMeetingEvent so future background/manual syncs skip it permanently
            IgnoredMeetingEvent.objects.get_or_create(
                user=request.user,
                google_event_id=meeting.google_event_id,
                defaults={"title": meeting.title, "reason": "user_discarded"},
            )
            # Remove linked timeline activity and note
            if meeting.activity:
                meeting.activity.delete()
            if meeting.synced_note:
                meeting.synced_note.delete()
            meeting.delete()
            return Response(status=status.HTTP_204_NO_CONTENT)
        except Meeting.DoesNotExist:
            return Response({"error": "Meeting not found."}, status=status.HTTP_404_NOT_FOUND)


class MeetingSyncView(APIView):
    """
    POST /meetings/sync/ → Triggers synchronous pull from Google Calendar API
    with date range selection and internal domain filtering.
    """

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        user = request.user
        time_range = request.data.get("time_range", "next_month")

        try:
            result = MeetingSyncService.sync_user_calendar(user, time_range=time_range)
            if not result.get("success"):
                return Response(
                    {
                        "error": result.get("error", "Calendar sync failed"),
                        "connected": result.get("connected", True),
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

            synced = result.get("synced_count", 0)
            matched = result.get("matched_count", 0)
            filtered = result.get("filtered_count", 0)

            return Response({
                "status": "success",
                "message": f"Synchronized {synced} meetings ({matched} matched to CRM, {filtered} internal/personal filtered).",
                **result,
            })
        except PermissionError as e:
            logger.warning(f"Google Calendar permission error for user {user.username}: {e}")
            return Response(
                {
                    "error": str(e),
                    "code": "insufficient_scopes",
                    "requires_reconnect": True,
                },
                status=status.HTTP_403_FORBIDDEN,
            )
        except Exception as e:
            logger.error(f"Error syncing Google Calendar for user {user.username}: {e}", exc_info=True)
            return Response(
                {"error": f"Failed to sync calendar: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )


class MeetingToggleRemindersView(APIView):
    """
    PATCH /meetings/<id>/toggle-reminders/
    Toggles automated branded reminders (24h and 1h) on or off for this meeting.
    """

    permission_classes = [permissions.IsAuthenticated]

    def patch(self, request, pk):
        try:
            meeting = Meeting.objects.get(id=pk, user=request.user)
            send_val = request.data.get("send_reminders")
            if send_val is not None:
                meeting.send_reminders = bool(send_val)
            else:
                meeting.send_reminders = not meeting.send_reminders
            meeting.save(update_fields=["send_reminders", "updated_at"])
            return Response(MeetingSerializer(meeting).data)
        except Meeting.DoesNotExist:
            return Response({"error": "Meeting not found."}, status=status.HTTP_404_NOT_FOUND)


class MeetingAnalyzeView(APIView):
    """
    POST /meetings/<id>/analyze/ → Runs Sales AI on meeting notes and transcript,
    persisting executive summary, action items, objections, and sentiment.
    """

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk: str):
        try:
            meeting = Meeting.objects.select_related("contact", "company").get(id=pk, user=request.user)
        except Meeting.DoesNotExist:
            return Response({"error": "Meeting not found."}, status=status.HTTP_404_NOT_FOUND)

        req_serializer = MeetingAnalyzeRequestSerializer(data=request.data)
        if not req_serializer.is_valid():
            return Response(req_serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        notes = req_serializer.validated_data.get("notes") or meeting.meeting_notes
        transcript = req_serializer.validated_data.get("transcript") or meeting.transcript

        contact_name = meeting.contact.full_name if meeting.contact else ""
        company_name = meeting.company.name if meeting.company else ""

        # Run AI Analysis
        analysis_result = MeetingAIService.analyze_meeting(
            title=meeting.title,
            notes=notes,
            transcript=transcript,
            contact_name=contact_name,
            company_name=company_name,
            user=request.user,
        )

        # Update meeting record
        if "notes" in req_serializer.validated_data and req_serializer.validated_data["notes"]:
            meeting.meeting_notes = notes
        if "transcript" in req_serializer.validated_data and req_serializer.validated_data["transcript"]:
            meeting.transcript = transcript

        meeting.analysis = analysis_result
        meeting.has_post_meeting_notes = True
        meeting.post_meeting_updated_at = timezone.now()
        meeting.save()

        # Update universal activity timeline & attached note
        sync_meeting_to_timeline(meeting)

        return Response({
            "status": "success",
            "analysis": analysis_result,
            "meeting": MeetingSerializer(meeting).data,
        })


class MeetingCreateTasksView(APIView):
    """
    POST /meetings/<id>/create-tasks/ → Converts AI action items into actionable CRM Tasks.
    """

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk: str):
        try:
            meeting = Meeting.objects.select_related("contact", "company", "deal").get(id=pk, user=request.user)
        except Meeting.DoesNotExist:
            return Response({"error": "Meeting not found."}, status=status.HTTP_404_NOT_FOUND)

        action_items = request.data.get("action_items")
        if not action_items and meeting.analysis:
            action_items = meeting.analysis.get("action_items", [])

        if not action_items:
            return Response({"error": "No action items found to convert."}, status=status.HTTP_400_BAD_REQUEST)

        created_tasks = []
        now = timezone.now()

        for item in action_items:
            if isinstance(item, dict):
                task_title = item.get("task", "").strip()
                due_in = item.get("due_in_days", 3)
            else:
                task_title = str(item).strip()
                due_in = 3

            if not task_title:
                continue

            due_date = now + timedelta(days=due_in)

            task = Task.objects.create(
                title=task_title,
                description=f"Action item from meeting '{meeting.title}'",
                task_type=TaskType.FOLLOW_UP,
                priority=TaskPriority.MEDIUM,
                status=TaskStatus.PENDING,
                due_date=due_date,
                owner=request.user,
                company=meeting.company,
                contact=meeting.contact,
                deal=meeting.deal,
                created_by=request.user,
                updated_by=request.user,
            )
            created_tasks.append({
                "id": str(task.id),
                "title": task.title,
                "due_date": task.due_date.isoformat(),
            })

        return Response({
            "status": "success",
            "message": f"Created {len(created_tasks)} tasks from action items.",
            "tasks": created_tasks,
        })


class UpcomingMeetingsSummaryView(APIView):
    """
    GET /meetings/upcoming/ → Lightweight endpoint for top dashboard widget.
    """

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        now = timezone.now()
        upcoming = (
            Meeting.objects.filter(
                user=request.user,
                end_time__gte=now,
            )
            .select_related("contact", "company")
            .order_by("start_time")[:5]
        )

        serializer = MeetingSerializer(upcoming, many=True)
        return Response(serializer.data)
