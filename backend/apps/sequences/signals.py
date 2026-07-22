import logging
from django.db.models.signals import post_save
from django.dispatch import receiver

from apps.contacts.models import Contact
from apps.deals.models import Deal
from apps.emails.models import EmailMessage
from apps.sequences.services.auto_stop import AutoStopService

logger = logging.getLogger(__name__)


@receiver(post_save, sender=EmailMessage)
def handle_email_reply_signal(sender, instance: EmailMessage, created: bool, **kwargs):
    """Automatically stops active sequence enrollments when an incoming reply is received."""
    if created and instance.direction == "incoming":
        contact = instance.thread.contact if hasattr(instance, "thread") and instance.thread else None
        if contact:
            AutoStopService.check_and_stop_for_reply(contact.id)


@receiver(post_save, sender=Contact)
def handle_contact_stage_signal(sender, instance: Contact, created: bool, **kwargs):
    """Automatically stops sequence if contact is marked Do Not Contact or Not Interested."""
    if not created and instance.tracker.has_changed("stage") if hasattr(instance, "tracker") else True:
        AutoStopService.check_and_stop_for_contact_stage(instance, instance.stage)


@receiver(post_save, sender=Deal)
def handle_deal_stage_signal(sender, instance: Deal, created: bool, **kwargs):
    """Automatically stops sequence if deal is marked Closed Won or Closed Lost."""
    if not created and instance.tracker.has_changed("stage") if hasattr(instance, "tracker") else True:
        AutoStopService.check_and_stop_for_deal_stage(instance, instance.stage)
