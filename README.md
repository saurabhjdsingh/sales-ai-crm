# Sales AI CRM 🚀

A premium, fully white-labeled Sales CRM built with **Django REST Framework**, **Celery & Redis** task queue, **Angular (Material Design)**, and **PostgreSQL**, designed for automated sales prospecting and AI-powered lead scoring.

Now integrated with a **Provider-Independent Conversation Intelligence Pipeline** for local, free speech-to-text transcription.

---

## ✨ Key Features

- 🏷️ **White-Labeled Branding**: Fully customize the CRM with your organization's name, custom browser tab title, favicon, and logo. Rectangular and square logos are automatically auto-fitted to prevent cropping.
- 📬 **Dual-Mailbox Strategy & Deliverability Guard**: Support for dual connected email accounts per user:
  - **Primary Mailbox**: Handles daily inbox sync and receives all prospect responses.
  - **Secondary Outbound Mailbox**: Dedicated sales outreach sender connected via **Secondary Google OAuth2** or **Custom SMTP (SendGrid, Mailgun, Amazon SES, Custom Domain)**.
  - Automatically forces `Reply-To: <primary_email>` on all outbound sequence steps and direct outreach to protect primary domain deliverability and inbox sender score.
- ⚡ **Automated AI Sales Sequences**: Create and enroll leads into multi-step automated outreach campaigns. Supports delay steps, AI email generation steps, manual review checkpoints, and real-time enrolled contact progress tracking.
- ✉️ **Direct Contact Outreach & Interactive AI Email Drafts**: Dedicated **Email Threads** column in Contact details with glimpse previews, direction badges (Sent/Received), and open/click/reply tracking metrics. Features an interactive AI email composer with real-time editing and quick thread reply popups.
- 📊 **Universal AI Prospecting, ICP Scoring & Usage Purpose Tracking**: Score and prioritize leads using customized LLM prompts (Claude 3.5 Sonnet / GPT-4o). Track AI token usage and dollar costs broken down by purpose (AI Email Generation, ICP Scoring, Copilot Chat) directly in Settings.
- ⚙️ **Custom SMTP & Integrations Panel**: Configure secondary outbound SMTP details directly from Integrations Settings. Encrypted on-disk using Django secret key wrappers.
- 🕒 **Inactivity Task Reminders**: Automated Celery task runner that detects upcoming tasks due in 1 hour and sends email reminders if the owner has been inactive for 6 hours.
- 🧑‍🤝‍🧑 **Onboarding & Team Invites**: Invite new members via admin panels. Invitees receive secure, cryptographically signed email links to set passwords on a public onboarding screen.
- 🎙️ **Independent Conversation Intelligence**: Browser audio stream capture (sales rep microphone and remote customer audio track) processed independently via dual WebSocket connections. Feeds a local Whisper container for 100% free transcription without relying on Twilio cloud recording.
- 🧠 **Interactive AI Assist Copilot & Post-Call Review**: Real-time floating softphone widget with an integrated side-panel Copilot. Features live speech objection detection, buying signal extraction, in-call discovery questions, entity-scoped AI Chat, and post-call review workflows that log outcomes straight to PostgreSQL.
- 📇 **Enhanced Contact & Lead Management**: Direct clickable company website links, employee size filtering/sorting across contact lists, and automatic target tab handling (`target="_blank"`) for all external activity links.

---

## 🛠️ Technology Stack

- **Frontend**: Angular 20, TypeScript, Angular Material Components, Vanilla CSS & SCSS.
- **Backend REST API**: Python 3.13, Django 5.x, Django REST Framework.
- **WebSockets / ASGI Server**: Daphne, Django Channels.
- **Task Scheduling**: Celery, Redis.
- **Database**: PostgreSQL 16.
- **Speech recognition**: local `faster-whisper-server` CPU-optimized Docker container (`large-v3`, `medium`, `small` models).
- **Containerization**: Docker & Docker Compose.

---

## 🚀 Quick Start (Local Development)

Getting the entire platform running locally takes just two steps:

### 1. Configure the Environment
1. Copy the example `.env` file in the `backend` folder:
   ```bash
   cp backend/.env.example backend/.env
   ```
2. Open `backend/.env` and insert your API keys (e.g. Anthropic/OpenAI keys).
3. To configure the local Whisper model size, modify `WHISPER_MODEL` in `backend/.env`:
   *   `WHISPER_MODEL=small` (Cost-efficient, fast CPU execution, fits in ~1GB RAM - default for testing).
   *   `WHISPER_MODEL=medium` (Balanced accuracy & speed).
   *   `WHISPER_MODEL=large-v3` (Highest accuracy, requires at least 8GB RAM or GPU).

By default, DB, Redis, and Whisper are preconfigured to connect seamlessly inside the Docker container network.

### 2. Run with Docker Compose
Start the CRM:
```bash
docker compose up -d --build
```
*This command automatically initializes the database, compiles all model migrations dynamically, starts the background Celery workers, pulls and caches the configured local Whisper model, and hosts the services.*

- **Frontend Application**: [http://localhost:4200](http://localhost:4200)
- **Backend API Docs**: [http://localhost:8000/api/v1/](http://localhost:8000/api/v1/)

---

## 📡 Exposing a Local Proxy Link for Twilio Integration

Twilio requires a public URL to send Webhook events to your local server when establishing softphone calls.

1.  Start a local proxy tunnel to expose your local Django server (port 8000) using **Pinggy** or **Ngrok**:
    *   **Pinggy (Free SSH tunnel, no setup or login needed)**:
        ```bash
        ssh -p 443 -R0:localhost:8000 qr@a.pinggy.io
        ```
    *   **Ngrok**:
        ```bash
        ngrok http 8000
        ```
2.  Pinggy will output a public secure URL (e.g. `https://xoual-203-145-56-1.free.pinggy.net`).
3.  Copy this public URL and register it as your TwiML App Voice webhook URL inside your Twilio Console:
    `https://<your-subdomain>.free.pinggy.net/api/v1/telephony/voice/`
4.  Update your `TWILIO_WEBHOOK_URL` in `backend/.env` with your tunnel address so signatures validate correctly.

---

## 🌎 Server Deployment

For deploying the CRM to an Ubuntu staging/production server, refer to our detailed [**Ubuntu Server Deployment Guide**](DEPLOYMENT.md) located at the root of this repository.

---

## 📂 Project Structure

```
├── backend/                  # Django REST API, ASGI, models, and Celery services
│   ├── apps/
│   │   ├── accounts/         # User profiles, team invitations, SMTP settings
│   │   ├── common/           # Branded email dispatch and encryption services
│   │   ├── companies/        # Company directory and auto-range normalization
│   │   ├── contacts/         # Contacts directory, company size sorting & detail context
│   │   ├── emails/           # Dual-Mailbox (Primary/Secondary), Custom SMTP provider, thread sync & outreach
│   │   ├── sequences/        # Multi-step AI sales sequence engine & Celery Beat dispatchers
│   │   ├── ai_engine/        # AI copilots, custom prompt templates, LLM pricing & usage purpose analytics
│   │   ├── telephony/        # Twilio call connection, softphone WebRTC & TwiML endpoints
│   │   ├── conversation_intelligence/ # Audio sockets, Whisper docker client, and AI summary
│   │   └── tasks/            # Task lists and email reminder jobs
│   └── config/               # Celery scheduler settings and main WSGI/ASGI entrypoints
├── frontend/                 # Angular single-page application
│   ├── src/app/core/         # Core application services & configuration
│   │   ├── auth/             # Auth guards & tokens management
│   │   ├── services/         # Branding, API, and notifications services
│   │   └── interceptors/     # JWT authentication header interceptors
│   ├── src/app/features/     # Dashboard and operational views
│   │   ├── auth/             # Login & public password-onboarding (accept-invite) screens
│   │   ├── companies/        # Companies list with ICP sorting and creation
│   │   ├── contacts/         # Contact list with 4 columns (Timeline, Tasks, Notes, Email Threads & AI Draft Generator)
│   │   ├── integrations/     # Primary/Secondary mailbox OAuth & Custom SMTP config panel
│   │   ├── settings/         # Organization settings, branding, SMTP, AI Persona & AI Usage purpose card
│   │   ├── sequences/        # Automated AI sequence creator, enrollment & enrolled progress column
│   │   ├── telephony/        # Softphone Widget, AI Assist Copilot, twin WS streaming & call history
│   │   ├── dashboard/        # Top prospects lists and lead activity metrics
│   │   └── tasks/            # Task board, pipeline statuses, and workflows
│   └── src/app/shared/       # Shared layouts, components, and global tables
├── docker-compose.yml        # Docker containers configuration stack
└── DEPLOYMENT.md             # Detailed production Ubuntu deployment manual
```
