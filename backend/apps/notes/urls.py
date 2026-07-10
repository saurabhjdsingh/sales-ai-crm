from django.urls import include, path
from rest_framework.routers import DefaultRouter

from apps.notes.views import NoteViewSet

app_name = "notes"
router = DefaultRouter()
router.register("", NoteViewSet, basename="note")

urlpatterns = [path("", include(router.urls))]
