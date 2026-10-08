import logging
from datetime import timedelta
from celery import shared_task
from django.contrib.auth import get_user_model
from django.utils import timezone

from apps.emails.models import EmailAccount
from apps.meetings.models import Meeting, MeetingStatus
from apps.meetings.services.sync_service import MeetingSyncService
from apps.meetings.services.reminder_service import MeetingReminderService

logger = logging.getLogger(__name__)


@shared_task(name="apps.meetings.tasks.sync_calendar_events_task")
def sync_calendar_events_task(user_id: str, time_range: str = "next_month"):
    """
    Asynchronous Celery worker to pull Google Calendar events for a specific user.
    """
    logger.info(f"Starting calendar sync task for user {user_id} with time_range={time_range}")
    User = get_user_model()
    try:
        user = User.objects.get(id=user_id)
    except User.DoesNotExist:
        logger.error(f"User {user_id} not found for calendar sync task.")
        return

    result = MeetingSyncService.sync_user_calendar(user, time_range=time_range)
    logger.info(f"Calendar sync task for user {user.username} finished: {result}")
    return result


@shared_task(name="apps.meetings.tasks.auto_sync_all_google_calendars")
def auto_sync_all_google_calendars():
    """
    Periodic Celery Beat task (every 15 minutes) to automatically synchronize
    Google Calendars for all users with connected Google accounts:
    - Ingests newly booked events (Meet, Calendly, direct invites)
    - Automatically updates rescheduled dates and times
    - Marks cancelled meetings
    - Filters out internal / mentor meetings
    """
    logger.info("Executing periodic auto_sync_all_google_calendars task...")
    User = get_user_model()

    # Find distinct users with connected Gmail accounts
    connected_user_ids = EmailAccount.objects.filter(
        provider_type="gmail",
        status="connected",
        refresh_token_encrypted__isnull=False,
    ).exclude(
        refresh_token_encrypted=""
    ).values_list("user_id", flat=True).distinct()

    total_synced = 0
    for uid in connected_user_ids:
        try:
            user = User.objects.get(id=uid)
            res = MeetingSyncService.sync_user_calendar(user, time_range="next_month")
            if res.get("success"):
                total_synced += res.get("synced_count", 0)
        except Exception as e:
            logger.error(f"Error auto-syncing calendar for user {uid}: {e}", exc_info=True)

    logger.info(f"auto_sync_all_google_calendars completed. Synced {total_synced} meetings across {len(connected_user_ids)} users.")
    return {"users_count": len(connected_user_ids), "total_synced": total_synced}


@shared_task(name="apps.meetings.tasks.send_meeting_reminders_task")
def send_meeting_reminders_task():
    """
    Periodic Celery Beat task (every 5 minutes) to evaluate confirmed sales meetings
    and dispatch beautiful branded reminder emails via Gmail:
    - 24-hour window: 23 hours to 25 hours prior to meeting start_time
    - 1-hour window: 50 minutes to 70 minutes prior to meeting start_time
    - Just-in-Time dynamic evaluation avoids stale fixed-ETA queues.
    """
    logger.debug("Checking meeting reminders...")
    now = timezone.now()

    # 1. Evaluate 24-hour Reminders (start_time between now + 23h and now + 25h)
    start_24h_min = now + timedelta(hours=23)
    start_24h_max = now + timedelta(hours=25)

    meetings_24h = Meeting.objects.filter(
        status=MeetingStatus.CONFIRMED,
        send_reminders=True,
        start_time__gte=start_24h_min,
        start_time__lte=start_24h_max,
    ).select_related("user", "contact", "company")

    for meeting in meetings_24h:
        # Check if reminder for this exact start_time was already sent
        if not meeting.reminder_24h_sent or meeting.reminder_24h_sent_for_time != meeting.start_time:
            try:
                MeetingReminderService.send_meeting_reminder(meeting, window_type="24h")
            except Exception as e:
                logger.error(f"Failed sending 24h reminder for meeting {meeting.id}: {e}", exc_info=True)

    # 2. Evaluate 1-hour Reminders (start_time between now + 50m and now + 70m)
    start_1h_min = now + timedelta(minutes=50)
    start_1h_max = now + timedelta(minutes=70)

    meetings_1h = Meeting.objects.filter(
        status=MeetingStatus.CONFIRMED,
        send_reminders=True,
        start_time__gte=start_1h_min,
        start_time__lte=start_1h_max,
    ).select_related("user", "contact", "company")

    for meeting in meetings_1h:
        # Check if reminder for this exact start_time was already sent
        if not meeting.reminder_1h_sent or meeting.reminder_1h_sent_for_time != meeting.start_time:
            try:
                MeetingReminderService.send_meeting_reminder(meeting, window_type="1h")
            except Exception as e:
                logger.error(f"Failed sending 1h reminder for meeting {meeting.id}: {e}", exc_info=True)
