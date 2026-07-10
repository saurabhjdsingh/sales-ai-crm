"""
Deal and DealContact models for Radar 36 CRM.
Deals belong to one company and can have multiple contacts via bridge table.
"""

import uuid

from django.conf import settings
from django.db import models

from apps.common.enums import DealContactRole, DealPriority, DealRisk, DealStage
from apps.common.models import BaseModel
from apps.common.validators import validate_probability


class Deal(BaseModel):
    """
    Represents a sales deal/opportunity.
    Always belongs to a company. Has contacts via DealContact bridge.
    """

    name = models.CharField(max_length=255)
    company = models.ForeignKey(
        "companies.Company",
        on_delete=models.CASCADE,
        related_name="deals",
    )
    contacts = models.ManyToManyField(
        "contacts.Contact",
        through="DealContact",
        related_name="deals",
        blank=True,
    )
    expected_revenue = models.DecimalField(
        max_digits=12, decimal_places=2, null=True, blank=True
    )
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="owned_deals",
    )
    stage = models.CharField(
        max_length=20,
        choices=DealStage.choices,
        default=DealStage.LEAD,
        db_index=True,
    )
    priority = models.CharField(
        max_length=10,
        choices=DealPriority.choices,
        default=DealPriority.MEDIUM,
    )
    expected_close_date = models.DateField(null=True, blank=True)
    risk = models.CharField(
        max_length=10,
        choices=DealRisk.choices,
        default=DealRisk.MEDIUM,
    )
    probability = models.IntegerField(
        null=True,
        blank=True,
        validators=[validate_probability],
    )
    description = models.TextField(blank=True, default="")
    internal_notes = models.TextField(blank=True, default="")

    # AI-generated fields
    ai_analysis = models.TextField(blank=True, default="")

    class Meta:
        db_table = "deals_deal"
        verbose_name = "Deal"
        verbose_name_plural = "Deals"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["company", "stage"]),
            models.Index(fields=["stage", "owner"]),
            models.Index(fields=["expected_close_date"]),
            models.Index(fields=["priority"]),
            models.Index(fields=["-created_at"]),
        ]

    def __str__(self):
        return f"{self.name} ({self.company.name})"

    @property
    def is_open(self):
        return self.stage not in (DealStage.CLOSED_WON, DealStage.CLOSED_LOST)

    @property
    def is_won(self):
        return self.stage == DealStage.CLOSED_WON


class DealContact(models.Model):
    """
    Bridge table between Deals and Contacts.
    Tracks the role each contact plays in the deal.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    deal = models.ForeignKey(
        Deal,
        on_delete=models.CASCADE,
        related_name="deal_contacts",
    )
    contact = models.ForeignKey(
        "contacts.Contact",
        on_delete=models.CASCADE,
        related_name="deal_contacts",
    )
    role = models.CharField(
        max_length=20,
        choices=DealContactRole.choices,
        blank=True,
        default="",
    )
    is_primary = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "deals_deal_contact"
        verbose_name = "Deal Contact"
        verbose_name_plural = "Deal Contacts"
        constraints = [
            models.UniqueConstraint(
                fields=["deal", "contact"],
                name="unique_deal_contact",
            )
        ]

    def __str__(self):
        return f"{self.contact} on {self.deal}"
