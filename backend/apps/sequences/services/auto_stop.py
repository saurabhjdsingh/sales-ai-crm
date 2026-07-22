import logging
from django.utils import timezone
from apps.sequences.models import SequenceEnrollment, EnrollmentStatus
from apps.activities.models import Activity
from apps.common.enums import ActivityType

logger = logging.getLogger(__name__)


class AutoStopService:
    """
    Evaluates automatic stop rules for sequence enrollments:
    - Customer replies to an email
    - Contact stage changes to Not Interested / Do Not Contact
    - Deal stage changes to Closed Won / Closed Lost
    """

    @staticmethod
    def check_and_stop_for_reply(contact_id, message_details=None):
        """Immediately stop any active sequence for a contact when a reply is detected."""
        active_enrollments = SequenceEnrollment.objects.filter(
            contact_id=contact_id,
            status__in=[EnrollmentStatus.RUNNING, EnrollmentStatus.WAITING, EnrollmentStatus.WAITING_APPROVAL]
        )

        if not active_enrollments.exists():
            return

        now = timezone.now()
        for enrollment in active_enrollments:
            enrollment.status = EnrollmentStatus.STOPPED
            enrollment.stop_reason = "Customer Replied"
            enrollment.stopped_at = now
            enrollment.save(update_fields=["status", "stop_reason", "stopped_at", "updated_at"])

            # Log Activity
            Activity.objects.create(
                activity_type=ActivityType.SEQUENCE_STOPPED,
                title=f"Sequence Auto-Stopped: Customer Replied",
                description=f"Sequence '{enrollment.sequence.name}' for {enrollment.contact.full_name} stopped automatically due to incoming reply.",
                contact=enrollment.contact,
                company=enrollment.company,
                deal=enrollment.deal,
                metadata={"sequence_id": str(enrollment.sequence.id), "reason": "customer_replied"},
                created_by=enrollment.enrolled_by,
            )
            logger.info("Sequence %s auto-stopped for contact %s due to email reply.", enrollment.sequence.name, enrollment.contact.full_name)

    @staticmethod
    def check_and_stop_for_contact_stage(contact, new_stage: str):
        """Stop sequence if contact stage changes to Do Not Contact or Not Interested."""
        stop_stages = ["do_not_contact", "not_interested", "won", "not_icp", "bad_data"]
        if new_stage not in stop_stages:
            return

        active_enrollments = SequenceEnrollment.objects.filter(
            contact=contact,
            status__in=[EnrollmentStatus.RUNNING, EnrollmentStatus.WAITING, EnrollmentStatus.WAITING_APPROVAL]
        )

        if not active_enrollments.exists():
            return

        reason_map = {
            "do_not_contact": "Contact marked Do Not Contact",
            "not_interested": "Contact marked Not Interested",
            "won": "Contact marked Won",
            "not_icp": "Contact marked Not ICP",
            "bad_data": "Contact marked Bad Data",
        }
        reason = reason_map.get(new_stage, f"Contact stage updated to {new_stage}")
        now = timezone.now()

        for enrollment in active_enrollments:
            enrollment.status = EnrollmentStatus.STOPPED
            enrollment.stop_reason = reason
            enrollment.stopped_at = now
            enrollment.save(update_fields=["status", "stop_reason", "stopped_at", "updated_at"])

            Activity.objects.create(
                activity_type=ActivityType.SEQUENCE_STOPPED,
                title=f"Sequence Auto-Stopped: {reason}",
                description=f"Sequence '{enrollment.sequence.name}' stopped because contact stage changed to {new_stage}.",
                contact=contact,
                company=enrollment.company,
                deal=enrollment.deal,
                created_by=enrollment.enrolled_by,
            )
            logger.info("Sequence %s auto-stopped for contact %s: %s", enrollment.sequence.name, contact.full_name, reason)

    @staticmethod
    def check_and_stop_for_deal_stage(deal, new_stage: str):
        """Stop sequences linked to this deal if deal is Closed Won or Closed Lost."""
        stop_stages = ["closed_won", "closed_lost"]
        if new_stage not in stop_stages:
            return

        active_enrollments = SequenceEnrollment.objects.filter(
            deal=deal,
            status__in=[EnrollmentStatus.RUNNING, EnrollmentStatus.WAITING, EnrollmentStatus.WAITING_APPROVAL]
        )

        if not active_enrollments.exists():
            return

        reason = "Deal marked Closed Won" if new_stage == "closed_won" else "Deal marked Closed Lost"
        now = timezone.now()

        for enrollment in active_enrollments:
            enrollment.status = EnrollmentStatus.STOPPED
            enrollment.stop_reason = reason
            enrollment.stopped_at = now
            enrollment.save(update_fields=["status", "stop_reason", "stopped_at", "updated_at"])

            Activity.objects.create(
                activity_type=ActivityType.SEQUENCE_STOPPED,
                title=f"Sequence Auto-Stopped: {reason}",
                description=f"Sequence '{enrollment.sequence.name}' stopped because deal '{deal.name}' reached stage {new_stage}.",
                contact=enrollment.contact,
                company=enrollment.company,
                deal=deal,
                created_by=enrollment.enrolled_by,
            )
            logger.info("Sequence %s auto-stopped for deal %s: %s", enrollment.sequence.name, deal.name, reason)
