import logging
from datetime import datetime, timedelta, timezone as dt_timezone
from typing import Any, Dict, List, Optional
from urllib.parse import urlencode

import httpx
from django.utils import timezone

from apps.emails.models import EmailAccount
from apps.emails.providers.factory import ProviderFactory

logger = logging.getLogger(__name__)


class GoogleCalendarService:
    """
    Client for interacting with the Google Calendar API v3.
    Reuses existing Google OAuth tokens from EmailAccount.
    """

    BASE_URL = "https://www.googleapis.com/calendar/v3"

    def __init__(self, account: EmailAccount):
        self.account = account
        self.provider = ProviderFactory.get_provider("gmail")

    def _get_auth_headers(self) -> Dict[str, str]:
        """Obtains authorized HTTP headers, automatically refreshing expired tokens."""
        return self.provider._get_headers(self.account)

    def fetch_events(
        self,
        time_min: Optional[datetime] = None,
        time_max: Optional[datetime] = None,
        calendar_id: str = "primary",
        max_results: int = 100,
    ) -> List[Dict[str, Any]]:
        """
        Fetches events from the specified calendar.
        Expands recurring events (singleEvents=True) and orders by start time.
        """
        if time_min is None:
            # Default to 7 days in the past up to 60 days in the future
            time_min = timezone.now() - timedelta(days=7)

        headers = self._get_auth_headers()
        params: Dict[str, Any] = {
            "timeMin": time_min.isoformat(),
            "singleEvents": "true",
            "orderBy": "startTime",
            "maxResults": max_results,
        }
        if time_max:
            params["timeMax"] = time_max.isoformat()

        url = f"{self.BASE_URL}/calendars/{calendar_id}/events"
        logger.info(f"Fetching Google Calendar events for {self.account.email} from {time_min.isoformat()}")

        try:
            resp = httpx.get(url, headers=headers, params=params, timeout=15.0)

            # If 401 Unauthorized, force token refresh and retry once
            if resp.status_code == 401:
                logger.info("Received 401 from Calendar API; forcing token refresh.")
                self.account.token_expiry = datetime.now(dt_timezone.utc)
                headers = self._get_auth_headers()
                resp = httpx.get(url, headers=headers, params=params, timeout=15.0)

            if resp.status_code == 403:
                error_body = resp.text
                logger.error(f"403 Forbidden calling Google Calendar API: {error_body}")
                if "insufficientPermissions" in error_body or "ACCESS_TOKEN_SCOPE_INSUFFICIENT" in error_body:
                    raise PermissionError(
                        "Google Calendar scope is missing. Please reconnect your Google account to grant calendar permissions."
                    )
                resp.raise_for_status()

            if resp.status_code != 200:
                logger.error(f"Google Calendar API failed with status {resp.status_code}: {resp.text}")
                resp.raise_for_status()

            data = resp.json()
            raw_items = data.get("items", [])
            parsed_events = []

            for item in raw_items:
                parsed = self._parse_event(item)
                if parsed:
                    parsed_events.append(parsed)

            return parsed_events

        except PermissionError:
            raise
        except Exception as e:
            logger.error(f"Error fetching Google Calendar events for {self.account.email}: {e}", exc_info=True)
            raise e

    def _parse_event(self, item: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Parses a raw Google Calendar event payload into a normalized CRM dictionary."""
        event_id = item.get("id")
        if not event_id:
            return None

        # Determine start and end datetimes
        start_obj = item.get("start", {})
        end_obj = item.get("end", {})

        start_dt = self._parse_datetime_field(start_obj)
        end_dt = self._parse_datetime_field(end_obj)

        if not start_dt:
            return None

        if not end_dt:
            end_dt = start_dt + timedelta(hours=1)

        timezone_str = (
            start_obj.get("timeZone")
            or item.get("timeZone")
            or "UTC"
        )

        # Extract video conference link (Google Meet, Zoom, etc.)
        meeting_url = item.get("hangoutLink", "")
        if not meeting_url:
            conf_data = item.get("conferenceData", {})
            entry_points = conf_data.get("entryPoints", [])
            for ep in entry_points:
                if ep.get("entryPointType") == "video":
                    meeting_url = ep.get("uri", "")
                    break

        # Attendees parsing
        raw_attendees = item.get("attendees", [])
        parsed_attendees = []
        for att in raw_attendees:
            parsed_attendees.append({
                "email": att.get("email", "").lower().strip(),
                "displayName": att.get("displayName", ""),
                "responseStatus": att.get("responseStatus", "needsAction"),
                "self": att.get("self", False),
                "organizer": att.get("organizer", False),
            })

        organizer_obj = item.get("organizer", {})
        organizer = {
            "email": organizer_obj.get("email", "").lower().strip(),
            "displayName": organizer_obj.get("displayName", ""),
            "self": organizer_obj.get("self", False),
        }

        status_str = item.get("status", "confirmed").lower()
        if status_str not in ["confirmed", "tentative", "cancelled"]:
            status_str = "confirmed"

        return {
            "google_event_id": event_id,
            "title": item.get("summary") or "Untitled Meeting",
            "description": item.get("description", "") or "",
            "start_time": start_dt,
            "end_time": end_dt,
            "timezone": timezone_str,
            "location": item.get("location", "") or "",
            "meeting_url": meeting_url or "",
            "html_link": item.get("htmlLink", "") or "",
            "status": status_str,
            "organizer": organizer,
            "attendees": parsed_attendees,
        }

    def _parse_datetime_field(self, dt_obj: Dict[str, Any]) -> Optional[datetime]:
        """Parses Google dateTime (ISO 8601) or date (all-day event)."""
        if not dt_obj:
            return None

        dt_str = dt_obj.get("dateTime")
        if dt_str:
            try:
                # Replace trailing 'Z' if present for ISO parsing
                cleaned = dt_str.replace("Z", "+00:00")
                parsed = datetime.fromisoformat(cleaned)
                if parsed.tzinfo is None:
                    parsed = parsed.replace(tzinfo=dt_timezone.utc)
                return parsed
            except Exception:
                pass

        # Handle all-day event
        date_str = dt_obj.get("date")
        if date_str:
            try:
                d = datetime.strptime(date_str, "%Y-%m-%d")
                return d.replace(tzinfo=dt_timezone.utc)
            except Exception:
                pass

        return None
