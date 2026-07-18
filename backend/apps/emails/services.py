import logging
import re
from datetime import datetime, timezone
from typing import List, Optional
from uuid import UUID

from django.db import transaction
from django.utils import timezone as django_timezone

from apps.activities.models import Activity
from apps.common.enums import ActivityType
from apps.companies.models import Company
from apps.contacts.models import Contact
from apps.deals.models import Deal
from apps.emails.models import EmailAccount, EmailAttachment, EmailMessage, EmailThread
from apps.emails.providers.factory import ProviderFactory

logger = logging.getLogger(__name__)


class EmailSyncService:
    """
    Implements incremental, duplicate-free sync of email threads and messages.
    Links synchronized emails to contacts, companies, deals, and logs activities.
    """

    def __init__(self, account: EmailAccount):
        self.account = account
        self.provider = ProviderFactory.get_provider(account.provider_type)

    def sync_contact(self, contact_id: UUID):
        """Sync emails for a single contact."""
        try:
            contact = Contact.objects.get(id=contact_id)
        except Contact.DoesNotExist:
            logger.error(f"Contact {contact_id} not found for email sync.")
            return

        if not contact.email:
            logger.info(f"Contact {contact.full_name} has no email address. Skipping sync.")
            return

        self.sync_for_emails([contact.email], contact_id=contact.id, company_id=contact.company_id)

    def sync_company(self, company_id: UUID):
        """Sync emails for all contacts associated with a company."""
        try:
            company = Company.objects.get(id=company_id)
        except Company.DoesNotExist:
            logger.error(f"Company {company_id} not found for email sync.")
            return

        contacts = company.contacts.filter(is_deleted=False)
        emails = [c.email for c in contacts if c.email]
        if not emails:
            logger.info(f"Company {company.name} has no contacts with email addresses. Skipping sync.")
            return

        for contact in contacts:
            if contact.email:
                self.sync_for_emails([contact.email], contact_id=contact.id, company_id=company.id)

    def sync_deal(self, deal_id: UUID):
        """Sync emails for all contacts associated with the company of a deal."""
        try:
            deal = Deal.objects.select_related("company").get(id=deal_id)
        except Deal.DoesNotExist:
            logger.error(f"Deal {deal_id} not found for email sync.")
            return

        company = deal.company
        if not company:
            logger.info(f"Deal {deal.name} is not linked to a company. Skipping sync.")
            return

        contacts = company.contacts.filter(is_deleted=False)
        emails = [c.email for c in contacts if c.email]
        if not emails:
            logger.info(f"Company {company.name} has no contacts with email addresses for deal {deal.name}. Skipping sync.")
            return

        for contact in contacts:
            if contact.email:
                self.sync_for_emails(
                    [contact.email],
                    contact_id=contact.id,
                    company_id=company.id,
                    deal_id=deal.id
                )

    def sync_for_emails(
        self,
        emails: List[str],
        contact_id: Optional[UUID] = None,
        company_id: Optional[UUID] = None,
        deal_id: Optional[UUID] = None
    ):
        """Perform email syncing for a list of emails."""
        for email in emails:
            # Query for the latest message in DB involving this contact/email to do incremental fetch
            latest_msg = EmailMessage.objects.filter(
                thread__contact_id=contact_id
            ).order_by("-internal_date").first()

            after_date = latest_msg.internal_date if latest_msg else None

            try:
                # Sync using the provider
                threads_data = self.provider.sync_emails(
                    account=self.account,
                    query=email,
                    after_date=after_date
                )

                # Save threads and messages in transactional blocks
                self.save_threads_and_messages(
                    threads_data,
                    contact_id=contact_id,
                    company_id=company_id,
                    deal_id=deal_id
                )
            except Exception as e:
                logger.error(f"Error syncing emails for {email}: {e}", exc_info=True)

    def save_threads_and_messages(
        self,
        threads_data: List[dict],
        contact_id: Optional[UUID] = None,
        company_id: Optional[UUID] = None,
        deal_id: Optional[UUID] = None
    ):
        """Parse synced threads, insert new messages and create corresponding activities."""
        for t_data in threads_data:
            with transaction.atomic():
                # Get or create Thread
                thread_defaults = {
                    "subject": t_data["subject"],
                    "snippet": t_data["snippet"],
                    "last_message_time": t_data["last_message_time"],
                    "participants": t_data["participants"],
                    "contact_id": contact_id,
                    "company_id": company_id,
                    "deal_id": deal_id,
                    "created_by": self.account.user,
                    "updated_by": self.account.user
                }

                thread, thread_created = EmailThread.objects.get_or_create(
                    gmail_thread_id=t_data["gmail_thread_id"],
                    defaults=thread_defaults
                )

                if not thread_created:
                    # Update thread details
                    thread.subject = t_data["subject"]
                    thread.snippet = t_data["snippet"]
                    thread.last_message_time = t_data["last_message_time"]
                    thread.participants = t_data["participants"]
                    
                    # Fill nullable FK links if not set
                    if not thread.contact_id and contact_id:
                        thread.contact_id = contact_id
                    if not thread.company_id and company_id:
                        thread.company_id = company_id
                    if not thread.deal_id and deal_id:
                        thread.deal_id = deal_id
                    thread.save()

                for m_data in t_data["messages"]:
                    # Check if message already exists (Duplicate prevention)
                    if EmailMessage.objects.filter(gmail_message_id=m_data["gmail_message_id"]).exists():
                        # Link additional contacts/activities if needed, but skip main import
                        self._link_additional_contacts_to_message(
                            gmail_message_id=m_data["gmail_message_id"],
                            sender=m_data["sender"],
                            recipients=m_data["recipients"],
                            cc=m_data["cc"],
                            bcc=m_data["bcc"],
                            thread=thread,
                            subject=m_data["subject"],
                            snippet=m_data["snippet"] or m_data["plain_text_body"][:300],
                            internal_date=m_data["internal_date"],
                            direction="outgoing" if m_data["sender_email"].lower() == self.account.email.lower() else "incoming"
                        )
                        continue

                    # Create new Message
                    direction = "outgoing" if m_data["sender_email"].lower() == self.account.email.lower() else "incoming"
                    message = EmailMessage.objects.create(
                        gmail_message_id=m_data["gmail_message_id"],
                        thread=thread,
                        sender=m_data["sender"],
                        recipients=m_data["recipients"],
                        cc=m_data["cc"],
                        bcc=m_data["bcc"],
                        direction=direction,
                        subject=m_data["subject"],
                        plain_text_body=m_data["plain_text_body"],
                        html_body=m_data["html_body"],
                        internal_date=m_data["internal_date"],
                        labels=m_data["labels"],
                        created_by=self.account.user,
                        updated_by=self.account.user
                    )

                    # Create attachment metadata
                    for att in m_data["attachments"]:
                        EmailAttachment.objects.create(
                            message=message,
                            filename=att["filename"],
                            mime_type=att["mime_type"],
                            size=att["size"],
                            attachment_id=att["attachment_id"],
                            created_by=self.account.user,
                            updated_by=self.account.user
                        )

                    # Create timeline activity for the primary contact
                    self._create_email_activity(
                        message=message,
                        thread=thread,
                        contact_id=contact_id,
                        company_id=company_id,
                        deal_id=deal_id
                    )

                    # Link any other CRM contacts participating in this message
                    self._link_additional_contacts_to_message(
                        gmail_message_id=m_data["gmail_message_id"],
                        sender=m_data["sender"],
                        recipients=m_data["recipients"],
                        cc=m_data["cc"],
                        bcc=m_data["bcc"],
                        thread=thread,
                        subject=m_data["subject"],
                        snippet=m_data["snippet"] or m_data["plain_text_body"][:300],
                        internal_date=m_data["internal_date"],
                        direction=direction,
                        exclude_contact_id=contact_id
                    )

    def _extract_email(self, addr_str: str) -> str:
        if not addr_str:
            return ""
        match = re.search(r"[\w\.-]+@[\w\.-]+", addr_str)
        return match.group(0).lower() if match else addr_str.strip().lower()

    def _link_additional_contacts_to_message(
        self,
        gmail_message_id: str,
        sender: str,
        recipients: List[str],
        cc: List[str],
        bcc: List[str],
        thread: EmailThread,
        subject: str,
        snippet: str,
        internal_date: datetime,
        direction: str,
        exclude_contact_id: Optional[UUID] = None
    ):
        """Finds other contacts in this email participants list and creates activities for them."""
        # Find all participant email addresses
        emails = set()
        sender_email = self._extract_email(sender)
        if sender_email:
            emails.add(sender_email)
        for r in recipients:
            emails.add(self._extract_email(r))
        for c in cc:
            emails.add(self._extract_email(c))
        for b in bcc:
            emails.add(self._extract_email(b))

        # Discard the user's email and primary contact email
        emails.discard(self.account.email.lower())

        contacts = Contact.objects.filter(email__in=emails, is_deleted=False)
        if exclude_contact_id:
            contacts = contacts.exclude(id=exclude_contact_id)

        for contact in contacts:
            # Check if this thread has multiple contacts linked, if not, update it
            if not thread.company_id and contact.company_id:
                thread.company_id = contact.company_id
                thread.save()

            # Check if timeline activity already exists for this message & contact
            if not Activity.objects.filter(
                activity_type=ActivityType.EMAIL,
                contact=contact,
                metadata__gmail_message_id=gmail_message_id
            ).exists():
                # Get local DB message
                msg_obj = EmailMessage.objects.filter(gmail_message_id=gmail_message_id).first()
                self._create_email_activity(
                    message=msg_obj,
                    thread=thread,
                    contact_id=contact.id,
                    company_id=contact.company_id,
                    deal_id=thread.deal_id,
                    custom_metadata={
                        "gmail_message_id": gmail_message_id,
                        "gmail_thread_id": thread.gmail_thread_id,
                        "direction": direction,
                        "sender": sender,
                        "recipients": recipients,
                        "cc": cc,
                        "subject": subject,
                        "preview": snippet,
                        "internal_date": internal_date
                    }
                )

    def _create_email_activity(
        self,
        message: Optional[EmailMessage],
        thread: EmailThread,
        contact_id: Optional[UUID],
        company_id: Optional[UUID],
        deal_id: Optional[UUID],
        custom_metadata: Optional[dict] = None
    ):
        """Create a timeline Activity entry for an email message."""
        direction = custom_metadata.get("direction", "") if custom_metadata else (message.direction if message else "")
        subject = custom_metadata.get("subject", "") if custom_metadata else (message.subject if message else "")
        sender = custom_metadata.get("sender", "") if custom_metadata else (message.sender if message else "")
        recipients = custom_metadata.get("recipients", []) if custom_metadata else (message.recipients if message else [])
        cc = custom_metadata.get("cc", []) if custom_metadata else (message.cc if message else [])
        preview = custom_metadata.get("preview", "") if custom_metadata else (
            message.plain_text_body[:300] if message and message.plain_text_body else ""
        )

        dir_label = "Sent Email" if direction == "outgoing" else "Received Email"
        title = f"{dir_label}: {subject or '(No Subject)'}"

        metadata = {
            "email_message_id": str(message.id) if message else None,
            "gmail_message_id": message.gmail_message_id if message else custom_metadata.get("gmail_message_id"),
            "thread_id": str(thread.id),
            "gmail_thread_id": thread.gmail_thread_id,
            "direction": direction,
            "sender": sender,
            "recipients": recipients,
            "cc": cc,
            "subject": subject,
            "preview": preview,
        }

        # Handle setting performed_by if outgoing, system if incoming
        performed_by = self.account.user if direction == "outgoing" else None

        # Get original email date to preserve chronological timeline ordering
        email_date = message.internal_date if message else (custom_metadata.get("internal_date") if custom_metadata else None)
        if not email_date:
            from django.utils import timezone
            email_date = timezone.now()

        # Create activity first (auto_now_add will set created_at to now)
        activity = Activity.objects.create(
            activity_type=ActivityType.EMAIL,
            title=title,
            description=preview[:500],
            metadata=metadata,
            performed_by=performed_by,
            company_id=company_id,
            contact_id=contact_id,
            deal_id=deal_id,
            created_by=self.account.user,
            updated_by=self.account.user
        )

        # Override created_at with the actual email date using queryset.update()
        # This bypasses Django's auto_now_add which ignores manual assignment during .save()
        if email_date:
            Activity.objects.filter(id=activity.id).update(created_at=email_date)

