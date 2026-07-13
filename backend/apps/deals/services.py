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
        return deal

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
