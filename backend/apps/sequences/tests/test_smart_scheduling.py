"""
Unit tests for TimezoneResolverService, SmartScheduleEngine, and timezone-aware sequence engine integration.
"""

from datetime import datetime
from zoneinfo import ZoneInfo

from django.test import TestCase
from django.utils import timezone

from apps.common.services.timezone_resolver import TimezoneResolverService
from apps.companies.models import Company
from apps.contacts.models import Contact, TimezoneConfidence, TimezoneSource
from apps.sequences.models import (
    DraftStatus,
    SendMode,
    Sequence,
    SequenceEmailDraft,
    SequenceEnrollment,
    SequenceScheduleSetting,
    SequenceStep,
)
from apps.sequences.services.sequence_engine import SequenceEngineService
from apps.sequences.services.smart_scheduler import SmartScheduleEngine


class TimezoneResolverTests(TestCase):
    def test_single_timezone_countries(self):
        # India -> Asia/Kolkata
        tz, conf = TimezoneResolverService.resolve_contact_timezone(country="India")
        self.assertEqual(tz, "Asia/Kolkata")
        self.assertEqual(conf, "HIGH")

        # United Kingdom -> Europe/London
        tz, conf = TimezoneResolverService.resolve_contact_timezone(country="United Kingdom")
        self.assertEqual(tz, "Europe/London")
        self.assertEqual(conf, "HIGH")

        # Japan -> Asia/Tokyo
        tz, conf = TimezoneResolverService.resolve_contact_timezone(country="JP")
        self.assertEqual(tz, "Asia/Tokyo")
        self.assertEqual(conf, "HIGH")

    def test_multi_timezone_country_city_resolution(self):
        # US - New York city -> America/New_York
        tz, conf = TimezoneResolverService.resolve_contact_timezone(country="United States", city="New York")
        self.assertEqual(tz, "America/New_York")
        self.assertEqual(conf, "HIGH")

        # US - San Francisco -> America/Los_Angeles
        tz, conf = TimezoneResolverService.resolve_contact_timezone(country="USA", city="San Francisco")
        self.assertEqual(tz, "America/Los_Angeles")
        self.assertEqual(conf, "HIGH")

        # Australia - Sydney -> Australia/Sydney
        tz, conf = TimezoneResolverService.resolve_contact_timezone(country="Australia", city="Sydney")
        self.assertEqual(tz, "Australia/Sydney")
        self.assertEqual(conf, "HIGH")

    def test_multi_timezone_country_fallback(self):
        # US with unknown city -> America/New_York (primary commercial fallback)
        tz, conf = TimezoneResolverService.resolve_contact_timezone(country="United States", city="Unknown Village")
        self.assertEqual(tz, "America/New_York")
        self.assertEqual(conf, "MEDIUM")

        # Canada with no city -> America/Toronto
        tz, conf = TimezoneResolverService.resolve_contact_timezone(country="Canada")
        self.assertEqual(tz, "America/Toronto")
        self.assertEqual(conf, "MEDIUM")

    def test_unknown_country(self):
        tz, conf = TimezoneResolverService.resolve_contact_timezone(country="")
        self.assertIsNone(tz)
        self.assertEqual(conf, "UNKNOWN")


class SmartScheduleEngineTests(TestCase):
    def setUp(self):
        self.company = Company.objects.create(name="Acme Inc")
        self.contact = Contact.objects.create(
            company=self.company,
            first_name="Alice",
            last_name="Smith",
            email="alice@acme.com",
            country="United States",
            city="New York",
        )
        self.settings = SequenceScheduleSetting.get_settings()

    def test_immediate_send_mode(self):
        result = SmartScheduleEngine.calculate_send_time(self.contact, send_mode="immediate")
        self.assertEqual(result.sending_window, "immediate")
        self.assertEqual(result.schedule_source, "send_now")

    def test_smart_send_scheduling(self):
        # Monday 9:00 AM UTC = Monday 5:00 AM EST (before 8:30 AM morning window)
        approval_dt = datetime(2026, 8, 10, 9, 0, 0, tzinfo=ZoneInfo("UTC"))
        result = SmartScheduleEngine.calculate_send_time(
            self.contact, send_mode="smart_send", approval_time=approval_dt
        )
        self.assertEqual(result.scheduled_timezone, "America/New_York")
        # Should be scheduled for Monday morning window (8:30 AM EST + jitter)
        self.assertGreaterEqual(result.scheduled_at_utc, approval_dt)

    def test_sunday_exclusion_default(self):
        # Sunday 10:00 AM EST (Sunday Aug 9, 2026)
        sunday_dt = datetime(2026, 8, 9, 14, 0, 0, tzinfo=ZoneInfo("UTC"))
        result = SmartScheduleEngine.calculate_send_time(
            self.contact, send_mode="smart_send", approval_time=sunday_dt
        )
        # Should skip Sunday and schedule for Monday morning window
        self.assertIn("Monday", result.scheduled_local_time)


class SequenceSchedulingIntegrationTests(TestCase):
    def setUp(self):
        self.company = Company.objects.create(name="TechCorp")
        self.contact = Contact.objects.create(
            company=self.company,
            first_name="Bob",
            last_name="Jones",
            email="bob@techcorp.com",
            country="India",
        )
        self.sequence = Sequence.objects.create(
            name="Smart Outreach",
            is_active=True,
            default_send_mode=SendMode.SMART_SEND,
        )
        self.step = SequenceStep.objects.create(
            sequence=self.sequence,
            step_number=1,
            send_mode=SendMode.SMART_SEND,
        )
        enrollments = SequenceEngineService.enroll_contacts(
            sequence_id=self.sequence.id,
            contact_ids=[self.contact.id],
            user=None,
        )
        self.enrollment = enrollments[0]
        self.draft = SequenceEmailDraft.objects.create(
            enrollment=self.enrollment,
            contact=self.contact,
            subject="Test Subject",
            body_html="<p>Test body</p>",
            body_text="Test body",
            status=DraftStatus.DRAFT_PENDING,
        )

    def test_approve_and_schedule_smart_send(self):
        # Approve draft with smart_send mode
        updated_draft = SequenceEngineService.approve_and_send_draft(
            draft=self.draft,
            user=None,
            send_mode="smart_send",
        )
        self.assertEqual(updated_draft.status, DraftStatus.SCHEDULED)
        self.assertIsNotNone(updated_draft.scheduled_at_utc)
        self.assertEqual(updated_draft.scheduled_timezone, "Asia/Kolkata")
        self.assertEqual(updated_draft.sending_mode, "smart_send")

    def test_approve_and_send_now_override(self):
        # Approve draft with force send_now=True
        updated_draft = SequenceEngineService.approve_and_send_draft(
            draft=self.draft,
            user=None,
            send_now=True,
        )
        self.assertEqual(updated_draft.status, DraftStatus.SENT)
        self.assertIsNotNone(updated_draft.sent_at)
