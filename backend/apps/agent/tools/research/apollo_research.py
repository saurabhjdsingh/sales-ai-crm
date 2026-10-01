"""
Apollo.io research tools for Agent Orchestrator and Copilot.
Enforces zero-credit consumption on company and people viewing (for Account Intelligence)
and provides an on-demand reveal tool for explicit contact requests in Copilot.
"""

import logging
from typing import Any, Dict, List

from apps.agent.enums import PermissionLevel
from apps.agent.tools.base import BaseTool, ToolParameter, ToolResult
from apps.agent.tools.registry import register_tool
from apps.ai_engine.services.apollo_client import get_user_apollo_client

logger = logging.getLogger(__name__)


@register_tool
class ApolloViewCompanyTool(BaseTool):
    """
    ZERO-CREDIT Tool: Retrieves firmographics, industry, employee headcount,
    tech stack, and funding information for an organization via Apollo.io without consuming credits.
    """

    name = "apollo_view_company"
    description = (
        "View company firmographics, industry, tech stack, and employee count via Apollo.io. "
        "Consumes ZERO credits. Ideal for account intelligence and company research."
    )
    permission_level = PermissionLevel.READ_ONLY
    parameters = [
        ToolParameter(
            name="domain",
            type="string",
            description="The domain name of the company (e.g. 'stripe.com' or 'adiroha.com').",
            required=True,
        ),
        ToolParameter(
            name="company_name",
            type="string",
            description="The legal or public brand name of the company.",
            required=False,
        ),
    ]

    def execute(self, context: Any, domain: str, company_name: str = "", **kwargs) -> ToolResult:
        user = getattr(context, "user", None)
        client = get_user_apollo_client(user)
        if not client:
            return ToolResult(
                success=False,
                error="Apollo.io integration is not configured. Please add your Apollo API key in Settings -> Integrations.",
            )

        res = client.view_organization(domain=domain, name=company_name)
        if not res.get("success", False):
            return ToolResult(
                success=False,
                error=res.get("error", "Failed to retrieve company details from Apollo."),
            )

        summary = (
            f"Apollo Profile: {res.get('name')} | Industry: {res.get('industry')} | "
            f"Employees: {res.get('estimated_num_employees')} | Location: {res.get('city')}, {res.get('country')}"
        )
        return ToolResult(
            success=True,
            data=res,
            summary=summary,
        )


@register_tool
class ApolloViewPeopleTool(BaseTool):
    """
    ZERO-CREDIT Tool: Searches employee directory at a company domain (names, titles, LinkedIn URLs).
    Does NOT reveal emails or direct phone numbers, saving credits.
    """

    name = "apollo_view_people"
    description = (
        "Search key leaders and employees at a company domain via Apollo.io. "
        "Returns names, titles, departments, and public LinkedIn URLs without unlocking emails or phones. "
        "Consumes ZERO credits. Perfect for mapping organizational hierarchy and decision-makers."
    )
    permission_level = PermissionLevel.READ_ONLY
    parameters = [
        ToolParameter(
            name="domain",
            type="string",
            description="The company domain to search employees for (e.g. 'stripe.com').",
            required=True,
        ),
        ToolParameter(
            name="titles",
            type="array",
            description="Optional list of target job titles (e.g. ['CEO', 'CTO', 'VP Sales', 'Head of Security']).",
            required=False,
            items={"type": "string"},
        ),
    ]

    def execute(self, context: Any, domain: str, titles: List[str] = None, **kwargs) -> ToolResult:
        user = getattr(context, "user", None)
        client = get_user_apollo_client(user)
        if not client:
            return ToolResult(
                success=False,
                error="Apollo.io integration is not configured. Please add your Apollo API key in Settings -> Integrations.",
            )

        people = client.view_people(domain=domain, titles=titles, limit=10)
        summary = f"Found {len(people)} key contact(s) at {domain} via Apollo (0 credits consumed)."
        return ToolResult(
            success=True,
            data={"domain": domain, "people": people, "credits_consumed": 0},
            summary=summary,
        )


@register_tool
class ApolloRevealContactInfoTool(BaseTool):
    """
    CREDIT-CONSUMING Tool (1 credit): Unlocks and matches verified personal/work email and direct phone numbers
    for a specific named individual. Only called on explicit user request in AI Copilot.
    """

    name = "apollo_reveal_contact_info"
    description = (
        "Explicitly unlocks verified work email, personal email, and direct mobile phone numbers for a specific person. "
        "WARNING: Consumes 1 Apollo credit. Only invoke when the user explicitly asks for email or phone details."
    )
    permission_level = PermissionLevel.READ_ONLY
    parameters = [
        ToolParameter(
            name="name",
            type="string",
            description="Full name of the contact to reveal details for (e.g. 'Jane Doe').",
            required=True,
        ),
        ToolParameter(
            name="domain",
            type="string",
            description="Domain name of the person's company (e.g. 'acme.com').",
            required=False,
        ),
        ToolParameter(
            name="company_name",
            type="string",
            description="Company name if domain is unknown.",
            required=False,
        ),
    ]

    def execute(self, context: Any, name: str, domain: str = "", company_name: str = "", **kwargs) -> ToolResult:
        user = getattr(context, "user", None)
        client = get_user_apollo_client(user)
        if not client:
            return ToolResult(
                success=False,
                error="Apollo.io integration is not configured. Please add your Apollo API key in Settings -> Integrations.",
            )

        res = client.reveal_contact_info(name=name, domain=domain, organization_name=company_name)
        if not res.get("success", False):
            return ToolResult(
                success=False,
                error=res.get("error", "No matching verified contact info found on Apollo."),
            )

        summary = f"Revealed contact info for {res.get('name')}: Email: {res.get('email')}, Phones: {', '.join(res.get('phone_numbers', []))}"
        return ToolResult(
            success=True,
            data=res,
            summary=summary,
        )
