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
                title=f"Stage changed: {old_stage} → {contact.stage}",
                user=user,
                metadata={"old_stage": old_stage, "new_stage": contact.stage},
            )
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
