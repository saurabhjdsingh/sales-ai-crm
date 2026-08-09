"""
Views for the Contacts module.
"""

from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.common.countries import normalize_country_code
from apps.common.mixins import CRMViewMixin
from apps.contacts.filters import ContactFilter
from apps.contacts.models import Contact
from apps.contacts.serializers import (
    ContactCreateUpdateSerializer,
    ContactDetailSerializer,
    ContactListSerializer,
)
from apps.contacts.services import ContactService
from apps.prospect_lists.models import ProspectList


class ContactViewSet(CRMViewMixin, viewsets.ModelViewSet):
    """
    ViewSet for Contact CRUD operations.
    """

    filterset_class = ContactFilter
    search_fields = ["first_name", "last_name", "email", "job_title", "company__name"]
    ordering_fields = ["last_name", "created_at", "updated_at", "stage", "has_email", "has_phone", "company__company_size"]
    ordering = ["-created_at"]

    def get_queryset(self):
        return ContactService.get_contacts_queryset().prefetch_related("lists")

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

    @action(detail=False, methods=["post"], url_path="bulk-add-to-list")
    def bulk_add_to_list(self, request):
        contact_ids = request.data.get("contact_ids", [])
        list_id = request.data.get("list_id")
        if not contact_ids or not list_id:
            return Response({"error": "contact_ids and list_id are required."}, status=status.HTTP_400_BAD_REQUEST)

        prospect_list = ProspectList.objects.filter(id=list_id, is_deleted=False).first()
        if not prospect_list:
            return Response({"error": "Prospect list not found."}, status=status.HTTP_404_NOT_FOUND)

        contacts = Contact.objects.filter(id__in=contact_ids, is_deleted=False)
        count = 0
        for cont in contacts:
            cont.lists.add(prospect_list)
            count += 1

        return Response({"message": f"Added {count} contacts to '{prospect_list.name}'."})

    @action(detail=False, methods=["post"], url_path="bulk-remove-from-list")
    def bulk_remove_from_list(self, request):
        contact_ids = request.data.get("contact_ids", [])
        list_id = request.data.get("list_id")
        if not contact_ids or not list_id:
            return Response({"error": "contact_ids and list_id are required."}, status=status.HTTP_400_BAD_REQUEST)

        prospect_list = ProspectList.objects.filter(id=list_id, is_deleted=False).first()
        if not prospect_list:
            return Response({"error": "Prospect list not found."}, status=status.HTTP_404_NOT_FOUND)

        contacts = Contact.objects.filter(id__in=contact_ids, is_deleted=False)
        count = 0
        for cont in contacts:
            cont.lists.remove(prospect_list)
            count += 1

        return Response({"message": f"Removed {count} contacts from '{prospect_list.name}'."})

    @action(detail=False, methods=["post"], url_path="bulk-set-country")
    def bulk_set_country(self, request):
        contact_ids = request.data.get("contact_ids", [])
        country_input = request.data.get("country", "")
        if not contact_ids:
            return Response({"error": "contact_ids is required."}, status=status.HTTP_400_BAD_REQUEST)

        iso = normalize_country_code(country_input) if country_input else ""
        count = Contact.objects.filter(id__in=contact_ids, is_deleted=False).update(country=iso)
        return Response({"message": f"Updated country for {count} contacts."})
