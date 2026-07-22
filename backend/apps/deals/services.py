"""
Service layer for deal operations.
"""

import logging
from collections import defaultdict
from uuid import UUID

from django.db import transaction
from django.db.models import Count, Sum

from apps.common.enums import ActivityType, DealStage
from apps.common.exceptions import DuplicateEntityException, EntityNotFoundException
from apps.deals.models import Deal, DealContact

logger = logging.getLogger(__name__)


class DealService:
    """Business logic for deal operations."""

    @staticmethod
    def get_deal(deal_id: UUID) -> Deal:
        try:
            return Deal.objects.select_related("company", "owner").get(id=deal_id)
        except Deal.DoesNotExist:
            raise EntityNotFoundException(f"Deal with id {deal_id} not found.")

    @staticmethod
    def get_deals_queryset():
        return Deal.objects.select_related("company", "owner")

    @staticmethod
    @transaction.atomic
    def create_deal(data: dict, user) -> Deal:
        deal = Deal.objects.create(**data, created_by=user, updated_by=user)
        
        # Autolink all company members in the deal contacts as decision maker
        if deal.company:
            from apps.contacts.models import Contact
            company_contacts = Contact.objects.filter(company=deal.company, is_deleted=False)
            for contact in company_contacts:
                DealContact.objects.create(
                    deal=deal,
                    contact=contact,
                    role="decision_maker",
                    is_primary=False
                )

        DealService._log_activity(
            deal=deal,
            activity_type=ActivityType.STAGE_CHANGED,
            title=f"Deal created: {deal.name}",
            user=user,
        )
        logger.info("Deal created: %s by %s", deal.name, user.email)
        return deal

    @staticmethod
    @transaction.atomic
    def update_deal(deal: Deal, data: dict, user) -> Deal:
        old_stage = deal.stage
        for key, value in data.items():
            setattr(deal, key, value)
        deal.updated_by = user
        deal.save()

        if "stage" in data and old_stage != deal.stage:
            DealService._log_activity(
                deal=deal,
                activity_type=ActivityType.STAGE_CHANGED,
                title=f"Deal stage: {old_stage} → {deal.stage}",
                user=user,
                metadata={"old_stage": old_stage, "new_stage": deal.stage},
            )
            DealService._sync_contacts_stage_for_deal(deal, deal.stage, user)
        return deal

    @staticmethod
    def _sync_contacts_stage_for_deal(deal: Deal, new_deal_stage: str, user):
        from apps.common.enums import ContactStage
        from apps.contacts.models import Contact
        from apps.activities.models import Activity
        from apps.sequences.services.auto_stop import AutoStopService

        stage_map = {
            "closed_won": ContactStage.WON,
            "closed_lost": ContactStage.NOT_INTERESTED,
            "on_hold": ContactStage.ON_HOLD,
            "contract_sent": ContactStage.INTERESTED,
            "negotiation": ContactStage.INTERESTED,
            "poc": ContactStage.INTERESTED,
            "meeting_booked": ContactStage.FOLLOW_UP,
            "sales_qualified": ContactStage.INTERESTED,
            "lead": ContactStage.APPROACHING,
        }

        target_contact_stage = stage_map.get(new_deal_stage)
        if not target_contact_stage:
            return

        contact_ids = set()
        for dc in deal.deal_contacts.all():
            contact_ids.add(dc.contact_id)

        if not contact_ids:
            return

        contacts = Contact.objects.filter(id__in=contact_ids)
        for contact in contacts:
            if contact.stage != target_contact_stage:
                old_c_stage = contact.stage
                contact.stage = target_contact_stage
                contact.save(update_fields=["stage", "updated_at"])

                Activity.objects.create(
                    activity_type=ActivityType.STAGE_CHANGED,
                    title=f"Contact Stage Synced: {contact.full_name}",
                    description=f"Contact stage updated from '{old_c_stage}' to '{target_contact_stage}' because linked deal '{deal.name}' moved to '{new_deal_stage}'.",
                    contact=contact,
                    company=deal.company,
                    deal=deal,
                    performed_by=user,
                    metadata={"deal_id": str(deal.id), "old_stage": old_c_stage, "new_stage": target_contact_stage},
                    created_by=user,
                )

                AutoStopService.check_and_stop_for_contact_stage(contact, target_contact_stage)

        AutoStopService.check_and_stop_for_deal_stage(deal, new_deal_stage)

    @staticmethod
    @transaction.atomic
    def add_contact_to_deal(deal: Deal, contact_id: UUID, role: str, is_primary: bool, user) -> DealContact:
        if DealContact.objects.filter(deal=deal, contact_id=contact_id).exists():
            raise DuplicateEntityException("This contact is already added to this deal.")

        if is_primary:
            DealContact.objects.filter(deal=deal, is_primary=True).update(is_primary=False)

        deal_contact = DealContact.objects.create(
            deal=deal,
            contact_id=contact_id,
            role=role,
            is_primary=is_primary,
        )
        return deal_contact

    @staticmethod
    def remove_contact_from_deal(deal: Deal, contact_id: UUID):
        deleted, _ = DealContact.objects.filter(deal=deal, contact_id=contact_id).delete()
        if not deleted:
            raise EntityNotFoundException("Contact is not associated with this deal.")

    @staticmethod
    def get_pipeline():
        """
        Return deals grouped by stage for the pipeline view.
        Includes count and total revenue per stage.
        """
        deals = (
            Deal.objects.filter(
                is_deleted=False,
                stage__in=[
                    DealStage.LEAD,
                    DealStage.SALES_QUALIFIED,
                    DealStage.MEETING_BOOKED,
                    DealStage.NEGOTIATION,
                    DealStage.POC,
                    DealStage.CONTRACT_SENT,
                ]
            )
            .select_related("company", "owner")
            .order_by("stage", "-expected_revenue")
        )

        pipeline = defaultdict(list)
        for deal in deals:
            pipeline[deal.stage].append(deal)

        return dict(pipeline)

    @staticmethod
    def _log_activity(deal, activity_type, title, user, metadata=None):
        from apps.activities.models import Activity

        Activity.objects.create(
            activity_type=activity_type,
            title=title,
            deal=deal,
            company=deal.company,
            performed_by=user,
            metadata=metadata or {},
            created_by=user,
        )
