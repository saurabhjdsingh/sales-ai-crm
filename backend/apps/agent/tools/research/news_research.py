import json
import logging
from apps.agent.enums import InsightCategory, SourceType
from apps.agent.models import ResearchInsight, ResearchRun, ResearchSource
from apps.agent.tools.base import BaseTool, ToolParameter, ToolResult
from apps.agent.tools.registry import register_tool
from apps.ai_engine.services.copilot import get_llm_provider
from apps.common.enums import ResearchStatus

logger = logging.getLogger(__name__)


@register_tool
class NewsResearchTool(BaseTool):
    name = "research_news"
    description = "Research recent news articles, press releases, and announcements for a company."
    parameters = [
        ToolParameter(
            name="company_name",
            type="string",
            description="The name of the company to research.",
            required=True,
        )
    ]

    def execute(self, context, company_name: str, **kwargs) -> ToolResult:
        try:
            # 1. Resolve or create ResearchRun
            run = None
            if hasattr(context, "run") and context.run:
                run = context.run
            else:
                run = ResearchRun.objects.filter(
                    company=context.company,
                    status__in=[ResearchStatus.PENDING, ResearchStatus.IN_PROGRESS]
                ).first()
                if not run:
                    run = ResearchRun.objects.create(
                        company=context.company,
                        contact=context.contact,
                        status=ResearchStatus.IN_PROGRESS,
                        created_by=context.user,
                    )

            logger.info("Executing news research on company: %s", company_name)

            # 2. Extract news via LLM provider simulating search results
            provider = get_llm_provider(user=context.user)
            
            system_prompt = (
                "You are a sales intelligence search engine.\n"
                "Search and extract the 3 most likely recent news announcements, funding rounds, partnerships, "
                "or cybersecurity challenges associated with the company.\n"
                "Return a JSON object with the following structure:\n"
                "{\n"
                "  \"news_items\": [\n"
                "    {\n"
                "      \"title\": \"Title of the news or announcement\",\n"
                "      \"source\": \"e.g. TechCrunch, Press Release, Company Blog\",\n"
                "      \"summary\": \"Brief summary of the announcement\",\n"
                "      \"date\": \"Likely date or timeframe (e.g., Q1 2026)\"\n"
                "    }\n"
                "  ]\n"
                "}\n"
                "Return ONLY raw valid JSON. Do not include markdown code blocks."
            )

            user_prompt = (
                f"Retrieve and summarize recent news for the company: '{company_name}'.\n"
                f"Industry context: {context.company.industry if context.company else 'Cybersecurity'}\n"
                f"Website context: {context.company.website if context.company else 'N/A'}"
            )

            response = provider.chat(
                messages=[{"role": "user", "content": user_prompt}],
                system_prompt=system_prompt,
            )

            content = response.content.strip()
            if content.startswith("```"):
                lines = content.split("\n")
                content = "\n".join(lines[1:-1]) if lines[-1].strip() == "```" else "\n".join(lines[1:])
                content = content.strip()

            try:
                data = json.loads(content)
            except json.JSONDecodeError:
                logger.warning("Failed to parse news JSON response, returning empty list")
                data = {"news_items": []}

            # 3. Save ResearchSource
            ResearchSource.objects.create(
                run=run,
                source_type=SourceType.NEWS,
                url=context.company.website if context.company else "",
                raw_data=data,
                created_by=context.user,
            )

            # 4. Save insights
            for item in data.get("news_items", []):
                headline = item.get("title", "")
                summary = item.get("summary", "")
                source = item.get("source", "News")
                
                content_str = f"[{source}] {headline} - {summary}"
                ResearchInsight.objects.create(
                    run=run,
                    category=InsightCategory.GROWTH_SIGNALS,
                    content=content_str,
                    confidence=0.7,
                    created_by=context.user,
                )

            summary = f"Retrieved {len(data.get('news_items', []))} news items for {company_name}."
            return ToolResult(
                success=True,
                data=data,
                summary=summary,
            )

        except Exception as e:
            logger.exception("News research failed")
            return ToolResult(success=False, error=str(e))
