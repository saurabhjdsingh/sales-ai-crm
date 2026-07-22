import logging
from django.utils import timezone
from apps.ai_engine.services.context_builder import ContextBuilder
from apps.ai_engine.services.providers.factory import LLMProviderFactory
from apps.sequences.actions.base import ActionResult, BaseActionHandler
from apps.sequences.models import DraftStatus, ExecutionStatus, EnrollmentStatus, SequenceEmailDraft
from apps.tasks.models import Notification
from apps.activities.models import Activity
from apps.common.enums import ActivityType

logger = logging.getLogger(__name__)


class AIEmailActionHandler(BaseActionHandler):
    """
    Action Handler for AI Email steps.
    Generates dynamic personalized follow-up drafts based on complete CRM context.
    NEVER sends automatically — pauses step execution for explicit human review & approval.
    """

    def execute(self, execution) -> ActionResult:
        enrollment = execution.enrollment
        step = execution.step
        contact = enrollment.contact
        user = enrollment.enrolled_by or contact.owner

        # Guard against duplicate execution / draft generation
        if execution.status == ExecutionStatus.WAITING_APPROVAL or getattr(execution, "email_draft", None) or SequenceEmailDraft.objects.filter(execution=execution).exists():
            logger.info("AI Email draft already created for execution %s, skipping duplicate creation", execution.id)
            return ActionResult(should_advance=False)

        logger.info("Executing AI Email step %d for enrollment %s (contact: %s)", step.step_number, enrollment.id, contact.full_name)

        try:
            # 1. Gather dynamic up-to-the-second CRM Context
            builder = ContextBuilder()
            crm_context = builder.build_contact_context(contact.id)

            # Include previous sequence task outcomes or previous AI email drafts if present
            previous_drafts = SequenceEmailDraft.objects.filter(
                enrollment=enrollment,
                status=DraftStatus.SENT
            ).order_by("sent_at")
            
            prev_email_lines = []
            for d in previous_drafts:
                prev_email_lines.append(f"Subject: {d.subject}\nBody:\n{d.body_text}\n---")
            
            if prev_email_lines:
                crm_context += "\n\n## Previously Sent AI Sequence Emails\n" + "\n".join(prev_email_lines)

            # 2. Get step instructions / prompt configuration
            step_config = step.configuration or {}
            custom_instruction = step_config.get("prompt_instruction", "Write a highly personalized, professional follow-up email.")
            tone = step_config.get("tone", "conversational and consultative")

            from apps.ai_engine.services.prompt_service import PromptService

            org_persona = PromptService.get_prompt(user, "copilot_system")

            system_prompt = (
                f"{org_persona}\n\n"
                "--- SEQUENCE EMAIL GENERATION INSTRUCTIONS ---\n"
                "You are an expert sales representative writing a personalized 1-to-1 follow-up outreach email for a sales sequence.\n"
                f"Tone: {tone}.\n"
                "RULES:\n"
                "1. NEVER use generic corporate filler like 'I hope this email finds you well'.\n"
                "2. Reference exact details from the provided complete CRM context (company info, job title, pain points, call summaries, past task outcomes, notes, email thread history, AI research).\n"
                "3. Keep the email concise (100-200 words), direct, personalized, and focused on starting a dialogue.\n"
                "4. Format output strictly as JSON with keys: 'subject', 'body_html', 'body_text', 'context_rationale'.\n"
            )

            prompt = (
                f"CRM Context:\n{crm_context}\n\n"
                f"User Instruction: {custom_instruction}\n\n"
                "Generate the follow-up email JSON response now."
            )

            # 3. Call LLM Provider (with graceful fallback on API/quota/key error)
            try:
                provider = LLMProviderFactory.get_provider(user=user)
                res = provider.generate_response(system_prompt=system_prompt, prompt=prompt, response_format="json", purpose="sales_sequences")
            except Exception as ai_err:
                logger.warning("LLM API call failed during sequence draft generation: %s. Using standard template.", ai_err)
                res = {
                    "subject": f"Follow up regarding {contact.company.name if contact.company else 'our conversation'}",
                    "body_text": f"Hi {contact.first_name},\n\nI wanted to follow up on our previous conversation regarding {contact.company_name if hasattr(contact, 'company_name') else 'your team'}.\n\nLet me know if you have time for a brief call this week.\n\nBest regards,\n{user.get_full_name() if user else 'Sales Team'}",
                    "context_rationale": f"Fallback draft generated due to AI service notice: {str(ai_err)[:150]}"
                }

            subject = res.get("subject", f"Follow up regarding {contact.company.name if contact.company else 'our conversation'}")
            body_html = res.get("body_html", res.get("body_text", ""))
            body_text = res.get("body_text", "")
            context_rationale = res.get("context_rationale", "Generated using latest contact, company, notes, and task history.")

            if not body_html.strip():
                body_html = f"<p>{body_text.replace(chr(10), '<br>')}</p>"

            # 4. Save Sequence Email Draft
            draft = SequenceEmailDraft.objects.create(
                execution=execution,
                enrollment=enrollment,
                contact=contact,
                sender=user,
                subject=subject,
                reply_to=getattr(user, "email", "") if user else "",
                body_html=body_html,
                body_text=body_text,
                context_summary=context_rationale,
                status=DraftStatus.DRAFT_PENDING,
                created_by=user,
                updated_by=user,
            )

            # 5. Update Execution and Enrollment status to waiting_approval
            execution.status = ExecutionStatus.WAITING_APPROVAL
            execution.executed_at = timezone.now()
            execution.save(update_fields=["status", "executed_at", "updated_at"])

            enrollment.status = EnrollmentStatus.WAITING_APPROVAL
            enrollment.save(update_fields=["status", "updated_at"])

            # 6. Notify User for Human Approval
            if user:
                Notification.objects.create(
                    user=user,
                    title="AI Email Draft Ready for Review",
                    message=f"Sequence '{enrollment.sequence.name}': AI draft for {contact.full_name} is ready for your review and approval.",
                    notification_type="sequence_draft_approval",
                    related_entity_id=draft.id,
                    related_entity_type="sequence_email_draft",
                )

            # 7. Log Activity on Contact Timeline
            Activity.objects.create(
                activity_type=ActivityType.SEQUENCE_EMAIL_DRAFTED,
                title=f"Sequence AI Draft Ready: '{subject}'",
                description=f"AI generated draft for {contact.full_name}. Awaiting rep approval before sending.",
                contact=contact,
                company=enrollment.company,
                deal=enrollment.deal,
                performed_by=user,
                metadata={"draft_id": str(draft.id), "sequence_id": str(enrollment.sequence.id)},
                created_by=user,
            )

            return ActionResult(
                success=True,
                should_advance=False,
                status=ExecutionStatus.WAITING_APPROVAL,
                message="AI Email draft created and pending user approval."
            )

        except Exception as e:
            logger.error("Error generating AI Email draft for execution %s: %s", execution.id, e, exc_info=True)
            execution.status = ExecutionStatus.FAILED
            execution.error_message = str(e)
            execution.save(update_fields=["status", "error_message", "updated_at"])
            
            enrollment.status = EnrollmentStatus.FAILED
            enrollment.stop_reason = f"AI Email generation error: {str(e)}"
            enrollment.save(update_fields=["status", "stop_reason", "updated_at"])

            return ActionResult(success=False, should_advance=False, status=ExecutionStatus.FAILED, message=str(e))

    def can_advance(self, execution) -> bool:
        try:
            return execution.email_draft.status == DraftStatus.SENT
        except Exception:
            return False
