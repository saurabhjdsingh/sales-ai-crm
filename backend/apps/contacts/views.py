"""
Views for the Contacts module.
"""

from rest_framework import viewsets

from apps.common.mixins import CRMViewMixin
from apps.contacts.filters import ContactFilter
from apps.contacts.models import Contact
from apps.contacts.serializers import (
    ContactCreateUpdateSerializer,
    ContactDetailSerializer,
    ContactListSerializer,
)
from apps.contacts.services import ContactService


class ContactViewSet(CRMViewMixin, viewsets.ModelViewSet):
    """
    ViewSet for Contact CRUD operations.
    """

    filterset_class = ContactFilter
    search_fields = ["first_name", "last_name", "email", "job_title", "company__name"]
    ordering_fields = ["last_name", "created_at", "updated_at", "stage", "has_email", "has_phone", "company__company_size"]
    ordering = ["-created_at"]

    def get_queryset(self):
        return ContactService.get_contacts_queryset()

    def get_serializer_class(self):
        if self.action == "list":
            return ContactListSerializer
        if self.action in ("create", "update", "partial_update"):
            return ContactCreateUpdateSerializer
        return ContactDetailSerializer

    def perform_create(self, serializer):
        ContactService.create_contact(
            data=serializer.validated_data,
            user=self.request.user,
        )

    def perform_update(self, serializer):
        ContactService.update_contact(
            contact=self.get_object(),
            data=serializer.validated_data,
            user=self.request.user,
        )
