"""
Views for Global Search.
"""

from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.search.services import SearchService


class GlobalSearchView(APIView):
    """
    GET /search/?q=<query>
    Search across companies, contacts, deals, notes, and tasks.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        query = request.query_params.get("q", "").strip()
        service = SearchService()
        results = service.search(query)
        return Response(results)
