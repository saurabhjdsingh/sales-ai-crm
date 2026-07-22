import logging
import re
import secrets
from typing import Optional, Any
from django.utils import timezone
from apps.sequences.models import SequenceLinkClick, SequenceEmailDraft
from apps.activities.models import Activity
from apps.common.enums import ActivityType

logger = logging.getLogger(__name__)


def autolink_bare_urls(html_content: str) -> str:
    """
    Finds bare URLs (http:// or https://) in HTML text nodes (outside <a> tags and attributes)
    and converts them into <a href="URL">URL</a> anchors.
    """
    if not html_content:
        return html_content

    # Split HTML into tags and text parts
    tokens = re.split(r'(<[^>]+>)', html_content)
    in_a_tag = False
    result = []

    url_pattern = re.compile(r'(https?://[^\s<"\'\)\(\]]+)', re.IGNORECASE)

    for token in tokens:
        if not token:
            continue
        if token.startswith('<'):
            tag_lower = token.lower()
            if tag_lower.startswith('<a ') or tag_lower == '<a>':
                in_a_tag = True
            elif tag_lower == '</a>':
                in_a_tag = False
            result.append(token)
        else:
            if not in_a_tag:
                def _replace_bare(match):
                    url = match.group(1)
                    trailing = ""
                    while url and url[-1] in ".,;:!?)":
                        trailing = url[-1] + trailing
                        url = url[:-1]
                    return f'<a href="{url}">{url}</a>{trailing}'

                token = url_pattern.sub(_replace_bare, token)
            result.append(token)

    return "".join(result)


class LinkTrackerService:
    """
    Stealth link click tracking service.
    Wraps outbound URLs with a natural endpoint route (/r/<token>) and records telemetry.
    """

    @staticmethod
    def wrap_links_in_html(
        base_url_or_draft: Any = None,
        base_url_or_html: Optional[str] = None,
        html_content: Optional[str] = None,
        draft: Optional[SequenceEmailDraft] = None,
        email_message: Optional[Any] = None,
        user: Optional[Any] = None,
        track_clicks: bool = True,
        base_url: Optional[str] = None,
    ) -> str:
        """
        Parses html_content, autolinks bare URLs, creates SequenceLinkClick records,
        and replaces hrefs with /r/<click_token>. Supports both SequenceEmailDraft and EmailMessage.
        """
        if isinstance(base_url_or_draft, SequenceEmailDraft):
            draft = base_url_or_draft
            clean_base_url = base_url or base_url_or_html or ""
            content = html_content if html_content is not None else draft.body_html
        else:
            clean_base_url = base_url or str(base_url_or_draft or "")
            content = html_content if html_content is not None else base_url_or_html

        if not content or not track_clicks:
            return content

        if draft and draft.enrollment and draft.enrollment.sequence:
            if not draft.enrollment.sequence.track_clicks:
                return content

        # 1. Autolink bare URLs in text nodes
        content = autolink_bare_urls(content)

        # 2. Match all href attributes
        href_pattern = re.compile(r'href=["\'](https?://[^"\']+)["\']', re.IGNORECASE)
        creator = user or (draft.sender if draft else (getattr(email_message, "created_by", None) if email_message else None))

        def replace_link(match):
            original_url = match.group(1)
            # Skip if it's already a stealth tracking link or pixel
            if "/r/" in original_url or "/track/open/" in original_url:
                return match.group(0)

            token = secrets.token_urlsafe(10)
            SequenceLinkClick.objects.create(
                draft=draft,
                email_message=email_message,
                click_token=token,
                original_url=original_url,
                created_by=creator,
                updated_by=creator,
            )

            clean_base = clean_base_url.rstrip("/")
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
                "draft__contact",
                "draft__enrollment__company",
                "draft__enrollment__deal",
                "email_message__thread__contact",
                "email_message__thread__company",
                "email_message__thread__deal",
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

        # Handle Draft (AI Sequence Outreach)
        if link_click.draft:
            draft = link_click.draft
            draft.click_count += 1
            if not draft.first_clicked_at:
                draft.first_clicked_at = now
            draft.last_clicked_at = now
            draft.save(update_fields=["click_count", "first_clicked_at", "last_clicked_at", "updated_at"])

            enrollment = draft.enrollment
            if enrollment:
                enrollment.click_count += 1
                enrollment.last_clicked_at = now
                enrollment.save(update_fields=["click_count", "last_clicked_at", "updated_at"])

                sequence = enrollment.sequence
                if sequence and sequence.auto_task_on_click_enabled and enrollment.click_count >= sequence.auto_task_click_count:
                    from apps.tasks.models import Task
                    from apps.common.enums import TaskPriority, TaskType, TaskStatus
                    existing_task = Task.objects.filter(
                        contact=draft.contact,
                        sequence_execution_id__isnull=True,
                        description__icontains=str(enrollment.id),
                    ).exists()
                    if not existing_task:
                        assignee = sequence.created_by if sequence.task_assignment_strategy == "sequence_owner" else (enrollment.enrolled_by or sequence.created_by)
                        task_title = f"{draft.contact.full_name} clicked links in sales sequence email more than {sequence.auto_task_click_count} times."
                        Task.objects.create(
                            title=task_title,
                            description=f"Automated sequence telemetry alert (Enrollment: {enrollment.id}): Contact {draft.contact.full_name} clicked links in sequence email '{draft.subject}' {enrollment.click_count} times. Target URL: {link_click.original_url}",
                            owner=assignee,
                            priority=TaskPriority.HIGH,
                            task_type=TaskType.CALL,
                            status=TaskStatus.PENDING,
                            contact=draft.contact,
                            company=enrollment.company or (draft.contact.company if (draft.contact and hasattr(draft.contact, "company")) else None),
                            deal=enrollment.deal,
                            created_by=draft.sender or assignee,
                            updated_by=draft.sender or assignee,
                        )

            contact = draft.contact
            if contact:
                Activity.objects.create(
                    activity_type=ActivityType.SEQUENCE_LINK_CLICKED,
                    title=f"Sequence Email Link Clicked: {contact.full_name}",
                    description=f"Contact clicked link: {link_click.original_url}",
                    contact=contact,
                    company=enrollment.company if enrollment else None,
                    deal=enrollment.deal if enrollment else None,
                    performed_by=draft.sender,
                    metadata={
                        "draft_id": str(draft.id),
                        "original_url": link_click.original_url,
                        "click_count": link_click.click_count,
                    },
                    created_by=draft.sender,
                )

        # Handle EmailMessage (Contact Outreach)
        elif link_click.email_message:
            msg = link_click.email_message
            msg.click_count += 1
            if not msg.last_clicked_at:
                msg.last_clicked_at = now
            msg.save(update_fields=["click_count", "last_clicked_at", "updated_at"])

            thread = msg.thread
            if thread:
                thread.click_count += 1
                thread.last_clicked_at = now
                thread.save(update_fields=["click_count", "last_clicked_at", "updated_at"])

                if thread.contact:
                    Activity.objects.create(
                        activity_type=ActivityType.EMAIL,
                        title=f"Contact Email Link Clicked: {thread.contact.full_name}",
                        description=f"Contact clicked link: {link_click.original_url}",
                        contact=thread.contact,
                        company=thread.company,
                        deal=thread.deal,
                        performed_by=msg.created_by,
                        metadata={
                            "message_id": str(msg.id),
                            "original_url": link_click.original_url,
                            "click_count": link_click.click_count,
                        },
                        created_by=msg.created_by,
                    )

        logger.info("Click recorded for token %s -> %s", click_token, link_click.original_url)
        return link_click.original_url
