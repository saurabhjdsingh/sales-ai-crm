#!/usr/bin/env python3
"""
Radar 36 Sales CRM - Standalone ChatGPT Plan Authenticator CLI.
Can be run on any computer with Python 3 (zero external dependencies required):
  python3 scripts/link_chatgpt_plan.py --remote https://crm.radar36.com
"""

import argparse
import base64
import getpass
import hashlib
import json
import secrets
import sys
import uuid
import webbrowser
import urllib.request
import urllib.parse
import urllib.error
from http.server import HTTPServer, BaseHTTPRequestHandler

LOOPBACK_PORT = 1455
REDIRECT_URI = f"http://127.0.0.1:{LOOPBACK_PORT}/auth/callback"
AUTH_ENDPOINT = "https://auth.openai.com/api/accounts/authorize"
TOKEN_ENDPOINT = "https://auth.openai.com/api/accounts/oauth/token"
RESOURCE_URI = "https://api.openai.com/v1"


def http_post(url, headers=None, json_data=None, form_data=None, timeout=25):
    """Zero-dependency HTTP POST using Python standard library."""
    req_headers = headers.copy() if headers else {}
    data_bytes = None
    if json_data is not None:
        req_headers["Content-Type"] = "application/json"
        data_bytes = json.dumps(json_data).encode("utf-8")
    elif form_data is not None:
        req_headers["Content-Type"] = "application/x-www-form-urlencoded"
        data_bytes = urllib.parse.urlencode(form_data).encode("utf-8")

    req = urllib.request.Request(url, data=data_bytes, headers=req_headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as response:
            status_code = response.getcode()
            body = response.read().decode("utf-8")
            return status_code, body
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8") if e.fp else ""
        return e.code, body


def main():
    parser = argparse.ArgumentParser(description="Link your personal ChatGPT plan to your CRM user account.")
    parser.add_argument(
        "--remote",
        type=str,
        default="https://crm.radar36.com",
        help="Base URL of your CRM production or local server (default: https://crm.radar36.com)",
    )
    args = parser.parse_args()
    remote_url = args.remote.rstrip("/")

    print("\n========================================================")
    print("   Radar 36 — ChatGPT Plan CLI Authenticator")
    print("========================================================\n")
    print(f"Connecting to CRM: {remote_url}\n")

    # 1. Prompt for CRM Email and Password
    crm_email = input("Enter CRM Email: ").strip()
    if not crm_email:
        print("Error: Email cannot be empty.")
        sys.exit(1)

    crm_password = getpass.getpass("Enter CRM Password: ").strip()
    if not crm_password:
        print("Error: Password cannot be empty.")
        sys.exit(1)

    print("Authenticating with CRM server...")
    try:
        status, body = http_post(
            f"{remote_url}/api/v1/auth/login/",
            json_data={"email": crm_email, "password": crm_password},
            timeout=15,
        )
    except Exception as e:
        print(f"Error reaching {remote_url}: {e}")
        sys.exit(1)

    if status != 200:
        print(f"CRM login failed ({status}): {body}")
        sys.exit(1)

    try:
        crm_tokens = json.loads(body)
    except Exception:
        print(f"Invalid JSON from CRM login: {body}")
        sys.exit(1)

    crm_jwt = crm_tokens.get("access") or crm_tokens.get("token")
    if not crm_jwt:
        print("Could not retrieve access token from CRM response.")
        sys.exit(1)

    user_name = crm_tokens.get("user", {}).get("first_name", "") or crm_email
    print(f"✅ Logged in as CRM User: {user_name} ({crm_email})\n")

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
    auth_url = f"{AUTH_ENDPOINT}?{urllib.parse.urlencode(oauth_params)}"

    # 3. Start Loopback Server to catch callback
    auth_code_holder = {}

    class CallbackHandler(BaseHTTPRequestHandler):
        def log_message(self, format, *args):
            return  # Suppress normal HTTP logging

        def do_GET(self):
            parsed = urllib.parse.urlparse(self.path)
            if parsed.path != "/auth/callback":
                self.send_response(404)
                self.end_headers()
                return

            params = urllib.parse.parse_qs(parsed.query)
            returned_state = params.get("state", [None])[0]
            returned_code = params.get("code", [None])[0]
            returned_error = params.get("error", [None])[0]

            if returned_error:
                auth_code_holder["error"] = returned_error
                self.send_response(200)
                self.send_header("Content-Type", "text/html")
                self.end_headers()
                self.wfile.write(b"<h1>Authentication Denied</h1><p>You can close this tab and check your terminal.</p>")
                return

            if returned_state != state:
                auth_code_holder["error"] = "State parameter mismatch (CSRF warning)"
                self.send_response(400)
                self.end_headers()
                self.wfile.write(b"<h1>State Mismatch</h1>")
                return

            auth_code_holder["code"] = returned_code
            auth_code_holder["client_id"] = params.get("client_id", [None])[0]
            self.send_response(200)
            self.send_header("Content-Type", "text/html")
            self.end_headers()
            success_html = """
            <!DOCTYPE html>
            <html>
            <head>
              <title>Radar 36 &bull; Authentication Successful</title>
              <style>
                body {
                  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                  background: #090d16;
                  color: #f1f5f9;
                  display: flex;
                  align-items: center;
                  justify-content: center;
                  min-height: 100vh;
                  margin: 0;
                }
                .card {
                  background: #0f172a;
                  border: 1px solid #1e293b;
                  border-radius: 12px;
                  padding: 2.5rem;
                  max-width: 480px;
                  text-align: center;
                  box-shadow: 0 10px 30px rgba(0,0,0,0.5);
                }
                h1 { color: #10b981; font-size: 1.5rem; margin-top: 0; }
                p { color: #94a3b8; font-size: 0.95rem; line-height: 1.5; }
                .badge {
                  display: inline-block;
                  background: rgba(16, 185, 129, 0.15);
                  color: #10b981;
                  padding: 4px 12px;
                  border-radius: 999px;
                  font-size: 0.8rem;
                  font-weight: 600;
                  margin-bottom: 1rem;
                }
              </style>
            </head>
            <body>
              <div class="card">
                <div class="badge">&#10003; Connected to Radar 36</div>
                <h1>ChatGPT Plan Linked Successfully!</h1>
                <p>Your authorization tokens have been captured. You can close this browser tab and return to your terminal.</p>
              </div>
            </body>
            </html>
            """
            self.wfile.write(success_html.encode("utf-8"))

    try:
        server = HTTPServer(("127.0.0.1", LOOPBACK_PORT), CallbackHandler)
    except OSError as e:
        print(f"Error binding to port {LOOPBACK_PORT}: {e}")
        print("Make sure another process is not already using port 1455.")
        sys.exit(1)

    print("Opening browser for OpenAI ChatGPT Sign-In...")
    print(f"If browser does not open automatically, visit:\n{auth_url}\n")
    webbrowser.open(auth_url)

    print(f"Waiting for authentication callback on http://127.0.0.1:{LOOPBACK_PORT}...")
    while "code" not in auth_code_holder and "error" not in auth_code_holder:
        server.handle_request()

    server.server_close()

    if "error" in auth_code_holder:
        print(f"Authentication failed: {auth_code_holder['error']}")
        sys.exit(1)

    code = auth_code_holder["code"]
    issued_client_id = auth_code_holder.get("client_id") or "dynamic_agent_client"
    print(f"Captured Issued Client ID: {issued_client_id}")

    # 4. Exchange code with OpenAI
    print("Exchanging authorization code for OpenAI tokens...")
    token_payload = {
        "grant_type": "authorization_code",
        "client_id": issued_client_id,
        "code": code,
        "redirect_uri": REDIRECT_URI,
        "code_verifier": code_verifier,
        "resource": RESOURCE_URI,
    }

    try:
        status, token_body = http_post(TOKEN_ENDPOINT, form_data=token_payload, timeout=25)
    except Exception as e:
        print(f"Error contacting token endpoint: {e}")
        sys.exit(1)

    if status != 200:
        print(f"OpenAI token exchange rejected ({status}): {token_body}")
        sys.exit(1)

    try:
        tokens = json.loads(token_body)
    except Exception:
        print(f"Invalid response from OpenAI: {token_body}")
        sys.exit(1)

    scopes = tokens.get("scope", "").split() if isinstance(tokens.get("scope"), str) else tokens.get("scope", [])

    # 5. Sync tokens to CRM Server
    print(f"Syncing ChatGPT session to CRM user '{crm_email}'...")
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
        status, sync_body = http_post(
            f"{remote_url}/api/v1/ai/chatgpt/sync-tokens/",
            headers={"Authorization": f"Bearer {crm_jwt}"},
            json_data=sync_payload,
            timeout=15,
        )
    except Exception as e:
        print(f"Error syncing with CRM: {e}")
        sys.exit(1)

    if status == 200:
        print(f"\n🎉 SUCCESS! ChatGPT Plan is now linked to CRM user '{crm_email}' on {remote_url}.")
        print("All CRM AI features (AI Emails, Copilot, Account Intelligence) will now run using your ChatGPT subscription at $0 API cost!\n")
    else:
        print(f"Error syncing tokens ({status}): {sync_body}")
        sys.exit(1)


if __name__ == "__main__":
    main()
