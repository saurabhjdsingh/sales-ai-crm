"""
Global search service using Postgres full-text search.
Searches across companies, contacts, deals, notes, and tasks.
Future: swap with Elasticsearch for better relevance and fuzzy matching.
"""

import logging

from django.contrib.postgres.search import SearchQuery, SearchRank, SearchVector
from django.db.models import CharField, F, Value

logger = logging.getLogger(__name__)


class SearchService:
    """
    Global search across all CRM entities.
    Uses Postgres full-text search with ranking.
    """

    MAX_RESULTS_PER_TYPE = 10

    def search(self, query: str) -> dict:
        """
        Search all entities and return grouped results.
        Returns: {"companies": [...], "contacts": [...], "deals": [...], ...}
        """
        if not query or len(query) < 2:
            return {"companies": [], "contacts": [], "deals": [], "notes": [], "tasks": []}

        return {
            "companies": self._search_companies(query),
            "contacts": self._search_contacts(query),
            "deals": self._search_deals(query),
            "notes": self._search_notes(query),
            "tasks": self._search_tasks(query),
        }

    def _search_companies(self, query: str) -> list[dict]:
        from apps.companies.models import Company

        vector = SearchVector("name", weight="A") + SearchVector("industry", "description", weight="B")
        search_query = SearchQuery(query, search_type="plain")

        results = (
            Company.objects.annotate(rank=SearchRank(vector, search_query))
            .filter(rank__gte=0.01)
            .order_by("-rank")[: self.MAX_RESULTS_PER_TYPE]
        )

        # Fallback to icontains if FTS returns nothing
        if not results:
            results = Company.objects.filter(
                name__icontains=query
            )[: self.MAX_RESULTS_PER_TYPE]

        return [
            {
                "id": str(r.id),
                "type": "company",
                "title": r.name,
                "subtitle": f"{r.industry or 'Unknown'} · {r.get_stage_display()}",
                "url": f"/companies/{r.id}",
            }
            for r in results
        ]

    def _search_contacts(self, query: str) -> list[dict]:
        from apps.contacts.models import Contact

        vector = (
            SearchVector("first_name", "last_name", weight="A")
            + SearchVector("email", "job_title", weight="B")
        )
        search_query = SearchQuery(query, search_type="plain")

        results = (
            Contact.objects.select_related("company")
            .annotate(rank=SearchRank(vector, search_query))
            .filter(rank__gte=0.01)
            .order_by("-rank")[: self.MAX_RESULTS_PER_TYPE]
        )

        if not results:
            results = Contact.objects.select_related("company").filter(
                first_name__icontains=query
            ) | Contact.objects.select_related("company").filter(
                last_name__icontains=query
            ) | Contact.objects.select_related("company").filter(
                email__icontains=query
            )
            results = results[: self.MAX_RESULTS_PER_TYPE]

        return [
            {
                "id": str(r.id),
                "type": "contact",
                "title": r.full_name,
                "subtitle": f"{r.job_title or ''} at {r.company.name}".strip(),
                "url": f"/contacts/{r.id}",
            }
            for r in results
        ]

    def _search_deals(self, query: str) -> list[dict]:
        from apps.deals.models import Deal

        vector = SearchVector("name", weight="A") + SearchVector("description", weight="B")
        search_query = SearchQuery(query, search_type="plain")

        results = (
            Deal.objects.select_related("company")
            .annotate(rank=SearchRank(vector, search_query))
            .filter(rank__gte=0.01)
            .order_by("-rank")[: self.MAX_RESULTS_PER_TYPE]
        )

        if not results:
            results = Deal.objects.select_related("company").filter(
                name__icontains=query
            )[: self.MAX_RESULTS_PER_TYPE]

        return [
            {
                "id": str(r.id),
                "type": "deal",
                "title": r.name,
                "subtitle": f"{r.company.name} · {r.get_stage_display()}",
                "url": f"/deals/{r.id}",
            }
            for r in results
        ]

    def _search_notes(self, query: str) -> list[dict]:
        from apps.notes.models import Note

        results = Note.objects.filter(content__icontains=query).select_related(
            "company", "contact", "deal"
        )[: self.MAX_RESULTS_PER_TYPE]

        output = []
        for r in results:
            parent = (
                r.company.name if r.company
                else r.contact.full_name if r.contact
                else r.deal.name if r.deal
                else "Unlinked"
            )
            output.append(
                {
                    "id": str(r.id),
                    "type": "note",
                    "title": r.content[:80] + ("..." if len(r.content) > 80 else ""),
                    "subtitle": f"Note on {parent}",
                    "url": f"/notes/{r.id}",
                }
            )
        return output

    def _search_tasks(self, query: str) -> list[dict]:
        from apps.tasks.models import Task

        results = Task.objects.filter(title__icontains=query)[: self.MAX_RESULTS_PER_TYPE]

        return [
            {
                "id": str(r.id),
                "type": "task",
                "title": r.title,
                "subtitle": f"{r.get_status_display()} · {r.get_priority_display()}",
                "url": f"/tasks/{r.id}",
            }
            for r in results
        ]
