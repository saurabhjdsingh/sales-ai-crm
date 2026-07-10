"""
Contact model for Radar 36 CRM.
Each contact belongs to exactly one company.
"""

from django.conf import settings
from django.db import models

from apps.common.enums import ContactStage
from apps.common.models import BaseModel


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
    country = models.CharField(max_length=100, blank=True, default="")

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
            models.Index(fields=["-created_at"]),
        ]

    def __str__(self):
        return f"{self.first_name} {self.last_name}"

    @property
    def full_name(self):
        return f"{self.first_name} {self.last_name}".strip()
