import logging
import re
import secrets
from django.utils import timezone
from apps.sequences.models import SequenceLinkClick, SequenceEmailDraft
from apps.activities.models import Activity
from apps.common.enums import ActivityType

logger = logging.getLogger(__name__)


class LinkTrackerService:
    """
    Stealth link click tracking service.
    Wraps outbound URLs with a natural endpoint route (/r/<token>) and records telemetry.
    """

    @staticmethod
    def wrap_links_in_html(draft: SequenceEmailDraft, base_url: str, html_content: str = None) -> str:
        """
        Parses html_content (or draft.body_html), creates SequenceLinkClick records, and replaces hrefs with /r/<click_token>.
        """
        content = html_content if html_content is not None else draft.body_html
        if not draft.enrollment.sequence.track_clicks or not content:
            return content

        href_pattern = re.compile(r'href=["\'](https?://[^"\']+)["\']', re.IGNORECASE)

        def replace_link(match):
            original_url = match.group(1)
            # Skip if it's already a stealth tracking link or pixel
            if "/r/" in original_url or "/track/open/" in original_url:
                return match.group(0)

            token = secrets.token_urlsafe(10)
            SequenceLinkClick.objects.create(
                draft=draft,
                click_token=token,
                original_url=original_url,
                created_by=draft.sender,
                updated_by=draft.sender,
            )

            clean_base = base_url.rstrip("/")
            stealth_url = f"{clean_base}/r/{token}"
            return f'href="{stealth_url}"'

        return href_pattern.sub(replace_link, content)

    @staticmethod
    def handle_click(click_token: str) -> str:
        """
        Processes a click on token, updates stats & timeline, and returns the original URL.
        """
        try:
            link_click = SequenceLinkClick.objects.select_related(
                "draft__contact", "draft__enrollment__company", "draft__enrollment__deal"
            ).get(click_token=click_token)
        except SequenceLinkClick.DoesNotExist:
            logger.warning("Invalid stealth click token: %s", click_token)
            return "/"

        now = timezone.now()
        
        # Update LinkClick record
        link_click.click_count += 1
        if not link_click.first_clicked_at:
            link_click.first_clicked_at = now
        link_click.last_clicked_at = now
        link_click.save(update_fields=["click_count", "first_clicked_at", "last_clicked_at", "updated_at"])

        # Update Draft record
        draft = link_click.draft
        draft.click_count += 1
        if not draft.first_clicked_at:
            draft.first_clicked_at = now
        draft.last_clicked_at = now
        draft.save(update_fields=["click_count", "first_clicked_at", "last_clicked_at", "updated_at"])

        # Update Enrollment record
        enrollment = draft.enrollment
        if enrollment:
            enrollment.click_count += 1
            enrollment.last_clicked_at = now
            enrollment.save(update_fields=["click_count", "last_clicked_at", "updated_at"])

        # Log Activity on Contact Timeline
        contact = draft.contact
        Activity.objects.create(
            activity_type=ActivityType.SEQUENCE_LINK_CLICKED,
            title=f"Sequence Email Link Clicked: {contact.full_name}",
            description=f"Contact clicked link: {link_click.original_url}",
            contact=contact,
            company=draft.enrollment.company,
            deal=draft.enrollment.deal,
            performed_by=draft.sender,
            metadata={
                "draft_id": str(draft.id),
                "original_url": link_click.original_url,
                "click_count": link_click.click_count,
            },
            created_by=draft.sender,
        )

        logger.info("Click recorded for token %s -> %s (Contact: %s)", click_token, link_click.original_url, contact.full_name)
        return link_click.original_url
