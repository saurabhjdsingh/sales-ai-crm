"""
Views for the Notes module.
"""

from rest_framework import viewsets

from apps.common.mixins import CRMViewMixin
from apps.notes.models import Note
from apps.notes.serializers import NoteCreateUpdateSerializer, NoteSerializer
from apps.notes.services import NoteService


class NoteViewSet(CRMViewMixin, viewsets.ModelViewSet):
    """ViewSet for Note CRUD."""

    search_fields = ["content"]
    ordering = ["-is_pinned", "-created_at"]

    def get_queryset(self):
        qs = Note.objects.select_related("created_by")

        company = self.request.query_params.get("company")
        contact = self.request.query_params.get("contact")
        deal = self.request.query_params.get("deal")

        if company:
            qs = qs.filter(company_id=company)
        if contact:
            qs = qs.filter(contact_id=contact)
        if deal:
            qs = qs.filter(deal_id=deal)

        return qs

    def get_serializer_class(self):
        if self.action in ("create", "update", "partial_update"):
            return NoteCreateUpdateSerializer
        return NoteSerializer

    def perform_create(self, serializer):
        NoteService.create_note(
            data=serializer.validated_data,
            user=self.request.user,
        )
