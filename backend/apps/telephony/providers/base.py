from abc import ABC, abstractmethod
from typing import Dict, Any, List


class BaseTelephonyProvider(ABC):
    """
    Abstract Telephony Provider interface.
    Additional providers (e.g. Telnyx, Vonage) should inherit from this
    and implement all methods to decouple core business logic from Twilio.
    """

    def __init__(self, config: Dict[str, Any]):
        """
        Initialize provider with configuration containing Account ID, API Keys, etc.
        """
        self.config = config

    @abstractmethod
    def connect(self) -> bool:
        """Test connection status to the provider API."""
        pass

    @abstractmethod
    def generate_access_token(self, client_identity: str, **kwargs) -> str:
        """Generate access token for WebRTC / softphone connection."""
        pass

    @abstractmethod
    def make_call(self, to_number: str, from_number: str, webhook_url: str, **kwargs) -> Dict[str, Any]:
        """Initiate outbound call via REST API."""
        pass

    @abstractmethod
    def answer_call(self, call_sid: str) -> bool:
        """Answer/accept a call remotely."""
        pass

    @abstractmethod
    def reject_call(self, call_sid: str) -> bool:
        """Reject/decline an incoming call remotely."""
        pass

    @abstractmethod
    def hangup(self, call_sid: str) -> bool:
        """Terminate call remotely."""
        pass

    @abstractmethod
    def mute(self, call_sid: str) -> bool:
        """Mute call remotely."""
        pass

    @abstractmethod
    def unmute(self, call_sid: str) -> bool:
        """Unmute call remotely."""
        pass

    @abstractmethod
    def hold(self, call_sid: str) -> bool:
        """Hold call remotely."""
        pass

    @abstractmethod
    def resume(self, call_sid: str) -> bool:
        """Resume call remotely."""
        pass

    @abstractmethod
    def transfer(self, call_sid: str, target_number: str) -> bool:
        """Transfer call to another number."""
        pass

    @abstractmethod
    def get_call_status(self, call_sid: str) -> str:
        """Fetch remote call status."""
        pass

    @abstractmethod
    def list_recent_calls(self) -> List[Dict[str, Any]]:
        """Fetch list of recent calls from provider API."""
        pass
