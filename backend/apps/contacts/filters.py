"""
Filters for the Contacts module.
"""

import django_filters

from apps.common.enums import ContactStage
from apps.common.filters import BaseEntityFilter
from apps.contacts.models import Contact


class ContactFilter(BaseEntityFilter):
    stage = django_filters.ChoiceFilter(choices=ContactStage.choices)
    company = django_filters.UUIDFilter(field_name="company__id")
    company_size = django_filters.CharFilter(field_name="company__company_size")
    job_title = django_filters.CharFilter(lookup_expr="icontains")
    department = django_filters.CharFilter(lookup_expr="icontains")
    country = django_filters.CharFilter(lookup_expr="icontains")

    class Meta:
        model = Contact
        fields = ["stage", "company", "company_size", "owner", "country"]
