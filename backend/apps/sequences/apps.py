from django.apps import AppConfig


class SequencesConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.sequences"
    verbose_name = "Sales Sequences"

    def ready(self):
        try:
            import apps.sequences.signals  # noqa: F401
        except ImportError:
            pass
