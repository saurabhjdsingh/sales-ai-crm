"""
Encryption utilities for securely storing API keys.

Uses Fernet symmetric encryption derived from Django's SECRET_KEY.
API keys are encrypted before storing in the database and decrypted
only when needed to make LLM API calls.
"""

import base64
import hashlib
import logging

from django.conf import settings

logger = logging.getLogger(__name__)


def _get_fernet():
    """
    Create a Fernet instance using a key derived from DJANGO_SECRET_KEY.

    Uses SHA-256 to derive a consistent 32-byte key, then base64-encodes it
    as Fernet requires a URL-safe base64-encoded 32-byte key.
    """
    from cryptography.fernet import Fernet

    secret = settings.SECRET_KEY.encode()
    key = base64.urlsafe_b64encode(hashlib.sha256(secret).digest())
    return Fernet(key)


def encrypt_api_key(plain_key: str) -> str:
    """
    Encrypt an API key for secure database storage.

    Args:
        plain_key: The plaintext API key.

    Returns:
        Base64-encoded encrypted string.
    """
    if not plain_key:
        return ""
    fernet = _get_fernet()
    return fernet.encrypt(plain_key.encode()).decode()


def decrypt_api_key(encrypted_key: str) -> str:
    """
    Decrypt an API key retrieved from the database.

    Args:
        encrypted_key: The Fernet-encrypted API key string.

    Returns:
        The plaintext API key.
    """
    if not encrypted_key:
        return ""
    fernet = _get_fernet()
    return fernet.decrypt(encrypted_key.encode()).decode()


def mask_api_key(plain_key: str) -> str:
    """
    Create a masked display version of an API key.

    Shows the first 4 and last 4 characters with asterisks in between.
    Example: 'sk-proj-abc123...xyz789' -> 'sk-p****z789'
    """
    if not plain_key:
        return ""
    if len(plain_key) <= 8:
        return "*" * len(plain_key)
    return f"{plain_key[:4]}****{plain_key[-4:]}"
