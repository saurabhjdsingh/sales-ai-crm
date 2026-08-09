"""
ProspectList model for Radar 36 CRM.
Allows Companies and Contacts to belong to segmented lists (e.g. Apollo imports, Founders, US Prospects).
"""

from django.db import models
from apps.common.models import BaseModel


class ProspectListSource(models.TextChoices):
    APOLLO = "APOLLO", "Apollo"
    MANUAL = "MANUAL", "Manual"
    IMPORT = "IMPORT", "Import"
    OTHER = "OTHER", "Other"


class ProspectList(BaseModel):
    """
    Represents a segmented list of target prospects (Companies and Contacts).
    """

    name = models.CharField(max_length=255)
    name_normalized = models.CharField(max_length=255, unique=True, db_index=True)
    description = models.TextField(blank=True, default="")
    source = models.CharField(
        max_length=20,
        choices=ProspectListSource.choices,
        default=ProspectListSource.MANUAL,
    )
    is_active = models.BooleanField(default=True, db_index=True)
    import_job = models.ForeignKey(
        "imports.ImportJob",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="prospect_lists",
    )

    class Meta:
        db_table = "prospect_lists_prospectlist"
        verbose_name = "Prospect List"
        verbose_name_plural = "Prospect Lists"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["name_normalized"]),
            models.Index(fields=["is_active"]),
            models.Index(fields=["-created_at"]),
        ]

    def __str__(self):
        return self.name

    def save(self, *args, **kwargs):
        if self.name:
            self.name = self.name.strip()
            self.name_normalized = self.name.lower()
        super().save(*args, **kwargs)

    @property
    def company_count(self) -> int:
        if hasattr(self, "_company_count"):
            return self._company_count
        return self.companies.filter(is_deleted=False).count()

    @company_count.setter
    def company_count(self, value: int):
        self._company_count = value

    @property
    def contact_count(self) -> int:
        if hasattr(self, "_contact_count"):
            return self._contact_count
        return self.contacts.filter(is_deleted=False).count()

    @contact_count.setter
    def contact_count(self, value: int):
        self._contact_count = value
