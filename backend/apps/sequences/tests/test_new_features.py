import uuid
from django.test import TestCase
from apps.accounts.models import User
from apps.contacts.models import Contact
from apps.companies.models import Company
from apps.deals.models import Deal
from apps.tasks.models import Task
from apps.common.enums import ContactStage, DealStage
from apps.sequences.models import (
    Sequence, SequenceStep, SequenceEnrollment, SequenceStepExecution,
    SequenceActionType, EnrollmentStatus, ExecutionStatus, SequenceEmailDraft, SequenceLinkClick
)
from apps.sequences.actions.update_stage import UpdateStageActionHandler
from apps.sequences.services.auto_stop import AutoStopService
from apps.sequences.services.link_tracker import LinkTrackerService
from apps.deals.services import DealService


class SequenceNewFeaturesTestCase(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="rep1", email="rep1@example.com", password="password")
        self.owner = User.objects.create_user(username="author1", email="author1@example.com", password="password")
        self.company = Company.objects.create(name="Acme Inc", created_by=self.user)
        self.contact = Contact.objects.create(
            first_name="Jane", last_name="Doe", email="jane@acme.com",
            company=self.company, stage=ContactStage.COLD, owner=self.user, created_by=self.user
        )
        self.deal = Deal.objects.create(
            name="Acme Renewal", company=self.company,
            stage=DealStage.LEAD, owner=self.user, created_by=self.user
        )
        from apps.deals.models import DealContact
        DealContact.objects.create(
            deal=self.deal, contact=self.contact, is_primary=True, role="Decision Maker"
        )

    def test_update_stage_action_handler(self):
        sequence = Sequence.objects.create(name="Stage Update Seq", created_by=self.owner)
        step = SequenceStep.objects.create(
            sequence=sequence, step_number=1, action_type=SequenceActionType.UPDATE_STAGE,
            delay=0, delay_unit="days", configuration={"target_stage": ContactStage.INTERESTED}
        )
        enrollment = SequenceEnrollment.objects.create(
            sequence=sequence, contact=self.contact, company=self.company, deal=self.deal,
            status=EnrollmentStatus.RUNNING, enrolled_by=self.user
        )
        import uuid
        execution = SequenceStepExecution.objects.create(
            enrollment=enrollment, step=step, status=ExecutionStatus.PENDING
        )

        handler = UpdateStageActionHandler()
        result = handler.execute(execution)

        self.assertTrue(result.success)
        self.assertTrue(result.should_advance)
        self.contact.refresh_from_db()
        self.assertEqual(self.contact.stage, ContactStage.INTERESTED)

    def test_per_sequence_auto_stop_contact_stage(self):
        sequence = Sequence.objects.create(
            name="Custom Auto Stop Seq", created_by=self.owner,
            auto_stop_contact_stages=["on_hold", "not_interested"]
        )
        enrollment = SequenceEnrollment.objects.create(
            sequence=sequence, contact=self.contact, company=self.company, deal=self.deal,
            status=EnrollmentStatus.RUNNING, enrolled_by=self.user
        )

        # Stage change to cold shouldn't stop sequence
        AutoStopService.check_and_stop_for_contact_stage(self.contact, ContactStage.APPROACHING)
        enrollment.refresh_from_db()
        self.assertEqual(enrollment.status, EnrollmentStatus.RUNNING)

        # Stage change to on_hold should stop sequence
        AutoStopService.check_and_stop_for_contact_stage(self.contact, ContactStage.ON_HOLD)
        enrollment.refresh_from_db()
        self.assertEqual(enrollment.status, EnrollmentStatus.STOPPED)
        self.assertIn("on_hold", enrollment.stop_reason)

    def test_deal_stage_sync_and_sequence_auto_stop(self):
        sequence = Sequence.objects.create(
            name="Deal Auto Stop Seq", created_by=self.owner,
            auto_stop_deal_stages=["closed_won"]
        )
        enrollment = SequenceEnrollment.objects.create(
            sequence=sequence, contact=self.contact, company=self.company, deal=self.deal,
            status=EnrollmentStatus.RUNNING, enrolled_by=self.user
        )

        DealService.update_deal(self.deal, {"stage": DealStage.CLOSED_WON}, self.user)

        self.contact.refresh_from_db()
        self.assertEqual(self.contact.stage, ContactStage.WON)

        enrollment.refresh_from_db()
        self.assertEqual(enrollment.status, EnrollmentStatus.STOPPED)

    def test_telemetry_auto_task_creation_click_threshold(self):
        sequence = Sequence.objects.create(
            name="Telemetry Task Seq", created_by=self.owner,
            auto_task_on_click_enabled=True, auto_task_click_count=2,
            task_assignment_strategy="sequence_owner"
        )
        enrollment = SequenceEnrollment.objects.create(
            sequence=sequence, contact=self.contact, company=self.company, deal=self.deal,
            status=EnrollmentStatus.RUNNING, enrolled_by=self.user, click_count=1
        )
        draft_token = str(uuid.uuid4())
        click_token = str(uuid.uuid4())
        draft = SequenceEmailDraft.objects.create(
            enrollment=enrollment, contact=self.contact, subject="Hello",
            body_html="<p>Test</p>", tracking_token=draft_token
        )
        link_click = SequenceLinkClick.objects.create(
            draft=draft, click_token=click_token, original_url="https://radar36.com"
        )

        LinkTrackerService.handle_click(click_token)

        enrollment.refresh_from_db()
        self.assertEqual(enrollment.click_count, 2)

        task = Task.objects.filter(contact=self.contact, title__icontains="clicked links in sales sequence email more than").first()
        self.assertIsNotNone(task)
        self.assertEqual(task.owner, self.owner)
        self.assertEqual(task.company, self.company)
        self.assertEqual(task.deal, self.deal)

    def test_enroll_contact_already_in_auto_stop_stage(self):
        self.contact.stage = "unresponsive"
        self.contact.save(update_fields=["stage"])

        sequence = Sequence.objects.create(
            name="Unresponsive Auto Stop Seq", created_by=self.owner,
            auto_stop_contact_stages=["unresponsive", "not_interested"]
        )
        SequenceStep.objects.create(
            sequence=sequence, step_number=1, action_type=SequenceActionType.AI_EMAIL,
            delay=0, delay_unit="days"
        )

        from apps.sequences.services.sequence_engine import SequenceEngineService
        enrollments = SequenceEngineService.enroll_contacts(
            sequence_id=sequence.id, contact_ids=[self.contact.id], user=self.user
        )

        self.assertEqual(len(enrollments), 1)
        enrollment = enrollments[0]
        self.assertEqual(enrollment.status, EnrollmentStatus.STOPPED)
        self.assertIn("unresponsive", enrollment.stop_reason)
