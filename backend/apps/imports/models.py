"""
Import models for Radar 36 CRM.
Handles CSV import jobs and individual record tracking.
"""

import uuid

from django.conf import settings
from django.db import models

from apps.common.enums import ImportEntityType, ImportRecordStatus, ImportStatus
from apps.common.models import BaseModel


class ImportJob(BaseModel):
    """
    Represents a CSV import session.
    Tracks overall progress, column mapping, and error summary.
    """

    file_name = models.CharField(max_length=255)
    entity_type = models.CharField(
        max_length=10,
        choices=ImportEntityType.choices,
    )
    status = models.CharField(
        max_length=15,
        choices=ImportStatus.choices,
        default=ImportStatus.PENDING,
        db_index=True,
    )
    total_rows = models.IntegerField(default=0)
    processed_rows = models.IntegerField(default=0)
    success_count = models.IntegerField(default=0)
    error_count = models.IntegerField(default=0)
    duplicate_count = models.IntegerField(default=0)
    column_mapping = models.JSONField(default=dict, blank=True)
    file_data = models.JSONField(default=list, blank=True)
    errors = models.JSONField(default=list, blank=True)
    started_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="import_jobs",
    )

    class Meta:
        db_table = "imports_import_job"
        verbose_name = "Import Job"
        verbose_name_plural = "Import Jobs"
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.file_name} ({self.status})"

    @property
    def progress_percent(self):
        if self.total_rows == 0:
            return 0
        return round((self.processed_rows / self.total_rows) * 100, 1)


class ImportRecord(models.Model):
    """
    Individual record within an import job.
    Tracks success/failure per row.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    import_job = models.ForeignKey(
        ImportJob,
        on_delete=models.CASCADE,
        related_name="records",
    )
    row_number = models.IntegerField()
    status = models.CharField(
        max_length=10,
        choices=ImportRecordStatus.choices,
    )
    raw_data = models.JSONField(default=dict)
    error_message = models.TextField(blank=True, default="")
    entity_id = models.UUIDField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "imports_import_record"
        verbose_name = "Import Record"
        verbose_name_plural = "Import Records"
        ordering = ["row_number"]

    def __str__(self):
        return f"Row {self.row_number}: {self.status}"
