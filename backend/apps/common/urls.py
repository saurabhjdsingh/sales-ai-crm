"""
URLs for common module.
"""

from django.urls import path
from apps.common.views import CountryListView

urlpatterns = [
    path("countries/", CountryListView.as_view(), name="country-list"),
]
