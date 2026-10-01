"""
Serializers for the AI Engine module.
"""

from rest_framework import serializers

from apps.ai_engine.models import AIConversation, AIMessage, CompanyResearch, UserAIConfig
from apps.ai_engine.prompts.registry import PROMPT_REGISTRY


class CompanyResearchSerializer(serializers.ModelSerializer):
    company_name = serializers.CharField(source="company.name", read_only=True)

    class Meta:
        model = CompanyResearch
        fields = [
            "id",
            "company",
            "company_name",
            "business_summary",
            "estimated_size",
            "icp_match",
            "pain_points",
            "technology_stack",
            "recent_hiring",
            "security_maturity",
            "why_radar36_fits",
            "potential_objections",
            "buying_signals",
            "latest_news",
            "services",
            "products",
            "website_summary",
            "linkedin_summary",
            "content_html",
            "content_markdown",
            "org_chart_data",
            "source_type",
            "researched_at",
            "research_status",
            "created_at",
            "updated_at",
        ]


class AIMessageSerializer(serializers.ModelSerializer):
    debug_report = serializers.SerializerMethodField()

    class Meta:
        model = AIMessage
        fields = ["id", "role", "content", "model_used", "tokens_used", "debug_report", "created_at"]
        read_only_fields = ["id", "created_at"]

    def get_debug_report(self, obj):
        request = self.context.get("request")
        if request:
            user = getattr(request, "user", None)
            is_staff = getattr(user, "is_staff", False) or getattr(user, "is_admin", False) or getattr(user, "is_superuser", False)
            debug_flag = request.query_params.get("debug") == "true" or request.headers.get("X-Developer-Debug") == "true"
            if is_staff or debug_flag:
                return obj.debug_report
        return None


class AIConversationListSerializer(serializers.ModelSerializer):
    message_count = serializers.SerializerMethodField()
    last_message_at = serializers.SerializerMethodField()

    class Meta:
        model = AIConversation
        fields = [
            "id",
            "title",
            "entity_type",
            "company",
            "contact",
            "deal",
            "is_archived",
            "message_count",
            "last_message_at",
            "created_at",
            "updated_at",
        ]

    def get_message_count(self, obj):
        return obj.messages.count()

    def get_last_message_at(self, obj):
        last = obj.messages.order_by("-created_at").first()
        return last.created_at if last else None


class AIConversationDetailSerializer(AIConversationListSerializer):
    messages = AIMessageSerializer(many=True, read_only=True)

    class Meta(AIConversationListSerializer.Meta):
        fields = AIConversationListSerializer.Meta.fields + ["messages"]


class AIConversationCreateSerializer(serializers.Serializer):
    entity_type = serializers.ChoiceField(choices=["company", "contact", "deal", "call"])
    entity_id = serializers.UUIDField()
    title = serializers.CharField(required=False, default="")


class AISendMessageSerializer(serializers.Serializer):
    message = serializers.CharField(min_length=1, max_length=5000)


class UserAIConfigSerializer(serializers.ModelSerializer):
    """Read serializer for UserAIConfig. Returns masked API keys, never the real ones."""

    api_key_masked = serializers.SerializerMethodField()
    fallback_api_key_masked = serializers.SerializerMethodField()

    class Meta:
        model = UserAIConfig
        fields = [
            "id",
            "provider",
            "config_type",
            "model_name",
            "base_url",
            "api_key_masked",
            "fallback_provider",
            "fallback_config_type",
            "fallback_model_name",
            "fallback_base_url",
            "fallback_api_key_masked",
            "is_active",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def get_api_key_masked(self, obj) -> str:
        from apps.common.encryption import decrypt_api_key, mask_api_key

        try:
            plain = decrypt_api_key(obj.api_key_encrypted)
            return mask_api_key(plain)
        except Exception:
            return "****" if obj.api_key_encrypted else ""

    def get_fallback_api_key_masked(self, obj) -> str:
        from apps.common.encryption import decrypt_api_key, mask_api_key

        try:
            plain = decrypt_api_key(obj.fallback_api_key_encrypted)
            return mask_api_key(plain)
        except Exception:
            return "****" if obj.fallback_api_key_encrypted else ""


class AIPromptSerializer(serializers.Serializer):
    """Read serializer for a single prompt with default and effective content."""

    key = serializers.CharField()
    label = serializers.CharField()
    description = serializers.CharField()
    category = serializers.CharField()
    is_internal = serializers.BooleanField(default=False)
    template_variables = serializers.ListField(child=serializers.CharField())
    default_content = serializers.CharField()
    content = serializers.CharField()
    is_customized = serializers.BooleanField()
    updated_at = serializers.DateTimeField(allow_null=True)


class AIPromptWriteSerializer(serializers.Serializer):
    content = serializers.CharField(min_length=1)

    def validate_content(self, value):
        return value.strip()


class AIPromptBulkWriteSerializer(serializers.Serializer):
    prompts = serializers.ListField(
        child=serializers.DictField(),
        min_length=1,
    )

    def validate_prompts(self, value):
        validated = []
        for item in value:
            key = item.get("key")
            content = item.get("content", "").strip()
            if not key or key not in PROMPT_REGISTRY:
                raise serializers.ValidationError(f"Invalid prompt key: {key}")
            if not content:
                raise serializers.ValidationError(f"Prompt '{key}' cannot be empty.")
            validated.append({"key": key, "content": content})
        return validated


class UserAIConfigWriteSerializer(serializers.Serializer):
    """Write serializer for creating/updating UserAIConfig. Encrypts the API key."""

    provider = serializers.ChoiceField(choices=["chatgpt_plan", "openai", "claude"])
    config_type = serializers.ChoiceField(choices=["chatgpt_oauth", "cloud_api", "custom_endpoint"])
    api_key = serializers.CharField(required=False, allow_blank=True, default="", max_length=500, write_only=True)
    model_name = serializers.CharField(min_length=1, max_length=100)
    base_url = serializers.URLField(required=False, allow_blank=True, default="")

    # Phase 5: Fallback LLM fields
    fallback_provider = serializers.ChoiceField(choices=["", "openai", "claude"], required=False, allow_blank=True, default="")
    fallback_config_type = serializers.ChoiceField(choices=["cloud_api", "custom_endpoint"], required=False, default="cloud_api")
    fallback_api_key = serializers.CharField(required=False, allow_blank=True, default="", max_length=500, write_only=True)
    fallback_model_name = serializers.CharField(required=False, allow_blank=True, default="", max_length=100)
    fallback_base_url = serializers.URLField(required=False, allow_blank=True, default="")

    def validate(self, attrs):
        provider = attrs["provider"]
        config_type = attrs["config_type"]
        api_key = attrs.get("api_key", "").strip()

        if provider == "chatgpt_plan" or config_type == "chatgpt_oauth":
            # For ChatGPT subscription, API key is not required because tokens are in ChatGPTSession
            pass
        else:
            if not api_key:
                raise serializers.ValidationError(
                    {"api_key": "API key is required for API provider configuration."}
                )
            if config_type == "custom_endpoint" and not attrs.get("base_url"):
                raise serializers.ValidationError(
                    {"base_url": "Base URL is required for custom endpoint configuration."}
                )

        fb_provider = attrs.get("fallback_provider", "")
        fb_key = attrs.get("fallback_api_key", "").strip()
        if fb_provider and not fb_key:
            # Check if an existing fallback key already exists on instance, else require it
            pass

        return attrs


class ApolloConfigSerializer(serializers.Serializer):
    """Read serializer for Apollo.io configuration."""

    configured = serializers.BooleanField()
    api_key_masked = serializers.CharField()
    is_active = serializers.BooleanField()
    last_verified_at = serializers.DateTimeField(allow_null=True)


class ApolloConfigWriteSerializer(serializers.Serializer):
    """Write serializer for saving Apollo.io API key."""

    api_key = serializers.CharField(min_length=10, max_length=500, write_only=True)


