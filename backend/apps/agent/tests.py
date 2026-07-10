import json
from unittest.mock import patch
from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone

from apps.agent.enums import ApprovalStatus, ToolExecutionStatus
from apps.agent.models import PendingApproval, ResearchRun, ToolExecution, UserLinkedInConfig
from apps.agent.services.context import AgentContext
from apps.agent.services.orchestrator import AgentOrchestrator
from apps.agent.services.tool_router import ToolRouter
from apps.agent.tools.base import BaseTool, ToolParameter, ToolResult
from apps.agent.tools.registry import register_tool, tool_registry
from apps.ai_engine.models import AIConversation, AIMessage
from apps.ai_engine.services.providers.base import LLMResponse, LLMToolResponse
from apps.companies.models import Company

User = get_user_model()


class MockLLMProvider:
    def chat(self, messages, system_prompt="", **kwargs):
        return LLMResponse(
            content="Mocked LinkedIn connection request message draft.",
            model="mock-model",
            input_tokens=10,
            output_tokens=20,
            total_tokens=30,
        )

    def chat_with_tools(self, messages, tools, system_prompt="", **kwargs):
        return LLMToolResponse(
            content="Mocked assistant content",
            tool_calls=[],
            model="mock-model",
            input_tokens=10,
            output_tokens=20,
            total_tokens=30,
        )

    def get_model_name(self):
        return "mock-model"


class AgentFrameworkTestCase(TestCase):
    """
    Unit tests for the AI Agent Framework.
    """

    def setUp(self):
        self.user = User.objects.create_user(
            username="testuser",
            email="testuser@radar36.com",
            password="testpassword123",
            first_name="Test",
            last_name="User",
        )
        self.company = Company.objects.create(
            name="Target Security Corp",
            website="https://targetsecurity.io",
            industry="Cybersecurity",
            created_by=self.user,
        )
        self.conversation = AIConversation.objects.create(
            title="Test Chat",
            entity_type="company",
            company=self.company,
            user=self.user,
            created_by=self.user,
        )
        self.mock_provider = MockLLMProvider()
        self.patcher = patch("apps.agent.tools.outreach.linkedin_connection.get_llm_provider", return_value=self.mock_provider)
        self.patcher.start()
        self.patcher2 = patch("apps.agent.services.orchestrator.get_llm_provider", return_value=self.mock_provider)
        self.patcher2.start()

    def tearDown(self):
        self.patcher.stop()
        self.patcher2.stop()


    def test_tool_registry_registration(self):
        """Verify that all tools are registered and schemas are compiled."""
        tools = tool_registry.get_all_tools()
        self.assertGreater(len(tools), 0)

        # Retrieve a specific tool
        crawl_tool = tool_registry.get_tool("crawl_website")
        self.assertEqual(crawl_tool.name, "crawl_website")

        schema = crawl_tool.get_schema()
        self.assertEqual(schema["name"], "crawl_website")
        self.assertIn("website_url", schema["input_schema"]["properties"])

    def test_tool_router_logging(self):
        """Verify that ToolRouter successfully executes and logs tool calls."""
        router = ToolRouter()
        context = AgentContext.from_conversation(self.conversation, self.user)

        # Call search tool with dummy query
        result = router.route_tool_call(
            "search_crm",
            {"query": "Target"},
            context
        )

        self.assertTrue(result.success)
        
        # Check execution log in DB
        execution = ToolExecution.objects.filter(tool_name="search_crm").first()
        self.assertIsNotNone(execution)
        self.assertEqual(execution.status, ToolExecutionStatus.SUCCESS)
        self.assertEqual(execution.parameters["query"], "Target")

    def test_pending_approval_generation(self):
        """Verify that connection request drafts correctly trigger approval gating."""
        router = ToolRouter()
        context = AgentContext.from_conversation(self.conversation, self.user)

        # Create contact with LinkedIn URL
        from apps.contacts.models import Contact
        contact = Contact.objects.create(
            first_name="John",
            last_name="Doe",
            linkedin_url="https://linkedin.com/in/johndoe",
            company=self.company,
            created_by=self.user,
        )

        result = router.route_tool_call(
            "generate_linkedin_connection_request",
            {"contact_id": str(contact.id)},
            context
        )

        self.assertTrue(result.success)
        self.assertTrue(result.requires_approval)
        self.assertIn("pending_approval_id", result.data)

        # Check PendingApproval record
        pending = PendingApproval.objects.get(id=result.data["pending_approval_id"])
        self.assertEqual(pending.status, ApprovalStatus.PENDING)
        self.assertEqual(pending.tool_name, "generate_linkedin_connection_request")
        self.assertEqual(pending.action_payload["linkedin_url"], contact.linkedin_url)

    def test_user_linkedin_config_encryption(self):
        """Verify user cookies are securely stored and decrypted."""
        from apps.common.encryption import encrypt_api_key, decrypt_api_key
        
        cookies = [{"name": "li_at", "value": "secret_token_123"}]
        encrypted = encrypt_api_key(json.dumps(cookies))

        config = UserLinkedInConfig.objects.create(
            user=self.user,
            cookies_json_encrypted=encrypted,
            linkedin_url="https://linkedin.com/in/testuser",
            created_by=self.user,
        )

        # Retrieve and decrypt
        db_config = UserLinkedInConfig.objects.get(user=self.user)
        decrypted_str = decrypt_api_key(db_config.cookies_json_encrypted)
        decrypted_cookies = json.loads(decrypted_str)

        self.assertEqual(decrypted_cookies[0]["value"], "secret_token_123")

    def test_agent_orchestrator_loop(self):
        """Verify that AgentOrchestrator successfully processes messages via the mock agentic loop."""
        orchestrator = AgentOrchestrator(user=self.user)
        ai_message = orchestrator.process_message(self.conversation, "Should we pursue this company?")
        
        self.assertIsNotNone(ai_message)
        self.assertEqual(ai_message.role, "assistant")
        self.assertEqual(ai_message.content, "Mocked assistant content")
        self.assertEqual(ai_message.model_used, "mock-model")

