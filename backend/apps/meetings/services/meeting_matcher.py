import logging
from typing import Any, Dict, List, Optional, Tuple

from apps.companies.models import Company
from apps.contacts.models import Contact

logger = logging.getLogger(__name__)


def resolve_meeting_crm_entities(
    meeting_data: Dict[str, Any],
    user_email: str,
) -> Tuple[Optional[Contact], Optional[Company], Optional[str]]:
    """
    Examines meeting attendee and organizer email addresses against the CRM Contact directory.
    Excludes the user's own email and resource addresses.
    
    Returns:
        (matched_contact, matched_company, matched_email) or (None, None, None)
    """
    attendees: List[Dict[str, Any]] = meeting_data.get("attendees", [])
    user_email_clean = user_email.lower().strip() if user_email else ""

    candidate_emails = []

    # 1. Inspect attendees
    for att in attendees:
        email = att.get("email", "").lower().strip()
        if not email:
            continue
        # Skip self and calendar resource emails
        if email == user_email_clean or att.get("self") is True:
            continue
        if "resource.calendar.google.com" in email or "group.calendar.google.com" in email:
            continue
        candidate_emails.append(email)

    # 2. Check organizer if external
    organizer = meeting_data.get("organizer", {})
    org_email = organizer.get("email", "").lower().strip()
    if org_email and org_email != user_email_clean and not organizer.get("self"):
        if "resource.calendar.google.com" not in org_email:
            if org_email not in candidate_emails:
                candidate_emails.append(org_email)

    if not candidate_emails:
        return None, None, None

    # Search CRM contacts
    matched_contact = (
        Contact.objects.filter(
            email__in=candidate_emails,
            is_deleted=False,
        )
        .select_related("company")
        .first()
    )

    if matched_contact:
        logger.info(
            f"Auto-matched meeting '{meeting_data.get('title')}' to contact "
            f"{matched_contact.full_name} ({matched_contact.email}) and company {matched_contact.company.name if matched_contact.company else 'None'}"
        )
        return matched_contact, matched_contact.company, matched_contact.email

    return None, None, None
