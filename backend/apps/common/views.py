"""
Views for common module.
"""

from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.common.countries import COUNTRY_LIST


class CountryListView(APIView):
    """
    GET /api/v1/common/countries/
    Returns list of normalized ISO 3166-1 alpha-2 countries.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(COUNTRY_LIST)
