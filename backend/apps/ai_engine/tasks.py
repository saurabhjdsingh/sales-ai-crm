"""
Celery tasks for the AI Engine.
"""

import logging

from celery import shared_task

logger = logging.getLogger(__name__)


@shared_task(
    name="apps.ai_engine.tasks.research_company",
    bind=True,
    max_retries=2,
    default_retry_delay=60,
)
def research_company(self, company_id: str, user_id: str = None):
    """
    Background task to run AI research on a company.
    Triggered on company creation/import or manually.
    Retries up to 2 times on failure.
    """
    try:
        from django.contrib.auth import get_user_model

        from apps.ai_engine.services.research import ResearchService

        User = get_user_model()
        user = None
        if user_id:
            try:
                user = User.objects.get(id=user_id)
            except User.DoesNotExist:
                pass

        service = ResearchService(user=user)
        research = service.research_company(company_id)
        logger.info("Research task completed for company %s", company_id)
        return {"status": "completed", "company_id": company_id}

    except Exception as exc:
        logger.exception("Research task failed for company %s", company_id)
        raise self.retry(exc=exc)


@shared_task(name="apps.ai_engine.tasks.calculate_icp_score")
def calculate_icp_score(company_id: str, user_id: str = None):
    """
    Background task to calculate or recalculate ICP score.
    Uses the ICP-specific prompt for scoring.
    """
    try:
        import json

        from django.contrib.auth import get_user_model

        from apps.ai_engine.services.copilot import get_llm_provider
        from apps.ai_engine.services.prompt_service import PromptService
        from apps.companies.models import Company

        User = get_user_model()
        user = None
        if user_id:
            try:
                user = User.objects.get(id=user_id)
            except User.DoesNotExist:
                pass

        company = Company.objects.get(id=company_id)
        provider = get_llm_provider(user=user)

        user_prompt = (
            f"Score this company:\n"
            f"Name: {company.name}\n"
            f"Industry: {company.industry or 'Unknown'}\n"
            f"Size: {company.company_size or 'Unknown'}\n"
            f"Country: {company.country or 'Unknown'}\n"
            f"Description: {company.description or 'No description'}\n"
            f"Website: {company.website or 'No website'}\n"
        )

        # Include research data if available
        try:
            research = company.research
            if research.business_summary:
                user_prompt += f"Research Summary: {research.business_summary}\n"
            if research.services:
                user_prompt += f"Services: {', '.join(research.services)}\n"
        except Exception:
            pass

        icp_system = PromptService.get_prompt(user, "icp_system")
        response = provider.chat(
            messages=[{"role": "user", "content": user_prompt}],
            system_prompt=icp_system,
        )

        content = response.content.strip()
        if content.startswith("```"):
            lines = content.split("\n")
            content = "\n".join(lines[1:-1])

        data = json.loads(content)
        score = min(max(int(data.get("score", 0)), 0), 100)
        explanation = data.get("explanation", "")

        company.icp_score = score
        company.icp_explanation = explanation
        company.save(update_fields=["icp_score", "icp_explanation", "updated_at"])

        logger.info("ICP score calculated for %s: %d", company.name, score)
        return {"company_id": company_id, "score": score}

    except Exception:
        logger.exception("ICP scoring failed for company %s", company_id)
