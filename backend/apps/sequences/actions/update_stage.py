import logging
from django.utils import timezone
from apps.sequences.actions.base import ActionResult, BaseActionHandler
from apps.sequences.models import ExecutionStatus
from apps.activities.models import Activity
from apps.common.enums import ActivityType, ContactStage

logger = logging.getLogger(__name__)


class UpdateStageActionHandler(BaseActionHandler):
    """
    Action Handler for Auto-updating Contact Stage inside a sequence step.
    Updates contact's stage to target_stage specified in step configuration.
    """

    def execute(self, execution) -> ActionResult:
        enrollment = execution.enrollment
        step = execution.step
        contact = enrollment.contact
        user = enrollment.enrolled_by or contact.owner

        if execution.status == ExecutionStatus.COMPLETED:
            logger.info("Update Stage step execution %s is already completed, advancing", execution.id)
            return ActionResult(should_advance=True)

        try:
            config = step.configuration or {}
            target_stage = config.get("target_stage")

            if not target_stage:
                logger.warning("No target_stage specified for step %s execution %s", step.id, execution.id)
                execution.status = ExecutionStatus.SKIPPED
                execution.error_message = "No target_stage configured"
                execution.completed_at = timezone.now()
                execution.save(update_fields=["status", "error_message", "completed_at", "updated_at"])
                return ActionResult(should_advance=True)

            old_stage = contact.stage
            if old_stage != target_stage:
                contact.stage = target_stage
                contact.save(update_fields=["stage", "updated_at"])
                logger.info("Contact %s stage updated from %s to %s via sequence step", contact.full_name, old_stage, target_stage)

                Activity.objects.create(
                    activity_type=ActivityType.STAGE_CHANGED,
                    title=f"Contact Stage Updated: {contact.full_name}",
                    description=f"Stage updated from '{old_stage}' to '{target_stage}' via Sequence '{enrollment.sequence.name}'.",
                    contact=contact,
                    company=enrollment.company,
                    deal=enrollment.deal,
                    performed_by=user,
                    metadata={
                        "old_stage": old_stage,
                        "new_stage": target_stage,
                        "sequence_id": str(enrollment.sequence.id),
                        "step_number": step.step_number,
                    },
                    created_by=user,
                )

                # Check if new stage triggers sequence auto-stop for other enrollments or this one
                from apps.sequences.services.auto_stop import AutoStopService
                AutoStopService.check_and_stop_for_contact_stage(contact, target_stage)

            now = timezone.now()
            execution.status = ExecutionStatus.COMPLETED
            execution.completed_at = now
            execution.save(update_fields=["status", "completed_at", "updated_at"])

            return ActionResult(
                success=True,
                should_advance=True,
                status=ExecutionStatus.COMPLETED,
                message=f"Contact stage updated to {target_stage}"
            )

        except Exception as e:
            logger.error("Error executing Update Stage step for execution %s: %s", execution.id, e, exc_info=True)
            execution.status = ExecutionStatus.FAILED
            execution.error_message = str(e)
            execution.save(update_fields=["status", "error_message", "updated_at"])

            return ActionResult(success=False, should_advance=False, status=ExecutionStatus.FAILED, message=str(e))

    def can_advance(self, execution) -> bool:
        return execution.status in [ExecutionStatus.COMPLETED, ExecutionStatus.SKIPPED]
