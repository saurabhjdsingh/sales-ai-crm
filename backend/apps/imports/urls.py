from django.urls import path

from apps.imports.views import (
    ImportJobDetailView,
    ImportJobListView,
    ImportProcessView,
    ImportRecordListView,
    ImportUploadView,
)

app_name = "imports"

urlpatterns = [
    path("", ImportJobListView.as_view(), name="import-list"),
    path("upload/", ImportUploadView.as_view(), name="import-upload"),
    path("process/", ImportProcessView.as_view(), name="import-process"),
    path("<uuid:id>/", ImportJobDetailView.as_view(), name="import-detail"),
    path(
        "<uuid:import_job_id>/records/",
        ImportRecordListView.as_view(),
        name="import-records",
    ),
]
