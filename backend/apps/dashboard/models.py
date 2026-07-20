"""
Models for the Dashboard app.

DailyProductivity stores a daily snapshot of a user's CRM activity counts.
Each row represents one user's productivity for one calendar date.
Counts represent *unique entities* worked on (not click counts).
"""

from django.conf import settings
from django.db import models

from apps.common.models import BaseModel


class DailyProductivity(BaseModel):
    """
    Daily snapshot of unique CRM entities a user worked on.

    One row per (user, date) pair. Updated throughout the day for today,
    frozen at end-of-day by a Celery beat task.

    The ``extra_metrics`` JSONField provides forward-compatible storage
    for future metric types (Meetings, LinkedIn Messages, Research Runs,
    AI Conversations, Documents, etc.) without requiring migrations.
    """

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="daily_productivity",
    )
    date = models.DateField(db_index=True)

    # Core CRM metrics — unique entities worked on that day
    companies_worked = models.PositiveIntegerField(default=0)
    contacts_worked = models.PositiveIntegerField(default=0)
    deals_worked = models.PositiveIntegerField(default=0)
    tasks_worked = models.PositiveIntegerField(default=0)
    activities_logged = models.PositiveIntegerField(default=0)
    notes_added = models.PositiveIntegerField(default=0)
    calls_completed = models.PositiveIntegerField(default=0)
    emails_imported = models.PositiveIntegerField(default=0)

    # Forward-compatible bucket for future metrics (no schema change needed)
    extra_metrics = models.JSONField(default=dict, blank=True)

    class Meta:
        db_table = "dashboard_daily_productivity"
        verbose_name = "Daily Productivity"
        verbose_name_plural = "Daily Productivities"
        ordering = ["-date"]
        constraints = [
            models.UniqueConstraint(
                fields=["user", "date"],
                name="unique_user_date_productivity",
            ),
        ]
        indexes = [
            models.Index(fields=["user", "-date"]),
        ]

    def __str__(self):
        return f"{self.user.get_full_name()} — {self.date}"

    @property
    def total_actions(self) -> int:
        """Sum of all core metrics for quick display."""
        return (
            self.companies_worked
            + self.contacts_worked
            + self.deals_worked
            + self.tasks_worked
            + self.activities_logged
            + self.notes_added
            + self.calls_completed
            + self.emails_imported
        )
