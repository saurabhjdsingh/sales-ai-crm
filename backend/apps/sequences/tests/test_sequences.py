import pytest
from datetime import timedelta
from django.utils import timezone

from apps.accounts.models import User
from apps.companies.models import Company
from apps.contacts.models import Contact
from apps.deals.models import Deal
from apps.emails.models import EmailMessage, EmailThread
from apps.sequences.models import (
    DelayUnit,
    DraftStatus,
    EnrollmentStatus,
    ExecutionStatus,
    Sequence,
    SequenceActionType,
    SequenceEmailDraft,
    SequenceEnrollment,
    SequenceLinkClick,
    SequenceStep,
    SequenceStepExecution,
)
from apps.sequences.services.auto_stop import AutoStopService
from apps.sequences.services.link_tracker import LinkTrackerService
from apps.sequences.services.sequence_engine import SequenceEngineService
from apps.tasks.models import Task
from apps.tasks.services import TaskService


@pytest.mark.django_db
class TestSequenceEngine:

    @pytest.fixture
    def user(self):
        return User.objects.create_user(
            email="salesrep@example.com",
            username="salesrep",
            password="Password123!",
            first_name="Jane",
            last_name="Doe",
        )

    @pytest.fixture
    def company(self, user):
        return Company.objects.create(name="Acme Corp", owner=user)

    @pytest.fixture
    def contact(self, company, user):
        return Contact.objects.create(
            first_name="John",
            last_name="Smith",
            email="john@acmecorp.com",
            company=company,
            owner=user,
        )

    @pytest.fixture
    def deal(self, company, user):
        return Deal.objects.create(name="Acme Enterprise Deal", company=company, owner=user)

    @pytest.fixture
    def sequence(self, user):
        seq = Sequence.objects.create(
            name="Outreach Sequence",
            description="3 step test sequence",
            is_active=True,
            created_by=user,
            updated_by=user,
        )
        SequenceStep.objects.create(
            sequence=seq,
            step_number=1,
            action_type=SequenceActionType.AI_EMAIL,
            delay=0,
            delay_unit=DelayUnit.DAYS,
            configuration={"prompt_instruction": "Introduce product.", "tone": "friendly"},
        )
        SequenceStep.objects.create(
            sequence=seq,
            step_number=2,
            action_type=SequenceActionType.WAIT,
            delay=2,
            delay_unit=DelayUnit.DAYS,
            configuration={},
        )
        SequenceStep.objects.create(
            sequence=seq,
            step_number=3,
            action_type=SequenceActionType.MANUAL_TASK,
            delay=0,
            delay_unit=DelayUnit.DAYS,
            configuration={
                "title": "Call John",
                "description": "Follow up call.",
                "requires_outcome": True,
            },
        )
        return seq

    def test_enrollment_creation(self, sequence, contact, user):
        enrollments = SequenceEngineService.enroll_contacts(
            sequence_id=sequence.id,
            contact_ids=[contact.id],
            user=user,
        )
        assert len(enrollments) == 1
        enrollment = enrollments[0]
        assert enrollment.contact == contact
        assert enrollment.sequence == sequence
        assert enrollment.current_step_number == 1

    def test_ai_email_draft_creation(self, sequence, contact, user, monkeypatch):
        # Mock LLM Provider response
        class DummyProvider:
            def generate_response(self, system_prompt, prompt, response_format):
                return {
                    "subject": "Tailored Outreach for Acme",
                    "body_html": "<p>Hello John, let's connect.</p>",
                    "body_text": "Hello John, let's connect.",
                    "context_rationale": "Tailored based on Acme Corp profile.",
                }

        monkeypatch.setattr(
            "apps.ai_engine.services.providers.factory.LLMProviderFactory.get_provider",
            lambda: DummyProvider(),
        )

        enrollments = SequenceEngineService.enroll_contacts(
            sequence_id=sequence.id,
            contact_ids=[contact.id],
            user=user,
        )
        enrollment = enrollments[0]

        # Execute current step (Step 1: AI Email)
        SequenceEngineService.execute_current_step(enrollment)

        enrollment.refresh_from_db()
        assert enrollment.status == EnrollmentStatus.WAITING_APPROVAL

        draft = SequenceEmailDraft.objects.get(enrollment=enrollment)
        assert draft.subject == "Tailored Outreach for Acme"
        assert draft.status == DraftStatus.DRAFT_PENDING
        assert draft.contact == contact

    def test_approval_and_send_advances_sequence(self, sequence, contact, user, monkeypatch):
        # Setup draft
        enrollment = SequenceEngineService.enroll_contacts(
            sequence_id=sequence.id,
            contact_ids=[contact.id],
            user=user,
        )[0]

        execution = SequenceStepExecution.objects.create(
            enrollment=enrollment,
            step=sequence.steps.get(step_number=1),
            status=ExecutionStatus.WAITING_APPROVAL,
        )
        draft = SequenceEmailDraft.objects.create(
            execution=execution,
            enrollment=enrollment,
            contact=contact,
            sender=user,
            subject="Test Subject",
            body_html="<p>Test <a href='https://example.com/demo'>Demo Link</a></p>",
            body_text="Test Demo Link",
            status=DraftStatus.DRAFT_PENDING,
        )

        # Approve draft
        SequenceEngineService.approve_and_send_draft(
            draft=draft,
            user=user,
            base_url="http://localhost:8000",
        )

        draft.refresh_from_db()
        assert draft.status == DraftStatus.SENT
        assert draft.sent_at is not None

        # Check stealth click link tracking wrapping
        link_click = SequenceLinkClick.objects.get(draft=draft)
        assert link_click.original_url == "https://example.com/demo"
        assert f"/r/{link_click.click_token}" in draft.body_html

        # Enrollment should advance to Step 2 (Wait 2 days)
        enrollment.refresh_from_db()
        assert enrollment.current_step_number == 2
        assert enrollment.status == EnrollmentStatus.WAITING

    def test_stealth_link_click_telemetry(self, sequence, contact, user):
        enrollment = SequenceEnrollment.objects.create(sequence=sequence, contact=contact, enrolled_by=user)
        draft = SequenceEmailDraft.objects.create(
            enrollment=enrollment,
            contact=contact,
            sender=user,
            subject="Test",
            body_html="body",
            body_text="body",
        )
        link = SequenceLinkClick.objects.create(
            draft=draft,
            click_token="testtoken123",
            original_url="https://acme.com/landing",
        )

        dest = LinkTrackerService.handle_click("testtoken123")
        assert dest == "https://acme.com/landing"

        link.refresh_from_db()
        draft.refresh_from_db()
        assert link.click_count == 1
        assert draft.click_count == 1

    def test_task_outcome_advances_sequence(self, sequence, contact, user):
        enrollment = SequenceEnrollment.objects.create(
            sequence=sequence,
            contact=contact,
            enrolled_by=user,
            current_step_number=3,
            status=EnrollmentStatus.RUNNING,
        )
        task_step = sequence.steps.get(step_number=3)
        execution = SequenceStepExecution.objects.create(
            enrollment=enrollment,
            step=task_step,
            status=ExecutionStatus.PENDING,
        )

        # Execute Manual Task step
        SequenceEngineService.execute_current_step(enrollment)

        execution.refresh_from_db()
        assert execution.task is not None
        task = execution.task
        assert task.requires_outcome is True
        assert task.sequence_execution_id == execution.id

        # Complete task with outcome
        TaskService.complete_task(task, user, outcome="requested_callback", outcome_notes="Call again Monday.")

        execution.refresh_from_db()
        assert execution.status == ExecutionStatus.COMPLETED
        assert execution.task_outcome == "requested_callback"

        # Enrollment should finish sequence
        enrollment.refresh_from_db()
        assert enrollment.status == EnrollmentStatus.COMPLETED

    def test_auto_stop_on_incoming_reply(self, sequence, contact, user):
        enrollment = SequenceEnrollment.objects.create(
            sequence=sequence,
            contact=contact,
            enrolled_by=user,
            status=EnrollmentStatus.WAITING,
        )

        # Trigger auto stop for reply
        AutoStopService.check_and_stop_for_reply(contact.id)

        enrollment.refresh_from_db()
        assert enrollment.status == EnrollmentStatus.STOPPED
        assert enrollment.stop_reason == "Customer Replied"

    def test_auto_stop_on_contact_stage_change(self, sequence, contact, user):
        enrollment = SequenceEnrollment.objects.create(
            sequence=sequence,
            contact=contact,
            enrolled_by=user,
            status=EnrollmentStatus.RUNNING,
        )

        # Trigger stage change to do_not_contact
        AutoStopService.check_and_stop_for_contact_stage(contact, "do_not_contact")

        enrollment.refresh_from_db()
        assert enrollment.status == EnrollmentStatus.STOPPED
        assert "Do Not Contact" in enrollment.stop_reason

    def test_task_outcome_stop_sequence(self, sequence, contact, user):
        enrollment = SequenceEnrollment.objects.create(
            sequence=sequence,
            contact=contact,
            enrolled_by=user,
            current_step_number=3,
            status=EnrollmentStatus.RUNNING,
        )
        task_step = sequence.steps.get(step_number=3)
        execution = SequenceStepExecution.objects.create(
            enrollment=enrollment,
            step=task_step,
            status=ExecutionStatus.PENDING,
        )

        SequenceEngineService.execute_current_step(enrollment)

        execution.refresh_from_db()
        task = execution.task

        # Complete call task with outcome 'answered' and stop_sequence=True
        TaskService.complete_task(
            task,
            user,
            outcome="answered",
            outcome_notes="Call answered, meeting requested later.",
            stop_sequence=True,
            stop_reason="Call Answered - Sequence Closed by Rep",
        )

        execution.refresh_from_db()
        assert execution.status == ExecutionStatus.COMPLETED
        assert execution.task_outcome == "answered"

        enrollment.refresh_from_db()
        assert enrollment.status == EnrollmentStatus.STOPPED
        assert "Call Answered" in enrollment.stop_reason

