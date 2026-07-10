from apps.agent.tools.base import BaseTool, ToolParameter, ToolResult
from apps.agent.tools.registry import register_tool
from apps.search.services import SearchService


@register_tool
class CRMSearchTool(BaseTool):
    name = "search_crm"
    description = "Search across all CRM entities (companies, contacts, deals, notes, and tasks) for a query string."
    parameters = [
        ToolParameter(
            name="query",
            type="string",
            description="The search query term (at least 2 characters).",
            required=True,
        ),
        ToolParameter(
            name="entity_type",
            type="string",
            description="Filter results by a specific entity type: 'company', 'contact', 'deal', 'note', 'task'. If omitted, returns all types.",
            required=False,
            enum=["company", "contact", "deal", "note", "task"],
        ),
    ]

    def execute(self, context, query: str, entity_type: str = None, **kwargs) -> ToolResult:
        try:
            ss = SearchService()
            all_results = ss.search(query)

            if entity_type:
                # Map singular parameter type to search result keys
                key_mapping = {
                    "company": "companies",
                    "contact": "contacts",
                    "deal": "deals",
                    "note": "notes",
                    "task": "tasks",
                }
                search_key = key_mapping.get(entity_type, "companies")
                filtered_data = {entity_type: all_results.get(search_key, [])}
                summary = f"Found {len(filtered_data[entity_type])} matching {entity_type}s for '{query}'"
                return ToolResult(success=True, data=filtered_data, summary=summary)

            total_count = sum(len(v) for v in all_results.values())
            summary = f"Found {total_count} matching results across all categories for '{query}'"
            return ToolResult(success=True, data=all_results, summary=summary)
        except Exception as e:
            return ToolResult(success=False, error=str(e))
