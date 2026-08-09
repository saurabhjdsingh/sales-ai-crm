"""
SmartScheduleEngine — Deterministic timezone-aware email scheduling.

Calculates the next optimal send time for a sequence email draft based on:
- Contact's IANA timezone (from auto-resolution or manual override)
- Organization's configured sending windows (morning/afternoon)
- Enabled sending days (Mon-Sat by default, Sunday excluded)
- Random jitter (5-25 minutes) to avoid all emails landing at the same second

All calculations are deterministic — no LLM, no external API calls.
"""

import logging
import random
from datetime import datetime, time, timedelta
from typing import Optional, Tuple
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from django.utils import timezone

logger = logging.getLogger(__name__)


class ScheduleResult:
    """Encapsulates a scheduling calculation result."""

    def __init__(
        self,
        scheduled_at_utc: datetime,
        scheduled_timezone: str,
        scheduled_local_time: str,
        sending_window: str,
        schedule_source: str,
    ):
        self.scheduled_at_utc = scheduled_at_utc
        self.scheduled_timezone = scheduled_timezone
        self.scheduled_local_time = scheduled_local_time
        self.sending_window = sending_window
        self.schedule_source = schedule_source


class SmartScheduleEngine:
    """
    Deterministic timezone-aware email scheduling engine.
    """

    @staticmethod
    def _get_schedule_settings():
        """Lazy-load SequenceScheduleSetting singleton."""
        from apps.sequences.models import SequenceScheduleSetting
        return SequenceScheduleSetting.get_settings()

    @classmethod
    def calculate_send_time(
        cls,
        contact,
        send_mode: str = "smart_send",
        approval_time: Optional[datetime] = None,
        manual_time_utc: Optional[datetime] = None,
    ) -> ScheduleResult:
        """
        Calculate the optimal send time for an email to a contact.

        Args:
            contact: Contact model instance
            send_mode: 'smart_send', 'immediate', or 'manual'
            approval_time: When the email was approved (UTC). Defaults to now.
            manual_time_utc: Manually specified send time (UTC), for 'manual' mode only.

        Returns:
            ScheduleResult with UTC timestamp and metadata.
        """
        now = approval_time or timezone.now()

        # Mode: IMMEDIATE — send right now
        if send_mode == "immediate":
            return ScheduleResult(
                scheduled_at_utc=now,
                scheduled_timezone="UTC",
                scheduled_local_time=now.strftime("%A, %b %d at %I:%M %p UTC"),
                sending_window="immediate",
                schedule_source="send_now",
            )

        # Mode: MANUAL — use the provided manual time
        if send_mode == "manual" and manual_time_utc:
            contact_tz_str = getattr(contact, "timezone", "") or ""
            tz_label = "UTC"
            local_str = manual_time_utc.strftime("%A, %b %d at %I:%M %p UTC")
            if contact_tz_str:
                try:
                    contact_tz = ZoneInfo(contact_tz_str)
                    local_dt = manual_time_utc.astimezone(contact_tz)
                    tz_label = contact_tz_str
                    local_str = local_dt.strftime(f"%A, %b %d at %I:%M %p {contact_tz_str}")
                except (ZoneInfoNotFoundError, KeyError):
                    pass
            return ScheduleResult(
                scheduled_at_utc=manual_time_utc,
                scheduled_timezone=tz_label,
                scheduled_local_time=local_str,
                sending_window="manual",
                schedule_source="manual",
            )

        # Mode: SMART_SEND — timezone-aware window matching
        return cls._calculate_smart_send(contact, now)

    @classmethod
    def _calculate_smart_send(cls, contact, now: datetime) -> ScheduleResult:
        """
        Core smart-send calculation.
        Finds the next available sending window in the contact's local timezone.
        """
        settings = cls._get_schedule_settings()
        contact_tz_str = getattr(contact, "timezone", "") or ""

        # Determine timezone to use
        if contact_tz_str:
            try:
                contact_tz = ZoneInfo(contact_tz_str)
                tz_label = contact_tz_str
            except (ZoneInfoNotFoundError, KeyError):
                logger.warning("Invalid timezone '%s' for contact %s, using org default", contact_tz_str, getattr(contact, "id", "?"))
                contact_tz = ZoneInfo(settings.org_timezone)
                tz_label = settings.org_timezone
        else:
            # Unknown timezone — use org default
            contact_tz = ZoneInfo(settings.org_timezone)
            tz_label = settings.org_timezone
            logger.info("No timezone for contact %s, using org default %s", getattr(contact, "id", "?"), settings.org_timezone)

        # Convert 'now' to contact's local time
        local_now = now.astimezone(contact_tz)

        # Get enabled days
        enabled_days = settings.get_enabled_days()
        if not enabled_days:
            # Fallback: Monday-Friday
            enabled_days = [0, 1, 2, 3, 4]

        # Get sending windows as time objects
        def parse_time(val):
            if isinstance(val, time):
                return val
            if isinstance(val, str):
                parts = val.split(":")
                return time(int(parts[0]), int(parts[1]))
            return time(8, 30)

        morning_start = parse_time(settings.morning_start_time)
        morning_end = parse_time(settings.morning_end_time)
        afternoon_start = parse_time(settings.afternoon_start_time)
        afternoon_end = parse_time(settings.afternoon_end_time)

        # Find next available slot
        scheduled_local, window_name = cls._find_next_slot(
            local_now=local_now,
            morning_start=morning_start,
            morning_end=morning_end,
            afternoon_start=afternoon_start,
            afternoon_end=afternoon_end,
            enabled_days=enabled_days,
            max_days_ahead=14,  # Search up to 2 weeks ahead
        )

        # Add random jitter (5-25 minutes) within window bounds
        jitter_minutes = random.randint(5, 25)
        scheduled_local = scheduled_local + timedelta(minutes=jitter_minutes)

        # Ensure jitter doesn't push past window end
        if window_name == "morning":
            window_end = morning_end
        else:
            window_end = afternoon_end

        window_end_dt = scheduled_local.replace(
            hour=window_end.hour, minute=window_end.minute, second=0, microsecond=0
        )
        if scheduled_local > window_end_dt:
            scheduled_local = window_end_dt - timedelta(minutes=random.randint(1, 5))

        # Convert back to UTC
        scheduled_utc = scheduled_local.astimezone(ZoneInfo("UTC"))
        local_str = scheduled_local.strftime(f"%A, %b %d at %I:%M %p {tz_label}")

        return ScheduleResult(
            scheduled_at_utc=scheduled_utc,
            scheduled_timezone=tz_label,
            scheduled_local_time=local_str,
            sending_window=window_name,
            schedule_source="automatic",
        )

    @staticmethod
    def _find_next_slot(
        local_now: datetime,
        morning_start: time,
        morning_end: time,
        afternoon_start: time,
        afternoon_end: time,
        enabled_days: list[int],
        max_days_ahead: int = 14,
    ) -> Tuple[datetime, str]:
        """
        Find the next available sending window from local_now.

        Returns:
            (local_datetime_at_window_start, window_name)
        """
        current_date = local_now.date()
        current_time = local_now.time()

        for day_offset in range(max_days_ahead + 1):
            check_date = current_date + timedelta(days=day_offset)
            weekday = check_date.weekday()  # 0=Monday, 6=Sunday

            if weekday not in enabled_days:
                continue

            # Check morning window
            if day_offset == 0 and current_time < morning_end:
                # Today, morning window still available
                start_time = max(current_time, morning_start)
                start_time = time(start_time.hour, start_time.minute, 0)
                if start_time < morning_end:
                    slot_dt = local_now.replace(
                        hour=start_time.hour, minute=start_time.minute, second=0, microsecond=0
                    )
                    return slot_dt, "morning"

            if day_offset > 0:
                # Future day — start of morning window
                slot_dt = local_now.replace(
                    year=check_date.year, month=check_date.month, day=check_date.day,
                    hour=morning_start.hour, minute=morning_start.minute, second=0, microsecond=0,
                )
                return slot_dt, "morning"

            # Check afternoon window (same day)
            if current_time < afternoon_end:
                start_time = max(current_time, afternoon_start)
                start_time = time(start_time.hour, start_time.minute, 0)
                if start_time < afternoon_end:
                    slot_dt = local_now.replace(
                        hour=start_time.hour, minute=start_time.minute, second=0, microsecond=0
                    )
                    return slot_dt, "afternoon"

        # Fallback: couldn't find a slot within max_days_ahead, schedule for tomorrow morning
        tomorrow = current_date + timedelta(days=1)
        slot_dt = local_now.replace(
            year=tomorrow.year, month=tomorrow.month, day=tomorrow.day,
            hour=morning_start.hour, minute=morning_start.minute, second=0, microsecond=0,
        )
        return slot_dt, "morning"
