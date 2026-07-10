"""
Filters for the Companies module.
"""

import django_filters

from apps.common.enums import CompanySize, CompanySource, CompanyStage
from apps.common.filters import BaseEntityFilter
from apps.companies.models import Company


from django.db.models import Q

class CompanyFilter(BaseEntityFilter):
    """
    Filterable fields for company list:
    - stage, industry, company_size, source, country
    - icp_score range
    - has_deals flag
    - search by name
    """

    stage = django_filters.ChoiceFilter(choices=CompanyStage.choices)
    industry = django_filters.CharFilter(lookup_expr="icontains")
    company_size = django_filters.ChoiceFilter(choices=CompanySize.choices)
    source = django_filters.ChoiceFilter(choices=CompanySource.choices)
    country = django_filters.CharFilter(lookup_expr="icontains")
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
            "owner",
        ]

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
