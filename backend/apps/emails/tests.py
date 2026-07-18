import json
from datetime import datetime, timezone, timedelta
from unittest.mock import MagicMock, patch
from uuid import uuid4

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.activities.models import Activity
from apps.common.enums import ActivityType
from apps.companies.models import Company
from apps.contacts.models import Contact
from apps.emails.models import EmailAccount, EmailThread, EmailMessage, EmailAttachment
from apps.emails.services import EmailSyncService

User = get_user_model()


class EmailAccountModelTestCase(TestCase):
    """
    Tests EmailAccount credential encryption/decryption.
    """

    def setUp(self):
        self.user = User.objects.create_user(
            username="testuser",
            email="testuser@radar36.com",
            password="password123"
        )

    def test_encryption_decryption(self):
        account = EmailAccount.objects.create(
            user=self.user,
            email="testuser@gmail.com",
            provider_type="gmail",
            token_expiry=datetime.now(timezone.utc) + timedelta(hours=1)
        )
        
        raw_access = "ya29.a0AfH6SM..."
        raw_refresh = "1//04..."
        
        account.set_access_token(raw_access)
        account.set_refresh_token(raw_refresh)
        account.save()
        
        # Reload from DB
        db_account = EmailAccount.objects.get(id=account.id)
        
        # Verify stored fields are encrypted
        self.assertNotEqual(db_account.access_token_encrypted, raw_access)
        self.assertNotEqual(db_account.refresh_token_encrypted, raw_refresh)
        
        # Verify read accessors decrypt correctly
        self.assertEqual(db_account.get_access_token(), raw_access)
        self.assertEqual(db_account.get_refresh_token(), raw_refresh)


class EmailSyncServiceTestCase(TestCase):
    """
    Tests EmailSyncService parsing, linking and activity logging.
    """

    def setUp(self):
        self.user = User.objects.create_user(
            username="syncuser",
            email="syncuser@radar36.com",
            password="password123"
        )
        self.account = EmailAccount.objects.create(
            user=self.user,
            email="syncuser@gmail.com",
            provider_type="gmail",
            token_expiry=datetime.now(timezone.utc) + timedelta(hours=1)
        )
        self.account.set_access_token("mock_access")
        self.account.set_refresh_token("mock_refresh")
        self.account.save()

        self.company = Company.objects.create(
            name="Acme Corp",
            website="https://acme.org",
            created_by=self.user
        )
        self.contact = Contact.objects.create(
            first_name="Jane",
            last_name="Doe",
            email="jane@acme.org",
            company=self.company,
            created_by=self.user
        )

    @patch("apps.emails.providers.gmail.GmailProvider.sync_emails")
    def test_sync_creates_threads_messages_and_activities(self, mock_sync_emails):
        # Mock returned email structure
        mock_sync_emails.return_value = [
            {
                "gmail_thread_id": "thread123",
                "subject": "Intro and Pricing",
                "snippet": "Here is the pricing sheet...",
                "last_message_time": datetime.now(timezone.utc),
                "participants": ["jane@acme.org", "syncuser@gmail.com"],
                "messages": [
                    {
                        "gmail_message_id": "msg987",
                        "sender": "Jane Doe <jane@acme.org>",
                        "sender_email": "jane@acme.org",
                        "recipients": ["syncuser@gmail.com"],
                        "cc": [],
                        "bcc": [],
                        "subject": "Intro and Pricing",
                        "plain_text_body": "Hello, here is the pricing sheet attached.",
                        "html_body": "<p>Hello</p>",
                        "internal_date": datetime.now(timezone.utc),
                        "labels": ["INBOX"],
                        "attachments": [
                            {
                                "filename": "pricing.pdf",
                                "mime_type": "application/pdf",
                                "size": 10240,
                                "attachment_id": "att001"
                            }
                        ],
                        "snippet": "Here is the pricing sheet..."
                    }
                ]
            }
        ]

        sync_service = EmailSyncService(self.account)
        sync_service.sync_contact(self.contact.id)

        # Check DB records
        self.assertEqual(EmailThread.objects.count(), 1)
        thread = EmailThread.objects.first()
        self.assertEqual(thread.gmail_thread_id, "thread123")
        self.assertEqual(thread.contact, self.contact)
        self.assertEqual(thread.company, self.company)

        self.assertEqual(EmailMessage.objects.count(), 1)
        message = EmailMessage.objects.first()
        self.assertEqual(message.gmail_message_id, "msg987")
        self.assertEqual(message.direction, "incoming")

        self.assertEqual(EmailAttachment.objects.count(), 1)
        attachment = EmailAttachment.objects.first()
        self.assertEqual(attachment.filename, "pricing.pdf")

        # Check Activity creation
        self.assertEqual(Activity.objects.count(), 1)
        activity = Activity.objects.first()
        self.assertEqual(activity.activity_type, ActivityType.EMAIL)
        self.assertEqual(activity.contact, self.contact)
        self.assertEqual(activity.company, self.company)
        self.assertIn("Sent" if message.direction == "outgoing" else "Received", activity.title)
        self.assertEqual(activity.metadata["gmail_message_id"], "msg987")

    @patch("apps.emails.providers.gmail.GmailProvider.sync_emails")
    def test_duplicate_prevention(self, mock_sync_emails):
        # First sync
        mock_sync_emails.return_value = [
            {
                "gmail_thread_id": "thread123",
                "subject": "Intro and Pricing",
                "snippet": "Here is the pricing sheet...",
                "last_message_time": datetime.now(timezone.utc),
                "participants": ["jane@acme.org", "syncuser@gmail.com"],
                "messages": [
                    {
                        "gmail_message_id": "msg987",
                        "sender": "Jane Doe <jane@acme.org>",
                        "sender_email": "jane@acme.org",
                        "recipients": ["syncuser@gmail.com"],
                        "cc": [],
                        "bcc": [],
                        "subject": "Intro and Pricing",
                        "plain_text_body": "Hello, here is the pricing sheet attached.",
                        "html_body": "<p>Hello</p>",
                        "internal_date": datetime.now(timezone.utc),
                        "labels": ["INBOX"],
                        "attachments": [],
                        "snippet": "Here is the pricing sheet..."
                    }
                ]
            }
        ]

        sync_service = EmailSyncService(self.account)
        sync_service.sync_contact(self.contact.id)
        
        self.assertEqual(EmailMessage.objects.count(), 1)
        self.assertEqual(Activity.objects.count(), 1)

        # Run sync again with same message ID
        sync_service.sync_contact(self.contact.id)
        
        # Verify counts did not increase (duplicate skipped)
        self.assertEqual(EmailMessage.objects.count(), 1)
        self.assertEqual(Activity.objects.count(), 1)


class EmailAPITestCase(APITestCase):
    """
    Tests email API views and JWT permissions.
    """

    def setUp(self):
        self.user = User.objects.create_user(
            username="apiuser",
            email="apiuser@radar36.com",
            password="password123"
        )
        self.client.force_authenticate(user=self.user)

    def test_account_status_initially_not_connected(self):
        url = reverse("emails:account-status")
        resp = self.client.get(url)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertFalse(resp.data["connected"])

    @patch("apps.emails.providers.gmail.GmailProvider.get_auth_url")
    def test_google_auth_url(self, mock_get_auth_url):
        mock_get_auth_url.return_value = "https://accounts.google.com/o/oauth2/auth?client_id=123..."
        url = reverse("emails:google-auth-url")
        resp = self.client.get(url)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertIn("url", resp.data)
        self.assertIn("state", resp.data)

    @patch("apps.emails.providers.gmail.GmailProvider.exchange_code")
    @patch("apps.emails.providers.gmail.GmailProvider.get_user_email")
    def test_google_callback_creates_account(self, mock_get_user_email, mock_exchange_code):
        mock_exchange_code.return_value = {
            "access_token": "ya29.new...",
            "refresh_token": "1//refresh...",
            "expires_in": 3600
        }
        mock_get_user_email.return_value = "apiuser@gmail.com"

        url = reverse("emails:google-callback")
        data = {"code": "auth_code_123", "redirect_uri": "http://localhost:4200/integrations"}
        resp = self.client.post(url, data)

        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["status"], "connected")
        self.assertEqual(resp.data["email"], "apiuser@gmail.com")

        # Verify account created in DB
        account = EmailAccount.objects.get(user=self.user)
        self.assertEqual(account.email, "apiuser@gmail.com")
        self.assertEqual(account.get_access_token(), "ya29.new...")
        self.assertEqual(account.get_refresh_token(), "1//refresh...")

    def test_sync_returns_not_integrated_without_account(self):
        url = reverse("emails:sync-emails")
        data = {"contact_id": str(uuid4())}
        resp = self.client.post(url, data)
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(resp.data["status"], "not_integrated")
