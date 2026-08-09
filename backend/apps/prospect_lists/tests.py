from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from apps.companies.models import Company
from apps.contacts.models import Contact
from apps.prospect_lists.models import ProspectList, ProspectListSource

User = get_user_model()


class ProspectListTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            email="testuser@example.com",
            username="testuser",
            password="Password123!",
            first_name="Test",
            last_name="User",
        )
        self.client.force_authenticate(user=self.user)

    def test_create_prospect_list(self):
        url = "/api/v1/prospect-lists/"
        data = {
            "name": "US Founders List",
            "description": "Founders based in US",
            "source": "APOLLO",
        }
        response = self.client.post(url, data)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["name"], "US Founders List")
        self.assertEqual(response.data["name_normalized"], "us founders list")

    def test_duplicate_list_prevention(self):
        ProspectList.objects.create(
            name="Fintech Leads",
            name_normalized="fintech leads",
            created_by=self.user,
        )

        url = "/api/v1/prospect-lists/"
        data = {"name": "FINTECH LEADS"}
        response = self.client.post(url, data)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_company_and_contact_multi_list_membership(self):
        list1 = ProspectList.objects.create(name="List One", created_by=self.user)
        list2 = ProspectList.objects.create(name="List Two", created_by=self.user)

        company = Company.objects.create(name="Acme Corp", created_by=self.user)
        contact = Contact.objects.create(
            company=company, first_name="John", last_name="Doe", created_by=self.user
        )

        company.lists.add(list1, list2)
        contact.lists.add(list1, list2)

        self.assertEqual(company.lists.count(), 2)
        self.assertEqual(contact.lists.count(), 2)
        self.assertEqual(list1.company_count, 1)
        self.assertEqual(list1.contact_count, 1)

    def test_list_membership_endpoints(self):
        list_obj = ProspectList.objects.create(name="High Priority", created_by=self.user)
        company = Company.objects.create(name="Beta Inc", created_by=self.user)
        contact = Contact.objects.create(
            company=company, first_name="Jane", last_name="Smith", created_by=self.user
        )

        # Add company
        add_comp_url = f"/api/v1/prospect-lists/{list_obj.id}/add-company/"
        res = self.client.post(add_comp_url, {"company_id": str(company.id)})
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertTrue(company.lists.filter(id=list_obj.id).exists())

        # Add contact
        add_cont_url = f"/api/v1/prospect-lists/{list_obj.id}/add-contact/"
        res = self.client.post(add_cont_url, {"contact_id": str(contact.id)})
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertTrue(contact.lists.filter(id=list_obj.id).exists())

        # List member companies
        comps_url = f"/api/v1/prospect-lists/{list_obj.id}/companies/"
        res = self.client.get(comps_url)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["count"], 1)

        # Remove contact
        rem_cont_url = f"/api/v1/prospect-lists/{list_obj.id}/remove-contact/"
        res = self.client.post(rem_cont_url, {"contact_id": str(contact.id)})
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertFalse(contact.lists.filter(id=list_obj.id).exists())
