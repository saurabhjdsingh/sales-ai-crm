"""
Column mapping configuration for CSV imports.
Defines how CSV columns map to model fields.
"""

COMPANY_FIELD_MAP = {
    "name": {"required": True, "aliases": ["company_name", "company", "organization", "org_name"]},
    "website": {"required": False, "aliases": ["url", "site", "web", "homepage", "company_website"]},
    "industry": {"required": False, "aliases": ["sector", "vertical"]},
    "company_size": {"required": False, "aliases": ["size", "employees", "employee_count", "num_employees"]},
    "country": {"required": False, "aliases": ["location", "hq_country", "headquarters"]},
    "linkedin_url": {"required": False, "aliases": ["linkedin", "linkedin_company_url", "company_linkedin"]},
    "apollo_id": {"required": False, "aliases": ["apollo_organization_id"]},
    "description": {"required": False, "aliases": ["about", "bio", "summary", "company_description"]},
    "source": {"required": False, "aliases": ["lead_source", "channel"]},
}

CONTACT_FIELD_MAP = {
    "first_name": {"required": True, "aliases": ["fname", "given_name"]},
    "last_name": {"required": True, "aliases": ["lname", "surname", "family_name"]},
    "email": {"required": False, "aliases": ["email_address", "work_email", "business_email"]},
    "phone": {"required": False, "aliases": ["phone_number", "mobile", "telephone", "work_phone"]},
    "job_title": {"required": False, "aliases": ["title", "position", "role", "designation"]},
    "department": {"required": False, "aliases": ["dept", "team", "division"]},
    "linkedin_url": {"required": False, "aliases": ["linkedin", "linkedin_profile", "person_linkedin"]},
    "apollo_id": {"required": False, "aliases": ["apollo_contact_id", "apollo_person_id"]},
    "timezone": {"required": False, "aliases": ["tz", "time_zone"]},
    "country": {"required": False, "aliases": ["location", "person_country"]},
    "company_name": {"required": False, "aliases": ["company", "organization", "org_name"]},
}

UNIFIED_FIELD_MAP = {
    "first_name": {"required": True, "aliases": ["fname", "given_name"]},
    "last_name": {"required": True, "aliases": ["lname", "surname", "family_name"]},
    "company_name": {"required": True, "aliases": ["company", "organization", "org_name", "company_name"]},
    "company_website": {"required": False, "aliases": ["company_website", "company_url", "company_site", "website", "url"]},
    "company_industry": {"required": False, "aliases": ["company_industry", "company_sector", "industry"]},
    "company_size": {"required": False, "aliases": ["company_size", "company_employees", "company_size_class"]},
    "company_linkedin_url": {"required": False, "aliases": ["company_linkedin", "company_linkedin_url"]},
    "company_description": {"required": False, "aliases": ["company_description", "company_about", "description"]},
    "email": {"required": False, "aliases": ["email_address", "work_email", "business_email"]},
    "phone": {"required": False, "aliases": ["phone_number", "mobile", "telephone", "work_phone"]},
    "job_title": {"required": False, "aliases": ["title", "position", "role", "designation"]},
    "department": {"required": False, "aliases": ["dept", "team", "division"]},
    "timezone": {"required": False, "aliases": ["tz", "time_zone"]},
    "country": {"required": False, "aliases": ["location", "person_country"]},
    "linkedin_url": {"required": False, "aliases": ["linkedin", "linkedin_profile", "person_linkedin"]},
    "apollo_id": {"required": False, "aliases": ["apollo_contact_id", "apollo_person_id"]},
}


def suggest_mapping(headers: list[str], entity_type: str) -> dict[str, str]:
    """
    Auto-suggest column mapping by matching CSV headers to model fields.
    Returns a dict of {model_field: csv_header}.
    """
    if entity_type == "company":
        field_map = COMPANY_FIELD_MAP
    elif entity_type == "contact":
        field_map = CONTACT_FIELD_MAP
    else:
        field_map = UNIFIED_FIELD_MAP

    mapping = {}
    normalized_headers = {h.lower().strip().replace(" ", "_"): h for h in headers}

    for field_name, config in field_map.items():
        # Direct match
        if field_name in normalized_headers:
            mapping[field_name] = normalized_headers[field_name]
            continue

        # Alias match
        for alias in config.get("aliases", []):
            if alias in normalized_headers:
                mapping[field_name] = normalized_headers[alias]
                break

    return mapping
