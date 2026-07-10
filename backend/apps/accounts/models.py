"""
User model for Radar 36 CRM.
Extends Django's AbstractUser with UUID primary key, role-based access, and profile fields.
"""

import uuid

from django.contrib.auth.models import AbstractUser
from django.db import models

from apps.common.enums import UserRole


class User(AbstractUser):
    """
    Custom user model for the CRM.

    Uses UUID primary key and email as the unique identifier.
    Role field controls RBAC permissions across the system.
    """

    id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        editable=False,
    )
    email = models.EmailField(unique=True)
    role = models.CharField(
        max_length=20,
        choices=UserRole.choices,
        default=UserRole.SALES_REP,
        db_index=True,
    )
    status = models.CharField(
        max_length=20,
        choices=[
            ("active", "Active"),
            ("pending", "Pending"),
            ("inactive", "Inactive"),
        ],
        default="active",
        db_index=True,
    )
    phone = models.CharField(max_length=20, blank=True, default="")
    avatar_url = models.URLField(blank=True, default="")
    timezone = models.CharField(max_length=50, default="UTC")
    job_title = models.CharField(max_length=100, blank=True, default="")

    def save(self, *args, **kwargs):
        if self.is_superuser:
            self.role = UserRole.ADMIN
            self.status = "active"
        super().save(*args, **kwargs)

    # Use email as the login field
    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = ["username", "first_name", "last_name"]

    class Meta:
        db_table = "accounts_user"
        verbose_name = "User"
        verbose_name_plural = "Users"
        ordering = ["first_name", "last_name"]

    def __str__(self):
        return f"{self.get_full_name()} ({self.email})"

    def get_full_name(self):
        full_name = f"{self.first_name} {self.last_name}".strip()
        return full_name or self.email

    @property
    def is_admin(self):
        return self.role == UserRole.ADMIN

    @property
    def is_manager(self):
        return self.role == UserRole.MANAGER

    @property
    def is_sales_rep(self):
        return self.role == UserRole.SALES_REP


DEFAULT_ORGANIZATION_NAME = "Sales AI CRM"
LOGO_OUTPUT_SIZE = 256


class OrganizationSettings(models.Model):
    """
    Singleton global organization branding settings.
    Admin can customize logo and organization name for white-labeling.
    """

    id = models.PositiveSmallIntegerField(primary_key=True, default=1, editable=False)
    organization_name = models.CharField(max_length=100, default=DEFAULT_ORGANIZATION_NAME)
    logo = models.ImageField(upload_to="organization/", blank=True, null=True)
    
    # SMTP Integration
    smtp_host = models.CharField(max_length=255, blank=True, default="")
    smtp_port = models.IntegerField(default=587)
    smtp_username = models.CharField(max_length=255, blank=True, default="")
    smtp_password = models.CharField(max_length=512, blank=True, default="")
    smtp_use_tls = models.BooleanField(default=True)
    smtp_use_ssl = models.BooleanField(default=False)
    smtp_from_email = models.CharField(max_length=255, blank=True, default="")

    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.ForeignKey(
        "accounts.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="branding_updates",
    )

    @property
    def smtp_password_decrypted(self) -> str:
        from apps.common.encryption import decrypt_api_key
        return decrypt_api_key(self.smtp_password)

    @smtp_password_decrypted.setter
    def smtp_password_decrypted(self, value: str):
        from apps.common.encryption import encrypt_api_key
        self.smtp_password = encrypt_api_key(value)

    class Meta:
        db_table = "accounts_organization_settings"
        verbose_name = "Organization Settings"
        verbose_name_plural = "Organization Settings"

    def save(self, *args, **kwargs):
        self.pk = 1
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise NotImplementedError("Organization settings cannot be deleted.")

    @classmethod
    def get_solo(cls):
        obj, _ = cls.objects.get_or_create(
            pk=1,
            defaults={"organization_name": DEFAULT_ORGANIZATION_NAME},
        )
        return obj

    def __str__(self):
        return self.organization_name

