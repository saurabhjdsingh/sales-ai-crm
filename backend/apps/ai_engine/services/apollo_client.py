"""
Apollo.io API and MCP client.
Supports zero-credit organization and people view operations (for Account Intelligence)
and explicit on-demand contact detail revelation (for AI Copilot).
"""

import json
import logging
from typing import Any, Dict, List, Optional, Tuple
import requests

logger = logging.getLogger(__name__)

APOLLO_BASE_URL = "https://api.apollo.io/v1"
APOLLO_MCP_URL = "https://mcp.apollo.io/mcp"


class ApolloClient:
    """
    Client for interacting with Apollo.io API and MCP endpoint using a user's API key.
    Enforces zero-credit consumption on company & people viewing.
    """

    def __init__(self, api_key: str):
        self.api_key = api_key.strip()
        self.headers = {
            "Content-Type": "application/json",
            "Cache-Control": "no-cache",
            "X-Api-Key": self.api_key,
        }

    def verify_api_key(self) -> Tuple[bool, str]:
        """
        Validates the API key against the Apollo MCP server and REST endpoint.
        Returns (is_valid, message).
        """
        if not self.api_key:
            return False, "Apollo API key cannot be empty."

        try:
            # Probe Apollo MCP initialize method
            init_payload = {
                "jsonrpc": "2.0",
                "method": "initialize",
                "params": {
                    "protocolVersion": "2024-11-05",
                    "capabilities": {},
                    "clientInfo": {"name": "Sales-AI-CRM", "version": "1.0"},
                },
                "id": 1,
            }
            resp = requests.post(APOLLO_MCP_URL, headers=self.headers, json=init_payload, timeout=15)
            if resp.status_code == 200:
                return True, "Successfully authenticated with Apollo MCP server."

            # If MCP endpoint returned non-200, check if error was invalid key
            try:
                err_data = resp.json()
                if "AUTH" in str(err_data) or "Invalid API key" in str(err_data):
                    return False, "Invalid Apollo API key or API access revoked."
            except Exception:
                pass

            # Fallback probe against REST auth health / search
            rest_resp = requests.post(
                f"{APOLLO_BASE_URL}/mixed_companies/search",
                headers=self.headers,
                json={"q_organization_name": "Apollo.io", "page": 1, "per_page": 1},
                timeout=15,
            )
            if rest_resp.status_code == 200:
                return True, "Successfully verified Apollo API key."
            elif rest_resp.status_code in (401, 403):
                return False, "Apollo API key rejected (401 Unauthorized)."
            else:
                return False, f"Apollo returned HTTP {rest_resp.status_code}: {rest_resp.text[:150]}"

        except requests.exceptions.Timeout:
            return False, "Connection to Apollo.io timed out."
        except Exception as e:
            logger.exception("Error verifying Apollo API key: %s", e)
            return False, f"Failed to connect to Apollo: {str(e)}"

    def view_organization(self, domain: str, name: str = "") -> Dict[str, Any]:
        """
        ZERO-CREDIT: Enriches organization firmographics using domain or name.
        Does NOT consume credits.
        """
        clean_domain = domain.replace("https://", "").replace("http://", "").split("/")[0].strip()
        payload = {}
        if clean_domain:
            payload["domain"] = clean_domain
        elif name:
            payload["name"] = name.strip()
        else:
            return {"error": "Domain or company name required"}

        try:
            resp = requests.post(
                f"{APOLLO_BASE_URL}/organizations/enrich",
                headers=self.headers,
                json=payload,
                timeout=20,
            )
            if resp.status_code == 200:
                data = resp.json()
                org = data.get("organization") or {}
                return {
                    "success": True,
                    "name": org.get("name", name),
                    "domain": org.get("website_url") or clean_domain,
                    "industry": org.get("industry"),
                    "estimated_num_employees": org.get("estimated_num_employees"),
                    "annual_revenue": org.get("annual_revenue_printed"),
                    "total_funding": org.get("total_funding_printed"),
                    "city": org.get("city"),
                    "state": org.get("state"),
                    "country": org.get("country"),
                    "technologies": [t.get("name", t) if isinstance(t, dict) else t for t in org.get("current_technologies", [])],
                    "keywords": org.get("keywords", []),
                    "short_description": org.get("short_description") or org.get("seo_description", ""),
                    "linkedin_url": org.get("linkedin_url"),
                    "raw_organization": org,
                }
            elif resp.status_code == 404:
                return {"success": False, "error": f"No Apollo organization match for {clean_domain or name}"}
            else:
                return {"success": False, "error": f"Apollo returned HTTP {resp.status_code}: {resp.text[:150]}"}
        except Exception as e:
            logger.exception("Error fetching organization from Apollo: %s", e)
            return {"success": False, "error": str(e)}

    def view_people(
        self,
        domain: str,
        titles: Optional[List[str]] = None,
        limit: int = 8,
    ) -> List[Dict[str, Any]]:
        """
        ZERO-CREDIT: Searches public employee directory at a domain.
        Returns names, titles, seniority, and public LinkedIn profile URLs.
        Does NOT reveal personal emails or phone numbers, conserving credits.
        """
        clean_domain = domain.replace("https://", "").replace("http://", "").split("/")[0].strip()
        payload = {
            "q_organization_domains": clean_domain,
            "page": 1,
            "per_page": min(limit, 25),
        }
        if titles:
            payload["person_titles"] = titles

        try:
            resp = requests.post(
                f"{APOLLO_BASE_URL}/mixed_people/api_search",
                headers=self.headers,
                json=payload,
                timeout=20,
            )
            if resp.status_code == 200:
                data = resp.json()
                raw_people = data.get("people", [])
                results = []
                for p in raw_people:
                    full_name = p.get("name")
                    if not full_name:
                        first = p.get("first_name", "")
                        last = p.get("last_name_obfuscated") or p.get("last_name", "")
                        full_name = f"{first} {last}".strip() or "Anonymous Contact"

                    results.append({
                        "id": p.get("id"),
                        "name": full_name,
                        "first_name": p.get("first_name"),
                        "last_name": p.get("last_name_obfuscated") or p.get("last_name"),
                        "title": p.get("title"),
                        "seniority": p.get("seniority"),
                        "departments": p.get("departments", []),
                        "linkedin_url": p.get("linkedin_url"),
                        "city": p.get("city"),
                        "state": p.get("state"),
                        "country": p.get("country"),
                        "has_email": p.get("has_email", False),
                        "has_direct_phone": p.get("has_direct_phone"),
                        "credits_consumed": 0,
                    })
                return results
            else:
                logger.warning("Apollo mixed_people/api_search returned %s: %s", resp.status_code, resp.text)
                return []
        except Exception as e:
            logger.exception("Error searching people on Apollo: %s", e)
            return []

    def reveal_contact_info(
        self,
        name: str,
        domain: str = "",
        organization_name: str = "",
    ) -> Dict[str, Any]:
        """
        CREDIT-CONSUMING (1 credit): Explicitly matches and reveals verified contact details
        (work email, personal email, phone numbers).
        Only invoked on-demand when the user in Copilot asks for a specific person's contact info.
        """
        payload = {
            "reveal_personal_emails": True,
            "reveal_phone_number": True,
        }
        if name:
            parts = name.strip().split(maxsplit=1)
            payload["first_name"] = parts[0]
            if len(parts) > 1:
                payload["last_name"] = parts[1]
            payload["name"] = name.strip()

        if domain:
            payload["domain"] = domain.replace("https://", "").replace("http://", "").split("/")[0].strip()
        if organization_name:
            payload["organization_name"] = organization_name.strip()

        try:
            resp = requests.post(
                f"{APOLLO_BASE_URL}/people/match",
                headers=self.headers,
                json=payload,
                timeout=25,
            )
            if resp.status_code == 200:
                data = resp.json()
                person = data.get("person") or {}
                return {
                    "success": True,
                    "name": person.get("name", name),
                    "title": person.get("title"),
                    "email": person.get("email"),
                    "phone_numbers": [pn.get("sanitized_number") or pn.get("raw_number") for pn in person.get("phone_numbers", [])],
                    "linkedin_url": person.get("linkedin_url"),
                    "organization": person.get("organization", {}).get("name", organization_name),
                    "confidence": "high" if person.get("email") else "medium",
                    "credits_consumed": 1,
                }
            else:
                return {
                    "success": False,
                    "error": f"Apollo returned HTTP {resp.status_code}: {resp.text[:150]}",
                }
        except Exception as e:
            logger.exception("Error revealing contact info via Apollo: %s", e)
            return {"success": False, "error": str(e)}


def get_user_apollo_client(user) -> Optional[ApolloClient]:
    """
    Retrieves an initialized ApolloClient for the specified user or active workspace config.
    """
    from apps.ai_engine.models import ApolloConfig

    config = None
    if user is not None:
        config = ApolloConfig.objects.filter(user=user, is_active=True, is_deleted=False).first()
    if not config:
        config = ApolloConfig.objects.filter(is_active=True, is_deleted=False).first()

    if config and config.api_key:
        return ApolloClient(api_key=config.api_key)
    return None
