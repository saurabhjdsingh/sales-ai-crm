"""
ChatGPT Plan OAuth & SIWC (Sign in with ChatGPT) service.
Implements Open-Source Token Sharing (RFC 7636 PKCE S256 with Dynamic Agent Client).
"""

import base64
import hashlib
import logging
import os
import secrets
import uuid
from datetime import timedelta
import requests
from django.conf import settings
from django.core.cache import cache
from django.utils import timezone

logger = logging.getLogger(__name__)

AUTH_ENDPOINT = "https://auth.openai.com/api/accounts/authorize"
TOKEN_ENDPOINT = "https://auth.openai.com/api/accounts/oauth/token"
REVOKE_ENDPOINT = "https://auth.openai.com/api/accounts/oauth/revoke"
RESOURCE_URI = "https://api.openai.com/v1"
LOOPBACK_PORT = 1455
REDIRECT_URI = f"http://127.0.0.1:{LOOPBACK_PORT}/auth/callback"


def get_or_create_host_id() -> str:
    """
    Generates and persists a stable host ID (urn:uuid:...) per host/runtime.
    """
    host_file = os.path.expanduser("~/.config/radar36/host_id.txt")
    try:
        if os.path.exists(host_file):
            with open(host_file, "r") as f:
                content = f.read().strip()
                if content:
                    return content
    except Exception as e:
        logger.warning("Could not read host ID file (%s), generating in-memory ID", e)

    host_id = f"urn:uuid:{uuid.uuid4()}"
    try:
        os.makedirs(os.path.dirname(host_file), exist_ok=True)
        with open(host_file, "w") as f:
            f.write(host_id)
    except Exception as e:
        logger.warning("Could not write host ID file (%s)", e)

    return host_id


def generate_pkce_pair():
    """Generates PKCE code_verifier and code_challenge (S256)."""
    verifier = secrets.token_urlsafe(64)
    digest = hashlib.sha256(verifier.encode("utf-8")).digest()
    challenge = base64.urlsafe_b64encode(digest).decode("utf-8").rstrip("=")
    return verifier, challenge


class ChatGPTOAuthService:
    """Manages OpenAI SIWC OAuth lifecycle for ChatGPT plan token sharing."""

    @staticmethod
    def get_authorization_url(existing_session=None):
        verifier, challenge = generate_pkce_pair()
        state = secrets.token_urlsafe(32)
        nonce = secrets.token_urlsafe(32)
        host_id = get_or_create_host_id()

        # Cache transaction state for 15 minutes
        cache.set(f"chatgpt_auth_{state}", {
            "verifier": verifier,
            "nonce": nonce,
            "host_id": host_id
        }, timeout=900)

        params = {
            "response_type": "code",
            "redirect_uri": REDIRECT_URI,
            "resource": RESOURCE_URI,
            "scope": "openid profile email offline_access resource.invoke chatgpt.tokens.use.direct",
            "state": state,
            "nonce": nonce,
            "code_challenge": challenge,
            "code_challenge_method": "S256",
            "ext_agent_host_id": host_id,
        }

        if existing_session and existing_session.client_id:
            # Reauthorization with existing dynamic client ID
            params["client_id"] = existing_session.client_id
            if existing_session.id_token:
                params["id_token_hint"] = existing_session.id_token
            if existing_session.chatgpt_email:
                params["login_hint"] = existing_session.chatgpt_email
        else:
            # First-time dynamic agent registration
            params["client_id"] = "dynamic_agent_client"
            params["agent_name_hint"] = "Radar 36 Sales CRM"

        req = requests.Request("GET", AUTH_ENDPOINT, params=params).prepare()
        return req.url, state

    @staticmethod
    def exchange_code(user, code: str, state: str, callback_client_id: str = None):
        cached = cache.get(f"chatgpt_auth_{state}")
        if not cached:
            raise ValueError("Invalid or expired OAuth state.")

        verifier = cached["verifier"]
        host_id = cached["host_id"]

        client_id_to_use = callback_client_id
        if not client_id_to_use:
            from apps.ai_engine.models import ChatGPTSession
            sess = ChatGPTSession.objects.filter(user=user).first()
            if sess:
                client_id_to_use = sess.client_id
            else:
                raise ValueError("Missing issued client_id from registration callback.")

        payload = {
            "grant_type": "authorization_code",
            "client_id": client_id_to_use,
            "code": code,
            "redirect_uri": REDIRECT_URI,
            "code_verifier": verifier,
            "resource": RESOURCE_URI,
        }

        resp = requests.post(TOKEN_ENDPOINT, data=payload, timeout=20)
        if not resp.ok:
            logger.error("OpenAI token exchange failed: %s", resp.text)
            raise RuntimeError(f"OpenAI token exchange failed: {resp.text}")

        data = resp.json()
        expires_in = data.get("expires_in", 3600)
        scopes = data.get("scope", "").split() if isinstance(data.get("scope"), str) else data.get("scope", [])
        id_token = data.get("id_token", "")

        from apps.ai_engine.models import ChatGPTSession
        session, _ = ChatGPTSession.objects.update_or_create(
            user=user,
            defaults={
                "client_id": client_id_to_use,
                "ext_agent_host_id": host_id,
                "access_token": data["access_token"],
                "refresh_token": data.get("refresh_token", ""),
                "id_token": id_token,
                "token_type": data.get("token_type", "Bearer"),
                "expires_at": timezone.now() + timedelta(seconds=expires_in),
                "scopes": scopes,
            }
        )
        return session

    @staticmethod
    def refresh_access_token(session):
        """
        Refreshes an expired access token using the stored refresh_token.
        Runs purely server-to-server without browser or loopback requirements.
        """
        if not session.refresh_token:
            raise ValueError("No refresh token available for session.")

        payload = {
            "grant_type": "refresh_token",
            "client_id": session.client_id,
            "refresh_token": session.refresh_token,
            "resource": RESOURCE_URI,
        }

        resp = requests.post(TOKEN_ENDPOINT, data=payload, timeout=20)
        if not resp.ok:
            logger.error("Failed to refresh ChatGPT token for %s: %s", session.user.email, resp.text)
            raise RuntimeError(f"Failed to refresh ChatGPT token: {resp.text}")

        data = resp.json()
        session.access_token = data["access_token"]
        if "refresh_token" in data and data["refresh_token"]:
            session.refresh_token = data["refresh_token"]
        expires_in = data.get("expires_in", 3600)
        session.expires_at = timezone.now() + timedelta(seconds=expires_in)
        session.save(update_fields=["access_token", "refresh_token", "expires_at", "updated_at"])
        logger.info("Successfully refreshed ChatGPT access token for %s", session.user.email)
        return session.access_token

    @staticmethod
    def revoke_session(session):
        """Revokes the renewable OAuth session with OpenAI and deletes local record."""
        if session.refresh_token:
            try:
                requests.post(
                    REVOKE_ENDPOINT,
                    data={
                        "token": session.refresh_token,
                        "token_type_hint": "refresh_token",
                        "client_id": session.client_id,
                    },
                    timeout=10,
                )
            except Exception as e:
                logger.warning("Remote token revocation encountered error: %s", e)

        session.delete()


def get_valid_chatgpt_token(user) -> str:
    """
    Returns an active Bearer access token for the user's ChatGPT plan.
    Auto-refreshes if within 5 minutes of expiration.
    """
    from apps.ai_engine.models import ChatGPTSession

    session = ChatGPTSession.objects.filter(user=user).first()
    if not session:
        raise PermissionError(f"User {getattr(user, 'email', user)} does not have a connected ChatGPT plan.")

    if not session.has_plan_usage:
        raise PermissionError("Connected ChatGPT plan did not grant direct plan usage permission ('chatgpt.tokens.use.direct').")

    # Refresh if expired or expiring within 5 minutes
    if timezone.now() >= (session.expires_at - timedelta(minutes=5)):
        return ChatGPTOAuthService.refresh_access_token(session)

    return session.access_token
