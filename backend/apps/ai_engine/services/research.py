"""
Company research service — runs AI-powered research on companies.
"""

import json
import logging

from django.utils import timezone

from apps.ai_engine.models import CompanyResearch
from apps.ai_engine.services.copilot import get_llm_provider
from apps.ai_engine.services.prompt_service import PromptService
from apps.common.enums import ActivityType, ResearchStatus

logger = logging.getLogger(__name__)


class ResearchService:
    """Handles AI-powered company research."""

    def __init__(self, user=None):
        self.user = user
        self.provider = get_llm_provider(user=user)

    def research_company(self, company_id: str) -> CompanyResearch:
        """
        Run comprehensive AI research on a company.
        Creates or updates the CompanyResearch record with structured data.
        """
        from apps.companies.models import Company

        company = Company.objects.get(id=company_id)

        # Create or get research record
        research, created = CompanyResearch.objects.get_or_create(
            company=company,
            defaults={"created_by": company.created_by},
        )

        research.research_status = ResearchStatus.IN_PROGRESS
        research.save(update_fields=["research_status", "updated_at"])

        try:
            # Build research prompt
            research_user_template = PromptService.get_prompt(self.user, "research_user")
            user_prompt = research_user_template.format(
                company_name=company.name,
                website=company.website or "Not provided",
                industry=company.industry or "Not provided",
                description=company.description or "Not provided",
                country=company.country or "Not provided",
                company_size=company.company_size or "Not provided",
            )

            research_system = PromptService.get_prompt(self.user, "research_system")
            response = self.provider.chat(
                messages=[{"role": "user", "content": user_prompt}],
                system_prompt=research_system,
            )

            # Parse JSON response
            data = self._parse_research_response(response.content)

            # Update research record
            research.business_summary = data.get("business_summary", "")
            research.estimated_size = data.get("estimated_size", "")
            research.icp_match = data.get("icp_match")
            research.pain_points = data.get("pain_points", [])
            research.technology_stack = data.get("technology_stack", [])
            research.recent_hiring = data.get("recent_hiring", "")
            research.security_maturity = data.get("security_maturity", "")
            research.why_radar36_fits = data.get("why_radar36_fits", "")
            research.potential_objections = data.get("potential_objections", [])
            research.buying_signals = data.get("buying_signals", [])
            research.services = data.get("services", [])
            research.products = data.get("products", [])
            research.website_summary = data.get("website_summary", "")
            research.raw_research_data = data
            research.researched_at = timezone.now()
            research.research_status = ResearchStatus.COMPLETED
            research.save()

            # Update company with research results
            company.ai_summary = data.get("business_summary", "")
            icp_score = data.get("icp_score")
            if icp_score is not None and isinstance(icp_score, (int, float)):
                company.icp_score = min(max(int(icp_score), 0), 100)
                company.icp_explanation = data.get("icp_explanation", "")
            company.save(update_fields=["ai_summary", "icp_score", "icp_explanation", "updated_at"])

            # Log activity
            from apps.activities.models import Activity

            Activity.objects.create(
                activity_type=ActivityType.AI_RESEARCH,
                title=f"AI research completed for {company.name}",
                company=company,
                metadata={
                    "icp_score": company.icp_score,
                    "icp_match": research.icp_match,
                },
                created_by=company.created_by,
            )

            logger.info("Research completed for %s (ICP: %s)", company.name, company.icp_score)
            return research

        except Exception as e:
            research.research_status = ResearchStatus.FAILED
            research.save(update_fields=["research_status", "updated_at"])
            logger.exception("Research failed for %s: %s", company.name, str(e))
            raise

    def _parse_research_response(self, content: str) -> dict:
        """Parse the AI response as JSON, handling common formatting issues."""
        content = content.strip()

        # Remove markdown code block if present
        if content.startswith("```"):
            lines = content.split("\n")
            content = "\n".join(lines[1:-1]) if lines[-1].strip() == "```" else "\n".join(lines[1:])
            content = content.strip()

        try:
            return json.loads(content)
        except json.JSONDecodeError:
            logger.warning("Failed to parse research response as JSON, returning raw")
            return {
                "business_summary": content[:500],
                "website_summary": content,
            }
