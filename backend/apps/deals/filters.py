"""
Filters for the Deals module.
"""

import django_filters

from apps.common.enums import DealPriority, DealRisk, DealStage
from apps.common.filters import BaseEntityFilter
from apps.deals.models import Deal


class DealFilter(BaseEntityFilter):
    stage = django_filters.ChoiceFilter(choices=DealStage.choices)
    priority = django_filters.ChoiceFilter(choices=DealPriority.choices)
    risk = django_filters.ChoiceFilter(choices=DealRisk.choices)
    company = django_filters.UUIDFilter(field_name="company__id")
    close_before = django_filters.DateFilter(
        field_name="expected_close_date", lookup_expr="lte"
    )
    close_after = django_filters.DateFilter(
        field_name="expected_close_date", lookup_expr="gte"
    )
    min_revenue = django_filters.NumberFilter(
        field_name="expected_revenue", lookup_expr="gte"
    )
    max_revenue = django_filters.NumberFilter(
        field_name="expected_revenue", lookup_expr="lte"
    )

    class Meta:
        model = Deal
        fields = ["stage", "priority", "risk", "company", "owner"]
