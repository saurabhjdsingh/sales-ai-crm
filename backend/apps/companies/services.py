"""
Service layer for company operations.
Handles business logic, stage transitions, and activity logging.
"""

import logging
from uuid import UUID

from django.db import transaction
from django.db.models import Count, QuerySet

from apps.common.enums import ActivityType, CompanyStage
from apps.common.exceptions import EntityNotFoundException
from apps.companies.models import Company

logger = logging.getLogger(__name__)


class CompanyService:
    """
    Business logic for company operations.
    Views delegate to this service — no business logic in views.
    """

    @staticmethod
    def get_company(company_id: UUID) -> Company:
        """Retrieve a single company by ID."""
        try:
            return (
                Company.objects.select_related("owner", "created_by")
                .annotate(
                    contact_count=Count("contacts", distinct=True),
                    deal_count=Count("deals", distinct=True),
                )
                .get(id=company_id)
            )
        except Company.DoesNotExist:
            raise EntityNotFoundException(f"Company with id {company_id} not found.")

    @staticmethod
    def get_companies_queryset() -> QuerySet:
        """
        Return an annotated queryset for the company list view.
        Annotations are computed at the database level for performance.
        """
        return Company.objects.select_related("owner").annotate(
            contact_count=Count("contacts", distinct=True),
            deal_count=Count("deals", distinct=True),
        )

    @staticmethod
    @transaction.atomic
    def create_company(data: dict, user) -> Company:
        """Create a new company and log the activity."""
        company = Company.objects.create(
            **data,
            created_by=user,
            updated_by=user,
        )
        # Log activity
        CompanyService._log_activity(
            company=company,
            activity_type=ActivityType.IMPORT,
            title=f"Company created: {company.name}",
            user=user,
        )
        logger.info("Company created: %s by %s", company.name, user.email)
        return company

    @staticmethod
    @transaction.atomic
    def update_company(company: Company, data: dict, user) -> Company:
        """Update a company and log stage changes."""
        old_stage = company.stage
        for key, value in data.items():
            setattr(company, key, value)
        company.updated_by = user
        company.save()

        # Log stage change as a separate activity
        if "stage" in data and old_stage != company.stage:
            CompanyService._log_activity(
                company=company,
                activity_type=ActivityType.STAGE_CHANGED,
                title=f"company stage is changed from {old_stage} -> {company.stage}",
                user=user,
                metadata={
                    "old_stage": old_stage,
                    "new_stage": company.stage,
                },
            )

        return company

    @staticmethod
    def _log_activity(company, activity_type, title, user, metadata=None):
        """Helper to log an activity for a company."""
        from apps.activities.models import Activity

        Activity.objects.create(
            activity_type=activity_type,
            title=title,
            company=company,
            performed_by=user,
            metadata=metadata or {},
            created_by=user,
        )
