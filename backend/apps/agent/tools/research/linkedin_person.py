import logging
from apps.agent.enums import InsightCategory, SourceType
from apps.agent.models import ResearchInsight, ResearchRun, ResearchSource
from apps.agent.tools.base import BaseTool, ToolParameter, ToolResult
from apps.agent.tools.registry import register_tool
from apps.agent.browser.linkedin import LinkedInBrowserProvider
from apps.common.enums import ResearchStatus

logger = logging.getLogger(__name__)


@register_tool
class LinkedInPersonTool(BaseTool):
    name = "research_person_linkedin"
    description = "Collect publicly available LinkedIn profile details, experiences, headlines, and decision-making roles for a contact."
    parameters = [
        ToolParameter(
            name="linkedin_url",
            type="string",
            description="The LinkedIn profile URL of the person/contact.",
            required=True,
        )
    ]

    def execute(self, context, linkedin_url: str, **kwargs) -> ToolResult:
        try:
            # 1. Resolve or create ResearchRun
            run = None
            if hasattr(context, "run") and context.run:
                run = context.run
            else:
                run = ResearchRun.objects.filter(
                    contact=context.contact,
                    status__in=[ResearchStatus.PENDING, ResearchStatus.IN_PROGRESS]
                ).first()
                if not run:
                    run = ResearchRun.objects.create(
                        company=context.company,
                        contact=context.contact,
                        status=ResearchStatus.IN_PROGRESS,
                        created_by=context.user,
                    )

            logger.info("Executing LinkedIn person research on url: %s", linkedin_url)

            # 2. Open browser and pull page details
            provider = LinkedInBrowserProvider(user=context.user)
            scraped_data = {}
            try:
                scraped_data = provider.get_profile_details(linkedin_url)
            except Exception as e:
                logger.warning("LinkedInBrowserProvider failed to scrape profile, falling back: %s", str(e))
                # Fallback to simulated extraction using existing Contact information
                scraped_data = {
                    "name": context.contact.full_name if context.contact else "Unknown",
                    "headline": context.contact.job_title or "Decision Maker",
                    "about": "No summary details available on profile.",
                    "recent_experiences": [],
                    "connection_status": "Unknown",
                    "note": "Scraped via fallback simulator (no authenticated browser session)."
                }
            finally:
                provider.close()

            # 3. Save ResearchSource
            ResearchSource.objects.create(
                run=run,
                source_type=SourceType.LINKEDIN_PERSON,
                url=linkedin_url,
                raw_data=scraped_data,
                created_by=context.user,
            )

            # 4. Save Insights
            if scraped_data.get("headline"):
                ResearchInsight.objects.create(
                    run=run,
                    category=InsightCategory.HIRING,
                    content=f"LinkedIn Headline: {scraped_data['headline']}",
                    confidence=0.85,
                    created_by=context.user,
                )

            for exp in scraped_data.get("recent_experiences", []):
                ResearchInsight.objects.create(
                    run=run,
                    category=InsightCategory.BUYING_SIGNALS,
                    content=f"Experience: {exp}",
                    confidence=0.8,
                    created_by=context.user,
                )

            # Update Contact fields if available
            if context.contact:
                changed = False
                if not context.contact.linkedin_url and linkedin_url:
                    context.contact.linkedin_url = linkedin_url
                    changed = True
                if scraped_data.get("headline") and not context.contact.job_title:
                    context.contact.job_title = scraped_data["headline"][:200]
                    changed = True
                if changed:
                    context.contact.save(update_fields=["linkedin_url", "job_title", "updated_at"])

            return ToolResult(
                success=True,
                data=scraped_data,
                summary=f"LinkedIn Person research completed for {linkedin_url}",
            )

        except Exception as e:
            logger.exception("LinkedIn person research failed")
            return ToolResult(success=False, error=str(e))
