"""
Central registry of all customizable AI prompts.

Hardcoded defaults live in their respective modules. This registry exposes
metadata for the settings UI and a single lookup point for prompt keys.
"""

from dataclasses import dataclass

from apps.agent.prompts.agent import AGENT_SYSTEM_PROMPT
from apps.ai_engine.prompts.copilot import COPILOT_CONTEXT_TEMPLATE, COPILOT_SYSTEM_PROMPT
from apps.ai_engine.prompts.icp import ICP_SYSTEM_PROMPT
from apps.ai_engine.prompts.research import RESEARCH_SYSTEM_PROMPT, RESEARCH_USER_PROMPT


@dataclass(frozen=True)
class PromptDefinition:
    key: str
    label: str
    description: str
    default_content: str
    category: str
    template_variables: tuple[str, ...] = ()
    is_internal: bool = False


PROMPT_REGISTRY: dict[str, PromptDefinition] = {
    "copilot_system": PromptDefinition(
        key="copilot_system",
        label="Organization AI Persona & System Prompt",
        description="Tell the AI about your organization, products/services, sales strategy, target audience, and guidelines. Used across AI Copilot, Analysis, Calls, and ICP scoring.",
        default_content=COPILOT_SYSTEM_PROMPT,
        category="organization",
        is_internal=False,
    ),
    "icp_system": PromptDefinition(
        key="icp_system",
        label="ICP Scoring Guidelines",
        description="Instructions and scoring criteria for evaluating prospect fit (0–100).",
        default_content=ICP_SYSTEM_PROMPT,
        category="analysis",
        is_internal=False,
    ),
    "research_system": PromptDefinition(
        key="research_system",
        label="Company Research Persona",
        description="Instructions for automated company web research and analysis.",
        default_content=RESEARCH_SYSTEM_PROMPT,
        category="research",
        is_internal=False,
    ),
    "copilot_context": PromptDefinition(
        key="copilot_context",
        label="Copilot Context Template (Internal)",
        description="Internal system template for inserting runtime CRM context. Must include {context}.",
        default_content=COPILOT_CONTEXT_TEMPLATE,
        category="technical",
        template_variables=("{context}",),
        is_internal=True,
    ),
    "agent_system": PromptDefinition(
        key="agent_system",
        label="Agent System Prompt (Internal)",
        description="Internal instructions for tool calling, execution rules, and loop prevention.",
        default_content=AGENT_SYSTEM_PROMPT,
        category="technical",
        is_internal=True,
    ),
    "research_user": PromptDefinition(
        key="research_user",
        label="Company Research User Prompt (Internal)",
        description="Internal user message format for website research.",
        default_content=RESEARCH_USER_PROMPT,
        category="technical",
        template_variables=(
            "{company_name}",
            "{website}",
            "{industry}",
            "{description}",
            "{country}",
            "{company_size}",
        ),
        is_internal=True,
    ),
}


def get_prompt_definition(key: str) -> PromptDefinition:
    if key not in PROMPT_REGISTRY:
        raise KeyError(f"Unknown prompt key: {key}")
    return PROMPT_REGISTRY[key]


def get_default_prompt(key: str) -> str:
    return get_prompt_definition(key).default_content
