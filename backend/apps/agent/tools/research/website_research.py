import json
import logging
from typing import Any
from urllib.parse import urljoin, urlparse
from bs4 import BeautifulSoup
import httpx

from apps.agent.enums import InsightCategory, SourceType
from apps.agent.models import ResearchArtifact, ResearchInsight, ResearchRun, ResearchSource
from apps.agent.tools.base import BaseTool, ToolParameter, ToolResult
from apps.agent.tools.registry import register_tool
from apps.ai_engine.services.copilot import get_llm_provider
from apps.common.enums import ResearchStatus

logger = logging.getLogger(__name__)


@register_tool
class WebsiteResearchTool(BaseTool):
    name = "crawl_website"
    description = "Crawl a company website to extract visible text, products, services, tech stack, and pain points."
    parameters = [
        ToolParameter(
            name="website_url",
            type="string",
            description="The URL of the company website to crawl.",
            required=True,
        )
    ]

    def execute(self, context, website_url: str, **kwargs) -> ToolResult:
        try:
            # 1. Resolve or create ResearchRun
            run = None
            if hasattr(context, "run") and context.run:
                run = context.run
            else:
                # Find or create latest pending/in-progress run
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

            # Ensure URL has protocol
            if not website_url.startswith(("http://", "https://")):
                website_url = "https://" + website_url

            logger.info("Crawling website: %s for run: %s", website_url, run.id)

            # 2. Perform Crawl
            scraped_pages = self._crawl_site(website_url)
            if not scraped_pages:
                return ToolResult(success=False, error="Could not reach or crawl the website.")

            # Compile text content
            full_compiled_text = ""
            for url, content in scraped_pages.items():
                full_compiled_text += f"\n--- PAGE: {url} ---\n{content}\n"

            # Save raw artifact
            ResearchArtifact.objects.create(
                run=run,
                name=f"Crawl: {urlparse(website_url).netloc}",
                content_type="text/plain",
                data_text=full_compiled_text,
                created_by=context.user,
            )

            # 3. Analyze compiled text using LLM
            analysis = self._analyze_text_with_llm(full_compiled_text, context.user)

            # 4. Save structured results
            # Save ResearchSource
            ResearchSource.objects.create(
                run=run,
                source_type=SourceType.WEBSITE,
                url=website_url,
                raw_data=analysis,
                created_by=context.user,
            )

            # Save ResearchInsights
            categories_map = {
                "services": InsightCategory.SERVICES,
                "products": InsightCategory.PRODUCTS,
                "industries": InsightCategory.INDUSTRIES,
                "customers": InsightCategory.CUSTOMERS,
                "technology": InsightCategory.TECHNOLOGY,
                "compliance": InsightCategory.COMPLIANCE,
                "case_studies": InsightCategory.CASE_STUDIES,
                "pain_points": InsightCategory.PAIN_POINTS,
                "growth_signals": InsightCategory.GROWTH_SIGNALS,
                "hiring": InsightCategory.HIRING,
            }

            for key, category in categories_map.items():
                items = analysis.get(key, [])
                if isinstance(items, list):
                    for item in items:
                        ResearchInsight.objects.create(
                            run=run,
                            category=category,
                            content=item,
                            confidence=0.9,
                            created_by=context.user,
                        )
                elif isinstance(items, str) and items:
                    ResearchInsight.objects.create(
                        run=run,
                        category=category,
                        content=items,
                        confidence=0.9,
                        created_by=context.user,
                    )

            summary = f"Successfully crawled website and extracted {len(scraped_pages)} pages."
            return ToolResult(
                success=True,
                data={
                    "scraped_pages": list(scraped_pages.keys()),
                    "extracted_info": analysis,
                },
                summary=summary,
            )

        except Exception as e:
            logger.exception("Website research crawl failed")
            return ToolResult(success=False, error=str(e))

    def _crawl_site(self, base_url: str) -> dict[str, str]:
        """Crawl up to 5 main subpages of the site."""
        pages_to_crawl = {base_url}
        crawled_pages = {}
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
        }

        try:
            with httpx.Client(headers=headers, timeout=10.0, follow_redirects=True) as client:
                # 1. Fetch home page first to discover links
                try:
                    resp = client.get(base_url)
                    if resp.status_code == 200:
                        crawled_pages[base_url] = self._clean_html(resp.text)
                        
                        # Find other subpages (about, services, products, contact, careers)
                        soup = BeautifulSoup(resp.text, "lxml")
                        base_domain = urlparse(base_url).netloc
                        for link in soup.find_all("a", href=True):
                            href = link["href"]
                            full_url = urljoin(base_url, href)
                            parsed_url = urlparse(full_url)
                            
                            # Stay on same domain, avoid hashes/queries, filter keywords
                            if parsed_url.netloc == base_domain and parsed_url.path:
                                clean_path = parsed_url.path.lower()
                                if any(kw in clean_path for kw in ["about", "product", "service", "contact", "career", "pricing", "compliance"]):
                                    # Normalize URL
                                    normalized = f"{parsed_url.scheme}://{parsed_url.netloc}{parsed_url.path}"
                                    pages_to_crawl.add(normalized)
                                    if len(pages_to_crawl) >= 5:
                                        break
                except Exception as e:
                    logger.warning("Failed to crawl base URL %s: %s", base_url, str(e))
                    return {}

                # 2. Crawl the remaining subpages
                for url in list(pages_to_crawl):
                    if url == base_url or url in crawled_pages:
                        continue
                    try:
                        resp = client.get(url)
                        if resp.status_code == 200:
                            crawled_pages[url] = self._clean_html(resp.text)
                    except Exception as e:
                        logger.warning("Failed to crawl subpage %s: %s", url, str(e))

        except Exception as e:
            logger.exception("General error in crawling site %s", base_url)

        return crawled_pages

    def _clean_html(self, html_content: str) -> str:
        """Removes nav, script, styles, footer, and collapses whitespace."""
        soup = BeautifulSoup(html_content, "lxml")

        # Decompose nav, footer, script, and style tags
        for element in soup(["script", "style", "nav", "footer", "header", "noscript"]):
            element.decompose()

        # Get text
        text = soup.get_text(separator="\n")

        # Collapse whitespace
        lines = [line.strip() for line in text.split("\n") if line.strip()]
        return "\n".join(lines)

    def _analyze_text_with_llm(self, text: str, user: Any) -> dict:
        """Uses LLM to extract structured data from crawled website text."""
        provider = get_llm_provider(user)
        
        system_prompt = (
            "You are a B2B sales crawler intelligence analyst.\n"
            "Analyze the crawled website text and extract a JSON object with the following fields:\n"
            "{\n"
            "  \"services\": [\"List of services offered\"],\n"
            "  \"products\": [\"List of products offered\"],\n"
            "  \"industries\": [\"Target industries\"],\n"
            "  \"customers\": [\"Target customers/companies they serve\"],\n"
            "  \"technology\": [\"Known technologies or developer tools mentioned\"],\n"
            "  \"compliance\": [\"Compliance standards mentioned (SOC2, HIPAA, ISO, etc.)\"],\n"
            "  \"case_studies\": [\"List of case studies or success stories\"],\n"
            "  \"pain_points\": [\"Likely pain points this company has\"],\n"
            "  \"growth_signals\": [\"Indicators of growth (expansion, funding, offices)\"],\n"
            "  \"hiring\": [\"Positions they mention hiring for\"]\n"
            "}\n"
            "Return ONLY raw valid JSON. Do not include markdown code blocks."
        )

        user_prompt = f"Analyze the following crawled website text:\n\n{text[:12000]}"

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
            return json.loads(content)
        except json.JSONDecodeError:
            logger.warning("Failed to decode LLM response in Website Scraper, returning empty structure")
            return {
                "services": [], "products": [], "industries": [], "customers": [],
                "technology": [], "compliance": [], "case_studies": [],
                "pain_points": [], "growth_signals": [], "hiring": []
            }
