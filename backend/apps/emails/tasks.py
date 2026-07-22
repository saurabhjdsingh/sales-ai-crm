import logging
from uuid import UUID
from celery import shared_task
from django.contrib.auth import get_user_model
from apps.emails.models import EmailAccount, AccountRole
from apps.emails.services import EmailSyncService

logger = logging.getLogger(__name__)


@shared_task(name="apps.emails.tasks.sync_emails_task")
def sync_emails_task(
    user_id: str,
    company_id: str = None,
    contact_id: str = None,
    deal_id: str = None
):
    """
    Celery background task to synchronize emails asynchronously.
    Prevents page loading from blocking while fetching/parsing Gmail records.
    """
    logger.info(
        f"Starting background email sync task. User: {user_id}, "
        f"Company: {company_id}, Contact: {contact_id}, Deal: {deal_id}"
    )

    User = get_user_model()
    try:
        user = User.objects.get(id=user_id)
        account = EmailAccount.objects.filter(
            user=user,
            status="connected",
            account_role=AccountRole.PRIMARY
        ).first() or EmailAccount.objects.filter(
            user=user,
            status="connected",
            provider_type="gmail"
        ).first() or EmailAccount.objects.filter(
            user=user,
            status="connected"
        ).first()
    except User.DoesNotExist:
        logger.error(f"User {user_id} not found for email sync.")
        return

    if not account:
        logger.warning(f"Email account not found or connected for user {user.username}. Sync cancelled.")
        return

    if account.status == "disconnected" or not account.refresh_token_encrypted:
        logger.warning(f"Email account for user {user.username} is disconnected (status: {account.status}). Sync cancelled.")
        return

    sync_service = EmailSyncService(account)
    try:
        if contact_id:
            logger.info(f"Syncing contact: {contact_id}")
            sync_service.sync_contact(UUID(contact_id))
        elif company_id:
            logger.info(f"Syncing company: {company_id}")
            sync_service.sync_company(UUID(company_id))
        elif deal_id:
            logger.info(f"Syncing deal: {deal_id}")
            sync_service.sync_deal(UUID(deal_id))
        logger.info(f"Background email sync completed successfully for user {user.username}")
    except Exception as e:
        logger.error(f"Error during background email sync for user {user.username}: {e}", exc_info=True)
