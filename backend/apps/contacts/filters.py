"""
Filters for the Contacts module.
"""

import django_filters
from django.db.models import Q

from apps.common.countries import normalize_country_code
from apps.common.enums import ContactStage
from apps.common.filters import BaseEntityFilter
from apps.contacts.models import Contact


class ContactFilter(BaseEntityFilter):
    stage = django_filters.ChoiceFilter(choices=ContactStage.choices)
    company = django_filters.UUIDFilter(field_name="company__id")
    company_size = django_filters.CharFilter(field_name="company__company_size")
    job_title = django_filters.CharFilter(lookup_expr="icontains")
    department = django_filters.CharFilter(lookup_expr="icontains")
    country = django_filters.CharFilter(method="filter_country")
    list = django_filters.CharFilter(method="filter_list")
    prospect_list = django_filters.CharFilter(method="filter_list")
    search = django_filters.CharFilter(method="filter_search")

    class Meta:
        model = Contact
        fields = ["stage", "company", "company_size", "owner", "country", "list", "prospect_list"]

    def filter_country(self, queryset, name, value):
        """Filter contacts by normalized ISO country code or 'no_country'."""
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
        """Filter contacts by prospect list ID/name or 'no_list'."""
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

    def filter_search(self, queryset, name, value):
        """Search contacts by first name, last name, or email."""
        return queryset.filter(
            Q(first_name__icontains=value)
            | Q(last_name__icontains=value)
            | Q(email__icontains=value)
            | Q(job_title__icontains=value)
        )
