"""
Reusable view mixins for the CRM API.
"""

from rest_framework import status
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.common.permissions import IsOwnerOrReadOnly, IsSalesTeam


class CRMViewMixin:
    """
    Standard mixin for all CRM entity ViewSets.
    - Applies sales team permissions + owner-based write access
    - Sets created_by / updated_by from the request user
    - Uses soft delete instead of hard delete
    """

    permission_classes = [IsSalesTeam, IsOwnerOrReadOnly]

    def perform_create(self, serializer):
        serializer.save(
            created_by=self.request.user,
            updated_by=self.request.user,
        )

    def perform_update(self, serializer):
        serializer.save(updated_by=self.request.user)

    def perform_destroy(self, instance):
        instance.delete()

    @action(detail=False, methods=["post"], url_path="bulk-delete")
    def bulk_delete(self, request):
        """Bulk delete multiple records by ID."""
        ids = request.data.get("ids", [])
        if not ids:
            return Response(
                {"error": "No IDs provided"},
                status=status.HTTP_400_BAD_REQUEST
            )

        from django.db import transaction

        with transaction.atomic():
            queryset = self.get_queryset().filter(id__in=ids)
            deleted_count = 0
            for obj in queryset:
                self.check_object_permissions(request, obj)
                self.perform_destroy(obj)
                deleted_count += 1

        return Response(
            {"message": f"Successfully deleted {deleted_count} items."},
            status=status.HTTP_200_OK
        )

