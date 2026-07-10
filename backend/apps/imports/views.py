"""
Views for the Imports module.
"""

from rest_framework import generics, status
from rest_framework.parsers import MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.common.pagination import StandardPagination
from apps.imports.models import ImportJob, ImportRecord
from apps.imports.serializers import (
    ImportJobDetailSerializer,
    ImportJobListSerializer,
    ImportProcessSerializer,
    ImportRecordSerializer,
    ImportUploadSerializer,
)
from apps.imports.services import ImportService
from apps.imports.tasks import process_import_job


class ImportUploadView(APIView):
    """
    POST /imports/upload/
    Upload a CSV file and receive preview with suggested mapping.
    """

    parser_classes = [MultiPartParser]
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = ImportUploadSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        result = ImportService.create_upload(
            file=serializer.validated_data["file"],
            entity_type=serializer.validated_data["entity_type"],
            user=request.user,
        )
        return Response(result, status=status.HTTP_201_CREATED)


class ImportProcessView(APIView):
    """
    POST /imports/process/
    Start import processing with confirmed column mapping.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = ImportProcessSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        import_job_id = str(serializer.validated_data["import_job_id"])
        column_mapping = serializer.validated_data["column_mapping"]

        try:
            import_job = ImportJob.objects.get(id=import_job_id)
        except ImportJob.DoesNotExist:
            return Response(
                {"error": {"code": "not_found", "message": "Import job not found."}},
                status=status.HTTP_404_NOT_FOUND,
            )

        import_job.column_mapping = column_mapping
        import_job.save(update_fields=["column_mapping"])

        process_import_job.delay(import_job_id)

        return Response(
            {"message": "Import processing started.", "import_job_id": import_job_id},
            status=status.HTTP_202_ACCEPTED,
        )


class ImportJobListView(generics.ListAPIView):
    """GET /imports/ — List all import jobs."""

    serializer_class = ImportJobListSerializer
    pagination_class = StandardPagination
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return ImportJob.objects.select_related("started_by").order_by("-created_at")


class ImportJobDetailView(generics.RetrieveAPIView):
    """GET /imports/:id/ — Get import job details."""

    serializer_class = ImportJobDetailSerializer
    permission_classes = [IsAuthenticated]
    lookup_field = "id"

    def get_queryset(self):
        return ImportJob.objects.select_related("started_by")


class ImportRecordListView(generics.ListAPIView):
    """GET /imports/:id/records/ — List records for an import job."""

    serializer_class = ImportRecordSerializer
    pagination_class = StandardPagination
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        import_job_id = self.kwargs["import_job_id"]
        status_filter = self.request.query_params.get("status")
        qs = ImportRecord.objects.filter(import_job_id=import_job_id)
        if status_filter:
            qs = qs.filter(status=status_filter)
        return qs
