"""
Activity model for Radar 36 CRM.
Everything becomes an activity — the universal timeline entry.
"""

from django.conf import settings
from django.db import models

from apps.common.enums import ActivityType
from apps.common.models import BaseModel


class Activity(BaseModel):
    """
    Universal timeline entry. Every significant action in the CRM
    creates an activity record. Activities appear on company, contact,
    and deal detail pages as a timeline, sorted newest first.
    """

    activity_type = models.CharField(
        max_length=50,
        choices=ActivityType.choices,
        db_index=True,
    )
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True, default="")
    metadata = models.JSONField(default=dict, blank=True)

    performed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="activities",
    )

    # Polymorphic association to parent entities
    company = models.ForeignKey(
        "companies.Company",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="activities",
    )
    contact = models.ForeignKey(
        "contacts.Contact",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="activities",
    )
    deal = models.ForeignKey(
        "deals.Deal",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="activities",
    )

    class Meta:
        db_table = "activities_activity"
        verbose_name = "Activity"
        verbose_name_plural = "Activities"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["activity_type", "-created_at"]),
            models.Index(fields=["company", "-created_at"]),
            models.Index(fields=["contact", "-created_at"]),
            models.Index(fields=["deal", "-created_at"]),
        ]

    def __str__(self):
        return f"[{self.activity_type}] {self.title}"
