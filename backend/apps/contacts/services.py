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
            return Contact.objects.select_related("company", "owner").get(id=contact_id)
        except Contact.DoesNotExist:
            raise EntityNotFoundException(f"Contact with id {contact_id} not found.")

    @staticmethod
    def get_contacts_queryset():
        return Contact.objects.select_related("company", "owner")

    @staticmethod
    @transaction.atomic
    def create_contact(data: dict, user) -> Contact:
        contact = Contact.objects.create(**data, created_by=user, updated_by=user)
        ContactService._log_activity(
            contact=contact,
            activity_type=ActivityType.IMPORT,
            title=f"Contact created: {contact.full_name}",
            user=user,
        )
        # Apply automatic company stage rule if contact has a stage and a company
        if contact.stage and contact.company:
            new_stage = contact.stage
            company_stage = None
            if new_stage in ["replied", "follow_up", "interested"]:
                company_stage = "active_opportunity"
            elif new_stage == "won":
                company_stage = "current_client"
            elif new_stage in ["not_icp", "not_interested", "unresponsive"]:
                company_stage = "dead_opportunity"
            elif new_stage in ["do_not_contact", "bad_data", "changed_job"]:
                company_stage = "do_not_prospect"
                
            if company_stage:
                from apps.companies.services import CompanyService
                CompanyService.update_company(contact.company, {"stage": company_stage}, user)

        logger.info("Contact created: %s by %s", contact.full_name, user.email)
        return contact

    @staticmethod
    @transaction.atomic
    def update_contact(contact: Contact, data: dict, user) -> Contact:
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
            if contact.company:
                new_stage = contact.stage
                company_stage = None
                if new_stage in ["replied", "follow_up", "interested"]:
                    company_stage = "active_opportunity"
                elif new_stage == "won":
                    company_stage = "current_client"
                elif new_stage in ["not_icp", "not_interested", "unresponsive"]:
                    company_stage = "dead_opportunity"
                elif new_stage in ["do_not_contact", "bad_data", "changed_job"]:
                    company_stage = "do_not_prospect"
                    
                if company_stage:
                    from apps.companies.services import CompanyService
                    CompanyService.update_company(contact.company, {"stage": company_stage}, user)

        return contact

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
