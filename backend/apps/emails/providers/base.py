from abc import ABC, abstractmethod
from typing import List, Dict, Any
from datetime import datetime


class BaseEmailProvider(ABC):
    """
    Abstract base class for email integration providers.
    Swappable across Gmail, Outlook, Microsoft 365, IMAP, etc.
    """

    @abstractmethod
    def get_auth_url(self, state: str, redirect_uri: str) -> str:
        """Generate the authorization URL for OAuth 2.0 connection."""
        pass

    @abstractmethod
    def exchange_code(self, code: str, redirect_uri: str) -> Dict[str, Any]:
        """Exchange OAuth 2.0 code for tokens."""
        pass

    @abstractmethod
    def refresh_token(self, refresh_token: str) -> Dict[str, Any]:
        """Obtain a new access token using a refresh token."""
        pass

    @abstractmethod
    def get_user_email(self, access_token: str) -> str:
        """Fetch the authenticated user's email address."""
        pass

    @abstractmethod
    def sync_emails(
        self,
        account: Any,
        query: str,
        after_date: datetime = None
    ) -> List[Dict[str, Any]]:
        """
        Fetch threads and messages matching the query string.
        Returns a structured, provider-independent list.
        """
        pass

    @abstractmethod
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
        """Send an email via the provider API."""
        pass
