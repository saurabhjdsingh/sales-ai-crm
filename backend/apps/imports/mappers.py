"""
Column mapping configuration for CSV imports.
Defines how CSV columns map to model fields.
"""

COMPANY_FIELD_MAP = {
    "name": {"required": True, "aliases": ["company_name", "company", "organization", "org_name"]},
    "website": {"required": False, "aliases": ["url", "site", "web", "homepage", "company_website"]},
    "industry": {"required": False, "aliases": ["sector", "vertical"]},
    "company_size": {"required": False, "aliases": ["size", "employees", "employee_count", "num_employees"]},
    "country": {"required": False, "aliases": ["country", "location", "hq_country", "headquarters", "company_country"]},
    "city": {"required": False, "aliases": ["city", "town", "hq_city", "company_city"]},
    "state": {"required": False, "aliases": ["state", "province", "region", "hq_state", "company_state", "state_code"]},
    "linkedin_url": {"required": False, "aliases": ["linkedin", "linkedin_company_url", "company_linkedin"]},
    "apollo_id": {"required": False, "aliases": ["apollo_organization_id"]},
    "description": {"required": False, "aliases": ["about", "bio", "summary", "company_description"]},
    "source": {"required": False, "aliases": ["lead_source", "channel"]},
    "list_name": {"required": False, "aliases": ["list_name", "list", "lists", "apollo_list", "apollo_lists", "custom_list", "custom_lists", "list_names", "company_list"]},
}

CONTACT_FIELD_MAP = {
    "first_name": {"required": True, "aliases": ["fname", "given_name", "first"]},
    "last_name": {"required": True, "aliases": ["lname", "surname", "family_name", "last"]},
    "company_name": {"required": True, "aliases": ["company", "organization", "org_name", "company_name"]},
    "email": {"required": False, "aliases": ["email_address", "work_email", "business_email"]},
    "phone": {"required": False, "aliases": ["phone_number", "mobile", "telephone", "work_phone"]},
    "job_title": {"required": False, "aliases": ["title", "position", "role", "designation"]},
    "department": {"required": False, "aliases": ["dept", "team", "division"]},
    "city": {"required": False, "aliases": ["city", "town", "person_city", "city_name"]},
    "state": {"required": False, "aliases": ["state", "province", "region", "person_state", "state_code"]},
    "country": {"required": False, "aliases": ["country", "location", "person_country"]},
    "timezone": {"required": False, "aliases": ["tz", "time_zone"]},
    "linkedin_url": {"required": False, "aliases": ["linkedin", "linkedin_profile", "person_linkedin"]},
    "apollo_id": {"required": False, "aliases": ["apollo_contact_id", "apollo_person_id"]},
    "list_name": {"required": False, "aliases": ["list_name", "list", "lists", "apollo_list", "apollo_lists", "custom_list", "custom_lists", "list_names", "contact_list"]},
}

UNIFIED_FIELD_MAP = {
    "first_name": {"required": True, "aliases": ["fname", "given_name", "first"]},
    "last_name": {"required": True, "aliases": ["lname", "surname", "family_name", "last"]},
    "company_name": {"required": True, "aliases": ["company", "organization", "org_name", "company_name"]},
    "company_website": {"required": False, "aliases": ["company_website", "company_url", "company_site", "website", "url"]},
    "company_industry": {"required": False, "aliases": ["company_industry", "company_sector", "industry"]},
    "company_size": {"required": False, "aliases": ["company_size", "company_employees", "company_size_class"]},
    "company_city": {"required": False, "aliases": ["company_city", "hq_city"]},
    "company_state": {"required": False, "aliases": ["company_state", "hq_state"]},
    "company_country": {"required": False, "aliases": ["company_country", "hq_country"]},
    "company_linkedin_url": {"required": False, "aliases": ["company_linkedin", "company_linkedin_url"]},
    "company_description": {"required": False, "aliases": ["company_description", "company_about", "description"]},
    "email": {"required": False, "aliases": ["email_address", "work_email", "business_email"]},
    "phone": {"required": False, "aliases": ["phone_number", "mobile", "telephone", "work_phone"]},
    "job_title": {"required": False, "aliases": ["title", "position", "role", "designation"]},
    "department": {"required": False, "aliases": ["dept", "team", "division"]},
    "city": {"required": False, "aliases": ["city", "town", "person_city"]},
    "state": {"required": False, "aliases": ["state", "province", "region", "person_state", "state_code"]},
    "country": {"required": False, "aliases": ["country", "location", "person_country"]},
    "timezone": {"required": False, "aliases": ["tz", "time_zone"]},
    "linkedin_url": {"required": False, "aliases": ["linkedin", "linkedin_profile", "person_linkedin"]},
    "apollo_id": {"required": False, "aliases": ["apollo_contact_id", "apollo_person_id"]},
    "list_name": {"required": False, "aliases": ["list_name", "list", "lists", "apollo_list", "apollo_lists", "custom_list", "custom_lists", "list_names"]},
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
