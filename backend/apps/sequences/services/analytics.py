import logging
from django.db.models import Avg, Count, F, Q
from django.utils import timezone
from apps.sequences.models import (
    Sequence,
    SequenceEnrollment,
    EnrollmentStatus,
    SequenceEmailDraft,
    DraftStatus,
    SequenceStepExecution,
    ExecutionStatus,
)

logger = logging.getLogger(__name__)


class SequenceAnalyticsService:
    """
    Computes real-time dashboard metrics and performance analytics across Sales Sequences.
    """

    @staticmethod
    def get_dashboard_metrics(sequence_id=None) -> dict:
        """
        Returns aggregated stats for sequence performance dashboard.
        """
        enrollments = SequenceEnrollment.objects.all()
        drafts = SequenceEmailDraft.objects.all()
        executions = SequenceStepExecution.objects.all()

        if sequence_id:
            enrollments = enrollments.filter(sequence_id=sequence_id)
            drafts = drafts.filter(enrollment__sequence_id=sequence_id)
            executions = executions.filter(enrollment__sequence_id=sequence_id)

        total_enrolled = enrollments.count()
        running_count = enrollments.filter(status=EnrollmentStatus.RUNNING).count()
        waiting_count = enrollments.filter(status=EnrollmentStatus.WAITING).count()
        approval_count = enrollments.filter(status=EnrollmentStatus.WAITING_APPROVAL).count()
        completed_count = enrollments.filter(status=EnrollmentStatus.COMPLETED).count()
        stopped_count = enrollments.filter(status=EnrollmentStatus.STOPPED).count()
        paused_count = enrollments.filter(status=EnrollmentStatus.PAUSED).count()

        # Reply statistics
        replied_count = enrollments.filter(
            Q(has_replied=True) |
            Q(stop_reason__icontains="replied") |
            Q(stop_reason__icontains="answered") |
            Q(stop_reason__icontains="meeting")
        ).count()
        reply_rate = round((replied_count / total_enrolled * 100), 1) if total_enrolled > 0 else 0.0

        # Completion rate
        completion_rate = round((completed_count / total_enrolled * 100), 1) if total_enrolled > 0 else 0.0

        # Email stats
        sent_drafts = drafts.filter(status=DraftStatus.SENT)
        emails_sent = sent_drafts.count()

        opened_drafts = sent_drafts.filter(open_count__gt=0).count()
        open_rate = round((opened_drafts / emails_sent * 100), 1) if emails_sent > 0 else 0.0

        clicked_drafts = sent_drafts.filter(click_count__gt=0).count()
        click_rate = round((clicked_drafts / emails_sent * 100), 1) if emails_sent > 0 else 0.0

        # Tasks completed
        tasks_completed = executions.filter(
            step__action_type="manual_task",
            status=ExecutionStatus.COMPLETED
        ).count()

        # Active sequences count
        active_sequences = Sequence.objects.filter(is_active=True).count()

        return {
            "active_sequences": active_sequences,
            "total_enrolled": total_enrolled,
            "running": running_count + waiting_count,
            "waiting_approval": approval_count,
            "completed": completed_count,
            "stopped": stopped_count,
            "paused": paused_count,
            "reply_rate": reply_rate,
            "open_rate": open_rate,
            "click_rate": click_rate,
            "completion_rate": completion_rate,
            "emails_sent": emails_sent,
            "tasks_completed": tasks_completed,
        }
