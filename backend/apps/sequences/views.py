import logging
from django.http import HttpResponse, HttpResponseRedirect
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.common.mixins import CRMViewMixin
from apps.sequences.models import (
    Sequence,
    SequenceStep,
    SequenceEnrollment,
    SequenceEmailDraft,
    DraftStatus,
    EnrollmentStatus,
)
from apps.sequences.serializers import (
    SequenceCreateUpdateSerializer,
    SequenceDetailSerializer,
    SequenceEmailDraftSerializer,
    SequenceEnrollmentSerializer,
    SequenceListSerializer,
)
from apps.sequences.services.analytics import SequenceAnalyticsService
from apps.sequences.services.link_tracker import LinkTrackerService
from apps.sequences.services.sequence_engine import SequenceEngineService
from apps.activities.models import Activity
from apps.common.enums import ActivityType

logger = logging.getLogger(__name__)

TRANSPARENT_1X1_GIF = (
    b"\x47\x49\x46\x38\x39\x61\x01\x00\x01\x00\x80\x00\x00\xff\xff\xff"
    b"\x00\x00\x00\x21\xf9\x04\x01\x00\x00\x00\x00\x2c\x00\x00\x00\x00"
    b"\x01\x00\x01\x00\x00\x02\x02\x44\x01\x00\x3b"
)


class SequenceViewSet(CRMViewMixin, viewsets.ModelViewSet):
    """ViewSet for Sequence CRUD, cloning, and contact enrollment."""
    queryset = Sequence.objects.all().prefetch_related("steps", "enrollments")
    search_fields = ["name", "description"]
    ordering_fields = ["name", "is_active", "created_at"]
    ordering = ["-created_at"]

    def get_serializer_class(self):
        if self.action == "list":
            return SequenceListSerializer
        if self.action in ["create", "update", "partial_update"]:
            return SequenceCreateUpdateSerializer
        return SequenceDetailSerializer

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user, updated_by=self.request.user)

    @action(detail=True, methods=["post"], url_path="duplicate")
    def duplicate(self, request, pk=None):
        """Duplicates a sequence and its configured steps."""
        sequence = self.get_object()
        new_seq = Sequence.objects.create(
            name=f"{sequence.name} (Copy)",
            description=sequence.description,
            is_active=False,
            track_opens=sequence.track_opens,
            track_clicks=sequence.track_clicks,
            created_by=request.user,
            updated_by=request.user,
        )

        for step in sequence.steps.all():
            SequenceStep.objects.create(
                sequence=new_seq,
                step_number=step.step_number,
                action_type=step.action_type,
                delay=step.delay,
                delay_unit=step.delay_unit,
                configuration=step.configuration,
            )

        return Response(SequenceDetailSerializer(new_seq).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"], url_path="enroll")
    def enroll(self, request, pk=None):
        """Enrolls contacts into this sequence."""
        sequence = self.get_object()
        contact_ids = request.data.get("contact_ids", [])
        if not contact_ids:
            return Response({"detail": "contact_ids array is required."}, status=status.HTTP_400_BAD_REQUEST)

        company_id = request.data.get("company_id")
        deal_id = request.data.get("deal_id")

        try:
            enrollments = SequenceEngineService.enroll_contacts(
                sequence_id=sequence.id,
                contact_ids=contact_ids,
                user=request.user,
                company_id=company_id,
                deal_id=deal_id,
            )
        except (ValueError, Exception) as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)

        # Immediate engine check for zero-delay initial steps
        SequenceEngineService.process_due_executions()

        return Response(
            {"status": "success", "enrolled_count": len(enrollments)},
            status=status.HTTP_200_OK,
        )


class SequenceEnrollmentViewSet(CRMViewMixin, viewsets.ModelViewSet):
    """ViewSet for viewing and managing Sequence Enrollments."""
    queryset = SequenceEnrollment.objects.select_related("sequence", "contact", "company", "deal")
    serializer_class = SequenceEnrollmentSerializer
    filterset_fields = ["sequence", "status", "contact"]

    @action(detail=True, methods=["post"], url_path="pause")
    def pause(self, request, pk=None):
        enrollment = self.get_object()
        enrollment.status = EnrollmentStatus.PAUSED
        enrollment.save(update_fields=["status", "updated_at"])

        Activity.objects.create(
            activity_type=ActivityType.SEQUENCE_PAUSED,
            title=f"Sequence Paused",
            description=f"Sequence '{enrollment.sequence.name}' paused for {enrollment.contact.full_name}.",
            contact=enrollment.contact,
            company=enrollment.company,
            deal=enrollment.deal,
            performed_by=request.user,
            created_by=request.user,
        )
        return Response(SequenceEnrollmentSerializer(enrollment).data)

    @action(detail=True, methods=["post"], url_path="resume")
    def resume(self, request, pk=None):
        enrollment = self.get_object()
        enrollment.status = EnrollmentStatus.RUNNING if enrollment.next_execution_at <= timezone.now() else EnrollmentStatus.WAITING
        enrollment.save(update_fields=["status", "updated_at"])

        Activity.objects.create(
            activity_type=ActivityType.SEQUENCE_RESUMED,
            title=f"Sequence Resumed",
            description=f"Sequence '{enrollment.sequence.name}' resumed for {enrollment.contact.full_name}.",
            contact=enrollment.contact,
            company=enrollment.company,
            deal=enrollment.deal,
            performed_by=request.user,
            created_by=request.user,
        )
        return Response(SequenceEnrollmentSerializer(enrollment).data)

    @action(detail=True, methods=["post"], url_path="stop")
    def stop(self, request, pk=None):
        enrollment = self.get_object()
        reason = request.data.get("reason", "Sequence manually stopped")
        enrollment.status = EnrollmentStatus.STOPPED
        enrollment.stop_reason = reason
        enrollment.stopped_at = timezone.now()
        enrollment.next_execution_at = None
        enrollment.save(update_fields=["status", "stop_reason", "stopped_at", "next_execution_at", "updated_at"])

        # Delete any pending AI drafts for this stopped enrollment
        from apps.sequences.models import DraftStatus, SequenceEmailDraft
        SequenceEmailDraft.objects.filter(enrollment=enrollment, status=DraftStatus.DRAFT_PENDING).delete()

        Activity.objects.create(
            activity_type=ActivityType.SEQUENCE_STOPPED,
            title=f"Sequence Stopped: {reason}",
            description=f"Sequence '{enrollment.sequence.name}' manually stopped for {enrollment.contact.full_name}.",
            contact=enrollment.contact,
            company=enrollment.company,
            deal=enrollment.deal,
            performed_by=request.user,
            created_by=request.user,
        )
        return Response(SequenceEnrollmentSerializer(enrollment).data)


class ApprovalQueueViewSet(CRMViewMixin, viewsets.ReadOnlyModelViewSet):
    """ViewSet for sales rep approval queue of AI-generated sequence email drafts."""
    serializer_class = SequenceEmailDraftSerializer

    def get_queryset(self):
        return SequenceEmailDraft.objects.filter(
            status=DraftStatus.DRAFT_PENDING
        ).select_related("enrollment__sequence", "contact", "execution")

    @action(detail=True, methods=["post"], url_path="approve")
    def approve(self, request, pk=None):
        """Approves and sends the AI email draft."""
        draft = self.get_object()
        updated_subject = request.data.get("subject")
        updated_reply_to = request.data.get("reply_to")
        updated_body_html = request.data.get("body_html")
        updated_body_text = request.data.get("body_text")
        
        from apps.sequences.services.sequence_engine import get_public_base_url
        base_url = get_public_base_url(request)
        sent_draft = SequenceEngineService.approve_and_send_draft(
            draft=draft,
            user=request.user,
            updated_subject=updated_subject,
            updated_reply_to=updated_reply_to,
            updated_body_html=updated_body_html,
            updated_body_text=updated_body_text,
            base_url=base_url,
        )
        return Response(SequenceEmailDraftSerializer(sent_draft).data)

    @action(detail=True, methods=["post"], url_path="regenerate")
    def regenerate(self, request, pk=None):
        """Regenerates AI email draft using user prompt feedback."""
        draft = self.get_object()
        feedback = request.data.get("feedback", "")
        updated_draft = SequenceEngineService.regenerate_draft(draft, request.user, feedback)
        return Response(SequenceEmailDraftSerializer(updated_draft).data)

    @action(detail=True, methods=["post"], url_path="reject")
    def reject(self, request, pk=None):
        """Rejects draft and closes sequence enrollment or skips step."""
        draft = self.get_object()
        reason = request.data.get("reason", "")
        stop_enrollment = request.data.get("stop_enrollment", True)
        rejected_draft = SequenceEngineService.reject_draft(
            draft=draft,
            user=request.user,
            reason=reason,
            stop_enrollment=stop_enrollment
        )
        return Response(SequenceEmailDraftSerializer(rejected_draft).data)


class SequenceDashboardView(APIView):
    """API view for sequence performance dashboard metrics."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        seq_id = request.query_params.get("sequence_id")
        stats = SequenceAnalyticsService.get_dashboard_metrics(sequence_id=seq_id)
        return Response(stats)


class EmailOpenPixelView(APIView):
    """
    Public open tracking pixel endpoint.
    Returns 1x1 transparent GIF image and records email open telemetry.
    """
    permission_classes = [AllowAny]

    def get(self, request, tracking_token):
        now = timezone.now()
        try:
            draft = SequenceEmailDraft.objects.select_related(
                "contact", "enrollment__company", "enrollment__deal"
            ).filter(tracking_token=tracking_token).first()

            if draft:
                draft.open_count += 1
                if not draft.first_opened_at:
                    draft.first_opened_at = now
                draft.last_opened_at = now
                draft.save(update_fields=["open_count", "first_opened_at", "last_opened_at", "updated_at"])

                enrollment = draft.enrollment
                if enrollment:
                    enrollment.open_count += 1
                    enrollment.last_opened_at = now
                    enrollment.save(update_fields=["open_count", "last_opened_at", "updated_at"])

                    sequence = enrollment.sequence
                    if sequence and sequence.auto_task_on_open_enabled and enrollment.open_count >= sequence.auto_task_open_count:
                        from apps.tasks.models import Task
                        from apps.common.enums import TaskPriority, TaskType, TaskStatus
                        existing_task = Task.objects.filter(
                            contact=draft.contact,
                            sequence_execution_id__isnull=True,
                            description__icontains=str(enrollment.id),
                        ).exists()
                        if not existing_task:
                            assignee = sequence.created_by if sequence.task_assignment_strategy == "sequence_owner" else (enrollment.enrolled_by or sequence.created_by)
                            task_title = f"{draft.contact.full_name} opened sales sequence email more than {sequence.auto_task_open_count} times."
                            Task.objects.create(
                                title=task_title,
                                description=f"Automated sequence telemetry alert (Enrollment: {enrollment.id}): Contact {draft.contact.full_name} has opened sequence email '{draft.subject}' {enrollment.open_count} times.",
                                owner=assignee,
                                priority=TaskPriority.HIGH,
                                task_type=TaskType.CALL,
                                status=TaskStatus.PENDING,
                                contact=draft.contact,
                                company=enrollment.company or (draft.contact.company if (draft.contact and hasattr(draft.contact, "company")) else None),
                                deal=enrollment.deal,
                                created_by=draft.sender or assignee,
                                updated_by=draft.sender or assignee,
                            )

                logger.info("Open pixel recorded for draft %s (Contact: %s, Total opens: %d)", draft.id, draft.contact.full_name, draft.open_count)

                # Log Activity
                Activity.objects.create(
                    activity_type=ActivityType.SEQUENCE_EMAIL_OPENED,
                    title=f"Sequence Email Opened: {draft.contact.full_name}",
                    description=f"Opened email '{draft.subject}' (Total opens: {draft.open_count}).",
                    contact=draft.contact,
                    company=draft.enrollment.company if draft.enrollment else None,
                    deal=draft.enrollment.deal if draft.enrollment else None,
                    performed_by=draft.sender,
                    metadata={"draft_id": str(draft.id), "open_count": draft.open_count},
                    created_by=draft.sender,
                )
            else:
                from apps.emails.models import EmailMessage
                msg = EmailMessage.objects.select_related("thread__contact", "thread__company").filter(tracking_token=tracking_token).first()
                if msg:
                    msg.open_count += 1
                    msg.last_opened_at = now
                    msg.save(update_fields=["open_count", "last_opened_at", "updated_at"])

                    thread = msg.thread
                    if thread:
                        thread.open_count += 1
                        thread.last_opened_at = now
                        thread.save(update_fields=["open_count", "last_opened_at", "updated_at"])

                    logger.info("Open pixel recorded for contact email %s (Subject: %s, Total opens: %d)", msg.id, msg.subject, msg.open_count)

                    if thread.contact:
                        Activity.objects.create(
                            activity_type=ActivityType.EMAIL,
                            title=f"Contact Email Opened: {thread.contact.full_name}",
                            description=f"Opened email '{msg.subject}' (Total opens: {msg.open_count}).",
                            contact=thread.contact,
                            company=thread.company,
                            metadata={"message_id": str(msg.id), "open_count": msg.open_count},
                        )
        except Exception as e:
            logger.warning("Error processing open pixel for token %s: %s", tracking_token, e)

        return HttpResponse(TRANSPARENT_1X1_GIF, content_type="image/gif")


class StealthClickRedirectView(APIView):
    """
    Public stealth link click redirect endpoint (/r/<click_token>).
    Records click telemetry and redirects recipient to original destination URL (HTTP 302).
    """
    permission_classes = [AllowAny]

    def get(self, request, click_token):
        target_url = LinkTrackerService.handle_click(click_token)
        return HttpResponseRedirect(target_url)
