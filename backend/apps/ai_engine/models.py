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
    content_html = models.TextField(blank=True, default="")
    content_markdown = models.TextField(blank=True, default="")
    org_chart_data = models.JSONField(default=dict, blank=True)
    source_type = models.CharField(max_length=50, blank=True, default="manual_paste")
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
    call = models.ForeignKey(
        "telephony.Call",
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
    debug_report = models.JSONField(default=dict, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "ai_engine_ai_message"
        verbose_name = "AI Message"
        verbose_name_plural = "AI Messages"
        ordering = ["created_at"]

    def __str__(self):
        return f"[{self.role}] {self.content[:50]}"


class ChatGPTSession(BaseModel):
    """
    Stores OpenAI SIWC OAuth credentials bound to a specific CRM user.
    """
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="chatgpt_session",
    )
    client_id = models.CharField(max_length=255, help_text="Dynamic agent client ID issued by OpenAI")
    ext_agent_host_id = models.CharField(max_length=255, help_text="Host UUID (urn:uuid:...)")
    access_token = models.TextField(help_text="Protected Bearer token")
    refresh_token = models.TextField(help_text="OAuth refresh token for autonomous renewals")
    id_token = models.TextField(blank=True, default="", help_text="Retained ID token for reauthorization hint")
    token_type = models.CharField(max_length=50, default="Bearer")
    expires_at = models.DateTimeField(help_text="Access token expiration timestamp")
    chatgpt_email = models.EmailField(blank=True, default="")
    chatgpt_user_id = models.CharField(max_length=255, blank=True, default="")
    scopes = models.JSONField(default=list, help_text="Granted OAuth scopes")

    class Meta:
        db_table = "ai_engine_chatgpt_session"
        verbose_name = "ChatGPT Plan Session"
        verbose_name_plural = "ChatGPT Plan Sessions"

    def __str__(self):
        return f"ChatGPT ({self.chatgpt_email or 'Active'}) — {self.user.email}"

    @property
    def has_plan_usage(self) -> bool:
        return "chatgpt.tokens.use.direct" in self.scopes and bool(self.refresh_token)


class UserAIConfig(BaseModel):
    """
    Per-user AI provider configuration.

    Stores the user's chosen AI provider, API key (encrypted), model name,
    and optional custom endpoint URL. Supports three config types:
    - chatgpt_oauth: Linked ChatGPT Subscription (Zero per-token cost)
    - cloud_api: Direct API key + model name (uses provider's default endpoint)
    - custom_endpoint: API key + model name + custom base URL (e.g., Azure AI Foundry)
    """

    PROVIDER_CHOICES = [
        ("chatgpt_plan", "ChatGPT Subscription Plan (Zero Cost)"),
        ("openai", "OpenAI"),
        ("claude", "Claude (Anthropic)"),
    ]

    CONFIG_TYPE_CHOICES = [
        ("chatgpt_oauth", "ChatGPT Subscription Plan"),
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
        blank=True,
        default="",
        help_text="Fernet-encrypted API key. Never stored in plaintext. Optional for ChatGPT plan.",
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

    # Phase 5: Fallback LLM configuration if primary (e.g. ChatGPT subscription) expires or fails
    fallback_provider = models.CharField(
        max_length=20,
        choices=PROVIDER_CHOICES,
        blank=True,
        default="",
        help_text="Fallback provider (e.g. 'openai', 'claude') if primary fails.",
    )
    fallback_config_type = models.CharField(
        max_length=20,
        choices=CONFIG_TYPE_CHOICES,
        default="cloud_api",
        help_text="Fallback config type: cloud_api or custom_endpoint.",
    )
    fallback_api_key_encrypted = models.TextField(
        blank=True,
        default="",
        help_text="Fernet-encrypted fallback API key.",
    )
    fallback_model_name = models.CharField(
        max_length=100,
        blank=True,
        default="",
        help_text="Fallback model name (e.g. 'gpt-4o', 'claude-3-5-sonnet-20241022').",
    )
    fallback_base_url = models.URLField(
        blank=True,
        default="",
        help_text="Custom base URL for fallback provider if custom_endpoint.",
    )

    class Meta:
        db_table = "ai_engine_user_ai_config"
        verbose_name = "User AI Config"
        verbose_name_plural = "User AI Configs"

    def __str__(self):
        return f"{self.user.get_full_name()} — {self.provider} ({self.model_name})"


class ApolloConfig(BaseModel):
    """
    Stores Apollo.io API credentials per user/organization for
    zero-credit account intelligence and on-demand contact revelation.
    """
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="apollo_config",
    )
    api_key_encrypted = models.TextField(
        blank=True,
        default="",
        help_text="Fernet-encrypted Apollo API key.",
    )
    is_active = models.BooleanField(default=True)
    last_verified_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "ai_engine_apollo_config"
        verbose_name = "Apollo Configuration"
        verbose_name_plural = "Apollo Configurations"

    def __str__(self):
        return f"Apollo Config — {self.user.email}"

    @property
    def api_key(self) -> str:
        if not self.api_key_encrypted:
            return ""
        from apps.common.encryption import decrypt_api_key
        return decrypt_api_key(self.api_key_encrypted)

    @api_key.setter
    def api_key(self, value: str):
        if not value:
            self.api_key_encrypted = ""
        else:
            from apps.common.encryption import encrypt_api_key
            self.api_key_encrypted = encrypt_api_key(value)

    @property
    def masked_api_key(self) -> str:
        key = self.api_key
        if not key:
            return ""
        if len(key) <= 8:
            return "••••••••"
        return f"{key[:4]}••••••••{key[-4:]}"



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


