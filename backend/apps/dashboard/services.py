"""
Dashboard service — aggregates data for the main dashboard view.
"""

import logging
from datetime import timedelta

from django.db.models import Count, Q, Sum
from django.utils import timezone

from apps.common.enums import DealStage, TaskStatus

logger = logging.getLogger(__name__)


class DashboardService:
    """Aggregates dashboard data for the current user."""

    @staticmethod
    def get_dashboard_data(user) -> dict:
        """
        Returns all dashboard data in a single response to minimize HTTP calls.
        """
        now = timezone.now()
        today = timezone.localdate()

        return {
            "kpis": DashboardService._get_kpis(user),
            "today_tasks": DashboardService._get_today_tasks(user, today),
            "overdue_tasks": DashboardService._get_overdue_tasks(user, now),
            "deals_closing_soon": DashboardService._get_deals_closing_soon(user, today),
            "recent_activities": DashboardService._get_recent_activities(),
            "pipeline_summary": DashboardService._get_pipeline_summary(),
            "top_prospects": DashboardService._get_top_prospects(),
        }

    @staticmethod
    def _get_kpis(user) -> dict:
        from apps.companies.models import Company
        from apps.contacts.models import Contact
        from apps.deals.models import Deal
        from apps.tasks.models import Task

        now = timezone.now()
        month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

        open_deals = Deal.objects.exclude(stage__in=[DealStage.CLOSED_WON, DealStage.CLOSED_LOST])

        return {
            "total_companies": Company.objects.count(),
            "total_contacts": Contact.objects.count(),
            "total_deals": Deal.objects.count(),
            "open_deals": open_deals.count(),
            "pipeline_value": float(open_deals.aggregate(total=Sum("expected_revenue"))["total"] or 0),
            "won_this_month": Deal.objects.filter(
                stage=DealStage.CLOSED_WON,
                updated_at__gte=month_start,
            ).count(),
            "tasks_pending": Task.objects.filter(
                owner=user,
                status__in=[TaskStatus.PENDING, TaskStatus.IN_PROGRESS],
            ).count(),
            "companies_added_this_month": Company.objects.filter(
                created_at__gte=month_start,
            ).count(),
        }

    @staticmethod
    def _get_today_tasks(user, today) -> list:
        from apps.tasks.models import Task

        tasks = (
            Task.objects.filter(
                owner=user,
                status__in=[TaskStatus.PENDING, TaskStatus.IN_PROGRESS],
                due_date__date=today,
            )
            .select_related("company", "contact", "deal")
            .order_by("due_date")[:10]
        )

        return [
            {
                "id": str(t.id),
                "title": t.title,
                "task_type": t.task_type,
                "priority": t.priority,
                "due_date": t.due_date.isoformat() if t.due_date else None,
                "entity": t.company.name if t.company else (t.contact.full_name if t.contact else None),
            }
            for t in tasks
        ]

    @staticmethod
    def _get_overdue_tasks(user, now) -> list:
        from apps.tasks.models import Task

        tasks = (
            Task.objects.filter(
                owner=user,
                status__in=[TaskStatus.PENDING, TaskStatus.IN_PROGRESS],
                due_date__lt=now,
            )
            .select_related("company")
            .order_by("due_date")[:5]
        )

        return [
            {
                "id": str(t.id),
                "title": t.title,
                "due_date": t.due_date.isoformat() if t.due_date else None,
                "days_overdue": (now - t.due_date).days if t.due_date else 0,
            }
            for t in tasks
        ]

    @staticmethod
    def _get_deals_closing_soon(user, today) -> list:
        from apps.deals.models import Deal

        deals = (
            Deal.objects.filter(
                expected_close_date__gte=today,
                expected_close_date__lte=today + timedelta(days=14),
            )
            .exclude(stage__in=[DealStage.CLOSED_WON, DealStage.CLOSED_LOST])
            .select_related("company", "owner")
            .order_by("expected_close_date")[:10]
        )

        return [
            {
                "id": str(d.id),
                "name": d.name,
                "company": d.company.name,
                "stage": d.stage,
                "expected_revenue": float(d.expected_revenue or 0),
                "expected_close_date": d.expected_close_date.isoformat() if d.expected_close_date else None,
                "owner": d.owner.get_full_name() if d.owner else None,
            }
            for d in deals
        ]

    @staticmethod
    def _get_recent_activities() -> list:
        from apps.activities.models import Activity

        activities = (
            Activity.objects.select_related("performed_by", "company")
            .order_by("-created_at")[:15]
        )

        return [
            {
                "id": str(a.id),
                "type": a.activity_type,
                "title": a.title,
                "performed_by": a.performed_by.get_full_name() if a.performed_by else "System",
                "company": a.company.name if a.company else None,
                "created_at": a.created_at.isoformat(),
            }
            for a in activities
        ]

    @staticmethod
    def _get_pipeline_summary() -> list:
        from apps.deals.models import Deal

        active_stages = [
            DealStage.LEAD,
            DealStage.SALES_QUALIFIED,
            DealStage.MEETING_BOOKED,
            DealStage.NEGOTIATION,
            DealStage.POC,
            DealStage.CONTRACT_SENT,
        ]

        summary = (
            Deal.objects.filter(stage__in=active_stages)
            .values("stage")
            .annotate(
                count=Count("id"),
                total=Sum("expected_revenue"),
            )
            .order_by("stage")
        )

        return [
            {
                "stage": s["stage"],
                "label": dict(DealStage.choices).get(s["stage"], s["stage"]),
                "count": s["count"],
                "total": float(s["total"] or 0),
            }
            for s in summary
        ]

    @staticmethod
    def _get_top_prospects() -> list:
        from apps.companies.models import Company

        companies = (
            Company.objects.filter(
                icp_score__isnull=False,
                icp_score__gte=70,
            )
            .order_by("-icp_score")[:5]
        )

        return [
            {
                "id": str(c.id),
                "name": c.name,
                "industry": c.industry,
                "icp_score": c.icp_score,
                "stage": c.stage,
            }
            for c in companies
        ]
