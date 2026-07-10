"""
URL patterns for the Companies module.
"""

from django.urls import include, path
from rest_framework.routers import DefaultRouter

from apps.companies.views import CompanyViewSet

app_name = "companies"

router = DefaultRouter()
router.register("", CompanyViewSet, basename="company")

urlpatterns = [
    path("", include(router.urls)),
]
