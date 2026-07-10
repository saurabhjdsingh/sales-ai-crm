"""
Company model for Radar 36 CRM.
Central entity that connects contacts, deals, activities, notes, and AI research.
"""

from django.conf import settings
from django.contrib.postgres.fields import ArrayField
from django.db import models

from apps.common.enums import CompanySize, CompanySource, CompanyStage
from apps.common.models import BaseModel
from apps.common.validators import validate_icp_score


class Company(BaseModel):
    """
    Represents a prospect or client company in the CRM.

    Companies are the top-level entity — contacts, deals, activities,
    and AI research all link back to a company.
    """

    name = models.CharField(max_length=255, db_index=True)
    website = models.URLField(max_length=500, blank=True, default="")
    industry = models.CharField(max_length=100, blank=True, default="")
    company_size = models.CharField(
        max_length=20,
        choices=CompanySize.choices,
        blank=True,
        default="",
    )
    country = models.CharField(max_length=100, blank=True, default="")
    linkedin_url = models.URLField(max_length=500, blank=True, default="")
    apollo_id = models.CharField(
        max_length=100, blank=True, unique=True, null=True
    )
    description = models.TextField(blank=True, default="")

    stage = models.CharField(
        max_length=30,
        choices=CompanyStage.choices,
        default=CompanyStage.COLD,
        db_index=True,
    )
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="owned_companies",
    )
    tags = ArrayField(
        models.CharField(max_length=50),
        blank=True,
        default=list,
    )
    source = models.CharField(
        max_length=20,
        choices=CompanySource.choices,
        blank=True,
        default="",
    )

    # AI-generated fields
    icp_score = models.IntegerField(
        null=True,
        blank=True,
        validators=[validate_icp_score],
        db_index=True,
    )
    icp_explanation = models.TextField(blank=True, default="")
    ai_summary = models.TextField(blank=True, default="")

    class Meta:
        db_table = "companies_company"
        verbose_name = "Company"
        verbose_name_plural = "Companies"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["name"]),
            models.Index(fields=["stage", "owner"]),
            models.Index(fields=["industry"]),
            models.Index(fields=["-icp_score"]),
            models.Index(fields=["-created_at"]),
        ]

    def __str__(self):
        return self.name

    @property
    def contact_count(self):
        if hasattr(self, "_contact_count"):
            return self._contact_count
        return self.contacts.count()

    @contact_count.setter
    def contact_count(self, value):
        self._contact_count = value

    @property
    def deal_count(self):
        if hasattr(self, "_deal_count"):
            return self._deal_count
        return self.deals.count()

    @deal_count.setter
    def deal_count(self, value):
        self._deal_count = value

    @property
    def open_deal_count(self):
        from apps.common.enums import DealStage

        return self.deals.exclude(
            stage__in=[DealStage.CLOSED_WON, DealStage.CLOSED_LOST]
        ).count()

    def save(self, *args, **kwargs):
        if self.company_size:
            self.company_size = self._normalize_company_size(self.company_size)
        super().save(*args, **kwargs)

    def _normalize_company_size(self, size_str: str) -> str:
        if not size_str:
            return ""
        size_str = size_str.strip()
        valid_ranges = ["1-10", "11-50", "51-100", "101-200", "201-500", "500+"]
        if size_str in valid_ranges:
            return size_str

        import re
        digits = re.findall(r"\d+", size_str)
        if not digits:
            return size_str

        try:
            val = int(digits[0])
            if val <= 10:
                return "1-10"
            elif val <= 50:
                return "11-50"
            elif val <= 100:
                return "51-100"
            elif val <= 200:
                return "101-200"
            elif val <= 500:
                return "201-500"
            else:
                return "500+"
        except ValueError:
            return size_str

    def delete(self, *args, **kwargs):
        """Perform hard deletion of the company and cascade-delete all related records."""
        # 1. Delete associated contacts, deals, tasks, and notes
        self.contacts.all().delete()
        self.deals.all().delete()
        self.tasks.all().delete()
        self.notes.all().delete()

        # 2. Hard-delete the company itself
        return super().delete(*args, **kwargs)
