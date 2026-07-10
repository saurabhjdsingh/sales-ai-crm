"""
AI Engine models — conversations, messages, and company research.
"""

import uuid

from django.conf import settings
from django.db import models

from apps.common.enums import AIEntityType, AIMessageRole, ResearchStatus
from apps.common.models import BaseModel


class CompanyResearch(BaseModel):
    """
    Stores AI-generated research about a company.
    One-to-one with Company. Populated by background research task.
    """

    company = models.OneToOneField(
        "companies.Company",
        on_delete=models.CASCADE,
        related_name="research",
    )
    business_summary = models.TextField(blank=True, default="")
    estimated_size = models.CharField(max_length=50, blank=True, default="")
    icp_match = models.BooleanField(null=True, blank=True)
    pain_points = models.JSONField(default=list, blank=True)
    technology_stack = models.JSONField(default=list, blank=True)
    recent_hiring = models.TextField(blank=True, default="")
    security_maturity = models.TextField(blank=True, default="")
    why_radar36_fits = models.TextField(blank=True, default="")
    potential_objections = models.JSONField(default=list, blank=True)
    buying_signals = models.JSONField(default=list, blank=True)
    latest_news = models.JSONField(default=list, blank=True)
    services = models.JSONField(default=list, blank=True)
    products = models.JSONField(default=list, blank=True)
    website_summary = models.TextField(blank=True, default="")
    linkedin_summary = models.TextField(blank=True, default="")
    raw_research_data = models.JSONField(default=dict, blank=True)
    researched_at = models.DateTimeField(null=True, blank=True)
    research_status = models.CharField(
        max_length=15,
        choices=ResearchStatus.choices,
        default=ResearchStatus.PENDING,
        db_index=True,
    )

    class Meta:
        db_table = "ai_engine_company_research"
        verbose_name = "Company Research"
        verbose_name_plural = "Company Research"

    def __str__(self):
        return f"Research: {self.company.name}"


class AIConversation(BaseModel):
    """
    Represents a chat conversation with the AI copilot.
    Scoped to a specific entity (company, contact, or deal).
    """

    title = models.CharField(max_length=255, blank=True, default="")
    entity_type = models.CharField(
        max_length=10,
        choices=AIEntityType.choices,
        db_index=True,
    )
    company = models.ForeignKey(
        "companies.Company",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="ai_conversations",
    )
    contact = models.ForeignKey(
        "contacts.Contact",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="ai_conversations",
    )
    deal = models.ForeignKey(
        "deals.Deal",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="ai_conversations",
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="ai_conversations",
    )
    is_archived = models.BooleanField(default=False)

    class Meta:
        db_table = "ai_engine_ai_conversation"
        verbose_name = "AI Conversation"
        verbose_name_plural = "AI Conversations"
        ordering = ["-updated_at"]

    def __str__(self):
        return self.title or f"Conversation on {self.entity_type}"


class AIMessage(models.Model):
    """Individual message within an AI conversation."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    conversation = models.ForeignKey(
        AIConversation,
        on_delete=models.CASCADE,
        related_name="messages",
    )
    role = models.CharField(
        max_length=10,
        choices=AIMessageRole.choices,
    )
    content = models.TextField()
    model_used = models.CharField(max_length=50, blank=True, default="")
    tokens_used = models.IntegerField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "ai_engine_ai_message"
        verbose_name = "AI Message"
        verbose_name_plural = "AI Messages"
        ordering = ["created_at"]

    def __str__(self):
        return f"[{self.role}] {self.content[:50]}"


class UserAIConfig(BaseModel):
    """
    Per-user AI provider configuration.

    Stores the user's chosen AI provider, API key (encrypted), model name,
    and optional custom endpoint URL. Supports two config types:
    - cloud_api: Direct API key + model name (uses provider's default endpoint)
    - custom_endpoint: API key + model name + custom base URL (e.g., Azure AI Foundry)
    """

    PROVIDER_CHOICES = [
        ("openai", "OpenAI"),
        ("claude", "Claude (Anthropic)"),
    ]

    CONFIG_TYPE_CHOICES = [
        ("cloud_api", "Cloud API"),
        ("custom_endpoint", "Custom Endpoint"),
    ]

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="ai_config",
    )
    provider = models.CharField(
        max_length=20,
        choices=PROVIDER_CHOICES,
        db_index=True,
    )
    config_type = models.CharField(
        max_length=20,
        choices=CONFIG_TYPE_CHOICES,
        default="cloud_api",
    )
    api_key_encrypted = models.TextField(
        help_text="Fernet-encrypted API key. Never stored in plaintext.",
    )
    model_name = models.CharField(
        max_length=100,
        help_text="Model identifier, e.g. 'gpt-4o', 'claude-opus-4-7'.",
    )
    base_url = models.URLField(
        blank=True,
        default="",
        help_text="Custom endpoint URL. Only used when config_type is 'custom_endpoint'.",
    )
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = "ai_engine_user_ai_config"
        verbose_name = "User AI Config"
        verbose_name_plural = "User AI Configs"

    def __str__(self):
        return f"{self.user.get_full_name()} — {self.provider} ({self.model_name})"


class UserAIPrompt(BaseModel):
    """
    Per-user customized AI prompt overrides.

    When no record exists for a prompt key, the hardcoded default from
    apps.ai_engine.prompts is used instead.
    """

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="ai_prompts",
    )
    prompt_key = models.CharField(max_length=50, db_index=True)
    content = models.TextField()

    class Meta:
        db_table = "ai_engine_user_ai_prompt"
        verbose_name = "User AI Prompt"
        verbose_name_plural = "User AI Prompts"
        constraints = [
            models.UniqueConstraint(
                fields=["user", "prompt_key"],
                condition=models.Q(is_deleted=False),
                name="unique_active_user_prompt_key",
            )
        ]

    def __str__(self):
        return f"{self.user_id} — {self.prompt_key}"


class LLMCallLog(models.Model):
    """
    Audit log to track token usage and cost for every LLM provider invocation.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="llm_calls",
    )
    model_name = models.CharField(max_length=100)
    input_tokens = models.IntegerField(default=0)
    output_tokens = models.IntegerField(default=0)
    total_tokens = models.IntegerField(default=0)
    cost = models.DecimalField(max_digits=12, decimal_places=6, default=0.0)
    prompt_purpose = models.CharField(max_length=50, blank=True, default="chat")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "ai_engine_llm_call_log"
        ordering = ["-created_at"]

    def __str__(self):
        return f"LLM Call ({self.model_name}) - Cost: ${self.cost} at {self.created_at}"


