"""
Organization branding service — logo processing and settings management.
"""

import io

from django.core.files.base import ContentFile
from PIL import Image

from apps.accounts.models import DEFAULT_ORGANIZATION_NAME, LOGO_OUTPUT_SIZE, OrganizationSettings

ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp"}
MAX_LOGO_UPLOAD_BYTES = 5 * 1024 * 1024


class BrandingService:
    """Manage global organization branding settings."""

    @staticmethod
    def get_settings() -> OrganizationSettings:
        return OrganizationSettings.get_solo()

    @staticmethod
    def get_branding_data(request=None) -> dict:
        settings_obj = BrandingService.get_settings()
        logo_url = None
        if settings_obj.logo:
            if request is not None:
                logo_url = request.build_absolute_uri(settings_obj.logo.url)
            else:
                logo_url = settings_obj.logo.url

        return {
            "organization_name": settings_obj.organization_name or DEFAULT_ORGANIZATION_NAME,
            "logo_url": logo_url,
            "has_logo": bool(settings_obj.logo),
            "smtp_host": settings_obj.smtp_host,
            "smtp_port": settings_obj.smtp_port,
            "smtp_username": settings_obj.smtp_username,
            "smtp_use_tls": settings_obj.smtp_use_tls,
            "smtp_use_ssl": settings_obj.smtp_use_ssl,
            "smtp_from_email": settings_obj.smtp_from_email,
            "smtp_has_password": bool(settings_obj.smtp_password),
        }

    @staticmethod
    def update_branding(
        user,
        organization_name: str | None = None,
        logo_file=None,
        remove_logo: bool = False,
        smtp_host: str | None = None,
        smtp_port: int | None = None,
        smtp_username: str | None = None,
        smtp_password: str | None = None,
        smtp_use_tls: bool | None = None,
        smtp_use_ssl: bool | None = None,
        smtp_from_email: str | None = None,
    ) -> OrganizationSettings:
        settings_obj = BrandingService.get_settings()

        if organization_name is not None:
            name = organization_name.strip()
            if not name:
                raise ValueError("Organization name cannot be empty.")
            settings_obj.organization_name = name

        if remove_logo and settings_obj.logo:
            settings_obj.logo.delete(save=False)
            settings_obj.logo = None

        if logo_file is not None:
            BrandingService._validate_logo_file(logo_file)
            processed = BrandingService._process_logo(logo_file)
            if settings_obj.logo:
                settings_obj.logo.delete(save=False)
            settings_obj.logo.save("logo.png", processed, save=False)

        # Test SMTP connection if settings are being updated and host is not empty
        smtp_updated = any(x is not None for x in [
            smtp_host, smtp_port, smtp_username, smtp_password, smtp_use_tls, smtp_use_ssl
        ])
        if smtp_updated:
            test_host = smtp_host.strip() if smtp_host is not None else settings_obj.smtp_host
            if test_host:
                test_port = smtp_port if smtp_port is not None else settings_obj.smtp_port
                test_username = smtp_username.strip() if smtp_username is not None else settings_obj.smtp_username
                
                if smtp_password is not None:
                    test_password = smtp_password.strip()
                else:
                    test_password = settings_obj.smtp_password_decrypted
                
                test_use_tls = smtp_use_tls if smtp_use_tls is not None else settings_obj.smtp_use_tls
                test_use_ssl = smtp_use_ssl if smtp_use_ssl is not None else settings_obj.smtp_use_ssl
                
                from apps.common.email import test_smtp_connection
                try:
                    test_smtp_connection(
                        host=test_host,
                        port=test_port,
                        username=test_username,
                        password=test_password,
                        use_tls=test_use_tls,
                        use_ssl=test_use_ssl,
                    )
                except Exception as e:
                    raise ValueError(f"SMTP connection test failed: {str(e)}")

        # Update SMTP details
        if smtp_host is not None:
            settings_obj.smtp_host = smtp_host.strip()
            # If smtp_host is empty, clear out credentials/from_email
            if not settings_obj.smtp_host:
                settings_obj.smtp_username = ""
                settings_obj.smtp_password = ""
                settings_obj.smtp_from_email = ""
                settings_obj.smtp_port = 587
                settings_obj.smtp_use_tls = True
                settings_obj.smtp_use_ssl = False

        if settings_obj.smtp_host:
            if smtp_port is not None:
                settings_obj.smtp_port = smtp_port
            if smtp_username is not None:
                settings_obj.smtp_username = smtp_username.strip()
            if smtp_password is not None:
                pw = smtp_password.strip()
                if pw:
                    settings_obj.smtp_password_decrypted = pw
            if smtp_use_tls is not None:
                settings_obj.smtp_use_tls = smtp_use_tls
            if smtp_use_ssl is not None:
                settings_obj.smtp_use_ssl = smtp_use_ssl
            if smtp_from_email is not None:
                settings_obj.smtp_from_email = smtp_from_email.strip()

        settings_obj.updated_by = user
        settings_obj.save()
        return settings_obj

    @staticmethod
    def _validate_logo_file(uploaded_file) -> None:
        content_type = getattr(uploaded_file, "content_type", "")
        if content_type and content_type not in ALLOWED_IMAGE_TYPES:
            raise ValueError("Logo must be a JPEG, PNG, or WebP image.")

        if uploaded_file.size > MAX_LOGO_UPLOAD_BYTES:
            raise ValueError("Logo file must be 5 MB or smaller.")

    @staticmethod
    def _process_logo(uploaded_file) -> ContentFile:
        """Resize the logo to fit within the square output size, preserving aspect ratio, centered on transparent background."""
        image = Image.open(uploaded_file)
        image = image.convert("RGBA")

        # Resize to fit within LOGO_OUTPUT_SIZE x LOGO_OUTPUT_SIZE preserving aspect ratio
        image.thumbnail((LOGO_OUTPUT_SIZE, LOGO_OUTPUT_SIZE), Image.Resampling.LANCZOS)

        # Create a new transparent square image
        new_image = Image.new("RGBA", (LOGO_OUTPUT_SIZE, LOGO_OUTPUT_SIZE), (0, 0, 0, 0))
        
        # Center the resized image on the transparent background
        x = (LOGO_OUTPUT_SIZE - image.width) // 2
        y = (LOGO_OUTPUT_SIZE - image.height) // 2
        new_image.paste(image, (x, y))

        buffer = io.BytesIO()
        new_image.save(buffer, format="PNG", optimize=True)
        buffer.seek(0)
        return ContentFile(buffer.read(), name="logo.png")
