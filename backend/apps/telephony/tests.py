import json
from unittest.mock import patch
from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.telephony.models import TelephonyProvider, Call, CallTranscript
from apps.companies.models import Company
from apps.contacts.models import Contact

User = get_user_model()


class MockLLMResponse:
    def __init__(self, content):
        self.content = content


class MockLLMProvider:
    def chat(self, messages, system_prompt="", **kwargs):
        return MockLLMResponse(
            json.dumps({
                "pain_points": ["Manual entries taking time"],
                "buying_signals": ["Interested in booking a Monday demo"],
                "objections": ["Reps complain about reporting speed"],
                "suggested_questions": ["What tools do you use?"]
            })
        )


class TelephonyAppTestCase(APITestCase):
    """
    Unit test cases for the Django Telephony module.
    """

    def setUp(self):
        # Create standard CRM user
        self.user = User.objects.create_user(
            username="dialer_agent",
            email="agent@radar36.com",
            password="securepassword123",
            first_name="CallCenter",
            last_name="Agent"
        )
        self.client.force_authenticate(user=self.user)

        # Create contact details
        self.company = Company.objects.create(
            name="Testing Corp",
            industry="Software",
            created_by=self.user
        )
        self.contact = Contact.objects.create(
            first_name="Alice",
            last_name="Smith",
            email="alice@testing.com",
            phone="+1234567890",
            company=self.company,
            created_by=self.user
        )

        # Configure mock Twilio BYOC provider
        self.provider = TelephonyProvider.objects.create(
            user=self.user,
            provider_type="twilio",
            name="Test Twilio",
            account_sid="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
            api_key="SKxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
            api_secret="API_SECRET_KEY_12345",
            application_sid="APxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
            phone_number="+19999999999",
            transcription_provider="deepgram",
            transcription_key="deepgram_api_key_value"
        )

    def test_get_settings_list(self):
        """Verify settings retrieve endpoint returns list of providers."""
        url = reverse("telephony-settings-list")
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        # Handle paginated list
        results = response.data.get("results", response.data)
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["name"], "Test Twilio")

    def test_initiate_outbound_call(self):
        """Verify calling outbound initializes database record correctly."""
        url = reverse("telephony-calls-initiate")
        payload = {
            "phone": "+1234567890",
            "contact_id": str(self.contact.id),
            "ai_assist_enabled": True
        }
        response = self.client.post(url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["direction"], "outbound")
        self.assertEqual(response.data["status"], "queued")
        self.assertTrue(response.data["ai_assist_enabled"])
        
        # Verify db persistence
        call_id = response.data["id"]
        call = Call.objects.get(id=call_id)
        self.assertEqual(call.contact, self.contact)

    @patch("apps.telephony.services.get_llm_provider")
    def test_append_live_transcript_chunk(self, mock_get_llm):
        """Verify adding dialogue segments updates call transcript timeline with mocked AI responses."""
        mock_get_llm.return_value = MockLLMProvider()

        call = Call.objects.create(
            user=self.user,
            provider=self.provider,
            direction="outbound",
            status="in-progress",
            ai_assist_enabled=True,
            contact=self.contact
        )

        url = reverse("telephony-calls-append-transcript", kwargs={"pk": str(call.id)})
        payload = {
            "speaker": "contact",
            "text": "Yes, our team objection is that CRM logging takes too much time."
        }
        
        response = self.client.post(url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("analysis", response.data)
        self.assertEqual(response.data["analysis"]["objections"][0], "Reps complain about reporting speed")
        
        # Check transcript saved in database
        transcript = CallTranscript.objects.get(call=call)
        self.assertIn("Yes, our team objection is that CRM logging takes too much time.", transcript.full_text)

    @patch("apps.telephony.providers.twilio.TwilioProvider.connect")
    def test_settings_connection_verification(self, mock_connect):
        """Verify test connection route returns mock success in debug mode."""
        mock_connect.return_value = True
        url = reverse("telephony-settings-test-connection", kwargs={"pk": str(self.provider.id)})
        response = self.client.post(url, {})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["connected"])
