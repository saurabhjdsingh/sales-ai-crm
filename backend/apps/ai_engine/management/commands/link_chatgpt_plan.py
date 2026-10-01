"""
Radar 36 Sales CRM - ChatGPT Plan OAuth Authenticator Command.
Prompts for CRM Email & Password, authenticates with CRM production server,
runs local loopback OAuth with ChatGPT, and syncs tokens to that specific user.
"""

import base64
import getpass
import hashlib
import json
import secrets
import uuid
import webbrowser
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
import requests
from django.core.management.base import BaseCommand

LOOPBACK_PORT = 1455
REDIRECT_URI = f"http://127.0.0.1:{LOOPBACK_PORT}/auth/callback"
AUTH_ENDPOINT = "https://auth.openai.com/api/accounts/authorize"
TOKEN_ENDPOINT = "https://auth.openai.com/api/accounts/oauth/token"
RESOURCE_URI = "https://api.openai.com/v1"


class Command(BaseCommand):
    help = "Link your ChatGPT subscription to your CRM user account (Local or Production)"

    def add_arguments(self, parser):
        parser.add_argument(
            "--remote",
            type=str,
            default="https://crm.radar36.com",
            help="Base URL of your CRM production or local server (default: https://crm.radar36.com)",
        )

    def handle(self, *args, **options):
        remote_url = options["remote"].rstrip("/")
        self.stdout.write(self.style.MIGRATE_HEADING("\n========================================================"))
        self.stdout.write(self.style.MIGRATE_HEADING("   Radar 36 — ChatGPT Plan CLI Authenticator"))
        self.stdout.write(self.style.MIGRATE_HEADING("========================================================\n"))
        self.stdout.write(f"Connecting to CRM: {remote_url}\n")

        # 1. Prompt for CRM Email and Password
        crm_email = input("Enter CRM Email: ").strip()
        if not crm_email:
            self.stdout.write(self.style.ERROR("Email cannot be empty."))
            return

        crm_password = getpass.getpass("Enter CRM Password: ").strip()
        if not crm_password:
            self.stdout.write(self.style.ERROR("Password cannot be empty."))
            return

        self.stdout.write("Authenticating with CRM server...")
        try:
            login_resp = requests.post(
                f"{remote_url}/api/v1/auth/login/",
                json={"email": crm_email, "password": crm_password},
                timeout=15,
            )
        except Exception as e:
            self.stdout.write(self.style.ERROR(f"Could not reach {remote_url}: {e}"))
            return

        if not login_resp.ok:
            self.stdout.write(self.style.ERROR(f"CRM login failed ({login_resp.status_code}): {login_resp.text}"))
            return

        crm_tokens = login_resp.json()
        crm_jwt = crm_tokens.get("access") or crm_tokens.get("token")
        if not crm_jwt:
            self.stdout.write(self.style.ERROR("Could not retrieve access token from CRM response."))
            return

        user_name = crm_tokens.get("user", {}).get("first_name", "") or crm_email
        self.stdout.write(self.style.SUCCESS(f" Logged in as CRM User: {user_name} ({crm_email})\n"))

        # 2. Setup PKCE & OpenAI OAuth
        code_verifier = secrets.token_urlsafe(64)
        digest = hashlib.sha256(code_verifier.encode("utf-8")).digest()
        code_challenge = base64.urlsafe_b64encode(digest).decode("utf-8").rstrip("=")
        state = secrets.token_urlsafe(32)
        nonce = secrets.token_urlsafe(32)
        host_id = f"urn:uuid:{uuid.uuid4()}"

        oauth_params = {
            "client_id": "dynamic_agent_client",
            "agent_name_hint": "Radar 36 Sales CRM",
            "ext_agent_host_id": host_id,
            "response_type": "code",
            "redirect_uri": REDIRECT_URI,
            "scope": "openid profile email offline_access resource.invoke chatgpt.tokens.use.direct",
            "resource": RESOURCE_URI,
            "state": state,
            "nonce": nonce,
            "code_challenge": code_challenge,
            "code_challenge_method": "S256",
        }
        auth_url = requests.Request("GET", AUTH_ENDPOINT, params=oauth_params).prepare().url

        # 3. Start Loopback Server to catch callback
        auth_code_holder = {}

        class CallbackHandler(BaseHTTPRequestHandler):
            def do_GET(self):
                query = parse_qs(urlparse(self.path).query)
                if "code" in query:
                    auth_code_holder["code"] = query["code"][0]
                    auth_code_holder["client_id"] = query.get("client_id", [""])[0]
                    auth_code_holder["state"] = query.get("state", [""])[0]
                    self.send_response(200)
                    self.send_header("Content-Type", "text/html")
                    self.end_headers()
                    html_content = f"""
                    <!DOCTYPE html>
                    <html>
                    <head>
                        <meta charset="utf-8">
                        <title>Radar 36 - ChatGPT Authorization</title>
                        <style>
                            body {{
                                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                                background: #0b1120;
                                color: #f8fafc;
                                display: flex;
                                align-items: center;
                                justify-content: center;
                                height: 100vh;
                                margin: 0;
                            }}
                            .card {{
                                background: #0f172a;
                                border: 1px solid #1e293b;
                                border-radius: 12px;
                                padding: 2.5rem;
                                max-width: 480px;
                                text-align: center;
                                box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5);
                            }}
                            .badge {{
                                background: rgba(56, 189, 248, 0.1);
                                color: #38bdf8;
                                border: 1px solid rgba(56, 189, 248, 0.25);
                                padding: 0.35rem 0.85rem;
                                border-radius: 20px;
                                font-size: 0.8rem;
                                font-weight: 600;
                                display: inline-block;
                                margin-bottom: 1rem;
                            }}
                            h2 {{ margin: 0 0 0.5rem; color: #f8fafc; font-size: 1.4rem; }}
                            p {{ color: #94a3b8; font-size: 0.95rem; line-height: 1.5; }}
                        </style>
                    </head>
                    <body>
                        <div class="card">
                            <span class="badge">Authorization Successful</span>
                            <h2>ChatGPT Plan Connected!</h2>
                            <p>Linked to CRM account: <strong>{crm_email}</strong></p>
                            <p>You can close this tab and return to your terminal.</p>
                        </div>
                    </body>
                    </html>
                    """
                    self.wfile.write(html_content.encode("utf-8"))
                else:
                    self.send_response(400)
                    self.end_headers()
                    self.wfile.write(b"Missing authorization code.")

            def log_message(self, format, *args):
                pass  # Silence default HTTP server console noise

        try:
            server = HTTPServer(("127.0.0.1", LOOPBACK_PORT), CallbackHandler)
        except OSError as e:
            self.stdout.write(self.style.ERROR(f"Port {LOOPBACK_PORT} is currently occupied ({e}). Ensure no other listener is running."))
            return

        self.stdout.write(self.style.WARNING("Opening default browser for ChatGPT authorization..."))
        self.stdout.write(f"URL: {auth_url}\n")
        webbrowser.open(auth_url)

        self.stdout.write("Waiting for authorization in browser...")
        server.handle_request()

        code = auth_code_holder.get("code")
        issued_client_id = auth_code_holder.get("client_id")
        returned_state = auth_code_holder.get("state")

        if not code or returned_state != state:
            self.stdout.write(self.style.ERROR("Authorization failed or state validation mismatched."))
            return

        # 4. Exchange authorization code with OpenAI
        self.stdout.write("Exchanging code for OpenAI tokens...")
        token_payload = {
            "grant_type": "authorization_code",
            "client_id": issued_client_id,
            "code": code,
            "redirect_uri": REDIRECT_URI,
            "code_verifier": code_verifier,
            "resource": RESOURCE_URI,
        }

        try:
            token_resp = requests.post(TOKEN_ENDPOINT, data=token_payload, timeout=20)
        except Exception as e:
            self.stdout.write(self.style.ERROR(f"Token endpoint request failed: {e}"))
            return

        if not token_resp.ok:
            self.stdout.write(self.style.ERROR(f"OpenAI token exchange rejected ({token_resp.status_code}): {token_resp.text}"))
            return

        tokens = token_resp.json()
        scopes = tokens.get("scope", "").split() if isinstance(tokens.get("scope"), str) else tokens.get("scope", [])

        if "chatgpt.tokens.use.direct" not in scopes:
            self.stdout.write(self.style.WARNING("Warning: 'chatgpt.tokens.use.direct' scope was not returned in the token response."))

        # 5. Sync tokens to CRM Production Server
        self.stdout.write(f"Syncing ChatGPT session to CRM user '{crm_email}'...")
        sync_payload = {
            "client_id": issued_client_id,
            "ext_agent_host_id": host_id,
            "access_token": tokens["access_token"],
            "refresh_token": tokens.get("refresh_token", ""),
            "id_token": tokens.get("id_token", ""),
            "expires_in": tokens.get("expires_in", 3600),
            "scopes": scopes,
        }

        try:
            sync_resp = requests.post(
                f"{remote_url}/api/v1/ai/chatgpt/sync-tokens/",
                headers={"Authorization": f"Bearer {crm_jwt}"},
                json=sync_payload,
                timeout=15,
            )
        except Exception as e:
            self.stdout.write(self.style.ERROR(f"Failed to sync with CRM server: {e}"))
            return

        if sync_resp.ok:
            self.stdout.write(self.style.SUCCESS(
                f"\n SUCCESS! ChatGPT Plan is now linked to CRM user '{crm_email}' on {remote_url}."
            ))
            self.stdout.write(self.style.SUCCESS("All CRM AI features (Emails, Copilot, Account Intelligence) will now run using your ChatGPT subscription at $0 API cost!\n"))
        else:
            self.stdout.write(self.style.ERROR(f"Token sync failed ({sync_resp.status_code}): {sync_resp.text}"))
