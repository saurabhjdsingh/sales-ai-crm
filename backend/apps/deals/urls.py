from django.urls import include, path
from rest_framework.routers import DefaultRouter

from apps.deals.views import DealViewSet

app_name = "deals"
router = DefaultRouter()
router.register("", DealViewSet, basename="deal")

urlpatterns = [path("", include(router.urls))]
