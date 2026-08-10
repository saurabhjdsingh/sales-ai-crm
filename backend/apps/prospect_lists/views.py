from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.shortcuts import get_object_or_404
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.filters import SearchFilter, OrderingFilter
from .models import ProspectList
from .serializers import ProspectListSerializer, ProspectListCreateUpdateSerializer
from apps.companies.models import Company
from apps.companies.serializers import CompanyListSerializer
from apps.contacts.models import Contact
from apps.contacts.serializers import ContactListSerializer


class ProspectListViewSet(viewsets.ModelViewSet):
    """
    API endpoint for managing Prospect Lists and list memberships.
    """
    queryset = ProspectList.objects.all().order_by("-created_at")
    serializer_class = ProspectListSerializer
    permission_classes = [permissions.IsAuthenticated]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ["source", "is_active"]
    search_fields = ["name", "description"]
    ordering_fields = ["name", "created_at", "company_count", "contact_count"]

    def create(self, request, *args, **kwargs):
        serializer = ProspectListCreateUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = request.user if request.user and request.user.is_authenticated else None
        instance = serializer.save(created_by=user)
        output_serializer = ProspectListSerializer(instance)
        return Response(output_serializer.data, status=status.HTTP_201_CREATED)

    def get_serializer_class(self):
        if self.action in ["create", "update", "partial_update"]:
            return ProspectListCreateUpdateSerializer
        return ProspectListSerializer

    @action(detail=True, methods=["post"], url_path="add-company")
    def add_company(self, request, pk=None):
        prospect_list = self.get_object()
        company_id = request.data.get("company_id")
        if not company_id:
            return Response({"error": "company_id is required"}, status=status.HTTP_400_BAD_REQUEST)
        company = get_object_or_404(Company, pk=company_id)
        prospect_list.companies.add(company)
        return Response({
            "status": "company added to list",
            "company_id": company.id,
            "company_count": prospect_list.company_count
        })

    @action(detail=True, methods=["post"], url_path="remove-company")
    def remove_company(self, request, pk=None):
        prospect_list = self.get_object()
        company_id = request.data.get("company_id")
        if not company_id:
            return Response({"error": "company_id is required"}, status=status.HTTP_400_BAD_REQUEST)
        company = get_object_or_404(Company, pk=company_id)
        prospect_list.companies.remove(company)
        return Response({
            "status": "company removed from list",
            "company_id": company.id,
            "company_count": prospect_list.company_count
        })

    @action(detail=True, methods=["post"], url_path="add-contact")
    def add_contact(self, request, pk=None):
        prospect_list = self.get_object()
        contact_id = request.data.get("contact_id")
        if not contact_id:
            return Response({"error": "contact_id is required"}, status=status.HTTP_400_BAD_REQUEST)
        contact = get_object_or_404(Contact, pk=contact_id)
        prospect_list.contacts.add(contact)
        return Response({
            "status": "contact added to list",
            "contact_id": contact.id,
            "contact_count": prospect_list.contact_count
        })

    @action(detail=True, methods=["post"], url_path="remove-contact")
    def remove_contact(self, request, pk=None):
        prospect_list = self.get_object()
        contact_id = request.data.get("contact_id")
        if not contact_id:
            return Response({"error": "contact_id is required"}, status=status.HTTP_400_BAD_REQUEST)
        contact = get_object_or_404(Contact, pk=contact_id)
        prospect_list.contacts.remove(contact)
        return Response({
            "status": "contact removed from list",
            "contact_id": contact.id,
            "contact_count": prospect_list.contact_count
        })

    @action(detail=True, methods=["post"], url_path="bulk-add-contacts")
    def bulk_add_contacts(self, request, pk=None):
        """Add multiple contacts to a prospect list in one request."""
        prospect_list = self.get_object()
        contact_ids = request.data.get("contact_ids", [])
        if not contact_ids or not isinstance(contact_ids, list):
            return Response(
                {"error": "contact_ids list is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        contacts = Contact.objects.filter(pk__in=contact_ids, is_deleted=False)
        prospect_list.contacts.add(*contacts)
        return Response({
            "status": "contacts added to list",
            "added_count": contacts.count(),
            "contact_count": prospect_list.contact_count,
        })

    @action(detail=True, methods=["get"])
    def companies(self, request, pk=None):
        prospect_list = self.get_object()
        companies_qs = prospect_list.companies.all().order_by("-created_at")
        page = self.paginate_queryset(companies_qs)
        if page is not None:
            serializer = CompanyListSerializer(page, many=True)
            return self.get_paginated_response(serializer.data)
        serializer = CompanyListSerializer(companies_qs, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=["get"])
    def contacts(self, request, pk=None):
        prospect_list = self.get_object()
        contacts_qs = prospect_list.contacts.all().order_by("-created_at")
        page = self.paginate_queryset(contacts_qs)
        if page is not None:
            serializer = ContactListSerializer(page, many=True)
            return self.get_paginated_response(serializer.data)
        serializer = ContactListSerializer(contacts_qs, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=["post"], url_path="enroll-in-sequence")
    def enroll_in_sequence(self, request, pk=None):
        prospect_list = self.get_object()
        sequence_id = request.data.get("sequence_id")
        if not sequence_id:
            return Response({"error": "sequence_id is required"}, status=status.HTTP_400_BAD_REQUEST)

        contacts_qs = prospect_list.contacts.filter(is_deleted=False)
        total_count = contacts_qs.count()
        valid_contacts = [c for c in contacts_qs if c.email and c.email.strip()]
        skipped_no_email_count = total_count - len(valid_contacts)

        if not valid_contacts:
            return Response({
                "detail": "No contacts with valid email addresses found in this list.",
                "total_contacts": total_count,
                "enrolled_count": 0,
                "skipped_no_email_count": skipped_no_email_count
            }, status=status.HTTP_400_BAD_REQUEST)

        from apps.sequences.services.sequence_engine import SequenceEngineService
        try:
            user = request.user if request.user and request.user.is_authenticated else None
            enrollments = SequenceEngineService.enroll_contacts(
                sequence_id=sequence_id,
                contact_ids=[c.id for c in valid_contacts],
                user=user,
                skip_invalid_emails=True
            )
            SequenceEngineService.process_due_executions()
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)

        return Response({
            "status": "success",
            "sequence_id": sequence_id,
            "total_contacts": total_count,
            "enrolled_count": len(enrollments),
            "skipped_no_email_count": skipped_no_email_count
        }, status=status.HTTP_200_OK)
