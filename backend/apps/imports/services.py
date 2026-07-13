"""
Service layer for CSV imports.
"""

import logging
import re

from django.db import transaction

from apps.common.enums import (
    CompanySource,
    CompanyStage,
    ContactStage,
    ImportEntityType,
    ImportRecordStatus,
    ImportStatus,
)
from apps.common.utils import parse_csv_content
from apps.imports.mappers import suggest_mapping
from apps.imports.models import ImportJob, ImportRecord

logger = logging.getLogger(__name__)


def normalize_domain(url: str) -> str:
    if not url:
        return ""
    url = url.lower().strip()
    url = re.sub(r'^https?://', '', url)
    url = re.sub(r'^www\.', '', url)
    url = url.split('/')[0]
    return url


class ImportService:
    """Business logic for CSV import operations."""

    @staticmethod
    def create_upload(file, entity_type: str, user) -> dict:
        """
        Parse uploaded CSV and create an ImportJob in MAPPING state.
        Returns the parsed data preview and suggested column mapping.
        """
        content = file.read()
        rows = parse_csv_content(content)

        if not rows:
            from apps.common.exceptions import ServiceException

            raise ServiceException("The CSV file is empty or could not be parsed.")

        headers = list(rows[0].keys())
        suggested = suggest_mapping(headers, entity_type)

        import_job = ImportJob.objects.create(
            file_name=file.name,
            entity_type=entity_type,
            status=ImportStatus.MAPPING,
            total_rows=len(rows),
            file_data=rows,
            column_mapping=suggested,
            started_by=user,
            created_by=user,
        )

        return {
            "import_job_id": str(import_job.id),
            "file_name": file.name,
            "total_rows": len(rows),
            "headers": headers,
            "suggested_mapping": suggested,
            "preview": rows[:5],
        }

    @staticmethod
    def process_import(import_job: ImportJob, column_mapping: dict, user):
        """
        Process the import job with the confirmed column mapping.
        Creates entities row by row, tracking successes and failures.
        """
        import_job.column_mapping = column_mapping
        import_job.status = ImportStatus.PROCESSING
        import_job.save()

        if import_job.entity_type == ImportEntityType.COMPANY:
            ImportService._process_companies(import_job, column_mapping, user)
        elif import_job.entity_type in (ImportEntityType.CONTACT, ImportEntityType.UNIFIED):
            ImportService._process_contacts(import_job, column_mapping, user)

        import_job.status = ImportStatus.COMPLETED
        import_job.save()

    @staticmethod
    def _process_companies(import_job: ImportJob, mapping: dict, user):
        from apps.companies.models import Company

        for idx, row in enumerate(import_job.file_data, start=1):
            try:
                name = row.get(mapping.get("name", ""), "").strip()
                if not name:
                    ImportRecord.objects.create(
                        import_job=import_job,
                        row_number=idx,
                        status=ImportRecordStatus.ERROR,
                        raw_data=row,
                        error_message="Company name is required.",
                    )
                    import_job.error_count += 1
                    import_job.processed_rows += 1
                    import_job.save(update_fields=["error_count", "processed_rows"])
                    continue

                # Check for duplicates by name
                existing = Company.objects.filter(name__iexact=name).first()

                # Check for duplicates by domain
                website_col = mapping.get("website")
                website_val = row.get(website_col, "").strip() if website_col else ""
                search_domain = ""
                
                if not existing and website_val:
                    search_domain = normalize_domain(website_val)
                    if search_domain:
                        possible_matches = Company.objects.filter(website__icontains=search_domain)
                        for comp in possible_matches:
                            if normalize_domain(comp.website) == search_domain:
                                existing = comp
                                break

                if existing:
                    reason = f"Company with domain '{search_domain}' already exists." if (website_val and existing.website) else f"Company '{name}' already exists."
                    ImportRecord.objects.create(
                        import_job=import_job,
                        row_number=idx,
                        status=ImportRecordStatus.DUPLICATE,
                        raw_data=row,
                        entity_id=existing.id,
                        error_message=reason,
                    )
                    import_job.duplicate_count += 1
                    import_job.processed_rows += 1
                    import_job.save(update_fields=["duplicate_count", "processed_rows"])
                    continue

                company_data = {
                    "name": name,
                    "source": CompanySource.CSV_IMPORT,
                    "stage": CompanyStage.COLD,
                }

                # Map optional fields
                for field in ["website", "industry", "company_size", "country", "linkedin_url", "apollo_id", "description"]:
                    csv_col = mapping.get(field)
                    if csv_col and row.get(csv_col):
                        company_data[field] = row[csv_col].strip()

                # Ensure unique apollo_id is saved as NULL instead of empty string to avoid unique constraint violations
                if not company_data.get("apollo_id"):
                    company_data["apollo_id"] = None

                company = Company.objects.create(
                    **company_data,
                    created_by=user,
                    updated_by=user,
                    owner=user,
                )

                ImportRecord.objects.create(
                    import_job=import_job,
                    row_number=idx,
                    status=ImportRecordStatus.SUCCESS,
                    raw_data=row,
                    entity_id=company.id,
                )
                import_job.success_count += 1

                # Queue AI research for the new company
                try:
                    from apps.ai_engine.tasks import research_company

                    research_company.delay(str(company.id), user_id=str(user.id))
                except Exception:
                    logger.warning("Failed to queue research for company %s", company.id)

            except Exception as e:
                ImportRecord.objects.create(
                    import_job=import_job,
                    row_number=idx,
                    status=ImportRecordStatus.ERROR,
                    raw_data=row,
                    error_message=str(e),
                )
                import_job.error_count += 1
                logger.exception("Import error on row %d", idx)

            import_job.processed_rows += 1
            import_job.save(update_fields=["processed_rows", "success_count", "error_count", "duplicate_count"])

    @staticmethod
    def _process_contacts(import_job: ImportJob, mapping: dict, user):
        from apps.companies.models import Company
        from apps.contacts.models import Contact

        for idx, row in enumerate(import_job.file_data, start=1):
            try:
                first_name = row.get(mapping.get("first_name", ""), "").strip()
                last_name = row.get(mapping.get("last_name", ""), "").strip()

                if not first_name or not last_name:
                    ImportRecord.objects.create(
                        import_job=import_job,
                        row_number=idx,
                        status=ImportRecordStatus.ERROR,
                        raw_data=row,
                        error_message="First name and last name are required.",
                    )
                    import_job.error_count += 1
                    import_job.processed_rows += 1
                    import_job.save(update_fields=["error_count", "processed_rows"])
                    continue

                # Match company by name and map additional fields
                company = None
                company_col = mapping.get("company_name")
                if company_col and row.get(company_col):
                    company_name = row[company_col].strip()
                    
                    company_data = {
                        "name": company_name,
                        "source": CompanySource.CSV_IMPORT,
                        "stage": CompanyStage.COLD,
                    }
                    
                    # Optional company fields map
                    company_fields_map = {
                        "company_website": "website",
                        "company_industry": "industry",
                        "company_size": "company_size",
                        "company_linkedin_url": "linkedin_url",
                        "company_description": "description"
                    }
                    for csv_field, model_field in company_fields_map.items():
                        col_name = mapping.get(csv_field)
                        if col_name and row.get(col_name):
                            company_data[model_field] = row[col_name].strip()

                    # Ensure unique apollo_id is saved as NULL instead of empty string to avoid unique constraint violations
                    company_data["apollo_id"] = None

                    company = Company.objects.filter(name__iexact=company_name).first()
                    if not company:
                        company = Company.objects.create(
                            **company_data,
                            created_by=user,
                            updated_by=user,
                            owner=user,
                        )
                    else:
                        # Enrich existing company if it has blank/empty attributes
                        updated = False
                        for model_field, val in company_data.items():
                            if val and not getattr(company, model_field):
                                setattr(company, model_field, val)
                                updated = True
                        if updated:
                            company.save(update_fields=[
                                "website", "industry", "company_size", 
                                "linkedin_url", "description"
                            ])

                if not company:
                    ImportRecord.objects.create(
                        import_job=import_job,
                        row_number=idx,
                        status=ImportRecordStatus.ERROR,
                        raw_data=row,
                        error_message="No company could be matched or created.",
                    )
                    import_job.error_count += 1
                    import_job.processed_rows += 1
                    import_job.save(update_fields=["error_count", "processed_rows"])
                    continue

                # Check for duplicate by email
                email = row.get(mapping.get("email", ""), "").strip()
                if email:
                    existing = Contact.objects.filter(email__iexact=email).first()
                    if existing:
                        ImportRecord.objects.create(
                            import_job=import_job,
                            row_number=idx,
                            status=ImportRecordStatus.DUPLICATE,
                            raw_data=row,
                            entity_id=existing.id,
                            error_message=f"Contact with email '{email}' already exists.",
                        )
                        import_job.duplicate_count += 1
                        import_job.processed_rows += 1
                        import_job.save(update_fields=["duplicate_count", "processed_rows"])
                        continue

                stage_val = ContactStage.COLD
                csv_stage_col = mapping.get("stage")
                if csv_stage_col and row.get(csv_stage_col):
                    raw_val = str(row[csv_stage_col]).strip().lower().replace(" ", "_")
                    for choice in ContactStage.choices:
                        if raw_val == choice[0] or raw_val == choice[1].lower().replace(" ", "_"):
                            stage_val = choice[0]
                            break

                contact_data = {
                    "company": company,
                    "first_name": first_name,
                    "last_name": last_name,
                    "email": email,
                    "stage": stage_val,
                }

                for field in ["phone", "job_title", "department", "linkedin_url", "apollo_id", "timezone", "country"]:
                    csv_col = mapping.get(field)
                    if csv_col and row.get(csv_col):
                        contact_data[field] = str(row[csv_col]).strip()

                # Ensure unique apollo_id is saved as NULL instead of empty string to avoid unique constraint violations
                if not contact_data.get("apollo_id"):
                    contact_data["apollo_id"] = None

                contact = Contact.objects.create(
                    **contact_data,
                    created_by=user,
                    updated_by=user,
                    owner=user,
                )

                # Trigger automatic company stage update based on contact stage
                if contact.stage and contact.company:
                    new_stage = contact.stage
                    company_stage = None
                    if new_stage in ["replied", "follow_up", "interested"]:
                        company_stage = "active_opportunity"
                    elif new_stage == "won":
                        company_stage = "current_client"
                    elif new_stage in ["not_icp", "not_interested", "unresponsive"]:
                        company_stage = "dead_opportunity"
                    elif new_stage in ["do_not_contact", "bad_data", "changed_job"]:
                        company_stage = "do_not_prospect"
                        
                    if company_stage:
                        from apps.companies.services import CompanyService
                        CompanyService.update_company(contact.company, {"stage": company_stage}, user)

                ImportRecord.objects.create(
                    import_job=import_job,
                    row_number=idx,
                    status=ImportRecordStatus.SUCCESS,
                    raw_data=row,
                    entity_id=contact.id,
                )
                import_job.success_count += 1

            except Exception as e:
                ImportRecord.objects.create(
                    import_job=import_job,
                    row_number=idx,
                    status=ImportRecordStatus.ERROR,
                    raw_data=row,
                    error_message=str(e),
                )
                import_job.error_count += 1
                logger.exception("Import error on row %d", idx)

            import_job.processed_rows += 1
            import_job.save(update_fields=["processed_rows", "success_count", "error_count", "duplicate_count"])
