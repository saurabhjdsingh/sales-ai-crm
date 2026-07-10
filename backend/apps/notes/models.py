"""
Note model for Radar 36 CRM.
Rich text notes with markdown support, attached to companies, contacts, or deals.
"""

from django.db import models

from apps.common.models import BaseModel


class Note(BaseModel):
    """
    Markdown-formatted note that can be attached to a company, contact, or deal.
    """

    content = models.TextField()
    is_pinned = models.BooleanField(default=False)

    company = models.ForeignKey(
        "companies.Company",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="notes",
    )
    contact = models.ForeignKey(
        "contacts.Contact",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="notes",
    )
    deal = models.ForeignKey(
        "deals.Deal",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="notes",
    )

    class Meta:
        db_table = "notes_note"
        verbose_name = "Note"
        verbose_name_plural = "Notes"
        ordering = ["-is_pinned", "-created_at"]
        indexes = [
            models.Index(fields=["company", "-created_at"]),
            models.Index(fields=["contact", "-created_at"]),
            models.Index(fields=["deal", "-created_at"]),
        ]

    def __str__(self):
        preview = self.content[:50] + "..." if len(self.content) > 50 else self.content
        return preview
