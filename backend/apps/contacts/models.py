"""
Contact model for Radar 36 CRM.
Each contact belongs to exactly one company.
"""

from django.conf import settings
from django.db import models

from apps.common.enums import ContactStage
from apps.common.models import BaseModel


class TimezoneSource(models.TextChoices):
    MANUAL = "MANUAL", "Manual"
    AUTOMATIC = "AUTOMATIC", "Automatic"
    DEFAULT = "DEFAULT", "Default"


class TimezoneConfidence(models.TextChoices):
    HIGH = "HIGH", "High"
    MEDIUM = "MEDIUM", "Medium"
    LOW = "LOW", "Low"
    UNKNOWN = "UNKNOWN", "Unknown"


class Contact(BaseModel):
    """
    Represents an individual contact/person at a company.
    Contacts are always associated with a company.
    """

    company = models.ForeignKey(
        "companies.Company",
        on_delete=models.CASCADE,
        related_name="contacts",
    )
    first_name = models.CharField(max_length=100)
    last_name = models.CharField(max_length=100)
    email = models.EmailField(blank=True, default="", db_index=True)
    phone = models.CharField(max_length=20, blank=True, default="")
    job_title = models.CharField(max_length=200, blank=True, default="")
    department = models.CharField(max_length=100, blank=True, default="")
    linkedin_url = models.URLField(max_length=500, blank=True, default="")
    apollo_id = models.CharField(
        max_length=100, blank=True, default="", unique=True, null=True
    )
    timezone = models.CharField(max_length=50, blank=True, default="")
    timezone_source = models.CharField(
        max_length=20,
        choices=TimezoneSource.choices,
        default=TimezoneSource.AUTOMATIC,
        help_text="How timezone was determined: MANUAL, AUTOMATIC, or DEFAULT",
    )
    timezone_confidence = models.CharField(
        max_length=20,
        choices=TimezoneConfidence.choices,
        default=TimezoneConfidence.UNKNOWN,
        help_text="Confidence level of resolved timezone",
    )
    country = models.CharField(max_length=100, blank=True, default="")
    city = models.CharField(max_length=100, blank=True, default="")
    state = models.CharField(max_length=100, blank=True, default="")
    lists = models.ManyToManyField(
        "prospect_lists.ProspectList",
        related_name="contacts",
        blank=True,
    )

    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="owned_contacts",
    )
    stage = models.CharField(
        max_length=20,
        choices=ContactStage.choices,
        default=ContactStage.COLD,
        db_index=True,
    )

    # AI-generated fields
    ai_summary = models.TextField(blank=True, default="")

    class Meta:
        db_table = "contacts_contact"
        verbose_name = "Contact"
        verbose_name_plural = "Contacts"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["company", "last_name"]),
            models.Index(fields=["email"]),
            models.Index(fields=["stage", "owner"]),
            models.Index(fields=["country"]),
            models.Index(fields=["-created_at"]),
        ]

    def __str__(self):
        return f"{self.first_name} {self.last_name}"

    @property
    def full_name(self):
        return f"{self.first_name} {self.last_name}".strip()

    def save(self, *args, **kwargs):
        """Auto-resolve timezone from location data unless manually set."""
        # Only auto-resolve if not manually set
        if self.timezone_source != TimezoneSource.MANUAL:
            from apps.common.services.timezone_resolver import TimezoneResolverService
            TimezoneResolverService.resolve_and_update_contact(self)
        super().save(*args, **kwargs)
