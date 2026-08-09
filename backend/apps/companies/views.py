"""
Views for the Companies module.
"""

from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.common.countries import normalize_country_code
from apps.common.mixins import CRMViewMixin
from apps.companies.filters import CompanyFilter
from apps.companies.models import Company
from apps.companies.serializers import (
    CompanyCreateSerializer,
    CompanyDetailSerializer,
    CompanyListSerializer,
    CompanyUpdateSerializer,
)
from apps.companies.services import CompanyService
from apps.prospect_lists.models import ProspectList


class CompanyViewSet(CRMViewMixin, viewsets.ModelViewSet):
    """
    ViewSet for Company CRUD operations.

    GET    /companies/           → List (paginated, filterable)
    POST   /companies/           → Create
    GET    /companies/:id/       → Detail
    PATCH  /companies/:id/       → Update
    DELETE /companies/:id/       → Soft delete
    POST   /companies/:id/research/ → Trigger AI research
    """

    filterset_class = CompanyFilter
    search_fields = ["name", "website", "industry", "description"]
    ordering_fields = ["name", "created_at", "updated_at", "icp_score", "stage"]
    ordering = ["-created_at"]

    def get_queryset(self):
        return CompanyService.get_companies_queryset().prefetch_related("lists")

    def filter_queryset(self, queryset):
        queryset = super().filter_queryset(queryset)
        ordering = self.request.query_params.get("ordering")
        if ordering:
            from django.db.models import F
            ordering_fields = [o.strip() for o in ordering.split(",")]
            new_ordering = []
            has_icp_sort = False
            for field in ordering_fields:
                if field == "icp_score":
                    new_ordering.append(F("icp_score").asc(nulls_last=True))
                    has_icp_sort = True
                elif field == "-icp_score":
                    new_ordering.append(F("icp_score").desc(nulls_last=True))
                    has_icp_sort = True
                else:
                    new_ordering.append(field)
            if has_icp_sort:
                queryset = queryset.order_by(*new_ordering)
        return queryset

    def get_serializer_class(self):
        if self.action == "list":
            return CompanyListSerializer
        if self.action in ("create",):
            return CompanyCreateSerializer
        if self.action in ("update", "partial_update"):
            return CompanyUpdateSerializer
        return CompanyDetailSerializer

    def perform_create(self, serializer):
        CompanyService.create_company(
            data=serializer.validated_data,
            user=self.request.user,
        )

    def perform_update(self, serializer):
        CompanyService.update_company(
            company=self.get_object(),
            data=serializer.validated_data,
            user=self.request.user,
        )

    @action(detail=True, methods=["post"], url_path="research")
    def trigger_research(self, request, pk=None):
        """Trigger AI research for a company."""
        company = self.get_object()
        from apps.ai_engine.tasks import research_company

        research_company.delay(str(company.id), user_id=str(request.user.id))
        return Response(
            {"message": f"Research queued for {company.name}."},
            status=status.HTTP_202_ACCEPTED,
        )

    @action(detail=True, methods=["get"], url_path="research-results")
    def get_research(self, request, pk=None):
        """Get AI research results for a company."""
        company = self.get_object()
        try:
            research = company.research
            from apps.ai_engine.serializers import CompanyResearchSerializer

            return Response(CompanyResearchSerializer(research).data)
        except Exception:
            return Response(
                {"message": "No research data available for this company."},
                status=status.HTTP_404_NOT_FOUND,
            )

    @action(detail=False, methods=["post"], url_path="bulk-add-to-list")
    def bulk_add_to_list(self, request):
        company_ids = request.data.get("company_ids", [])
        list_id = request.data.get("list_id")
        if not company_ids or not list_id:
            return Response({"error": "company_ids and list_id are required."}, status=status.HTTP_400_BAD_REQUEST)

        prospect_list = ProspectList.objects.filter(id=list_id, is_deleted=False).first()
        if not prospect_list:
            return Response({"error": "Prospect list not found."}, status=status.HTTP_404_NOT_FOUND)

        companies = Company.objects.filter(id__in=company_ids, is_deleted=False)
        count = 0
        for comp in companies:
            comp.lists.add(prospect_list)
            count += 1

        return Response({"message": f"Added {count} companies to '{prospect_list.name}'."})

    @action(detail=False, methods=["post"], url_path="bulk-remove-from-list")
    def bulk_remove_from_list(self, request):
        company_ids = request.data.get("company_ids", [])
        list_id = request.data.get("list_id")
        if not company_ids or not list_id:
            return Response({"error": "company_ids and list_id are required."}, status=status.HTTP_400_BAD_REQUEST)

        prospect_list = ProspectList.objects.filter(id=list_id, is_deleted=False).first()
        if not prospect_list:
            return Response({"error": "Prospect list not found."}, status=status.HTTP_404_NOT_FOUND)

        companies = Company.objects.filter(id__in=company_ids, is_deleted=False)
        count = 0
        for comp in companies:
            comp.lists.remove(prospect_list)
            count += 1

        return Response({"message": f"Removed {count} companies from '{prospect_list.name}'."})

    @action(detail=False, methods=["post"], url_path="bulk-set-country")
    def bulk_set_country(self, request):
        company_ids = request.data.get("company_ids", [])
        country_input = request.data.get("country", "")
        if not company_ids:
            return Response({"error": "company_ids is required."}, status=status.HTTP_400_BAD_REQUEST)

        iso = normalize_country_code(country_input) if country_input else ""
        count = Company.objects.filter(id__in=company_ids, is_deleted=False).update(country=iso)
        return Response({"message": f"Updated country for {count} companies."})
