"""
Dossier service for deterministic company intelligence ingestion,
contact deduplication, and organizational tree synchronization.
Zero AI tokens used.
"""

import re
import urllib.parse
from django.db import transaction
from django.utils import timezone
from apps.common.enums import ContactStage
from apps.companies.models import Company
from apps.contacts.models import Contact
from apps.ai_engine.models import CompanyResearch
from apps.ai_engine.serializers import CompanyResearchSerializer


def normalize_linkedin_url(url: str) -> str:
    """Normalize a LinkedIn URL for reliable deduplication matching."""
    if not url:
        return ""
    url = url.strip().lower()
    # Remove query string / fragments
    parsed = urllib.parse.urlparse(url)
    path = parsed.path.rstrip("/")
    # Remove locale prefix like in.linkedin.com -> linkedin.com
    netloc = parsed.netloc
    if "linkedin.com" in netloc:
        netloc = "linkedin.com"
    return f"{netloc}{path}"


def find_existing_contact(company: Company, linkedin_url: str = "", name: str = "") -> Contact | None:
    """
    Search for an existing contact under the given company.
    1st preference: Normalized LinkedIn URL match.
    2nd preference: Case-insensitive full name match within company.
    """
    company_contacts = Contact.objects.filter(company=company, is_deleted=False)
    
    # 1. LinkedIn Match
    norm_target = normalize_linkedin_url(linkedin_url)
    if norm_target:
        for c in company_contacts:
            if c.linkedin_url and normalize_linkedin_url(c.linkedin_url) == norm_target:
                return c

    # 2. Name Match
    if name:
        target_name = re.sub(r"\s+", " ", name.strip().lower())
        for c in company_contacts:
            ln = c.last_name.strip() if c.last_name and c.last_name != "." else ""
            fn = c.first_name.strip()
            full = re.sub(r"\s+", " ", f"{fn} {ln}".strip().lower())
            if full == target_name or fn.lower() == target_name:
                return c

    return None


class DossierService:
    @staticmethod
    @transaction.atomic
    def ingest_dossier(data: dict, user=None) -> dict:
        """
        Ingest company research dossier, handle deduplication, and sync org tree.
        Supports both:
        - Case 1: Company does not exist (creates company, contacts, and dossier)
        - Case 2: Company exists (links/creates contacts, updates dossier)
        """
        company_id = data.get("company_id")
        company_name = (data.get("name") or "").strip()
        
        # 1. Resolve or Create Company
        if company_id:
            try:
                company = Company.objects.get(id=company_id, is_deleted=False)
            except Company.DoesNotExist:
                raise ValueError(f"Company with ID '{company_id}' not found.")
        else:
            if not company_name:
                raise ValueError("Company name is required when company_id is not provided.")
            
            # Check if company with same name already exists
            company = Company.objects.filter(name__iexact=company_name, is_deleted=False).first()
            if not company:
                company = Company.objects.create(
                    name=company_name,
                    website=data.get("website", "").strip(),
                    industry=data.get("industry", "").strip(),
                    country=data.get("country", "").strip(),
                    company_size=data.get("company_size", "").strip(),
                    description=data.get("description", "").strip(),
                    owner=user,
                )

        # Enrich company if missing fields
        fields_to_update = []
        if not company.website and data.get("website"):
            company.website = data.get("website").strip()
            fields_to_update.append("website")
        if not company.industry and data.get("industry"):
            company.industry = data.get("industry").strip()
            fields_to_update.append("industry")
        if not company.country and data.get("country"):
            company.country = data.get("country").strip()
            fields_to_update.append("country")
        if not company.company_size and data.get("company_size"):
            company.company_size = data.get("company_size").strip()
            fields_to_update.append("company_size")
        if fields_to_update:
            company.save(update_fields=fields_to_update)

        # 2. Upsert CompanyResearch
        research, _ = CompanyResearch.objects.get_or_create(company=company)
        content_html = data.get("content_html", "")
        content_markdown = data.get("content_markdown", "")
        org_chart_data = data.get("org_chart_data") or {}

        research.content_html = content_html
        research.content_markdown = content_markdown
        research.source_type = data.get("source_type", "chatgpt_plugin")
        research.research_status = "completed"
        research.researched_at = timezone.now()

        # 3. Process People & Deduplication
        people = data.get("people", [])
        stats = {"created": 0, "linked": 0, "errors": []}
        person_id_map = {}  # Map person name/linkedin to CRM contact ID

        for person in people:
            p_name = (person.get("name") or "").strip()
            p_role = (person.get("role") or "").strip()
            p_linkedin = (person.get("linkedin_url") or "").strip()
            p_selected = person.get("selected", True)

            if not p_name:
                continue

            sid = transaction.savepoint()
            try:
                existing = find_existing_contact(company, p_linkedin, p_name)
                if existing:
                    # Enrich empty fields on existing contact
                    updated_contact_fields = []
                    if not existing.linkedin_url and p_linkedin:
                        existing.linkedin_url = p_linkedin
                        updated_contact_fields.append("linkedin_url")
                    if not existing.job_title and p_role:
                        existing.job_title = p_role
                        updated_contact_fields.append("job_title")
                    if updated_contact_fields:
                        existing.save(update_fields=updated_contact_fields)

                    person_id_map[p_name.lower()] = str(existing.id)
                    if p_linkedin:
                        person_id_map[normalize_linkedin_url(p_linkedin)] = str(existing.id)
                    stats["linked"] += 1
                elif p_selected:
                    # Create new contact
                    name_parts = p_name.split(maxsplit=1)
                    first_name = name_parts[0]
                    last_name = name_parts[1] if len(name_parts) > 1 else ""

                    new_contact = Contact.objects.create(
                        company=company,
                        first_name=first_name,
                        last_name=last_name,
                        job_title=p_role,
                        linkedin_url=p_linkedin,
                        country=company.country,
                        owner=user,
                        stage=ContactStage.COLD,
                        apollo_id=None,
                    )
                    person_id_map[p_name.lower()] = str(new_contact.id)
                    if p_linkedin:
                        person_id_map[normalize_linkedin_url(p_linkedin)] = str(new_contact.id)
                    stats["created"] += 1

                transaction.savepoint_commit(sid)
            except Exception as exc:
                transaction.savepoint_rollback(sid)
                stats["errors"].append({"person": p_name, "error": str(exc)})

        # 4. Update Org Chart Nodes with CRM Contact IDs
        if isinstance(org_chart_data, dict) and "nodes" in org_chart_data:
            for node in org_chart_data.get("nodes", []):
                n_name = (node.get("name") or "").strip().lower()
                n_linkedin = normalize_linkedin_url(node.get("linkedin_url") or "")
                
                crm_id = person_id_map.get(n_name) or (person_id_map.get(n_linkedin) if n_linkedin else None)
                if crm_id:
                    node["crm_contact_id"] = crm_id
                    node["in_crm"] = True

        research.org_chart_data = org_chart_data
        research.save()

        return {
            "company_id": str(company.id),
            "company_name": company.name,
            "created_contacts": stats["created"],
            "linked_contacts": stats["linked"],
            "errors": stats["errors"],
            "research": CompanyResearchSerializer(research).data,
        }

    @staticmethod
    def update_dossier(company_id: str, data: dict, user=None) -> dict:
        """Update content_html, content_markdown, or org_chart_data of an existing dossier."""
        company = Company.objects.get(id=company_id, is_deleted=False)
        research, _ = CompanyResearch.objects.get_or_create(company=company)

        if "content_html" in data:
            research.content_html = data["content_html"]
        if "content_markdown" in data:
            research.content_markdown = data["content_markdown"]
        if "org_chart_data" in data:
            research.org_chart_data = data["org_chart_data"]

        research.save()
        return CompanyResearchSerializer(research).data

    @staticmethod
    def import_single_contact(company_id: str, person_data: dict, user=None) -> dict:
        """Import a single person from the org chart directly into CRM contacts."""
        company = Company.objects.get(id=company_id, is_deleted=False)
        p_name = (person_data.get("name") or "").strip()
        p_role = (person_data.get("role") or "").strip()
        p_linkedin = (person_data.get("linkedin_url") or "").strip()

        if not p_name:
            raise ValueError("Contact name is required.")

        existing = find_existing_contact(company, p_linkedin, p_name)
        if existing:
            contact = existing
            is_new = False
        else:
            name_parts = p_name.split(maxsplit=1)
            first_name = name_parts[0]
            last_name = name_parts[1] if len(name_parts) > 1 else ""
            contact = Contact.objects.create(
                company=company,
                first_name=first_name,
                last_name=last_name,
                job_title=p_role,
                linkedin_url=p_linkedin,
                country=company.country,
                owner=user,
                stage=ContactStage.COLD,
                apollo_id=None,
            )
            is_new = True

        # Update org_chart_data if present
        try:
            research = company.research
            org_data = research.org_chart_data or {}
            if isinstance(org_data, dict) and "nodes" in org_data:
                for node in org_data.get("nodes", []):
                    if (node.get("name") or "").strip().lower() == p_name.lower():
                        node["crm_contact_id"] = str(contact.id)
                        node["in_crm"] = True
                research.org_chart_data = org_data
                research.save(update_fields=["org_chart_data"])
        except Exception:
            pass

        return {
            "contact_id": str(contact.id),
            "contact_name": f"{contact.first_name} {contact.last_name}".strip(),
            "is_new": is_new,
        }
