from django.apps import AppConfig


class AgentConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.agent"

    def ready(self):
        # Import tools to trigger registration
        import apps.agent.tools  # noqa
