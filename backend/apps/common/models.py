"""
Base models for Radar 36 CRM.
Every model in the system inherits from BaseModel which provides:
- UUID primary key
- Audit fields (created_at, updated_at, created_by, updated_by)
- Soft delete (is_deleted, deleted_at)
- Soft-delete aware manager
"""

import uuid

from django.conf import settings
from django.db import models
from django.utils import timezone


class SoftDeleteManager(models.Manager):
    """Default manager that filters out soft-deleted records."""

    def get_queryset(self):
        return super().get_queryset().filter(is_deleted=False)


class AllObjectsManager(models.Manager):
    """Manager that includes soft-deleted records. Use for admin or cleanup tasks."""

    pass


class BaseModel(models.Model):
    """
    Abstract base model for all CRM entities.

    Provides UUID primary keys, audit trail, and soft delete.
    All querysets exclude soft-deleted records by default.
    Use `all_objects` manager to include deleted records.
    """

    id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        editable=False,
    )
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="%(class)s_created",
    )
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="%(class)s_updated",
    )
    is_deleted = models.BooleanField(default=False, db_index=True)
    deleted_at = models.DateTimeField(null=True, blank=True)

    objects = SoftDeleteManager()
    all_objects = AllObjectsManager()

    class Meta:
        abstract = True
        ordering = ["-created_at"]

    def soft_delete(self, user=None):
        """Mark record as deleted without removing from database."""
        self.is_deleted = True
        self.deleted_at = timezone.now()
        if user:
            self.updated_by = user
        self.save(update_fields=["is_deleted", "deleted_at", "updated_by", "updated_at"])

    def restore(self, user=None):
        """Restore a soft-deleted record."""
        self.is_deleted = False
        self.deleted_at = None
        if user:
            self.updated_by = user
        self.save(update_fields=["is_deleted", "deleted_at", "updated_by", "updated_at"])
