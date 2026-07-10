"""
Branded HTML Email Service.
"""

import logging
from django.conf import settings
from django.core.mail import EmailMultiAlternatives
from django.utils.html import strip_tags
from apps.accounts.services.branding import BrandingService

logger = logging.getLogger(__name__)

EMAIL_TEMPLATE = """<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <style>
        body {{
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            background-color: #f8fafc;
            color: #1e293b;
            margin: 0;
            padding: 0;
        }}
        .container {{
            max-width: 600px;
            margin: 0 auto;
            padding: 40px 20px;
        }}
        .header {{
            text-align: center;
            margin-bottom: 30px;
        }}
        .logo {{
            max-height: 64px;
            margin-bottom: 12px;
        }}
        .org-name {{
            font-size: 22px;
            font-weight: 700;
            color: #0f172a;
        }}
        .card {{
            background-color: #ffffff;
            border-radius: 12px;
            padding: 32px;
            box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -2px rgba(0, 0, 0, 0.05);
            border: 1px solid #e2e8f0;
        }}
        h1 {{
            font-size: 22px;
            font-weight: 700;
            color: #0f172a;
            margin-top: 0;
            margin-bottom: 16px;
        }}
        p {{
            font-size: 16px;
            line-height: 24px;
            color: #475569;
            margin-top: 0;
            margin-bottom: 24px;
        }}
        .btn-wrapper {{
            text-align: center;
            margin: 32px 0 16px 0;
        }}
        .btn {{
            display: inline-block;
            background-color: #2563eb;
            color: #ffffff !important;
            text-decoration: none;
            padding: 14px 28px;
            font-weight: 600;
            border-radius: 8px;
            font-size: 16px;
            text-align: center;
        }}
        .footer {{
            text-align: center;
            margin-top: 30px;
            font-size: 13px;
            color: #94a3b8;
        }}
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            {logo_html}
            <div class="org-name">{org_name}</div>
        </div>
        <div class="card">
            <h1>{title}</h1>
            {content_html}
            {cta_html}
        </div>
        <div class="footer">
            Sent by {org_name} CRM.
        </div>
    </div>
</body>
</html>
"""

def send_branded_email(
    subject: str,
    title: str,
    content_html: str,
    recipient_list: list[str],
    cta_text: str | None = None,
    cta_url: str | None = None,
) -> bool:
    """
    Sends a beautifully branded HTML email to a list of recipients.
    Incorporates the custom organization name and logo.
    """
    try:
        # Fetch branding
        branding = BrandingService.get_branding_data()
        org_name = branding.get("organization_name")
        logo_url = branding.get("logo_url")
        
        # Build absolute URL for logo
        if logo_url:
            if not logo_url.startswith("http"):
                backend_url = getattr(settings, "BACKEND_URL", "http://localhost:8000").rstrip("/")
                logo_url = f"{backend_url}/{logo_url.lstrip('/')}"
            logo_html = f'<img class="logo" src="{logo_url}" alt="{org_name} Logo" />'
        else:
            logo_html = ""

        # Build CTA Button
        if cta_text and cta_url:
            cta_html = f'<div class="btn-wrapper"><a href="{cta_url}" class="btn" target="_blank">{cta_text}</a></div>'
        else:
            cta_html = ""

        # Render complete template
        html_content = EMAIL_TEMPLATE.format(
            logo_html=logo_html,
            org_name=org_name,
            title=title,
            content_html=content_html,
            cta_html=cta_html,
        )
        
        # Strip HTML for plaintext fallback
        text_content = strip_tags(html_content)
        
        # Check for custom SMTP connection
        settings_obj = BrandingService.get_settings()
        connection = None
        from_email = getattr(settings, "DEFAULT_FROM_EMAIL", "webmaster@localhost")
        
        if settings_obj.smtp_host:
            from django.core.mail import get_connection
            connection = get_connection(
                backend="django.core.mail.backends.smtp.EmailBackend",
                host=settings_obj.smtp_host,
                port=settings_obj.smtp_port,
                username=settings_obj.smtp_username,
                password=settings_obj.smtp_password_decrypted,
                use_tls=settings_obj.smtp_use_tls,
                use_ssl=settings_obj.smtp_use_ssl,
            )
            if settings_obj.smtp_from_email:
                from_email = settings_obj.smtp_from_email
        
        msg = EmailMultiAlternatives(
            subject=f"[{org_name}] {subject}",
            body=text_content,
            from_email=from_email,
            to=recipient_list,
            connection=connection,
        )
        msg.attach_alternative(html_content, "text/html")
        msg.send()
        
        logger.info("Branded email sent successfully to %s", recipient_list)
        return True
    except Exception as e:
        logger.error("Failed to send branded email: %s", str(e), exc_info=True)
        return False
