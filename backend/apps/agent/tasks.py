import logging
from celery import shared_task
from django.contrib.auth import get_user_model
from django.utils import timezone

from apps.agent.enums import ApprovalStatus
from apps.agent.models import PendingApproval, ResearchRun
from apps.agent.services.research_engine import ResearchEngine
from apps.common.enums import ResearchStatus

logger = logging.getLogger(__name__)


@shared_task(
    name="apps.agent.tasks.execute_research_pipeline",
    bind=True,
    max_retries=2,
    default_retry_delay=60,
)
def execute_research_pipeline(self, company_id: str, sources: list[str], user_id: str = None):
    """
    Asynchronously runs the company research engine pipeline.
    """
    try:
        User = get_user_model()
        user = None
        if user_id:
            try:
                user = User.objects.get(id=user_id)
            except User.DoesNotExist:
                pass

        engine = ResearchEngine(user=user)
        run = engine.create_run(company_id=company_id)
        
        logger.info("Starting background research pipeline run %s", run.id)
        engine.execute_pipeline(run.id, sources)
        return {"status": "completed", "run_id": str(run.id)}

    except Exception as exc:
        logger.exception("Research pipeline task failed for company %s", company_id)
        raise self.retry(exc=exc)


@shared_task(name="apps.agent.tasks.execute_approved_action")
def execute_approved_action(approval_id: str):
    """
    Runs approved external actions (like sending LinkedIn connection requests or messages).
    Executes inside a background celery task to handle browser initialization overhead.
    """
    try:
        approval = PendingApproval.objects.get(id=approval_id)
        if approval.status != ApprovalStatus.APPROVED:
            logger.warning("Approval %s is not in APPROVED state, skipping execution.", approval_id)
            return {"status": "skipped"}

        payload = approval.action_payload
        action_type = payload.get("action_type")
        linkedin_url = payload.get("linkedin_url")
        message = payload.get("message")

        from apps.agent.browser.linkedin import LinkedInBrowserProvider
        provider = LinkedInBrowserProvider(user=approval.created_by)

        success = False
        try:
            if action_type == "send_linkedin_connection":
                logger.info("Executing approved connection request to %s", linkedin_url)
                success = provider.send_connection_request(linkedin_url, message)
            elif action_type == "send_linkedin_message":
                logger.info("Executing approved LinkedIn message to %s", linkedin_url)
                success = provider.send_message(linkedin_url, message)
            else:
                logger.error("Unknown action type: %s in approval payload", action_type)
        finally:
            provider.close()

        # Update activity log
        if success:
            from apps.activities.models import Activity
            from apps.common.enums import ActivityType
            from apps.contacts.models import Contact

            contact = Contact.objects.filter(linkedin_url=linkedin_url).first()

            Activity.objects.create(
                activity_type=ActivityType.LINKEDIN_REQUEST,
                title=f"LinkedIn message sent via Agent",
                description=f"Action: {action_type}\nMessage: {message[:200]}...",
                company=contact.company if contact else None,
                contact=contact,
                created_by=approval.created_by,
            )
            logger.info("Successfully executed approval action for %s", approval_id)
            return {"status": "success"}
        else:
            logger.warning("Failed executing approved browser action for %s", approval_id)
            return {"status": "failed"}

    except Exception:
        logger.exception("Error executing approved action %s", approval_id)
        return {"status": "error"}


@shared_task(name="apps.agent.tasks.cleanup_expired_research")
def cleanup_expired_research():
    """
    Cleans up expired/stale research runs periodically.
    """
    now = timezone.now()
    deleted_count, _ = ResearchRun.objects.filter(
        expires_at__lt=now,
        is_deleted=False
    ).update(is_deleted=True, deleted_at=now)
    
    logger.info("Cleaned up %d expired research runs.", deleted_count)
    return {"cleaned_count": deleted_count}
