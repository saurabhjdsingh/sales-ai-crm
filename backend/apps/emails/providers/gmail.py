import base64
import logging
import re
from datetime import datetime, timezone
from typing import Any, Dict, List
from urllib.parse import urlencode

import httpx
from django.conf import settings

from apps.emails.providers.base import BaseEmailProvider

logger = logging.getLogger(__name__)


class GmailProvider(BaseEmailProvider):
    """
    Gmail API integration using official REST endpoints via httpx.
    """

    SCOPES = [
        "https://www.googleapis.com/auth/gmail.readonly",
        "https://www.googleapis.com/auth/userinfo.email",
    ]

    def _get_credentials(self) -> tuple[str, str]:
        # Try fetching from DB first
        try:
            from apps.emails.models import GoogleOauthConfig
            config_obj = GoogleOauthConfig.objects.first()
            if config_obj and config_obj.client_id and config_obj.client_secret_encrypted:
                return config_obj.client_id, config_obj.get_client_secret()
        except Exception as e:
            logger.error(f"Error reading GoogleOauthConfig from DB: {e}")

        # Fallback to settings
        client_id = getattr(settings, "GOOGLE_OAUTH_CLIENT_ID", None)
        client_secret = getattr(settings, "GOOGLE_OAUTH_CLIENT_SECRET", None)
        if not client_id or not client_secret:
            raise ValueError(
                "Google OAuth is not configured. Please set the Client ID and Secret in settings page."
            )
        return client_id, client_secret

    def get_auth_url(self, state: str, redirect_uri: str) -> str:
        client_id, _ = self._get_credentials()
        params = {
            "client_id": client_id,
            "redirect_uri": redirect_uri,
            "response_type": "code",
            "scope": " ".join(self.SCOPES),
            "access_type": "offline",
            "prompt": "consent",
            "state": state,
        }
        return f"https://accounts.google.com/o/oauth2/v2/auth?{urlencode(params)}"

    def exchange_code(self, code: str, redirect_uri: str) -> Dict[str, Any]:
        client_id, client_secret = self._get_credentials()
        data = {
            "code": code,
            "client_id": client_id,
            "client_secret": client_secret,
            "redirect_uri": redirect_uri,
            "grant_type": "authorization_code",
        }
        resp = httpx.post("https://oauth2.googleapis.com/token", data=data)
        if resp.status_code != 200:
            logger.error(f"Failed to exchange Google OAuth code: {resp.text}")
            resp.raise_for_status()
        return resp.json()

    def refresh_token(self, refresh_token: str) -> Dict[str, Any]:
        client_id, client_secret = self._get_credentials()
        data = {
            "client_id": client_id,
            "client_secret": client_secret,
            "refresh_token": refresh_token,
            "grant_type": "refresh_token",
        }
        resp = httpx.post("https://oauth2.googleapis.com/token", data=data)
        if resp.status_code != 200:
            logger.error(f"Failed to refresh Google OAuth token: {resp.text}")
            resp.raise_for_status()
        return resp.json()

    def get_user_email(self, access_token: str) -> str:
        headers = {"Authorization": f"Bearer {access_token}"}
        resp = httpx.get("https://www.googleapis.com/oauth2/v2/userinfo", headers=headers)
        if resp.status_code != 200:
            logger.error(f"Failed to fetch Google userinfo: {resp.text}")
            resp.raise_for_status()
        return resp.json().get("email", "")

    def _get_headers(self, account: Any) -> Dict[str, str]:
        # Handle automatic refresh
        access_token = account.get_access_token()
        from datetime import timedelta
        # Check if expired or expiring within 5 minutes (300s buffer)
        if account.token_expiry <= datetime.now(timezone.utc) + timedelta(minutes=5):
            try:
                logger.info(f"Refreshing Google access token for {account.email}")
                tokens = self.refresh_token(account.get_refresh_token())
                access_token = tokens["access_token"]
                account.set_access_token(access_token)
                # Google might return a new refresh token (though rare for offline access unless requested)
                if "refresh_token" in tokens:
                    account.set_refresh_token(tokens["refresh_token"])
                # Update expiry
                expires_in = tokens.get("expires_in", 3600)
                account.token_expiry = datetime.now(timezone.utc) + timedelta(seconds=expires_in)
                account.status = "connected"
                account.save(update_fields=["access_token_encrypted", "refresh_token_encrypted", "token_expiry", "status"])
            except httpx.HTTPStatusError as e:
                logger.error(f"HTTP error refreshing Google OAuth token for {account.email}: {e}")
                if e.response.status_code == 400 and "invalid_grant" in e.response.text:
                    account.status = "error"
                    account.save(update_fields=["status"])
                raise e
            except Exception as e:
                logger.error(f"Failed to automatically refresh token for {account.email}: {e}")
                raise e
        return {"Authorization": f"Bearer {access_token}"}

    def sync_emails(
        self,
        account: Any,
        query: str,
        after_date: datetime = None
    ) -> List[Dict[str, Any]]:
        headers = self._get_headers(account)
        
        # Build query
        q = f'"{query}"'
        if after_date:
            # Gmail after filter uses epoch seconds
            q += f" after:{int(after_date.timestamp())}"

        logger.info(f"Syncing Gmail for {account.email} with query: {q}")
        
        # Call list threads
        params = {"q": q, "maxResults": 50}
        resp = httpx.get(
            "https://gmail.googleapis.com/gmail/v1/users/me/threads",
            headers=headers,
            params=params
        )
        
        if resp.status_code == 401:
            # Force refresh and retry
            account.token_expiry = datetime.now(timezone.utc)  # Mark as expired
            headers = self._get_headers(account)
            resp = httpx.get(
                "https://gmail.googleapis.com/gmail/v1/users/me/threads",
                headers=headers,
                params=params
            )

        if resp.status_code != 200:
            logger.error(f"Gmail sync threads failed: {resp.text}")
            resp.raise_for_status()

        threads_list = resp.json().get("threads", [])
        synced_threads = []

        for t_summary in threads_list:
            thread_id = t_summary["id"]
            # Fetch full thread details
            thread_resp = httpx.get(
                f"https://gmail.googleapis.com/gmail/v1/users/me/threads/{thread_id}",
                headers=headers
            )
            if thread_resp.status_code != 200:
                logger.error(f"Failed to fetch Gmail thread {thread_id}: {thread_resp.text}")
                continue

            thread_data = thread_resp.json()
            messages_data = thread_data.get("messages", [])
            if not messages_data:
                continue

            # Parse each message
            parsed_messages = []
            participants = set()

            for msg in messages_data:
                parsed_msg = self._parse_message(msg)
                if parsed_msg:
                    parsed_messages.append(parsed_msg)
                    # Extract participant emails
                    participants.add(parsed_msg["sender_email"])
                    participants.update(parsed_msg["recipients_emails"])
                    participants.update(parsed_msg["cc_emails"])

            # Subject of the thread is the subject of the first message
            subject = parsed_messages[0]["subject"] if parsed_messages else ""
            snippet = messages_data[-1].get("snippet", "") if messages_data else ""
            
            # Last message time (epoch ms from Gmail)
            last_msg_internal_date = int(messages_data[-1].get("internalDate", 0))
            last_message_time = datetime.fromtimestamp(
                last_msg_internal_date / 1000.0,
                tz=timezone.utc
            )

            synced_threads.append({
                "gmail_thread_id": thread_id,
                "subject": subject,
                "snippet": snippet,
                "last_message_time": last_message_time,
                "participants": list(participants),
                "messages": parsed_messages
            })

        return synced_threads

    def _parse_message(self, msg: Dict[str, Any]) -> Dict[str, Any]:
        msg_headers = msg.get("payload", {}).get("headers", [])
        
        subject = self._get_header_value(msg_headers, "subject")
        sender = self._get_header_value(msg_headers, "from")
        recipients_str = self._get_header_value(msg_headers, "to")
        cc_str = self._get_header_value(msg_headers, "cc")
        bcc_str = self._get_header_value(msg_headers, "bcc")

        sender_email = self._extract_email(sender)
        recipients_emails = self._parse_email_list(recipients_str)
        cc_emails = self._parse_email_list(cc_str)
        bcc_emails = self._parse_email_list(bcc_str)

        # Parse date
        internal_date_ms = int(msg.get("internalDate", 0))
        internal_date = datetime.fromtimestamp(internal_date_ms / 1000.0, tz=timezone.utc)

        # Parse bodies and attachments
        plain_parts = []
        html_parts = []
        attachments = []
        
        payload = msg.get("payload", {})
        self._parse_payload_parts(payload, plain_parts, html_parts, attachments)

        plain_text_body = "".join(plain_parts)
        html_body = "".join(html_parts)

        return {
            "gmail_message_id": msg["id"],
            "sender": sender,
            "sender_email": sender_email,
            "recipients": recipients_emails,
            "recipients_emails": recipients_emails,
            "cc": cc_emails,
            "cc_emails": cc_emails,
            "bcc": bcc_emails,
            "subject": subject,
            "plain_text_body": plain_text_body,
            "html_body": html_body,
            "internal_date": internal_date,
            "labels": msg.get("labelIds", []),
            "attachments": attachments,
            "snippet": msg.get("snippet", "")
        }

    def _get_header_value(self, headers: List[Dict[str, str]], name: str) -> str:
        for h in headers:
            if h.get("name", "").lower() == name.lower():
                return h.get("value", "")
        return ""

    def _extract_email(self, addr_str: str) -> str:
        if not addr_str:
            return ""
        match = re.search(r"[\w\.-]+@[\w\.-]+", addr_str)
        return match.group(0).lower() if match else addr_str.strip().lower()

    def _parse_email_list(self, emails_str: str) -> List[str]:
        if not emails_str:
            return []
        # Split by comma if not inside quotes
        parts = re.split(r",(?=(?:[^\"']*[\"'][^\"']*[\"'])*[^\"']*$)", emails_str)
        return [self._extract_email(p) for p in parts if self._extract_email(p)]

    def _parse_payload_parts(
        self,
        part: Dict[str, Any],
        plain_parts: List[str],
        html_parts: List[str],
        attachments: List[Dict[str, Any]]
    ):
        filename = part.get("filename", "")
        mime_type = part.get("mimeType", "")
        body = part.get("body", {})
        data = body.get("data", "")

        if filename:
            # Attachment metadata only
            attachments.append({
                "filename": filename,
                "mime_type": mime_type,
                "size": body.get("size", 0),
                "attachment_id": body.get("attachmentId", "")
            })
        elif mime_type == "text/plain" and data:
            plain_parts.append(self._decode_data(data))
        elif mime_type == "text/html" and data:
            html_parts.append(self._decode_data(data))
        
        # Traverse subparts recursively
        subparts = part.get("parts", [])
        for sub in subparts:
            self._parse_payload_parts(sub, plain_parts, html_parts, attachments)

    def _decode_data(self, data: str) -> str:
        if not data:
            return ""
        try:
            # Base64url decode
            decoded_bytes = base64.urlsafe_b64decode(data.encode("utf-8") + b"==")
            return decoded_bytes.decode("utf-8", errors="ignore")
        except Exception as e:
            logger.error(f"Error decoding base64url content: {e}")
            return ""
