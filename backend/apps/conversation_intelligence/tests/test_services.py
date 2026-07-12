from django.test import TestCase
from django.contrib.auth import get_user_model
from django.utils import timezone
from unittest.mock import patch
from apps.contacts.models import Contact
from apps.companies.models import Company
from apps.conversation_intelligence.models import (
    Conversation,
    ConversationSession,
    Transcript,
    TranscriptSegment,
    ConversationSummary
)
from apps.conversation_intelligence.services import ConversationService

User = get_user_model()


class ConversationServiceTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="testrep",
            email="testrep@radar36.com",
            password="testpassword",
            first_name="John",
            last_name="Doe"
        )
        self.company = Company.objects.create(
            name="Acme Corp",
            created_by=self.user,
            updated_by=self.user
        )
        self.contact = Contact.objects.create(
            first_name="Jane",
            last_name="Smith",
            email="jane@acme.com",
            phone="+123456789",
            company=self.company,
            created_by=self.user,
            updated_by=self.user
        )

    def test_initiate_conversation(self):
        init_data = ConversationService.initiate_conversation(
            user=self.user,
            contact_id=self.contact.id,
            company_id=self.company.id
        )
        
        self.assertIn("conversation_id", init_data)
        self.assertIn("session_key", init_data)
        self.assertIn("websocket_url", init_data)

        # Verify db records
        conversation = Conversation.objects.get(id=init_data["conversation_id"])
        self.assertEqual(conversation.user, self.user)
        self.assertEqual(conversation.contact, self.contact)
        self.assertEqual(conversation.company, self.company)
        self.assertEqual(conversation.status, "active")

        # Verify related objects created
        self.assertTrue(Transcript.objects.filter(conversation=conversation).exists())
        self.assertTrue(ConversationSession.objects.filter(conversation=conversation).exists())

    def test_end_conversation(self):
        init_data = ConversationService.initiate_conversation(
            user=self.user,
            contact_id=self.contact.id
        )
        conv_id = init_data["conversation_id"]

        # End it
        conversation = ConversationService.end_conversation(conv_id, self.user)
        self.assertEqual(conversation.status, "processing")
        
        session = ConversationSession.objects.get(conversation=conversation)
        self.assertFalse(session.is_active)
        self.assertIsNotNone(session.ended_at)

    def test_confirm_post_call_review(self):
        init_data = ConversationService.initiate_conversation(
            user=self.user,
            contact_id=self.contact.id
        )
        conv_id = init_data["conversation_id"]
        
        # Save mock segments first to have transcript text
        conversation = Conversation.objects.get(id=conv_id)
        transcript = conversation.transcript
        transcript.data = [
            {"speaker": "sales_rep", "start_time": 0.0, "end_time": 2.0, "text": "Hello Jane"},
            {"speaker": "customer", "start_time": 2.0, "end_time": 4.0, "text": "Hi John"}
        ]
        transcript.save()

        # Confirm review
        review_data = {
            "executive_summary": "Great intro call.",
            "conversation_summary": "Discussed product requirements.",
            "tasks": [
                {"title": "Send brochure", "description": "Send product catalog", "due_days_offset": 2, "approved": True},
                {"title": "Skip this", "approved": False}
            ]
        }
        
        activity = ConversationService.confirm_post_call_review(conv_id, review_data, self.user)
        
        # Check Activity creation
        self.assertIsNotNone(activity)
        self.assertEqual(activity.performed_by, self.user)
        self.assertEqual(activity.contact, self.contact)
        self.assertEqual(activity.company, self.company)
        self.assertIn("Great intro call", activity.description)
        self.assertIn("Hello Jane", activity.description)

        # Check task creation
        from apps.tasks.models import Task
        tasks = Task.objects.filter(contact=self.contact)
        self.assertEqual(tasks.count(), 1)
        self.assertEqual(tasks.first().title, "Send brochure")
        
        # Verify status set to completed
        conversation.refresh_from_db()
        self.assertEqual(conversation.status, "completed")

    @patch('apps.ai_engine.services.copilot.get_llm_provider')
    def test_initiate_conversation_with_invalid_ai_config(self, mock_get_llm_provider):
        from rest_framework.exceptions import ValidationError
        mock_get_llm_provider.side_effect = Exception("AI model missing key")
        
        with self.assertRaises(ValidationError):
            ConversationService.initiate_conversation(
                user=self.user,
                contact_id=self.contact.id
            )
