from typing import Dict, Any, List
from twilio.rest import Client as TwilioClient
from twilio.jwt.access_token import AccessToken
from twilio.jwt.access_token.grants import VoiceGrant
from apps.telephony.providers.base import BaseTelephonyProvider


class TwilioProvider(BaseTelephonyProvider):
    """
    Twilio Telephony Provider.
    Implements BaseTelephonyProvider using Twilio Voice REST and JWT APIs.
    """

    def _get_client(self) -> TwilioClient:
        """Helper to instantiate Twilio REST Client."""
        return TwilioClient(
            username=self.config.get("api_key"),
            password=self.config.get("api_secret"),
            account_sid=self.config.get("account_sid")
        )

    def connect(self) -> bool:
        """Validate credentials by running a lightweight query (fetch first call)."""
        try:
            client = self._get_client()
            client.calls.list(limit=1)
            return True
        except Exception:
            return False

    def generate_access_token(self, client_identity: str, **kwargs) -> str:
        """
        Generate Voice capability token for softphone browser endpoint client.
        """
        account_sid = self.config.get("account_sid")
        api_key = self.config.get("api_key")
        api_secret = self.config.get("api_secret")
        app_sid = self.config.get("application_sid")

        token = AccessToken(
            account_sid=account_sid,
            signing_key_sid=api_key,
            secret=api_secret,
            identity=client_identity
        )
        
        voice_grant = VoiceGrant(
            outgoing_application_sid=app_sid,
            incoming_allow=True
        )
        token.add_grant(voice_grant)
        return token.to_jwt()

    def make_call(self, to_number: str, from_number: str, webhook_url: str, **kwargs) -> Dict[str, Any]:
        """Trigger an outbound call using Twilio REST API."""
        client = self._get_client()
        call = client.calls.create(
            to=to_number,
            from_=from_number,
            url=webhook_url,
            record=kwargs.get("record", False)
        )
        return {
            "sid": call.sid,
            "status": call.status,
            "direction": "outbound"
        }

    def answer_call(self, call_sid: str) -> bool:
        """Not required directly in REST API as client-side handles accepting WebRTC stream."""
        return True

    def reject_call(self, call_sid: str) -> bool:
        """Reject/decline an incoming call by terminating it."""
        return self.hangup(call_sid)

    def hangup(self, call_sid: str) -> bool:
        """Terminate call via REST API."""
        client = self._get_client()
        try:
            call = client.calls(call_sid).update(status="completed")
            return call.status == "completed"
        except Exception:
            return False

    def mute(self, call_sid: str) -> bool:
        """Client-side WebRTC handles mute natively; API tracks state."""
        return True

    def unmute(self, call_sid: str) -> bool:
        return True

    def hold(self, call_sid: str) -> bool:
        """Redirect call to a hold music URL."""
        client = self._get_client()
        try:
            # Twilio holdmusic twimlet
            client.calls(call_sid).update(url="https://twimlets.com/holdmusic")
            return True
        except Exception:
            return False

    def resume(self, call_sid: str) -> bool:
        """Resuming will redirect the call back to the agent; typically done client-side."""
        return True

    def transfer(self, call_sid: str, target_number: str) -> bool:
        """Redirect the call to Dial the target number."""
        client = self._get_client()
        try:
            # Redirect call TwiML to Dial out to target number
            # We would write a custom TwiML view, or use twimlets
            transfer_twimlet_url = f"https://twimlets.com/forward?PhoneNumber={target_number}"
            client.calls(call_sid).update(url=transfer_twimlet_url)
            return True
        except Exception:
            return False

    def get_call_status(self, call_sid: str) -> str:
        """Fetch status of active call."""
        client = self._get_client()
        try:
            call = client.calls(call_sid).fetch()
            return call.status
        except Exception:
            return "failed"

    def list_recent_calls(self) -> List[Dict[str, Any]]:
        """Retrieve recent Twilio calls log."""
        client = self._get_client()
        try:
            calls = client.calls.list(limit=20)
            return [
                {
                    "sid": c.sid,
                    "direction": c.direction,
                    "from": c.from_,
                    "to": c.to,
                    "status": c.status,
                    "duration": c.duration,
                    "start_time": c.start_time,
                }
                for c in calls
            ]
        except Exception:
            return []
