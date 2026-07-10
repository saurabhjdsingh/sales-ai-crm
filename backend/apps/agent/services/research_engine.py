import logging
from datetime import timedelta
from typing import Any, List, Optional

from django.conf import settings
from django.utils import timezone

from apps.agent.enums import SourceType
from apps.agent.models import ResearchRun
from apps.common.enums import ResearchStatus
from apps.companies.models import Company
from apps.contacts.models import Contact

logger = logging.getLogger(__name__)


class ResearchEngine:
    """
    Coordinates provider-independent company and contact research.
    Manages caching, runs multi-source research tasks, and compiles insights.
    """

    def __init__(self, user=None):
        self.user = user

    def get_latest_run(self, company_id: Optional[str] = None, contact_id: Optional[str] = None) -> Optional[ResearchRun]:
        """Retrieve the latest completed research run if it is still fresh."""
        cache_days = getattr(settings, "AGENT_RESEARCH_CACHE_DAYS", 7)
        threshold = timezone.now() - timedelta(days=cache_days)

        qs = ResearchRun.objects.filter(status=ResearchStatus.COMPLETED)
        if company_id:
            qs = qs.filter(company_id=company_id)
        elif contact_id:
            qs = qs.filter(contact_id=contact_id)
        else:
            return None

        run = qs.first()
        if run and run.completed_at and run.completed_at >= threshold:
            return run
        return None

    def create_run(self, company_id: Optional[str] = None, contact_id: Optional[str] = None) -> ResearchRun:
        """Create a new ResearchRun in PENDING state."""
        run_kwargs = {
            "status": ResearchStatus.PENDING,
            "created_by": self.user,
            "started_at": timezone.now(),
        }
        if company_id:
            run_kwargs["company_id"] = company_id
        elif contact_id:
            run_kwargs["contact_id"] = contact_id

        return ResearchRun.objects.create(**run_kwargs)

    def execute_pipeline(self, run_id: str, sources: List[str]) -> ResearchRun:
        """
        Executes research pipeline synchronously.
        Saves sources, raw crawls, extracts insights, scores ICP, and updates Company fields.
        """
        run = ResearchRun.objects.get(id=run_id)
        run.status = ResearchStatus.IN_PROGRESS
        run.save(update_fields=["status", "updated_at"])

        from apps.agent.services.context import AgentContext
        from apps.agent.services.tool_router import ToolRouter

        context = AgentContext(
            user=self.user,
            conversation=None,  # Not linked to a chat conversation
            entity_type="company" if run.company else "contact",
            entity_id=run.company_id if run.company else run.contact_id,
            company=run.company,
            contact=run.contact,
        )

        router = ToolRouter()

        try:
            # 1. Execute individual source crawling tools
            for src in sources:
                tool_name = None
                params = {}

                if src == SourceType.WEBSITE and run.company and run.company.website:
                    tool_name = "crawl_website"
                    params = {"website_url": run.company.website}
                elif src == SourceType.LINKEDIN_COMPANY and run.company and run.company.linkedin_url:
                    tool_name = "research_company_linkedin"
                    params = {"linkedin_url": run.company.linkedin_url}
                elif src == SourceType.LINKEDIN_PERSON and run.contact and run.contact.linkedin_url:
                    tool_name = "research_person_linkedin"
                    params = {"linkedin_url": run.contact.linkedin_url}
                elif src == SourceType.NEWS and run.company:
                    tool_name = "research_news"
                    params = {"company_name": run.company.name}

                if tool_name:
                    logger.info("ResearchEngine executing tool: %s for run: %s", tool_name, run.id)
                    router.route_tool_call(tool_name, params, context)

            # 2. Run ICP Scorer and Strategy if company research is completed
            if run.company:
                logger.info("ResearchEngine running ICP scoring for company %s", run.company.name)
                router.route_tool_call("score_company_icp", {"company_id": str(run.company_id)}, context)

                logger.info("ResearchEngine running Sales Strategy for company %s", run.company.name)
                router.route_tool_call("generate_sales_strategy", {"company_id": str(run.company_id)}, context)

            run.status = ResearchStatus.COMPLETED
            run.completed_at = timezone.now()
            cache_days = getattr(settings, "AGENT_RESEARCH_CACHE_DAYS", 7)
            run.expires_at = run.completed_at + timedelta(days=cache_days)
            run.save()

            logger.info("Research pipeline finished successfully for run %s", run.id)
            return run

        except Exception as e:
            logger.exception("Research pipeline failed for run %s", run.id)
            run.status = ResearchStatus.FAILED
            run.save(update_fields=["status", "updated_at"])
            raise
