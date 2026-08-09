from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import ProspectListViewSet

router = DefaultRouter()
router.register(r"", ProspectListViewSet, basename="prospect-list")

urlpatterns = [
    path("", include(router.urls)),
]
