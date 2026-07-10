"""
Report service — aggregation queries for CRM analytics.
"""

import logging
from datetime import timedelta

from django.db import models
from django.db.models import Avg, Count, Q, Sum
from django.utils import timezone

from apps.common.enums import DealStage, TaskStatus

logger = logging.getLogger(__name__)


class ReportService:
    """Generates report data from CRM aggregations."""

    @staticmethod
    def pipeline_report() -> dict:
        """Deals by stage with count and total revenue."""
        from apps.deals.models import Deal

        stages = (
            Deal.objects.values("stage")
            .annotate(
                count=Count("id"),
                total_revenue=Sum("expected_revenue"),
                avg_probability=Avg("probability"),
            )
            .order_by("stage")
        )

        return {
            "stages": [
                {
                    "stage": s["stage"],
                    "label": dict(DealStage.choices).get(s["stage"], s["stage"]),
                    "count": s["count"],
                    "total_revenue": float(s["total_revenue"] or 0),
                    "avg_probability": float(s["avg_probability"] or 0),
                }
                for s in stages
            ]
        }

    @staticmethod
    def revenue_forecast() -> dict:
        """Revenue forecast based on deal probability and expected revenue."""
        from apps.deals.models import Deal

        open_deals = Deal.objects.exclude(
            stage__in=[DealStage.CLOSED_WON, DealStage.CLOSED_LOST]
        )

        total_pipeline = open_deals.aggregate(total=Sum("expected_revenue"))["total"] or 0
        weighted_pipeline = sum(
            float(d.expected_revenue or 0) * (d.probability or 0) / 100
            for d in open_deals.all()
        )

        won_deals = Deal.objects.filter(stage=DealStage.CLOSED_WON)
        won_revenue = won_deals.aggregate(total=Sum("expected_revenue"))["total"] or 0

        closing_soon = open_deals.filter(
            expected_close_date__lte=timezone.now().date() + timedelta(days=30),
            expected_close_date__gte=timezone.now().date(),
        ).aggregate(
            count=Count("id"),
            total=Sum("expected_revenue"),
        )

        return {
            "total_pipeline": float(total_pipeline),
            "weighted_pipeline": round(weighted_pipeline, 2),
            "won_revenue": float(won_revenue),
            "closing_in_30_days": {
                "count": closing_soon["count"] or 0,
                "total": float(closing_soon["total"] or 0),
            },
        }

    @staticmethod
    def sales_performance() -> dict:
        """Performance metrics per sales rep."""
        from django.contrib.auth import get_user_model

        from apps.deals.models import Deal

        User = get_user_model()

        reps = User.objects.filter(is_active=True).annotate(
            total_deals=Count("owned_deals"),
            won_deals=Count(
                "owned_deals",
                filter=models.Q(owned_deals__stage=DealStage.CLOSED_WON),
            ),
            total_revenue=Sum(
                "owned_deals__expected_revenue",
                filter=models.Q(owned_deals__stage=DealStage.CLOSED_WON),
            ),
        )

        return {
            "reps": [
                {
                    "id": str(r.id),
                    "name": r.get_full_name(),
                    "total_deals": r.total_deals,
                    "won_deals": r.won_deals,
                    "conversion_rate": (
                        round((r.won_deals / r.total_deals) * 100, 1)
                        if r.total_deals > 0
                        else 0
                    ),
                    "total_revenue": float(r.total_revenue or 0),
                }
                for r in reps
                if r.total_deals > 0
            ]
        }

    @staticmethod
    def task_completion() -> dict:
        """Task completion statistics."""
        from apps.tasks.models import Task

        now = timezone.now()
        last_30_days = now - timedelta(days=30)

        total = Task.objects.filter(created_at__gte=last_30_days).count()
        completed = Task.objects.filter(
            status=TaskStatus.COMPLETED,
            completed_at__gte=last_30_days,
        ).count()
        overdue = Task.objects.filter(
            status__in=[TaskStatus.PENDING, TaskStatus.IN_PROGRESS],
            due_date__lt=now,
        ).count()

        return {
            "total_created_30d": total,
            "completed_30d": completed,
            "completion_rate": round((completed / total) * 100, 1) if total > 0 else 0,
            "overdue": overdue,
        }
