"""
Reusable filter base classes for CRM entities.
"""

import django_filters

from apps.common.enums import CompanyStage, ContactStage, DealStage


class BaseEntityFilter(django_filters.FilterSet):
    """Base filter that all entity filters inherit from."""

    created_after = django_filters.DateTimeFilter(
        field_name="created_at", lookup_expr="gte"
    )
    created_before = django_filters.DateTimeFilter(
        field_name="created_at", lookup_expr="lte"
    )
    owner = django_filters.UUIDFilter(field_name="owner__id")
