# Import all tool modules to trigger decorator registration
from apps.agent.tools.crm import (
    company_context,
    contact_context,
    deal_context,
    crm_search,
    activity_timeline,
    task_tool,
    notes_tool,
)
from apps.agent.tools import knowledge
from apps.agent.tools.research import (
    website_research,
    linkedin_company,
    linkedin_person,
    news_research,
)
from apps.agent.tools.analysis import (
    icp_scorer,
    sales_strategy,
)
from apps.agent.tools.outreach import (
    linkedin_connection,
    linkedin_message,
    linkedin_profile,
    outreach_strategy,
)

from apps.agent.tools.base import BaseTool, ToolResult, ToolParameter
from apps.agent.tools.registry import tool_registry, register_tool

__all__ = ["BaseTool", "ToolResult", "ToolParameter", "tool_registry", "register_tool"]
