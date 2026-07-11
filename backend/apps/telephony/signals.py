from django.db.models.signals import post_save
from django.dispatch import receiver
from apps.telephony.models import Call


@receiver(post_save, sender=Call)
def handle_call_save(sender, instance, created, **kwargs):
    """
    Hook to trigger background notifications or event tracking
    on Call state modifications.
    """
    pass
