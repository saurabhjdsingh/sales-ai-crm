"""
Service layer for CSV imports.
"""

import logging
import re

from django.db import transaction

from apps.common.countries import normalize_country_code
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
from apps.prospect_lists.models import ProspectList, ProspectListSource

logger = logging.getLogger(__name__)


def normalize_domain(url: str) -> str:
    if not url:
        return ""
    url = url.lower().strip()
    url = re.sub(r'^https?://', '', url)
    url = re.sub(r'^www\.', '', url)
    url = url.split('/')[0]
    return url


def _get_or_create_prospect_list(raw_list_name: str, import_job: ImportJob, user) -> ProspectList:
    """Helper to find or create a ProspectList by name."""
    list_name = raw_list_name.strip()
    norm_name = list_name.lower()

    prospect_list = ProspectList.objects.filter(name_normalized=norm_name, is_deleted=False).first()
    if not prospect_list:
        prospect_list = ProspectList.objects.create(
            name=list_name,
            name_normalized=norm_name,
            source=ProspectListSource.APOLLO,
            import_job=import_job,
            created_by=user,
            updated_by=user,
        )
    return prospect_list


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

                # Process ProspectList if present
                prospect_list = None
                list_col = mapping.get("list_name")
                if list_col and row.get(list_col):
                    raw_list_name = str(row[list_col]).strip()
                    if raw_list_name:
                        prospect_list = _get_or_create_prospect_list(raw_list_name, import_job, user)

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
                    # Associate list with existing company if list is present
                    if prospect_list:
                        existing.lists.add(prospect_list)

                    updated_company_fields = []
                    for f_name in ["website", "industry", "company_size", "city", "state", "linkedin_url", "description"]:
                        col_name = mapping.get(f_name)
                        if col_name and row.get(col_name):
                            val = str(row[col_name]).strip()
                            if val and not getattr(existing, f_name):
                                setattr(existing, f_name, val)
                                updated_company_fields.append(f_name)

                    country_col = mapping.get("country")
                    if country_col and row.get(country_col) and not existing.country:
                        norm_country = normalize_country_code(str(row[country_col]))
                        if norm_country:
                            existing.country = norm_country
                            updated_company_fields.append("country")

                    if updated_company_fields:
                        existing.save()

                    ImportRecord.objects.create(
                        import_job=import_job,
                        row_number=idx,
                        status=ImportRecordStatus.SUCCESS,
                        raw_data=row,
                        entity_id=existing.id,
                    )
                    import_job.success_count += 1
                    import_job.processed_rows += 1
                    import_job.save(update_fields=["success_count", "processed_rows"])
                    continue

                company_data = {
                    "name": name,
                    "source": CompanySource.CSV_IMPORT,
                    "stage": CompanyStage.COLD,
                }

                # Map optional fields
                for field in ["website", "industry", "company_size", "country", "city", "state", "linkedin_url", "apollo_id", "description"]:
                    csv_col = mapping.get(field)
                    if csv_col and row.get(csv_col):
                        company_data[field] = str(row[csv_col]).strip()

                # Normalize country if provided
                if company_data.get("country"):
                    company_data["country"] = normalize_country_code(company_data["country"])

                # Ensure unique apollo_id is saved as NULL instead of empty string
                if not company_data.get("apollo_id"):
                    company_data["apollo_id"] = None

                company = Company.objects.create(
                    **company_data,
                    created_by=user,
                    updated_by=user,
                    owner=user,
                )

                if prospect_list:
                    company.lists.add(prospect_list)

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

                # Process ProspectList if present
                prospect_list = None
                list_col = mapping.get("list_name")
                if list_col and row.get(list_col):
                    raw_list_name = str(row[list_col]).strip()
                    if raw_list_name:
                        prospect_list = _get_or_create_prospect_list(raw_list_name, import_job, user)

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
                        "company_city": "city",
                        "company_state": "state",
                        "company_linkedin_url": "linkedin_url",
                        "company_description": "description",
                        "country": "country",
                        "company_country": "country",
                    }
                    for csv_field, model_field in company_fields_map.items():
                        col_name = mapping.get(csv_field)
                        if col_name and row.get(col_name):
                            company_data[model_field] = str(row[col_name]).strip()

                    if company_data.get("country"):
                        company_data["country"] = normalize_country_code(company_data["country"])

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
                                "website", "industry", "company_size", "city", "state",
                                "linkedin_url", "description", "country"
                            ])

                    if prospect_list:
                        company.lists.add(prospect_list)

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

                # Check for duplicate by email & implement smart upsert
                email = row.get(mapping.get("email", ""), "").strip()
                existing = None
                if email:
                    existing = Contact.objects.filter(email__iexact=email).first()

                if existing:
                    if prospect_list:
                        existing.lists.add(prospect_list)

                    update_fields = []
                    # Updatable fields: first_name, last_name, phone, job_title, department, apollo_id, country, city, state, timezone
                    if first_name and existing.first_name != first_name:
                        existing.first_name = first_name
                        update_fields.append("first_name")
                    if last_name and existing.last_name != last_name:
                        existing.last_name = last_name
                        update_fields.append("last_name")

                    for f_name in ["phone", "job_title", "department", "city", "state", "timezone"]:
                        col_name = mapping.get(f_name)
                        if col_name and row.get(col_name):
                            val = str(row[col_name]).strip()
                            if val and getattr(existing, f_name) != val:
                                setattr(existing, f_name, val)
                                update_fields.append(f_name)

                    # linkedin_url: update only if existing is empty
                    col_lk = mapping.get("linkedin_url")
                    if col_lk and row.get(col_lk):
                        val_lk = str(row[col_lk]).strip()
                        if val_lk and not existing.linkedin_url:
                            existing.linkedin_url = val_lk
                            update_fields.append("linkedin_url")

                    # country: normalize and update if changed
                    col_country = mapping.get("country")
                    if col_country and row.get(col_country):
                        norm_country = normalize_country_code(str(row[col_country]))
                        if norm_country and existing.country != norm_country:
                            existing.country = norm_country
                            update_fields.append("country")

                    # apollo_id
                    col_apollo = mapping.get("apollo_id")
                    if col_apollo and row.get(col_apollo):
                        val_ap = str(row[col_apollo]).strip()
                        if val_ap and existing.apollo_id != val_ap:
                            existing.apollo_id = val_ap
                            update_fields.append("apollo_id")

                    if company and existing.company_id != company.id:
                        existing.company = company
                        update_fields.append("company")

                    # Always ensure timezone resolution runs & save contact if timezone is missing or fields updated
                    from apps.common.services.timezone_resolver import TimezoneResolverService
                    tz_changed = TimezoneResolverService.resolve_and_update_contact(existing)

                    if update_fields or tz_changed or not existing.timezone:
                        existing.save()

                    ImportRecord.objects.create(
                        import_job=import_job,
                        row_number=idx,
                        status=ImportRecordStatus.SUCCESS,
                        raw_data=row,
                        entity_id=existing.id,
                    )
                    import_job.success_count += 1
                    import_job.processed_rows += 1
                    import_job.save(update_fields=["success_count", "processed_rows"])
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

                for field in ["phone", "job_title", "department", "linkedin_url", "apollo_id", "timezone", "country", "city", "state"]:
                    csv_col = mapping.get(field)
                    if csv_col and row.get(csv_col):
                        contact_data[field] = str(row[csv_col]).strip()

                if contact_data.get("country"):
                    contact_data["country"] = normalize_country_code(contact_data["country"])

                # Ensure unique apollo_id is saved as NULL instead of empty string
                if not contact_data.get("apollo_id"):
                    contact_data["apollo_id"] = None

                contact = Contact.objects.create(
                    **contact_data,
                    created_by=user,
                    updated_by=user,
                    owner=user,
                )

                if prospect_list:
                    contact.lists.add(prospect_list)

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
