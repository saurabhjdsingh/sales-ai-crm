"""
Production settings for Sales AI CRM.
"""

from .base import *  # noqa: F401, F403

DEBUG = False

# Security
SECURE_BROWSER_XSS_FILTER = True
SECURE_CONTENT_TYPE_NOSNIFF = True
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
SECURE_SSL_REDIRECT = config("SECURE_SSL_REDIRECT", default=True, cast=bool)  # noqa: F405
SECURE_HSTS_SECONDS = 31536000
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_HSTS_PRELOAD = True

# Sentry
SENTRY_DSN = config("SENTRY_DSN", default="")  # noqa: F405
if SENTRY_DSN:
    import sentry_sdk

    sentry_sdk.init(
        dsn=SENTRY_DSN,
        traces_sample_rate=0.1,
        profiles_sample_rate=0.1,
    )

import urllib.parse as urlparse

# ──────────────────────────────────────────────
# Database Override for Production Cloud DB
# ──────────────────────────────────────────────
DATABASE_URL = config("DATABASE_URL", default=None)  # noqa: F405
if DATABASE_URL:
    url = urlparse.urlparse(DATABASE_URL)
    # Extract connection options from query parameters
    query_params = urlparse.parse_qs(url.query)
    ssl_mode = query_params.get("sslmode", [None])[0] or config("DB_SSL_MODE", default=None)  # noqa: F405
    
    username = url.username
    password = url.password
    if username:
        username = urlparse.unquote(username)
    if password:
        password = urlparse.unquote(password)

    DATABASES["default"] = {  # noqa: F405
        "ENGINE": "django.db.backends.postgresql",
        "NAME": url.path[1:],
        "USER": username,
        "PASSWORD": password,
        "HOST": url.hostname,
        "PORT": url.port or 5432,
        "OPTIONS": {
            "connect_timeout": 5,
        }
    }
    if ssl_mode:
        DATABASES["default"]["OPTIONS"]["sslmode"] = ssl_mode  # noqa: F405
else:
    # If using individual DB variables but needing production SSL
    ssl_mode = config("DB_SSL_MODE", default=None)  # noqa: F405
    if ssl_mode:
        DATABASES["default"]["OPTIONS"]["sslmode"] = ssl_mode  # noqa: F405


# ──────────────────────────────────────────────
# AWS S3 Storage for Production Media
# ──────────────────────────────────────────────
AWS_ACCESS_KEY_ID = config("AWS_ACCESS_KEY_ID", default=None)  # noqa: F405
AWS_SECRET_ACCESS_KEY = config("AWS_SECRET_ACCESS_KEY", default=None)  # noqa: F405
AWS_STORAGE_BUCKET_NAME = config("AWS_STORAGE_BUCKET_NAME", default=None)  # noqa: F405
AWS_S3_REGION_NAME = config("AWS_S3_REGION_NAME", default=None)  # noqa: F405
AWS_S3_ENDPOINT_URL = config("AWS_S3_ENDPOINT_URL", default=None)  # noqa: F405
AWS_S3_CUSTOM_DOMAIN = config("AWS_S3_CUSTOM_DOMAIN", default=None)  # noqa: F405
AWS_QUERYSTRING_AUTH = config("AWS_QUERYSTRING_AUTH", default=True, cast=bool)  # noqa: F405

if AWS_STORAGE_BUCKET_NAME:
    STORAGES["default"] = {  # noqa: F405
        "BACKEND": "storages.backends.s3boto3.S3Boto3Storage",
    }
    # Optional: Align MEDIA_URL if custom domain is used, otherwise boto3 handles it automatically
    if AWS_S3_CUSTOM_DOMAIN:
        MEDIA_URL = f"https://{AWS_S3_CUSTOM_DOMAIN}/"  # noqa: F405

