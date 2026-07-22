import logging
import smtplib
import uuid
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Dict, Any, List
from datetime import datetime

from apps.emails.providers.base import BaseEmailProvider

logger = logging.getLogger(__name__)


class SmtpProvider(BaseEmailProvider):
    """
    Custom SMTP Provider for sending outbound emails via generic SMTP servers
    (SendGrid, Mailgun, Amazon SES, Google Workspace SMTP Relay, Custom Domain SMTP).
    """

    def get_auth_url(self, state: str, redirect_uri: str) -> str:
        return ""

    def exchange_code(self, code: str, redirect_uri: str) -> Dict[str, Any]:
        return {}

    def refresh_token(self, refresh_token: str) -> Dict[str, Any]:
        return {}

    def get_user_email(self, access_token: str) -> str:
        return ""

    def sync_emails(self, account: Any, query: str, after_date: datetime = None) -> List[Dict[str, Any]]:
        # Syncing inbox via IMAP could be expanded later if needed; SMTP handles outbound dispatch
        return []

    def test_connection(
        self,
        host: str,
        port: int,
        username: str,
        password: str,
        use_tls: bool = True,
        use_ssl: bool = False
    ) -> bool:
        """
        Validates SMTP server configuration and credentials.
        """
        try:
            if use_ssl:
                server = smtplib.SMTP_SSL(host, port, timeout=10)
            else:
                server = smtplib.SMTP(host, port, timeout=10)
                if use_tls:
                    server.starttls()

            if username and password:
                server.login(username, password)
            server.quit()
            return True
        except Exception as e:
            logger.error(f"SMTP Connection Test failed for {host}:{port} ({username}): {e}")
            raise ValueError(f"SMTP authentication failed: {str(e)}")

    def send_email(
        self,
        account: Any,
        to_email: str,
        subject: str,
        body_html: str,
        body_text: str = "",
        thread_id: str = None,
        reply_to: str = None,
    ) -> Dict[str, Any]:
        """
        Sends an email using the connected SMTP credentials of account.
        Strictly enforces account's host, port, username, and password.
        """
        host = account.smtp_host
        port = account.smtp_port or (465 if account.smtp_use_ssl else 587)
        username = account.smtp_username or account.email
        password = account.get_smtp_password()
        use_tls = account.smtp_use_tls
        use_ssl = account.smtp_use_ssl

        if not host:
            raise ValueError("SMTP host is missing for this account.")
        if not password:
            raise ValueError("SMTP password is missing for this account.")

        # Create MIME Multipart Message
        msg = MIMEMultipart("alternative")
        msg["From"] = account.email
        msg["To"] = to_email
        msg["Subject"] = subject

        if reply_to:
            msg["Reply-To"] = reply_to

        if body_text:
            msg.attach(MIMEText(body_text, "plain", "utf-8"))
        if body_html:
            msg.attach(MIMEText(body_html, "html", "utf-8"))

        generated_msg_id = f"smtp-{uuid.uuid4()}@{host}"
        msg["Message-ID"] = f"<{generated_msg_id}>"

        try:
            if use_ssl:
                server = smtplib.SMTP_SSL(host, port, timeout=15)
            else:
                server = smtplib.SMTP(host, port, timeout=15)
                if use_tls:
                    server.starttls()

            if username and password:
                server.login(username, password)

            server.sendmail(account.email, [to_email], msg.as_string())
            server.quit()

            logger.info(f"Email sent successfully via SMTP {host} from {account.email} to {to_email}")

            return {
                "gmail_message_id": generated_msg_id,
                "gmail_thread_id": thread_id or f"thread-{uuid.uuid4()}",
                "status": "SENT"
            }
        except Exception as e:
            logger.error(f"Failed to send email via SMTP ({account.email}): {e}", exc_info=True)
            raise RuntimeError(f"SMTP dispatch failed: {str(e)}")
