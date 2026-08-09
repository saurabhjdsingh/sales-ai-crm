"""
ISO 3166-1 alpha-2 country reference mapping and normalization utilities for Sales CRM.
"""

from typing import List, Dict, Optional

# Standard ISO 3166-1 alpha-2 country code list with primary names
COUNTRY_LIST: List[Dict[str, str]] = [
    {"code": "AF", "name": "Afghanistan"},
    {"code": "AL", "name": "Albania"},
    {"code": "DZ", "name": "Algeria"},
    {"code": "AR", "name": "Argentina"},
    {"code": "AM", "name": "Armenia"},
    {"code": "AU", "name": "Australia"},
    {"code": "AT", "name": "Austria"},
    {"code": "AZ", "name": "Azerbaijan"},
    {"code": "BH", "name": "Bahrain"},
    {"code": "BD", "name": "Bangladesh"},
    {"code": "BY", "name": "Belarus"},
    {"code": "BE", "name": "Belgium"},
    {"code": "BO", "name": "Bolivia"},
    {"code": "BR", "name": "Brazil"},
    {"code": "BG", "name": "Bulgaria"},
    {"code": "CA", "name": "Canada"},
    {"code": "CL", "name": "Chile"},
    {"code": "CN", "name": "China"},
    {"code": "CO", "name": "Colombia"},
    {"code": "CR", "name": "Costa Rica"},
    {"code": "HR", "name": "Croatia"},
    {"code": "CY", "name": "Cyprus"},
    {"code": "CZ", "name": "Czech Republic"},
    {"code": "DK", "name": "Denmark"},
    {"code": "EC", "name": "Ecuador"},
    {"code": "EG", "name": "Egypt"},
    {"code": "EE", "name": "Estonia"},
    {"code": "FI", "name": "Finland"},
    {"code": "FR", "name": "France"},
    {"code": "GE", "name": "Georgia"},
    {"code": "DE", "name": "Germany"},
    {"code": "GR", "name": "Greece"},
    {"code": "HK", "name": "Hong Kong"},
    {"code": "HU", "name": "Hungary"},
    {"code": "IS", "name": "Iceland"},
    {"code": "IN", "name": "India"},
    {"code": "ID", "name": "Indonesia"},
    {"code": "IE", "name": "Ireland"},
    {"code": "IL", "name": "Israel"},
    {"code": "IT", "name": "Italy"},
    {"code": "JP", "name": "Japan"},
    {"code": "JO", "name": "Jordan"},
    {"code": "KZ", "name": "Kazakhstan"},
    {"code": "KE", "name": "Kenya"},
    {"code": "KR", "name": "South Korea"},
    {"code": "KW", "name": "Kuwait"},
    {"code": "LV", "name": "Latvia"},
    {"code": "LB", "name": "Lebanon"},
    {"code": "LT", "name": "Lithuania"},
    {"code": "LU", "name": "Luxembourg"},
    {"code": "MY", "name": "Malaysia"},
    {"code": "MX", "name": "Mexico"},
    {"code": "MD", "name": "Moldova"},
    {"code": "MN", "name": "Mongolia"},
    {"code": "MA", "name": "Morocco"},
    {"code": "NL", "name": "Netherlands"},
    {"code": "NZ", "name": "New Zealand"},
    {"code": "NG", "name": "Nigeria"},
    {"code": "NO", "name": "Norway"},
    {"code": "OM", "name": "Oman"},
    {"code": "PK", "name": "Pakistan"},
    {"code": "PA", "name": "Panama"},
    {"code": "PE", "name": "Peru"},
    {"code": "PH", "name": "Philippines"},
    {"code": "PL", "name": "Poland"},
    {"code": "PT", "name": "Portugal"},
    {"code": "QA", "name": "Qatar"},
    {"code": "RO", "name": "Romania"},
    {"code": "RU", "name": "Russia"},
    {"code": "SA", "name": "Saudi Arabia"},
    {"code": "RS", "name": "Serbia"},
    {"code": "SG", "name": "Singapore"},
    {"code": "SK", "name": "Slovakia"},
    {"code": "SI", "name": "Slovenia"},
    {"code": "ZA", "name": "South Africa"},
    {"code": "ES", "name": "Spain"},
    {"code": "SE", "name": "Sweden"},
    {"code": "CH", "name": "Switzerland"},
    {"code": "TW", "name": "Taiwan"},
    {"code": "TH", "name": "Thailand"},
    {"code": "TR", "name": "Turkey"},
    {"code": "UA", "name": "Ukraine"},
    {"code": "AE", "name": "United Arab Emirates"},
    {"code": "GB", "name": "United Kingdom"},
    {"code": "US", "name": "United States"},
    {"code": "UY", "name": "Uruguay"},
    {"code": "UZ", "name": "Uzbekistan"},
    {"code": "VN", "name": "Vietnam"},
]

# Dictionary mapping ISO 2-letter codes to primary display names
CODE_TO_NAME: Dict[str, str] = {item["code"]: item["name"] for item in COUNTRY_LIST}

# Normalization lookup dictionary mapping lowercase aliases to 2-letter ISO codes
NORMALIZE_MAP: Dict[str, str] = {
    # United States
    "us": "US",
    "usa": "US",
    "u.s.": "US",
    "u.s.a.": "US",
    "united states": "US",
    "united states of america": "US",
    "america": "US",
    "us of a": "US",
    # India
    "in": "IN",
    "ind": "IN",
    "india": "IN",
    "bharat": "IN",
    # United Kingdom
    "gb": "GB",
    "uk": "GB",
    "u.k.": "GB",
    "united kingdom": "GB",
    "great britain": "GB",
    "britain": "GB",
    "england": "GB",
    "scotland": "GB",
    "wales": "GB",
    # Germany
    "de": "DE",
    "deu": "DE",
    "germany": "DE",
    "deutschland": "DE",
    # Singapore
    "sg": "SG",
    "sgp": "SG",
    "singapore": "SG",
    # United Arab Emirates
    "ae": "AE",
    "uae": "AE",
    "u.a.e.": "AE",
    "united arab emirates": "AE",
    "dubai": "AE",
    "abu dhabi": "AE",
    # Canada
    "ca": "CA",
    "can": "CA",
    "canada": "CA",
    # Australia
    "au": "AU",
    "aus": "AU",
    "australia": "AU",
    # France
    "fr": "FR",
    "fra": "FR",
    "france": "FR",
    # Spain
    "es": "ES",
    "esp": "ES",
    "spain": "ES",
    "espana": "ES",
    # Italy
    "it": "IT",
    "ita": "IT",
    "italy": "IT",
    "italia": "IT",
    # Netherlands
    "nl": "NL",
    "nld": "NL",
    "netherlands": "NL",
    "holland": "NL",
    # Brazil
    "br": "BR",
    "bra": "BR",
    "brazil": "BR",
    "brasil": "BR",
    # Japan
    "jp": "JP",
    "jpn": "JP",
    "japan": "JP",
    # China
    "cn": "CN",
    "chn": "CN",
    "china": "CN",
    # Mexico
    "mx": "MX",
    "mex": "MX",
    "mexico": "MX",
    # Switzerland
    "ch": "CH",
    "che": "CH",
    "switzerland": "CH",
    # Sweden
    "se": "SE",
    "swe": "SE",
    "sweden": "SE",
    # Israel
    "il": "IL",
    "isr": "IL",
    "israel": "IL",
    # South Africa
    "za": "ZA",
    "zaf": "ZA",
    "south africa": "ZA",
}

# Add all standard codes and names from COUNTRY_LIST to NORMALIZE_MAP
for item in COUNTRY_LIST:
    code = item["code"]
    name = item["name"]
    NORMALIZE_MAP[code.lower()] = code
    NORMALIZE_MAP[name.lower()] = code


def normalize_country_code(value: Optional[str]) -> str:
    """
    Normalizes a country string (e.g. "United States", "USA", "in", "India")
    to its 2-letter ISO 3166-1 alpha-2 country code ("US", "IN").
    Returns empty string "" if value is empty or cannot be matched with confidence.
    """
    if not value:
        return ""
    val_str = str(value).strip().lower()
    if not val_str:
        return ""

    # Direct match in map
    if val_str in NORMALIZE_MAP:
        return NORMALIZE_MAP[val_str]

    # Clean special punctuation
    cleaned = val_str.replace(".", "").replace(",", "").replace("-", " ").strip()
    if cleaned in NORMALIZE_MAP:
        return NORMALIZE_MAP[cleaned]

    # Partial match for longer exact country names
    for item in COUNTRY_LIST:
        c_name = item["name"].lower()
        if c_name == val_str or c_name == cleaned:
            return item["code"]

    return ""


def get_country_display_name(code: Optional[str]) -> str:
    """
    Returns the full primary display name for an ISO country code.
    If unknown or empty, returns the original code or empty string.
    """
    if not code:
        return ""
    upper_code = str(code).strip().upper()
    return CODE_TO_NAME.get(upper_code, upper_code)
