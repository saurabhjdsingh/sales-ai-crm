import logging
import re
from datetime import timedelta
from typing import List, Optional
from uuid import UUID

from django.core.mail import send_mail
from django.db import transaction
from django.utils import timezone

from apps.activities.models import Activity
from apps.ai_engine.services.context_builder import ContextBuilder
from apps.ai_engine.services.providers.factory import LLMProviderFactory
from apps.common.enums import ActivityType
from apps.emails.models import EmailAccount, EmailMessage, EmailThread
from apps.sequences.actions.registry import ActionHandlerRegistry
from apps.sequences.models import (
    DelayUnit,
    DraftStatus,
    EnrollmentStatus,
    ExecutionStatus,
    Sequence,
    SequenceEmailDraft,
    SequenceEnrollment,
    SequenceStep,
    SequenceStepExecution,
)
from apps.sequences.services.link_tracker import LinkTrackerService

logger = logging.getLogger(__name__)


def get_public_base_url(request=None, fallback_base_url: str = "") -> str:
    """
    Computes the true public base URL for tracking links/pixels.
    Handles Cloudflare Tunnels, X-Forwarded-Host, and SITE_URL environment settings.
    Ensures HTTPS protocol for external proxy domains (e.g. pinggy, ngrok, cloudflare).
    """
    from django.conf import settings

    site_url = getattr(settings, "SITE_URL", "").strip()
    if site_url and "localhost" not in site_url and "127.0.0.1" not in site_url:
        url = site_url.rstrip("/")
        if not url.startswith("http://") and not url.startswith("https://"):
            url = "https://" + url
        return url

    if request:
        forwarded_host = request.META.get("HTTP_X_FORWARDED_HOST") or request.META.get("HTTP_HOST", "")
        forwarded_proto = request.META.get("HTTP_X_FORWARDED_PROTO") or ("https" if request.is_secure() else "http")

        if forwarded_host:
            host = forwarded_host.split(",")[0].strip()
            # Force https for public tunnels/domains (e.g. pinggy, ngrok, cloudflare, custom domains)
            if "localhost" not in host and "127.0.0.1" not in host:
                forwarded_proto = "https"
            return f"{forwarded_proto}://{host}".rstrip("/")

        uri = request.build_absolute_uri("/").rstrip("/")
        if "localhost" not in uri and "127.0.0.1" not in uri:
            if uri.startswith("http://"):
                uri = "https://" + uri[7:]
        return uri

    if fallback_base_url and "localhost" not in fallback_base_url and "127.0.0.1" not in fallback_base_url:
        if fallback_base_url.startswith("http://"):
            fallback_base_url = "https://" + fallback_base_url[7:]
        return fallback_base_url.rstrip("/")

    return (site_url or fallback_base_url or getattr(settings, "FRONTEND_URL", "http://localhost:8000")).rstrip("/")


class SequenceEngineService:
    """
    Core engine service for processing sequence step execution, draft approval & sending,
    task completion progression, and sequence advancement.
    """

    @staticmethod
    def enroll_contacts(
        sequence_id: UUID,
        contact_ids: List[UUID],
        user,
        company_id: Optional[UUID] = None,
        deal_id: Optional[UUID] = None,
    ) -> List[SequenceEnrollment]:
        """Bulk or single enrollment of contacts into a Sequence."""
        try:
            sequence = Sequence.objects.get(id=sequence_id, is_active=True)
        except Sequence.DoesNotExist:
            raise ValueError(f"Sequence {sequence_id} is not active or does not exist.")

        first_step = sequence.steps.order_by("step_number").first()
        if not first_step:
            raise ValueError(f"Sequence '{sequence.name}' has no steps configured.")

        enrollments = []
        now = timezone.now()

        for c_id in contact_ids:
            # Check if contact is already actively enrolled
            existing = SequenceEnrollment.objects.filter(
                sequence=sequence,
                contact_id=c_id,
                status__in=[
                    EnrollmentStatus.RUNNING,
                    EnrollmentStatus.WAITING,
                    EnrollmentStatus.WAITING_APPROVAL,
                ],
            ).first()

            if existing:
                logger.info("Contact %s already actively enrolled in %s", c_id, sequence.name)
                enrollments.append(existing)
                continue

            # Calculate initial execution time based on first step delay
            delay = first_step.delay
            unit = first_step.delay_unit
            if delay == 0:
                next_exec = now
            else:
                if unit == DelayUnit.MINUTES:
                    delta = timedelta(minutes=delay)
                elif unit == DelayUnit.HOURS:
                    delta = timedelta(hours=delay)
                else:
                    delta = timedelta(days=delay)
                next_exec = now + delta

            enrollment = SequenceEnrollment.objects.create(
                sequence=sequence,
                contact_id=c_id,
                company_id=company_id or getattr(c_id, "company_id", None),
                deal_id=deal_id,
                enrolled_by=user,
                status=EnrollmentStatus.RUNNING if delay == 0 else EnrollmentStatus.WAITING,
                current_step_number=first_step.step_number,
                next_execution_at=next_exec,
                created_by=user,
                updated_by=user,
            )

            # Log Activity
            Activity.objects.create(
                activity_type=ActivityType.SEQUENCE_ENROLLED,
                title=f"Enrolled in Sequence: '{sequence.name}'",
                description=f"Contact enrolled by {user.get_full_name() if user else 'System'}.",
                contact_id=c_id,
                company_id=enrollment.company_id,
                deal_id=deal_id,
                performed_by=user,
                metadata={"sequence_id": str(sequence.id), "enrollment_id": str(enrollment.id)},
                created_by=user,
            )
            enrollments.append(enrollment)

            # Evaluate auto-stop criteria immediately at enrollment time
            from apps.sequences.services.auto_stop import AutoStopService
            AutoStopService.check_and_stop_single_enrollment(enrollment)

        return enrollments

    @staticmethod
    def process_due_executions() -> int:
        """
        Periodic worker function called by Celery.
        Evaluates active sequence enrollments whose next_execution_at <= now().
        """
        now = timezone.now()
        due_enrollments = SequenceEnrollment.objects.filter(
            sequence__is_active=True,
            status__in=[EnrollmentStatus.RUNNING, EnrollmentStatus.WAITING],
            next_execution_at__lte=now,
        ).select_related("sequence", "contact", "company", "deal")

        processed_count = 0
        for enrollment in due_enrollments:
            try:
                SequenceEngineService.execute_current_step(enrollment)
                processed_count += 1
            except Exception as e:
                logger.error("Error processing sequence enrollment %s: %s", enrollment.id, e, exc_info=True)

        return processed_count

    @staticmethod
    @transaction.atomic
    def execute_current_step(enrollment: SequenceEnrollment):
        """Executes the current step for a single enrollment."""
        if enrollment.status in [EnrollmentStatus.STOPPED, EnrollmentStatus.PAUSED, EnrollmentStatus.COMPLETED]:
            logger.info("Enrollment %s is in status '%s', skipping step execution", enrollment.id, enrollment.status)
            return

        from apps.sequences.services.auto_stop import AutoStopService
        if AutoStopService.check_and_stop_single_enrollment(enrollment):
            logger.info("Enrollment %s was auto-stopped based on stage rules before executing step", enrollment.id)
            return

        step = enrollment.sequence.steps.filter(step_number=enrollment.current_step_number).first()

        if not step:
            # Sequence has ended
            SequenceEngineService.complete_enrollment(enrollment)
            return

        # Get or create step execution
        execution, created = SequenceStepExecution.objects.get_or_create(
            enrollment=enrollment,
            step=step,
            defaults={
                "status": ExecutionStatus.PENDING,
                "scheduled_at": timezone.now(),
                "created_by": enrollment.enrolled_by,
                "updated_by": enrollment.enrolled_by,
            },
        )

        if execution.status in [ExecutionStatus.COMPLETED, ExecutionStatus.SKIPPED]:
            # Already completed, advance
            SequenceEngineService.advance_enrollment_to_next_step(enrollment)
            return

        if execution.status in [ExecutionStatus.EXECUTING, ExecutionStatus.WAITING_APPROVAL]:
            # Already created & waiting for rep action (task outcome or email approval)
            logger.info("Execution %s for enrollment %s is already in status '%s', skipping duplicate execution", execution.id, enrollment.id, execution.status)
            return

        # Fetch handler from registry
        handler = ActionHandlerRegistry.get_handler(step.action_type)
        result = handler.execute(execution)

        if result.should_advance:
            SequenceEngineService.advance_enrollment_to_next_step(enrollment)

    @staticmethod
    @transaction.atomic
    def advance_enrollment_to_next_step(enrollment: SequenceEnrollment):
        """Advances enrollment to current_step_number + 1."""
        next_step_num = enrollment.current_step_number + 1
        next_step = enrollment.sequence.steps.filter(step_number=next_step_num).first()

        if not next_step:
            SequenceEngineService.complete_enrollment(enrollment)
            return

        now = timezone.now()
        delay = next_step.delay
        unit = next_step.delay_unit

        if delay == 0:
            next_exec = now
        else:
            if unit == DelayUnit.MINUTES:
                delta = timedelta(minutes=delay)
            elif unit == DelayUnit.HOURS:
                delta = timedelta(hours=delay)
            else:
                delta = timedelta(days=delay)
            next_exec = now + delta

        enrollment.current_step_number = next_step_num
        enrollment.next_execution_at = next_exec
        enrollment.status = EnrollmentStatus.RUNNING if delay == 0 else EnrollmentStatus.WAITING
        enrollment.save(update_fields=["current_step_number", "next_execution_at", "status", "updated_at"])

        # If zero delay, execute immediately
        if delay == 0:
            SequenceEngineService.execute_current_step(enrollment)

    @staticmethod
    def complete_enrollment(enrollment: SequenceEnrollment):
        """Marks enrollment as COMPLETED and logs timeline activity."""
        enrollment.status = EnrollmentStatus.COMPLETED
        enrollment.next_execution_at = None
        enrollment.save(update_fields=["status", "next_execution_at", "updated_at"])

        Activity.objects.create(
            activity_type=ActivityType.SEQUENCE_COMPLETED,
            title=f"Sequence Completed: '{enrollment.sequence.name}'",
            description=f"All steps completed successfully for {enrollment.contact.full_name}.",
            contact=enrollment.contact,
            company=enrollment.company,
            deal=enrollment.deal,
            performed_by=enrollment.enrolled_by,
            metadata={"sequence_id": str(enrollment.sequence.id)},
            created_by=enrollment.enrolled_by,
        )
        logger.info("Sequence %s completed for contact %s.", enrollment.sequence.name, enrollment.contact.full_name)

    @staticmethod
    @transaction.atomic
    def handle_task_completion(task, stop_sequence: bool = False, stop_reason: str = None):
        """Called when a sequence task is marked COMPLETED."""
        if not task.sequence_execution_id:
            return

        try:
            execution = SequenceStepExecution.objects.select_related("enrollment__contact", "enrollment__sequence", "step").get(
                id=task.sequence_execution_id
            )
        except SequenceStepExecution.DoesNotExist:
            logger.error("SequenceStepExecution %s not found for task %s", task.sequence_execution_id, task.id)
            return

        now = timezone.now()
        execution.status = ExecutionStatus.COMPLETED
        execution.task_outcome = task.outcome
        execution.completed_at = now
        execution.save(update_fields=["status", "task_outcome", "completed_at", "updated_at"])

        enrollment = execution.enrollment

        # Terminal outcomes that automatically stop sequence
        terminal_outcomes = ["meeting_booked", "not_interested", "wrong_number"]
        is_terminal = task.outcome in terminal_outcomes if task.outcome else False

        if stop_sequence or is_terminal:
            outcome_display = task.get_outcome_display() if hasattr(task, 'get_outcome_display') and task.outcome else (task.outcome or "Task Completed")
            reason = stop_reason or f"Task Outcome: {outcome_display} (Sequence Stopped)"

            enrollment.status = EnrollmentStatus.STOPPED
            enrollment.stop_reason = reason
            enrollment.stopped_at = now
            enrollment.next_execution_at = None
            enrollment.save(update_fields=["status", "stop_reason", "stopped_at", "next_execution_at", "updated_at"])

            # Delete any pending AI email drafts generated for this enrollment
            SequenceEmailDraft.objects.filter(enrollment=enrollment, status=DraftStatus.DRAFT_PENDING).delete()

            Activity.objects.create(
                activity_type=ActivityType.SEQUENCE_STOPPED,
                title=f"Sequence Stopped: {reason}",
                description=f"Sequence '{enrollment.sequence.name}' stopped after task completion for {enrollment.contact.full_name}.",
                contact=enrollment.contact,
                company=enrollment.company,
                deal=enrollment.deal,
                performed_by=task.updated_by or task.owner,
                metadata={"sequence_id": str(enrollment.sequence.id), "task_id": str(task.id), "outcome": task.outcome},
                created_by=task.updated_by or task.owner,
            )
            logger.info("Sequence %s stopped on task completion for contact %s (Reason: %s)", enrollment.sequence.name, enrollment.contact.full_name, reason)
        else:
            # Advance enrollment to next step
            SequenceEngineService.advance_enrollment_to_next_step(enrollment)

    @staticmethod
    @transaction.atomic
    def approve_and_send_draft(
        draft: SequenceEmailDraft,
        user,
        updated_subject: Optional[str] = None,
        updated_reply_to: Optional[str] = None,
        updated_body_html: Optional[str] = None,
        updated_body_text: Optional[str] = None,
        base_url: str = "http://localhost:8000",
    ) -> SequenceEmailDraft:
        """Approves and sends an AI-generated draft."""
        if draft.status not in [DraftStatus.DRAFT_PENDING, DraftStatus.APPROVED]:
            raise ValueError(f"Draft {draft.id} cannot be approved from status '{draft.status}'.")

        if updated_subject is not None:
            draft.subject = updated_subject
        if updated_reply_to is not None:
            draft.reply_to = updated_reply_to
        if not draft.reply_to and getattr(user, "email", None):
            draft.reply_to = user.email

        if updated_body_text is not None:
            draft.body_text = updated_body_text
            # Convert text paragraphs to HTML breaks if updated_body_html not explicitly provided
            if updated_body_html is not None:
                draft.body_html = updated_body_html
            else:
                draft.body_html = "".join([f"<p>{p.replace('\n', '<br>')}</p>" for p in updated_body_text.split("\n\n")])
        elif updated_body_html is not None:
            draft.body_html = updated_body_html
            draft.body_text = re_strip_html(updated_body_html)

        sequence = draft.enrollment.sequence
        effective_base_url = get_public_base_url(fallback_base_url=base_url)

        # 1. Stealth link click wrapping
        final_html = draft.body_html
        if sequence.track_clicks:
            final_html = LinkTrackerService.wrap_links_in_html(draft, effective_base_url, html_content=final_html)

        # 2. Open tracking pixel injection
        if sequence.track_opens:
            pixel_url = f"{effective_base_url.rstrip('/')}/api/v1/sequences/track/open/{draft.tracking_token}/pixel.png"
            pixel_tag = f'<img src="{pixel_url}" width="1" height="1" style="display:none !important;" alt="" />'
            final_html += f"\n{pixel_tag}"
            logger.info("Injected open tracking pixel for draft %s with URL: %s", draft.id, pixel_url)

        draft.body_html = final_html

        # 3. Send email via User Email Account or Django Mail Fallback
        contact = draft.contact
        recipient_email = contact.email
        if not recipient_email:
            raise ValueError(f"Contact {contact.full_name} has no valid email address.")

        email_sent = False
        message_id = None
        thread_id = None

        try:
            account = EmailAccount.objects.filter(user=user, status="connected").first()
            if account:
                # Send via Gmail Provider
                from apps.emails.providers.factory import ProviderFactory

                provider = ProviderFactory.get_provider(account.provider_type)
                sent_data = provider.send_email(
                    account=account,
                    to_email=recipient_email,
                    subject=draft.subject,
                    body_html=final_html,
                    body_text=draft.body_text,
                    reply_to=draft.reply_to,
                )
                message_id = sent_data.get("gmail_message_id")
                thread_id = sent_data.get("gmail_thread_id")
                email_sent = True
        except Exception as ex:
            logger.warning("Failed to send sequence email via Gmail OAuth: %s. Falling back to default mailer.", ex)

        if not email_sent:
            from django.core.mail import EmailMultiAlternatives

            headers = {"Reply-To": draft.reply_to} if draft.reply_to else None
            msg = EmailMultiAlternatives(
                subject=draft.subject,
                body=draft.body_text,
                from_email=getattr(user, "email", None),
                to=[recipient_email],
                headers=headers,
            )
            if final_html:
                msg.attach_alternative(final_html, "text/html")
            msg.send(fail_silently=False)

        now = timezone.now()
        draft.status = DraftStatus.SENT
        draft.approved_at = now
        draft.sent_at = now
        draft.gmail_message_id = message_id
        draft.gmail_thread_id = thread_id
        draft.save()

        # Update step execution & enrollment
        if draft.execution:
            draft.execution.status = ExecutionStatus.COMPLETED
            draft.execution.completed_at = now
            draft.execution.save(update_fields=["status", "completed_at", "updated_at"])

        # Log Activity
        Activity.objects.create(
            activity_type=ActivityType.SEQUENCE_EMAIL_SENT,
            title=f"Sequence Email Sent: '{draft.subject}'",
            description=f"Approved & sent to {contact.full_name} ({recipient_email}).",
            contact=contact,
            company=draft.enrollment.company,
            deal=draft.enrollment.deal,
            performed_by=user,
            metadata={"draft_id": str(draft.id), "sequence_id": str(sequence.id)},
            created_by=user,
        )

        # Advance sequence enrollment
        SequenceEngineService.advance_enrollment_to_next_step(draft.enrollment)
        return draft

    @staticmethod
    def regenerate_draft(draft: SequenceEmailDraft, user, feedback_prompt: str = "") -> SequenceEmailDraft:
        """Regenerates AI email draft with user feedback."""
        contact = draft.contact
        builder = ContextBuilder()
        crm_context = builder.build_contact_context(contact.id)

        system_prompt = (
            "You are an expert sales representative refining an email draft.\n"
            "Format response as JSON with keys: 'subject', 'body_html', 'body_text', 'context_rationale'."
        )
        prompt = (
            f"Original Draft:\nSubject: {draft.subject}\nBody: {draft.body_text}\n\n"
            f"User Feedback Instruction: {feedback_prompt}\n\n"
            f"CRM Context:\n{crm_context}\n\n"
            "Regenerate the follow-up email JSON response."
        )

        provider = LLMProviderFactory.get_provider(user=user)
        res = provider.generate_response(system_prompt=system_prompt, prompt=prompt, response_format="json", purpose="sales_sequences")

        draft.subject = res.get("subject", draft.subject)
        draft.body_html = res.get("body_html", res.get("body_text", draft.body_html))
        draft.body_text = res.get("body_text", draft.body_text)
        draft.context_summary = f"Regenerated with feedback: '{feedback_prompt}'. Rationale: {res.get('context_rationale', '')}"
        draft.updated_by = user
        draft.save()

        return draft

    @staticmethod
    def reject_draft(draft: SequenceEmailDraft, user, reason: str = "", stop_enrollment: bool = True) -> SequenceEmailDraft:
        """
        Rejects/discards an AI draft.
        If stop_enrollment is True, closes/stops the contact's sequence enrollment.
        If stop_enrollment is False, skips this email step and advances the sequence.
        """
        now = timezone.now()
        draft.status = DraftStatus.REJECTED
        draft.updated_by = user
        draft.save()

        if draft.execution:
            draft.execution.status = ExecutionStatus.SKIPPED
            draft.execution.error_message = reason or "Draft rejected by user"
            draft.execution.completed_at = now
            draft.execution.save(update_fields=["status", "error_message", "completed_at", "updated_at"])

        enrollment = draft.enrollment
        if stop_enrollment and enrollment:
            enrollment.status = EnrollmentStatus.STOPPED
            enrollment.stop_reason = f"Draft Rejected & Closed: {reason or 'User rejected draft'}"
            enrollment.stopped_at = now
            enrollment.save(update_fields=["status", "stop_reason", "stopped_at", "updated_at"])

            Activity.objects.create(
                activity_type=ActivityType.SEQUENCE_STOPPED,
                title=f"Sequence Stopped: {draft.contact.full_name}",
                description=f"Draft rejected by {getattr(user, 'email', 'user')}. Reason: {reason or 'Manual rejection'}",
                contact=draft.contact,
                company=enrollment.company,
                deal=enrollment.deal,
                performed_by=user,
                metadata={"draft_id": str(draft.id), "sequence_id": str(enrollment.sequence.id)},
                created_by=user,
            )
        elif enrollment:
            SequenceEngineService.advance_enrollment_to_next_step(enrollment)

        return draft


def re_strip_html(html: str) -> str:
    """Helper to convert basic html tags to plain text."""
    clean = re.sub(r"<br\s*/?>", "\n", html)
    clean = re.sub(r"</p>", "\n\n", clean)
    clean = re.sub(r"<[^>]+>", "", clean)
    return clean.strip()
