"""
Filters for the Companies module.
"""

import django_filters
from django.db.models import Q

from apps.common.countries import normalize_country_code
from apps.common.enums import CompanySize, CompanySource, CompanyStage
from apps.common.filters import BaseEntityFilter
from apps.companies.models import Company


class CompanyFilter(BaseEntityFilter):
    """
    Filterable fields for company list:
    - stage, industry, company_size, source, country, list
    - icp_score range
    - search by name
    """

    stage = django_filters.ChoiceFilter(choices=CompanyStage.choices)
    industry = django_filters.CharFilter(lookup_expr="icontains")
    company_size = django_filters.ChoiceFilter(choices=CompanySize.choices)
    source = django_filters.ChoiceFilter(choices=CompanySource.choices)
    country = django_filters.CharFilter(method="filter_country")
    list = django_filters.CharFilter(method="filter_list")
    prospect_list = django_filters.CharFilter(method="filter_list")
    icp_score_min = django_filters.NumberFilter(
        field_name="icp_score", lookup_expr="gte"
    )
    icp_score_max = django_filters.NumberFilter(
        field_name="icp_score", lookup_expr="lte"
    )
    tag = django_filters.CharFilter(method="filter_by_tag")
    search = django_filters.CharFilter(method="filter_search")

    class Meta:
        model = Company
        fields = [
            "stage",
            "industry",
            "company_size",
            "source",
            "country",
            "list",
            "prospect_list",
            "owner",
        ]

    def filter_country(self, queryset, name, value):
        """Filter companies by normalized ISO country code or 'no_country'."""
        if not value:
            return queryset
        val_str = str(value).strip().lower()
        if val_str in ("none", "no_country", "no country", "null"):
            return queryset.filter(Q(country="") | Q(country__isnull=True))

        iso = normalize_country_code(value)
        if iso:
            return queryset.filter(country__iexact=iso)
        return queryset.filter(country__icontains=value.strip())

    def filter_list(self, queryset, name, value):
        """Filter companies by prospect list ID/name or 'no_list'."""
        if not value:
            return queryset
        val_str = str(value).strip().lower()
        if val_str in ("none", "no_list", "no list", "null"):
            return queryset.filter(lists__isnull=True)

        return queryset.filter(
            Q(lists__id=value)
            | Q(lists__name_normalized=val_str)
            | Q(lists__name__icontains=value)
        ).distinct()

    def filter_by_tag(self, queryset, name, value):
        """Filter companies that contain a specific tag."""
        return queryset.filter(tags__contains=[value])

    def filter_search(self, queryset, name, value):
        """Search companies by name, website, or industry."""
        return queryset.filter(
            Q(name__icontains=value)
            | Q(website__icontains=value)
            | Q(industry__icontains=value)
            | Q(description__icontains=value)
        )
