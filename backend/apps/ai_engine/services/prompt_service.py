"""
Service for resolving user-customized AI prompts with hardcoded defaults as fallback.
"""

from django.core.exceptions import ValidationError

from apps.ai_engine.models import UserAIPrompt
from apps.ai_engine.prompts.registry import PROMPT_REGISTRY, get_default_prompt, get_prompt_definition


class PromptService:
    """Resolve effective prompt content per user."""

    @staticmethod
    def list_prompts_for_user(user) -> list[dict]:
        custom_map = {
            p.prompt_key: p
            for p in UserAIPrompt.objects.filter(user=user, is_deleted=False)
        }

        results = []
        for key, definition in PROMPT_REGISTRY.items():
            custom = custom_map.get(key)
            results.append(
                {
                    "key": key,
                    "label": definition.label,
                    "description": definition.description,
                    "category": definition.category,
                    "is_internal": getattr(definition, "is_internal", False),
                    "template_variables": list(definition.template_variables),
                    "default_content": definition.default_content,
                    "content": custom.content if custom else definition.default_content,
                    "is_customized": custom is not None,
                    "updated_at": custom.updated_at if custom else None,
                }
            )
        return results

    @staticmethod
    def get_prompt(user, key: str) -> str:
        """Return effective prompt content for a user (custom or default)."""
        get_prompt_definition(key)  # validate key

        if user is not None:
            try:
                custom = UserAIPrompt.objects.get(
                    user=user,
                    prompt_key=key,
                    is_deleted=False,
                )
                return custom.content
            except UserAIPrompt.DoesNotExist:
                pass

        return get_default_prompt(key)

    @staticmethod
    def save_prompt(user, key: str, content: str) -> UserAIPrompt:
        definition = get_prompt_definition(key)
        content = content.strip()

        if not content:
            raise ValidationError("Prompt content cannot be empty.")

        PromptService._validate_template_variables(definition, content)

        prompt, created = UserAIPrompt.all_objects.get_or_create(
            user=user,
            prompt_key=key,
            defaults={
                "content": content,
                "is_deleted": False,
                "created_by": user,
            },
        )

        if not created:
            prompt.content = content
            prompt.is_deleted = False
            prompt.deleted_at = None
            prompt.updated_by = user
            prompt.save(update_fields=["content", "is_deleted", "deleted_at", "updated_by", "updated_at"])

        return prompt

    @staticmethod
    def reset_prompt(user, key: str) -> None:
        get_prompt_definition(key)
        for prompt in UserAIPrompt.objects.filter(user=user, prompt_key=key):
            prompt.soft_delete(user=user)

    @staticmethod
    def reset_all_prompts(user) -> None:
        for prompt in UserAIPrompt.objects.filter(user=user):
            prompt.soft_delete(user=user)

    @staticmethod
    def _validate_template_variables(definition, content: str) -> None:
        missing = [var for var in definition.template_variables if var not in content]
        if missing:
            raise ValidationError(
                f"Prompt must include required placeholders: {', '.join(missing)}"
            )
