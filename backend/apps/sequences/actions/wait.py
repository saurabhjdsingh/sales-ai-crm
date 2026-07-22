import logging
from datetime import timedelta
from django.utils import timezone
from apps.sequences.actions.base import ActionResult, BaseActionHandler
from apps.sequences.models import DelayUnit, ExecutionStatus, EnrollmentStatus

logger = logging.getLogger(__name__)


class WaitActionHandler(BaseActionHandler):
    """
    Action Handler for Wait steps between actions.
    Computes delay duration and sets next_execution_at for the enrollment.
    """

    def execute(self, execution) -> ActionResult:
        enrollment = execution.enrollment
        step = execution.step

        delay = step.delay
        unit = step.delay_unit

        logger.info("Executing Wait step %d (%d %s) for enrollment %s", step.step_number, delay, unit, enrollment.id)

        now = timezone.now()
        if unit == DelayUnit.MINUTES:
            delta = timedelta(minutes=delay)
        elif unit == DelayUnit.HOURS:
            delta = timedelta(hours=delay)
        elif unit == DelayUnit.DAYS:
            delta = timedelta(days=delay)
        else:
            delta = timedelta(days=delay)

        next_exec = now + delta

        execution.status = ExecutionStatus.COMPLETED
        execution.executed_at = now
        execution.completed_at = now
        execution.save(update_fields=["status", "executed_at", "completed_at", "updated_at"])

        enrollment.status = EnrollmentStatus.WAITING
        enrollment.next_execution_at = next_exec
        enrollment.save(update_fields=["status", "next_execution_at", "updated_at"])

        return ActionResult(
            success=True,
            should_advance=True,
            status=ExecutionStatus.COMPLETED,
            message=f"Waiting for {delay} {unit} until {next_exec.strftime('%Y-%m-%d %H:%M:%S UTC')}.",
            next_execution_at=next_exec
        )

    def can_advance(self, execution) -> bool:
        return True
