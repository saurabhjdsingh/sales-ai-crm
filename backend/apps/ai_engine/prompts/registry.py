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


PROMPT_REGISTRY: dict[str, PromptDefinition] = {
    "copilot_system": PromptDefinition(
        key="copilot_system",
        label="Copilot System Prompt",
        description="Core instructions for the AI Sales Copilot when chatting about CRM entities.",
        default_content=COPILOT_SYSTEM_PROMPT,
        category="copilot",
    ),
    "copilot_context": PromptDefinition(
        key="copilot_context",
        label="Copilot Context Template",
        description="Template appended to the system prompt with live CRM context. Must include {context}.",
        default_content=COPILOT_CONTEXT_TEMPLATE,
        category="copilot",
        template_variables=("{context}",),
    ),
    "agent_system": PromptDefinition(
        key="agent_system",
        label="Agent System Prompt",
        description="Instructions for the autonomous agent on when and how to use tools.",
        default_content=AGENT_SYSTEM_PROMPT,
        category="copilot",
    ),
    "icp_system": PromptDefinition(
        key="icp_system",
        label="ICP Scoring Prompt",
        description="Instructions for scoring companies against your Ideal Customer Profile (0–100).",
        default_content=ICP_SYSTEM_PROMPT,
        category="analysis",
    ),
    "research_system": PromptDefinition(
        key="research_system",
        label="Company Research System Prompt",
        description="System instructions when running automated company research.",
        default_content=RESEARCH_SYSTEM_PROMPT,
        category="research",
    ),
    "research_user": PromptDefinition(
        key="research_user",
        label="Company Research User Prompt",
        description="User message template for company research. Supports company field placeholders.",
        default_content=RESEARCH_USER_PROMPT,
        category="research",
        template_variables=(
            "{company_name}",
            "{website}",
            "{industry}",
            "{description}",
            "{country}",
            "{company_size}",
        ),
    ),
}


def get_prompt_definition(key: str) -> PromptDefinition:
    if key not in PROMPT_REGISTRY:
        raise KeyError(f"Unknown prompt key: {key}")
    return PROMPT_REGISTRY[key]


def get_default_prompt(key: str) -> str:
    return get_prompt_definition(key).default_content
