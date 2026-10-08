import json
import logging
import re
from typing import Any, Dict

from apps.ai_engine.services.providers.factory import LLMProviderFactory

logger = logging.getLogger(__name__)


class MeetingAIService:
    """
    Extracts structured executive intelligence, action items, objections,
    and summaries from meeting notes and raw transcripts.
    """

    @classmethod
    def analyze_meeting(
        cls,
        title: str,
        notes: str = "",
        transcript: str = "",
        contact_name: str = "",
        company_name: str = "",
        user: Any = None,
    ) -> Dict[str, Any]:
        """
        Analyzes the meeting text and returns a structured dictionary:
        {
            "summary": "...",
            "key_takeaways": [...],
            "action_items": [{"task": "...", "owner": "...", "due_in_days": 2}],
            "objections_raised": [...],
            "sentiment": "...",
            "next_recommended_step": "..."
        }
        """
        combined_text = ""
        if notes:
            combined_text += f"MEETING NOTES:\n{notes}\n\n"
        if transcript:
            # Truncate if excessively long (e.g. max 25,000 chars)
            clean_transcript = transcript[:25000]
            combined_text += f"MEETING TRANSCRIPT:\n{clean_transcript}\n\n"

        if not combined_text.strip():
            return {
                "summary": "No notes or transcript provided for this meeting.",
                "key_takeaways": [],
                "action_items": [],
                "objections_raised": [],
                "sentiment": "Neutral",
                "next_recommended_step": "",
            }

        system_prompt = (
            "You are an elite Sales AI Executive Assistant for Radar 36 Sales CRM. "
            "Analyze the meeting notes and conversation transcript between the sales representative and the prospect/client. "
            "Extract structured, high-impact intelligence to keep the CRM pipeline organized. "
            "Respond ONLY with a valid JSON object matching the exact structure below, without markdown formatting or introductory text:\n"
            "{\n"
            '  "summary": "Concise 2 to 3 sentence executive summary of the discussion and main outcome",\n'
            '  "key_takeaways": ["Specific decision or notable point 1", "Specific decision or notable point 2"],\n'
            '  "action_items": [\n'
            '     {"task": "Actionable task description", "owner": "Rep or Prospect", "due_in_days": 3}\n'
            '  ],\n'
            '  "objections_raised": ["Any concern, hesitation, competitor mention, or budget roadblock mentioned"],\n'
            '  "sentiment": "Very Positive | Positive | Neutral | Skeptical | At Risk",\n'
            '  "next_recommended_step": "Specific recommended next action to advance the deal"\n'
            "}"
        )

        user_prompt = (
            f"Meeting Title: {title}\n"
            f"Company: {company_name or 'Unknown Company'}\n"
            f"Contact: {contact_name or 'Unknown Contact'}\n\n"
            f"Content to analyze:\n{combined_text}"
        )

        try:
            llm = LLMProviderFactory.get_provider(user=user)
            result = llm.generate_response(
                system_prompt=system_prompt,
                prompt=user_prompt,
                response_format="json",
                purpose="chat",
            )

            if isinstance(result, dict) and "summary" in result:
                return result

            # If response returned wrapped text, try extracting JSON substring
            raw_text = result.get("text", "") or result.get("body_text", "")
            match = re.search(r"\{.*\}", raw_text, re.DOTALL)
            if match:
                try:
                    parsed = json.loads(match.group(0))
                    if "summary" in parsed:
                        return parsed
                except Exception:
                    pass

        except Exception as e:
            logger.warning(f"Error calling LLM provider for meeting analysis: {e}. Falling back to heuristic summary.")

        # Heuristic fallback if LLM is unavailable
        return cls._heuristic_analysis(notes, transcript, title)

    @classmethod
    def _heuristic_analysis(cls, notes: str, transcript: str, title: str) -> Dict[str, Any]:
        """Fallback analysis when external LLM is not configured."""
        first_lines = [line.strip() for line in (notes or transcript).split("\n") if line.strip()][:3]
        summary_text = " ".join(first_lines) if first_lines else f"Meeting regarding {title}."

        action_items = []
        for line in (notes or transcript).split("\n"):
            line_lower = line.lower()
            if any(kw in line_lower for kw in ["todo", "action", "follow up", "will send", "need to", "agreed to"]):
                clean_item = re.sub(r"^[-*•\d\.\s]+", "", line).strip()
                if clean_item:
                    action_items.append({"task": clean_item[:120], "owner": "Team", "due_in_days": 3})

        return {
            "summary": summary_text[:300],
            "key_takeaways": [line[:100] for line in first_lines[:2]] if first_lines else ["Meeting conducted successfully."],
            "action_items": action_items[:5],
            "objections_raised": [],
            "sentiment": "Neutral",
            "next_recommended_step": "Follow up with meeting notes.",
        }
