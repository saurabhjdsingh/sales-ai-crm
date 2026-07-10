from django.urls import include, path
from rest_framework.routers import DefaultRouter

from apps.contacts.views import ContactViewSet

app_name = "contacts"
router = DefaultRouter()
router.register("", ContactViewSet, basename="contact")

urlpatterns = [path("", include(router.urls))]
