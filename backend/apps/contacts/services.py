"""
Service layer for contact operations.
"""

import logging
from uuid import UUID

from django.db import transaction

from apps.common.enums import ActivityType
from apps.common.exceptions import EntityNotFoundException
from apps.contacts.models import Contact

logger = logging.getLogger(__name__)


class ContactService:
    """Business logic for contact operations."""

    @staticmethod
    def get_contact(contact_id: UUID) -> Contact:
        try:
            return Contact.objects.select_related("company", "owner").prefetch_related("lists").get(id=contact_id)
        except Contact.DoesNotExist:
            raise EntityNotFoundException(f"Contact with id {contact_id} not found.")

    @staticmethod
    def get_contacts_queryset():
        from django.db.models import ExpressionWrapper, BooleanField, Q
        return Contact.objects.select_related("company", "owner").prefetch_related(
            "lists",
            "sequence_enrollments__sequence",
            "sequence_enrollments__executions",
        ).annotate(
            has_email=ExpressionWrapper(~Q(email=None) & ~Q(email=""), output_field=BooleanField()),
            has_phone=ExpressionWrapper(~Q(phone=None) & ~Q(phone=""), output_field=BooleanField()),
        )

    @staticmethod
    @transaction.atomic
    def create_contact(data: dict, user) -> Contact:
        lists = data.pop("lists", None)
        contact = Contact.objects.create(**data, created_by=user, updated_by=user)
        if lists is not None:
            contact.lists.set(lists)

        ContactService._log_activity(
            contact=contact,
            activity_type=ActivityType.IMPORT,
            title=f"Contact created: {contact.full_name}",
            user=user,
        )
        # Apply automatic company stage rule if contact has a stage and a company
        ContactService.sync_company_stage_from_contact(contact, user)

        logger.info("Contact created: %s by %s", contact.full_name, user.email)
        return contact

    @staticmethod
    @transaction.atomic
    def update_contact(contact: Contact, data: dict, user) -> Contact:
        lists = data.pop("lists", None)
        if lists is not None:
            contact.lists.set(lists)

        old_stage = contact.stage
        for key, value in data.items():
            setattr(contact, key, value)
        contact.updated_by = user
        contact.save()

        if "stage" in data and old_stage != contact.stage:
            ContactService._log_activity(
                contact=contact,
                activity_type=ActivityType.STAGE_CHANGED,
                title=f"contact {contact.first_name} stage is changed from {old_stage} -> {contact.stage}",
                user=user,
                metadata={"old_stage": old_stage, "new_stage": contact.stage},
            )
            # Apply automatic company stage rule on update
            ContactService.sync_company_stage_from_contact(contact, user)

        return contact

    @staticmethod
    def sync_company_stage_from_contact(contact: Contact, user=None) -> None:
        """
        Synchronize the associated company's stage when a contact's stage is set or updated.
        Follows Option 1 (Safe Hierarchy):
        - 'approaching': transitions company to 'approaching' if currently cold/uncontacted/dead.
          Does not downgrade 'current_client' or 'active_opportunity'.
        - 'replied', 'follow_up', 'interested': transitions company to 'active_opportunity' (unless client).
        - 'won': transitions company to 'current_client'.
        - 'not_icp', 'not_interested', 'unresponsive': sets 'dead_opportunity' (unless client/active).
        - 'do_not_contact', 'bad_data', 'changed_job': sets 'do_not_prospect' (unless client/active).
        """
        if not contact or not contact.stage or not contact.company:
            return

        company = contact.company
        current_comp_stage = company.stage
        new_stage = contact.stage
        target_company_stage = None

        if new_stage == "approaching":
            if current_comp_stage in ["cold", "dead_opportunity", "do_not_prospect", ""]:
                target_company_stage = "approaching"
        elif new_stage in ["replied", "follow_up", "interested"]:
            if current_comp_stage != "current_client":
                target_company_stage = "active_opportunity"
        elif new_stage == "won":
            target_company_stage = "current_client"
        elif new_stage in ["not_icp", "not_interested", "unresponsive"]:
            if current_comp_stage not in ["current_client", "active_opportunity"]:
                target_company_stage = "dead_opportunity"
        elif new_stage in ["do_not_contact", "bad_data", "changed_job"]:
            if current_comp_stage not in ["current_client", "active_opportunity"]:
                target_company_stage = "do_not_prospect"

        if target_company_stage and target_company_stage != current_comp_stage:
            from apps.companies.services import CompanyService
            CompanyService.update_company(company, {"stage": target_company_stage}, user)

    @staticmethod
    def _log_activity(contact, activity_type, title, user, metadata=None):
        from apps.activities.models import Activity

        Activity.objects.create(
            activity_type=activity_type,
            title=title,
            contact=contact,
            company=contact.company,
            performed_by=user,
            metadata=metadata or {},
            created_by=user,
        )
