"""
TimezoneResolverService — Deterministic IANA timezone resolution for contacts.

Resolves canonical IANA timezone identifiers (e.g., 'Asia/Kolkata', 'America/New_York')
based on country, city, and state/region data. Uses static lookup tables for
single-timezone and multi-timezone countries, with NO LLM or external API calls.

Returns:
    tuple[str | None, str]:  (timezone_string, confidence_level)
    - timezone_string: IANA timezone string or None if unresolvable
    - confidence_level: 'HIGH', 'MEDIUM', 'LOW', 'UNKNOWN'
"""

import logging
from typing import Optional, Tuple
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

logger = logging.getLogger(__name__)

# ──────────────────────────────────────────────────────────────────────────────
# Single-timezone country → IANA mappings  (ISO 3166-1 alpha-2 code → tz)
# ──────────────────────────────────────────────────────────────────────────────
SINGLE_TZ_COUNTRY_MAP: dict[str, str] = {
    # Asia
    "IN": "Asia/Kolkata",
    "SG": "Asia/Singapore",
    "JP": "Asia/Tokyo",
    "KR": "Asia/Seoul",
    "HK": "Asia/Hong_Kong",
    "BD": "Asia/Dhaka",
    "LK": "Asia/Colombo",
    "PK": "Asia/Karachi",
    "PH": "Asia/Manila",
    "TH": "Asia/Bangkok",
    "VN": "Asia/Ho_Chi_Minh",
    "MM": "Asia/Yangon",
    "NP": "Asia/Kathmandu",
    "AF": "Asia/Kabul",
    "BH": "Asia/Bahrain",
    "QA": "Asia/Qatar",
    "KW": "Asia/Kuwait",
    "OM": "Asia/Muscat",
    "JO": "Asia/Amman",
    "LB": "Asia/Beirut",
    "IL": "Asia/Jerusalem",
    "SA": "Asia/Riyadh",
    "AE": "Asia/Dubai",
    "MY": "Asia/Kuala_Lumpur",
    "TW": "Asia/Taipei",
    # Europe
    "GB": "Europe/London",
    "IE": "Europe/Dublin",
    "FR": "Europe/Paris",
    "DE": "Europe/Berlin",
    "AT": "Europe/Vienna",
    "CH": "Europe/Zurich",
    "NL": "Europe/Amsterdam",
    "BE": "Europe/Brussels",
    "IT": "Europe/Rome",
    "ES": "Europe/Madrid",
    "PT": "Europe/Lisbon",
    "SE": "Europe/Stockholm",
    "NO": "Europe/Oslo",
    "DK": "Europe/Copenhagen",
    "FI": "Europe/Helsinki",
    "PL": "Europe/Warsaw",
    "CZ": "Europe/Prague",
    "RO": "Europe/Bucharest",
    "BG": "Europe/Sofia",
    "GR": "Europe/Athens",
    "HU": "Europe/Budapest",
    "HR": "Europe/Zagreb",
    "RS": "Europe/Belgrade",
    "SK": "Europe/Bratislava",
    "LT": "Europe/Vilnius",
    "LV": "Europe/Riga",
    "EE": "Europe/Tallinn",
    "IS": "Atlantic/Reykjavik",
    "LU": "Europe/Luxembourg",
    "CY": "Asia/Nicosia",
    "GE": "Asia/Tbilisi",
    "AM": "Asia/Yerevan",
    "AZ": "Asia/Baku",
    "BY": "Europe/Minsk",
    "MD": "Europe/Chisinau",
    "AL": "Europe/Tirane",
    "MK": "Europe/Skopje",
    "ME": "Europe/Podgorica",
    "BA": "Europe/Sarajevo",
    "SI": "Europe/Ljubljana",
    # Americas (single-tz)
    "CL": "America/Santiago",
    "CO": "America/Bogota",
    "PE": "America/Lima",
    "AR": "America/Argentina/Buenos_Aires",
    "VE": "America/Caracas",
    "EC": "America/Guayaquil",
    "BO": "America/La_Paz",
    "PY": "America/Asuncion",
    "UY": "America/Montevideo",
    "CR": "America/Costa_Rica",
    "PA": "America/Panama",
    # Africa
    "ZA": "Africa/Johannesburg",
    "NG": "Africa/Lagos",
    "KE": "Africa/Nairobi",
    "EG": "Africa/Cairo",
    "MA": "Africa/Casablanca",
    "GH": "Africa/Accra",
    "TZ": "Africa/Dar_es_Salaam",
    "ET": "Africa/Addis_Ababa",
    "UG": "Africa/Kampala",
    # Oceania
    "NZ": "Pacific/Auckland",
}

# Country name aliases → ISO 3166-1 alpha-2 codes
COUNTRY_NAME_TO_CODE: dict[str, str] = {
    "india": "IN",
    "singapore": "SG",
    "japan": "JP",
    "south korea": "KR",
    "korea": "KR",
    "hong kong": "HK",
    "bangladesh": "BD",
    "sri lanka": "LK",
    "pakistan": "PK",
    "philippines": "PH",
    "thailand": "TH",
    "vietnam": "VN",
    "myanmar": "MM",
    "nepal": "NP",
    "afghanistan": "AF",
    "bahrain": "BH",
    "qatar": "QA",
    "kuwait": "KW",
    "oman": "OM",
    "jordan": "JO",
    "lebanon": "LB",
    "israel": "IL",
    "saudi arabia": "SA",
    "uae": "AE",
    "united arab emirates": "AE",
    "malaysia": "MY",
    "taiwan": "TW",
    "united kingdom": "GB",
    "uk": "GB",
    "great britain": "GB",
    "england": "GB",
    "scotland": "GB",
    "wales": "GB",
    "ireland": "IE",
    "france": "FR",
    "germany": "DE",
    "austria": "AT",
    "switzerland": "CH",
    "netherlands": "NL",
    "belgium": "BE",
    "italy": "IT",
    "spain": "ES",
    "portugal": "PT",
    "sweden": "SE",
    "norway": "NO",
    "denmark": "DK",
    "finland": "FI",
    "poland": "PL",
    "czech republic": "CZ",
    "czechia": "CZ",
    "romania": "RO",
    "bulgaria": "BG",
    "greece": "GR",
    "hungary": "HU",
    "croatia": "HR",
    "serbia": "RS",
    "slovakia": "SK",
    "lithuania": "LT",
    "latvia": "LV",
    "estonia": "EE",
    "iceland": "IS",
    "luxembourg": "LU",
    "cyprus": "CY",
    "georgia": "GE",
    "armenia": "AM",
    "azerbaijan": "AZ",
    "belarus": "BY",
    "moldova": "MD",
    "albania": "AL",
    "north macedonia": "MK",
    "montenegro": "ME",
    "bosnia": "BA",
    "bosnia and herzegovina": "BA",
    "slovenia": "SI",
    "chile": "CL",
    "colombia": "CO",
    "peru": "PE",
    "argentina": "AR",
    "venezuela": "VE",
    "ecuador": "EC",
    "bolivia": "BO",
    "paraguay": "PY",
    "uruguay": "UY",
    "costa rica": "CR",
    "panama": "PA",
    "south africa": "ZA",
    "nigeria": "NG",
    "kenya": "KE",
    "egypt": "EG",
    "morocco": "MA",
    "ghana": "GH",
    "tanzania": "TZ",
    "ethiopia": "ET",
    "uganda": "UG",
    "new zealand": "NZ",
    # Multi-timezone countries
    "united states": "US",
    "usa": "US",
    "us": "US",
    "united states of america": "US",
    "canada": "CA",
    "australia": "AU",
    "brazil": "BR",
    "russia": "RU",
    "russian federation": "RU",
    "mexico": "MX",
    "china": "CN",
    "indonesia": "ID",
    "mongolia": "MN",
    "kazakhstan": "KZ",
}

# ──────────────────────────────────────────────────────────────────────────────
# Multi-timezone country: city/state → IANA mappings
# ──────────────────────────────────────────────────────────────────────────────

# United States
US_STATE_TZ: dict[str, str] = {
    # Eastern
    "ct": "America/New_York", "connecticut": "America/New_York",
    "dc": "America/New_York", "district of columbia": "America/New_York", "washington dc": "America/New_York",
    "de": "America/New_York", "delaware": "America/New_York",
    "fl": "America/New_York", "florida": "America/New_York",
    "ga": "America/New_York", "georgia": "America/New_York",
    "ma": "America/New_York", "massachusetts": "America/New_York",
    "md": "America/New_York", "maryland": "America/New_York",
    "me": "America/New_York", "maine": "America/New_York",
    "mi": "America/New_York", "michigan": "America/New_York",
    "nc": "America/New_York", "north carolina": "America/New_York",
    "nh": "America/New_York", "new hampshire": "America/New_York",
    "nj": "America/New_York", "new jersey": "America/New_York",
    "ny": "America/New_York", "new york": "America/New_York",
    "oh": "America/New_York", "ohio": "America/New_York",
    "pa": "America/New_York", "pennsylvania": "America/New_York",
    "ri": "America/New_York", "rhode island": "America/New_York",
    "sc": "America/New_York", "south carolina": "America/New_York",
    "va": "America/New_York", "virginia": "America/New_York",
    "vt": "America/New_York", "vermont": "America/New_York",
    "wv": "America/New_York", "west virginia": "America/New_York",
    # Central
    "al": "America/Chicago", "alabama": "America/Chicago",
    "ar": "America/Chicago", "arkansas": "America/Chicago",
    "ia": "America/Chicago", "iowa": "America/Chicago",
    "il": "America/Chicago", "illinois": "America/Chicago",
    "in": "America/Indiana/Indianapolis", "indiana": "America/Indiana/Indianapolis",
    "ks": "America/Chicago", "kansas": "America/Chicago",
    "ky": "America/New_York", "kentucky": "America/New_York",
    "la": "America/Chicago", "louisiana": "America/Chicago",
    "mn": "America/Chicago", "minnesota": "America/Chicago",
    "mo": "America/Chicago", "missouri": "America/Chicago",
    "ms": "America/Chicago", "mississippi": "America/Chicago",
    "nd": "America/Chicago", "north dakota": "America/Chicago",
    "ne": "America/Chicago", "nebraska": "America/Chicago",
    "ok": "America/Chicago", "oklahoma": "America/Chicago",
    "sd": "America/Chicago", "south dakota": "America/Chicago",
    "tn": "America/Chicago", "tennessee": "America/Chicago",
    "tx": "America/Chicago", "texas": "America/Chicago",
    "wi": "America/Chicago", "wisconsin": "America/Chicago",
    # Mountain
    "az": "America/Phoenix", "arizona": "America/Phoenix",
    "co": "America/Denver", "colorado": "America/Denver",
    "id": "America/Boise", "idaho": "America/Boise",
    "mt": "America/Denver", "montana": "America/Denver",
    "nm": "America/Denver", "new mexico": "America/Denver",
    "ut": "America/Denver", "utah": "America/Denver",
    "wy": "America/Denver", "wyoming": "America/Denver",
    # Pacific
    "ca": "America/Los_Angeles", "california": "America/Los_Angeles",
    "nv": "America/Los_Angeles", "nevada": "America/Los_Angeles",
    "or": "America/Los_Angeles", "oregon": "America/Los_Angeles",
    "wa": "America/Los_Angeles", "washington": "America/Los_Angeles",
    # Alaska & Hawaii
    "ak": "America/Anchorage", "alaska": "America/Anchorage",
    "hi": "Pacific/Honolulu", "hawaii": "Pacific/Honolulu",
}

US_CITY_TZ: dict[str, str] = {
    "new york": "America/New_York", "nyc": "America/New_York", "manhattan": "America/New_York",
    "brooklyn": "America/New_York", "boston": "America/New_York", "philadelphia": "America/New_York",
    "miami": "America/New_York", "atlanta": "America/New_York", "washington": "America/New_York",
    "charlotte": "America/New_York", "pittsburgh": "America/New_York", "detroit": "America/New_York",
    "chicago": "America/Chicago", "houston": "America/Chicago", "dallas": "America/Chicago",
    "san antonio": "America/Chicago", "austin": "America/Chicago", "nashville": "America/Chicago",
    "minneapolis": "America/Chicago", "milwaukee": "America/Chicago", "kansas city": "America/Chicago",
    "st louis": "America/Chicago", "new orleans": "America/Chicago", "memphis": "America/Chicago",
    "denver": "America/Denver", "phoenix": "America/Phoenix", "salt lake city": "America/Denver",
    "albuquerque": "America/Denver", "boise": "America/Boise",
    "los angeles": "America/Los_Angeles", "san francisco": "America/Los_Angeles",
    "san diego": "America/Los_Angeles", "san jose": "America/Los_Angeles",
    "seattle": "America/Los_Angeles", "portland": "America/Los_Angeles",
    "las vegas": "America/Los_Angeles", "sacramento": "America/Los_Angeles",
    "anchorage": "America/Anchorage", "honolulu": "Pacific/Honolulu",
}

# Canada
CA_PROVINCE_TZ: dict[str, str] = {
    "on": "America/Toronto", "ontario": "America/Toronto",
    "qc": "America/Toronto", "quebec": "America/Toronto",
    "bc": "America/Vancouver", "british columbia": "America/Vancouver",
    "ab": "America/Edmonton", "alberta": "America/Edmonton",
    "sk": "America/Regina", "saskatchewan": "America/Regina",
    "mb": "America/Winnipeg", "manitoba": "America/Winnipeg",
    "ns": "America/Halifax", "nova scotia": "America/Halifax",
    "nb": "America/Halifax", "new brunswick": "America/Halifax",
    "pe": "America/Halifax", "prince edward island": "America/Halifax",
    "nl": "America/St_Johns", "newfoundland": "America/St_Johns", "newfoundland and labrador": "America/St_Johns",
    "nt": "America/Yellowknife", "northwest territories": "America/Yellowknife",
    "nu": "America/Iqaluit", "nunavut": "America/Iqaluit",
    "yt": "America/Whitehorse", "yukon": "America/Whitehorse",
}

CA_CITY_TZ: dict[str, str] = {
    "toronto": "America/Toronto", "ottawa": "America/Toronto", "montreal": "America/Toronto",
    "vancouver": "America/Vancouver", "victoria": "America/Vancouver",
    "calgary": "America/Edmonton", "edmonton": "America/Edmonton",
    "winnipeg": "America/Winnipeg", "halifax": "America/Halifax",
    "st johns": "America/St_Johns",
}

# Australia
AU_STATE_TZ: dict[str, str] = {
    "nsw": "Australia/Sydney", "new south wales": "Australia/Sydney",
    "vic": "Australia/Melbourne", "victoria": "Australia/Melbourne",
    "qld": "Australia/Brisbane", "queensland": "Australia/Brisbane",
    "wa": "Australia/Perth", "western australia": "Australia/Perth",
    "sa": "Australia/Adelaide", "south australia": "Australia/Adelaide",
    "tas": "Australia/Hobart", "tasmania": "Australia/Hobart",
    "act": "Australia/Sydney", "australian capital territory": "Australia/Sydney",
    "nt": "Australia/Darwin", "northern territory": "Australia/Darwin",
}

AU_CITY_TZ: dict[str, str] = {
    "sydney": "Australia/Sydney", "melbourne": "Australia/Melbourne",
    "brisbane": "Australia/Brisbane", "perth": "Australia/Perth",
    "adelaide": "Australia/Adelaide", "hobart": "Australia/Hobart",
    "darwin": "Australia/Darwin", "canberra": "Australia/Sydney",
    "gold coast": "Australia/Brisbane",
}

# Brazil
BR_STATE_TZ: dict[str, str] = {
    "sp": "America/Sao_Paulo", "sao paulo": "America/Sao_Paulo",
    "rj": "America/Sao_Paulo", "rio de janeiro": "America/Sao_Paulo",
    "mg": "America/Sao_Paulo", "minas gerais": "America/Sao_Paulo",
    "rs": "America/Sao_Paulo", "rio grande do sul": "America/Sao_Paulo",
    "pr": "America/Sao_Paulo", "parana": "America/Sao_Paulo",
    "sc": "America/Sao_Paulo", "santa catarina": "America/Sao_Paulo",
    "ba": "America/Bahia", "bahia": "America/Bahia",
    "am": "America/Manaus", "amazonas": "America/Manaus",
    "ac": "America/Rio_Branco", "acre": "America/Rio_Branco",
    "mt": "America/Cuiaba", "mato grosso": "America/Cuiaba",
    "ms": "America/Campo_Grande", "mato grosso do sul": "America/Campo_Grande",
    "df": "America/Sao_Paulo", "distrito federal": "America/Sao_Paulo",
}

BR_CITY_TZ: dict[str, str] = {
    "sao paulo": "America/Sao_Paulo", "rio de janeiro": "America/Sao_Paulo",
    "brasilia": "America/Sao_Paulo", "curitiba": "America/Sao_Paulo",
    "belo horizonte": "America/Sao_Paulo", "porto alegre": "America/Sao_Paulo",
    "salvador": "America/Bahia", "manaus": "America/Manaus",
    "recife": "America/Recife", "fortaleza": "America/Fortaleza",
}

# Russia
RU_CITY_TZ: dict[str, str] = {
    "moscow": "Europe/Moscow", "saint petersburg": "Europe/Moscow", "st petersburg": "Europe/Moscow",
    "novosibirsk": "Asia/Novosibirsk", "yekaterinburg": "Asia/Yekaterinburg",
    "kazan": "Europe/Moscow", "nizhny novgorod": "Europe/Moscow",
    "vladivostok": "Asia/Vladivostok", "krasnoyarsk": "Asia/Krasnoyarsk",
    "omsk": "Asia/Omsk", "samara": "Europe/Samara",
    "rostov": "Europe/Moscow", "rostov-on-don": "Europe/Moscow",
    "kaliningrad": "Europe/Kaliningrad",
}

# Mexico
MX_STATE_TZ: dict[str, str] = {
    "cdmx": "America/Mexico_City", "ciudad de mexico": "America/Mexico_City",
    "jal": "America/Mexico_City", "jalisco": "America/Mexico_City",
    "nl": "America/Monterrey", "nuevo leon": "America/Monterrey",
    "chh": "America/Chihuahua", "chihuahua": "America/Chihuahua",
    "son": "America/Hermosillo", "sonora": "America/Hermosillo",
    "bcn": "America/Tijuana", "baja california": "America/Tijuana",
    "bcs": "America/Mazatlan", "baja california sur": "America/Mazatlan",
    "sin": "America/Mazatlan", "sinaloa": "America/Mazatlan",
    "qroo": "America/Cancun", "quintana roo": "America/Cancun",
}

MX_CITY_TZ: dict[str, str] = {
    "mexico city": "America/Mexico_City", "guadalajara": "America/Mexico_City",
    "monterrey": "America/Monterrey", "puebla": "America/Mexico_City",
    "cancun": "America/Cancun", "tijuana": "America/Tijuana",
    "chihuahua": "America/Chihuahua", "merida": "America/Merida",
}

# Multi-timezone country primary (capital/commercial centre) fallback
MULTI_TZ_COUNTRY_FALLBACK: dict[str, str] = {
    "US": "America/New_York",
    "CA": "America/Toronto",
    "AU": "Australia/Sydney",
    "BR": "America/Sao_Paulo",
    "RU": "Europe/Moscow",
    "MX": "America/Mexico_City",
    "CN": "Asia/Shanghai",
    "ID": "Asia/Jakarta",
    "MN": "Asia/Ulaanbaatar",
    "KZ": "Asia/Almaty",
}

# Multi-timezone city/state resolver tables
MULTI_TZ_RESOLVERS: dict[str, dict] = {
    "US": {"state": US_STATE_TZ, "city": US_CITY_TZ},
    "CA": {"state": CA_PROVINCE_TZ, "city": CA_CITY_TZ},
    "AU": {"state": AU_STATE_TZ, "city": AU_CITY_TZ},
    "BR": {"state": BR_STATE_TZ, "city": BR_CITY_TZ},
    "RU": {"state": {}, "city": RU_CITY_TZ},
    "MX": {"state": MX_STATE_TZ, "city": MX_CITY_TZ},
}


class TimezoneResolverService:
    """
    Deterministic timezone resolution for CRM contacts.
    No external API calls, no LLM. Pure static lookup.
    """

    @staticmethod
    def _normalize_country_to_code(country: str) -> Optional[str]:
        """Normalize a country name or code to ISO 3166-1 alpha-2 code."""
        if not country:
            return None
        from apps.common.countries import normalize_country_code
        code = normalize_country_code(country)
        if code:
            return code
        cleaned = country.strip().upper()
        if len(cleaned) == 2:
            return cleaned
        return COUNTRY_NAME_TO_CODE.get(country.strip().lower())

    @staticmethod
    def _validate_iana_timezone(tz_string: str) -> bool:
        """Validate that a string is a valid IANA timezone identifier."""
        try:
            ZoneInfo(tz_string)
            return True
        except (ZoneInfoNotFoundError, KeyError, ValueError):
            return False

    @classmethod
    def resolve_contact_timezone(
        cls,
        country: str = "",
        city: str = "",
        state: str = "",
        existing_timezone: str = "",
        timezone_source: str = "",
    ) -> Tuple[Optional[str], str]:
        """
        Resolve timezone from location data.

        Returns:
            tuple[str | None, str]: (iana_timezone, confidence)
              - confidence: 'HIGH' (city/state match), 'MEDIUM' (country fallback for multi-tz),
                           'LOW' (single-tz country), 'UNKNOWN' (unresolvable)
        """
        # If manually set, preserve it
        if timezone_source == "MANUAL" and existing_timezone:
            if cls._validate_iana_timezone(existing_timezone):
                return existing_timezone, "HIGH"

        # If an existing valid timezone is set and no auto-resolve is needed
        if existing_timezone and cls._validate_iana_timezone(existing_timezone) and timezone_source == "MANUAL":
            return existing_timezone, "HIGH"

        country_code = cls._normalize_country_to_code(country)
        if not country_code:
            return None, "UNKNOWN"

        # Single-timezone country?
        if country_code in SINGLE_TZ_COUNTRY_MAP:
            tz = SINGLE_TZ_COUNTRY_MAP[country_code]
            return tz, "HIGH"

        # Multi-timezone country — try city/state resolution first
        if country_code in MULTI_TZ_RESOLVERS:
            resolvers = MULTI_TZ_RESOLVERS[country_code]
            city_clean = city.strip().lower() if city else ""
            state_clean = state.strip().lower() if state else ""

            # Try city first (more precise)
            if city_clean and city_clean in resolvers.get("city", {}):
                tz = resolvers["city"][city_clean]
                return tz, "HIGH"

            # Try state
            if state_clean and state_clean in resolvers.get("state", {}):
                tz = resolvers["state"][state_clean]
                return tz, "HIGH"

            # Fallback to primary timezone for the country
            fallback_tz = MULTI_TZ_COUNTRY_FALLBACK.get(country_code)
            if fallback_tz:
                return fallback_tz, "MEDIUM"

        # Country is known but has no mapping (shouldn't happen with proper data)
        # Try the fallback map
        if country_code in MULTI_TZ_COUNTRY_FALLBACK:
            return MULTI_TZ_COUNTRY_FALLBACK[country_code], "MEDIUM"

        return None, "UNKNOWN"

    @classmethod
    def resolve_and_update_contact(cls, contact) -> bool:
        """
        Resolve timezone for a Contact model instance and update it in-place.
        Returns True if timezone was changed.

        Does NOT call contact.save() — caller is responsible for saving.
        """
        if getattr(contact, "timezone_source", "") == "MANUAL":
            return False

        tz, confidence = cls.resolve_contact_timezone(
            country=getattr(contact, "country", ""),
            city=getattr(contact, "city", ""),
            state=getattr(contact, "state", ""),
            existing_timezone=getattr(contact, "timezone", ""),
            timezone_source=getattr(contact, "timezone_source", ""),
        )

        changed = False
        new_tz = tz or ""
        new_confidence = confidence

        if new_tz != (getattr(contact, "timezone", "") or ""):
            contact.timezone = new_tz
            changed = True

        source = "AUTOMATIC" if tz else "DEFAULT"
        if getattr(contact, "timezone_source", "") != source:
            contact.timezone_source = source
            changed = True

        if getattr(contact, "timezone_confidence", "") != new_confidence:
            contact.timezone_confidence = new_confidence
            changed = True

        return changed
