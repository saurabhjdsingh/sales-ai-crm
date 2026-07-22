import logging
from django.utils import timezone
from apps.sequences.models import SequenceEnrollment, EnrollmentStatus
from apps.activities.models import Activity
from apps.common.enums import ActivityType

logger = logging.getLogger(__name__)


class AutoStopService:
    """
    Evaluates per-sequence automatic stop rules for sequence enrollments:
    - Customer replies to an email (if auto_stop_on_reply enabled)
    - Contact stage changes to an auto-stop contact stage configured on the sequence
    - Deal stage changes to an auto-stop deal stage configured on the sequence
    """

    @staticmethod
    def check_and_stop_for_reply(contact_id, message_details=None):
        """Immediately stop any active sequence for a contact when a reply is detected."""
        active_enrollments = SequenceEnrollment.objects.select_related("sequence", "contact").filter(
            contact_id=contact_id,
            status__in=[EnrollmentStatus.RUNNING, EnrollmentStatus.WAITING, EnrollmentStatus.WAITING_APPROVAL]
        )

        now = timezone.now()
        for enrollment in active_enrollments:
            sequence = enrollment.sequence
            if sequence and not getattr(sequence, "auto_stop_on_reply", True):
                logger.info("Sequence %s has auto_stop_on_reply disabled, skipping reply auto-stop", sequence.name)
                continue

            enrollment.status = EnrollmentStatus.STOPPED
            enrollment.stop_reason = "Customer Replied"
            enrollment.stopped_at = now
            enrollment.save(update_fields=["status", "stop_reason", "stopped_at", "updated_at"])

            Activity.objects.create(
                activity_type=ActivityType.SEQUENCE_STOPPED,
                title="Sequence Auto-Stopped: Customer Replied",
                description=f"Sequence '{sequence.name}' for {enrollment.contact.full_name} stopped automatically due to incoming reply.",
                contact=enrollment.contact,
                company=enrollment.company,
                deal=enrollment.deal,
                metadata={"sequence_id": str(sequence.id), "reason": "customer_replied"},
                created_by=enrollment.enrolled_by,
            )
            logger.info("Sequence %s auto-stopped for contact %s due to email reply.", sequence.name, enrollment.contact.full_name)

    @staticmethod
    def check_and_stop_for_contact_stage(contact, new_stage: str):
        """Stop sequence if contact stage changes to a stage configured in sequence.auto_stop_contact_stages."""
        active_enrollments = SequenceEnrollment.objects.select_related("sequence", "contact").filter(
            contact=contact,
            status__in=[EnrollmentStatus.RUNNING, EnrollmentStatus.WAITING, EnrollmentStatus.WAITING_APPROVAL]
        )

        now = timezone.now()
        default_stages = ["do_not_contact", "not_interested", "won", "not_icp", "bad_data"]

        for enrollment in active_enrollments:
            sequence = enrollment.sequence
            configured_stages = getattr(sequence, "auto_stop_contact_stages", None) or default_stages
            if new_stage not in configured_stages:
                continue

            reason = f"Contact stage updated to {new_stage}"
            enrollment.status = EnrollmentStatus.STOPPED
            enrollment.stop_reason = reason
            enrollment.stopped_at = now
            enrollment.save(update_fields=["status", "stop_reason", "stopped_at", "updated_at"])

            Activity.objects.create(
                activity_type=ActivityType.SEQUENCE_STOPPED,
                title=f"Sequence Auto-Stopped: {reason}",
                description=f"Sequence '{sequence.name}' stopped because contact stage changed to '{new_stage}'.",
                contact=contact,
                company=enrollment.company,
                deal=enrollment.deal,
                created_by=enrollment.enrolled_by,
            )
            logger.info("Sequence %s auto-stopped for contact %s: %s", sequence.name, contact.full_name, reason)

    @staticmethod
    def check_and_stop_for_deal_stage(deal, new_stage: str):
        """Stop sequences linked to this deal if deal reaches a stage configured in sequence.auto_stop_deal_stages."""
        active_enrollments = SequenceEnrollment.objects.select_related("sequence", "contact").filter(
            deal=deal,
            status__in=[EnrollmentStatus.RUNNING, EnrollmentStatus.WAITING, EnrollmentStatus.WAITING_APPROVAL]
        )

        now = timezone.now()
        default_stages = ["closed_won", "closed_lost"]

        for enrollment in active_enrollments:
            sequence = enrollment.sequence
            configured_stages = getattr(sequence, "auto_stop_deal_stages", None) or default_stages
            if new_stage not in configured_stages:
                continue

            reason = f"Deal stage updated to {new_stage}"
            enrollment.status = EnrollmentStatus.STOPPED
            enrollment.stop_reason = reason
            enrollment.stopped_at = now
            enrollment.save(update_fields=["status", "stop_reason", "stopped_at", "updated_at"])

            Activity.objects.create(
                activity_type=ActivityType.SEQUENCE_STOPPED,
                title=f"Sequence Auto-Stopped: {reason}",
                description=f"Sequence '{sequence.name}' stopped because deal '{deal.name}' reached stage '{new_stage}'.",
                contact=enrollment.contact,
                company=enrollment.company,
                deal=deal,
                created_by=enrollment.enrolled_by,
            )
            logger.info("Sequence %s auto-stopped for deal %s: %s", sequence.name, deal.name, reason)

    @staticmethod
    def check_and_stop_single_enrollment(enrollment: SequenceEnrollment) -> bool:
        """
        Evaluates whether a single enrollment should be stopped based on contact stage or deal stage.
        If auto-stop criteria match, stops the enrollment immediately and creates an activity.
        Returns True if enrollment was stopped, False otherwise.
        """
        if not enrollment or enrollment.status in [EnrollmentStatus.STOPPED, EnrollmentStatus.COMPLETED]:
            return False

        sequence = enrollment.sequence
        if not sequence:
            return False

        contact = enrollment.contact
        if contact and contact.stage:
            default_stages = ["do_not_contact", "not_interested", "won", "not_icp", "bad_data"]
            configured_contact_stages = getattr(sequence, "auto_stop_contact_stages", None) or default_stages
            if contact.stage in configured_contact_stages:
                reason = f"Contact stage is {contact.stage}"
                enrollment.status = EnrollmentStatus.STOPPED
                enrollment.stop_reason = reason
                enrollment.stopped_at = timezone.now()
                enrollment.save(update_fields=["status", "stop_reason", "stopped_at", "updated_at"])

                Activity.objects.create(
                    activity_type=ActivityType.SEQUENCE_STOPPED,
                    title=f"Sequence Auto-Stopped: {reason}",
                    description=f"Sequence '{sequence.name}' stopped because contact '{contact.full_name}' is in stage '{contact.stage}'.",
                    contact=contact,
                    company=enrollment.company,
                    deal=enrollment.deal,
                    created_by=enrollment.enrolled_by,
                )
                logger.info("Sequence %s auto-stopped for contact %s: %s", sequence.name, contact.full_name, reason)
                return True

        deal = enrollment.deal
        if deal and deal.stage:
            default_stages = ["closed_won", "closed_lost"]
            configured_deal_stages = getattr(sequence, "auto_stop_deal_stages", None) or default_stages
            if deal.stage in configured_deal_stages:
                reason = f"Deal stage is {deal.stage}"
                enrollment.status = EnrollmentStatus.STOPPED
                enrollment.stop_reason = reason
                enrollment.stopped_at = timezone.now()
                enrollment.save(update_fields=["status", "stop_reason", "stopped_at", "updated_at"])

                Activity.objects.create(
                    activity_type=ActivityType.SEQUENCE_STOPPED,
                    title=f"Sequence Auto-Stopped: {reason}",
                    description=f"Sequence '{sequence.name}' stopped because deal '{deal.name}' is in stage '{deal.stage}'.",
                    contact=enrollment.contact,
                    company=enrollment.company,
                    deal=deal,
                    created_by=enrollment.enrolled_by,
                )
                logger.info("Sequence %s auto-stopped for deal %s: %s", sequence.name, deal.name, reason)
                return True

        return False
