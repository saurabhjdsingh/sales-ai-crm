"""
Service layer for activities.
"""

import logging
from uuid import UUID

from apps.activities.models import Activity
from apps.common.enums import ActivityType

logger = logging.getLogger(__name__)


class ActivityService:
    """Business logic for activity operations."""

    @staticmethod
    def log_activity(
        activity_type: str,
        title: str,
        user,
        company=None,
        contact=None,
        deal=None,
        description: str = "",
        metadata: dict = None,
    ) -> Activity:
        """
        Central method to log any activity in the system.
        All services call this to record timeline entries.
        """
        activity = Activity.objects.create(
            activity_type=activity_type,
            title=title,
            description=description,
            metadata=metadata or {},
            performed_by=user,
            company=company,
            contact=contact,
            deal=deal,
            created_by=user,
        )
        return activity

    @staticmethod
    def get_entity_timeline(
        company_id: UUID = None,
        contact_id: UUID = None,
        deal_id: UUID = None,
    ):
        """Get activity timeline for a specific entity, newest first."""
        qs = Activity.objects.select_related("performed_by")

        if company_id:
            qs = qs.filter(company_id=company_id)
        elif contact_id:
            qs = qs.filter(contact_id=contact_id)
        elif deal_id:
            qs = qs.filter(deal_id=deal_id)

        return qs.order_by("-created_at")

    @staticmethod
    def get_recent_activities(limit: int = 20):
        """Get most recent activities across all entities."""
        return (
            Activity.objects.select_related("performed_by", "company")
            .order_by("-created_at")[:limit]
        )
