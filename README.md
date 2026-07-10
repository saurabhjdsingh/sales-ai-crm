# Sales AI CRM 🚀

A premium, fully white-labeled Sales CRM built with **Django REST Framework**, **Celery & Redis** task queue, **Angular (Material Design)**, and **PostgreSQL**, designed for automated sales prospecting and AI-powered lead scoring.

---

## ✨ Key Features

- 🏷️ **White-Labeled Branding**: Fully customize the CRM with your organization's name, custom browser tab title, favicon, and logo. Rectangular and square logos are automatically auto-fitted to prevent cropping.
- 📧 **Branded System Emails**: Beautifully formatted HTML emails for user invitations and reminders, featuring your custom company logo and name branding.
- ⚙️ **Custom SMTP Integration**: Configure custom SMTP details (e.g. AWS SES, SendGrid, Mailgun) directly from the settings panel on your organization's behalf. Passwords are encrypted on-disk using Django secret key wrappers.
- 🕒 **Inactivity Task Reminders**: Automated Celery task runner that detects upcoming tasks due in 1 hour and sends email reminders if the owner has been inactive for the last 6 hours.
- 📊 **AI Prospecting & ICP Scoring**: Intercept, score, and prioritize leads using customized LLM prompts (Claude 3.5 Sonnet / GPT-4o).
- 🧑‍🤝‍🧑 **Onboarding & Team Invites**: Invite new members via admin panels. Invitees receive secure, cryptographically signed email links to set passwords on a public onboarding screen.

---

## 🛠️ Technology Stack

- **Frontend**: Angular 20, TypeScript, Angular Material Components, Vanilla CSS & SCSS.
- **Backend**: Python 3.13, Django 5.x, Django REST Framework.
- **Task Scheduling**: Celery, Redis.
- **Database**: PostgreSQL 16.
- **Containerization**: Docker & Docker Compose.

---

## 🚀 Quick Start (Local Development)

Getting the entire platform running locally takes just two steps:

### 1. Configure the Environment
1. Copy the example `.env` file in the `backend` folder:
   ```bash
   cp backend/.env.example backend/.env
   ```
2. Open `backend/.env` and insert your API keys (e.g. Anthropic/OpenAI keys). By default, DB and Redis are preconfigured to connect seamlessly inside the Docker container network.

### 2. Run with Docker Compose
Start the CRM:
```bash
docker compose up -d --build
```
*This command automatically initializes the database, compiles all model migrations dynamically, starts the background Celery workers, and hosts the services.*

- **Frontend Application**: [http://localhost:4200](http://localhost:4200)
- **Backend API Docs**: [http://localhost:8000/api/v1/](http://localhost:8000/api/v1/)

---

## 🌎 Server Deployment

For deploying the CRM to an Ubuntu staging/production server, refer to our detailed [**Ubuntu Server Deployment Guide**](DEPLOYMENT.md) located at the root of this repository.

---

## 📂 Project Structure

```
├── backend/                  # Django REST API, models, and celery services
│   ├── apps/
│   │   ├── accounts/         # User profiles, team invitations, SMTP settings
│   │   ├── common/           # Branded email dispatch and encryption services
│   │   ├── companies/        # Company directory and auto-range normalization
│   │   ├── ai_engine/        # AI copilots, prompt engineering templates, and research
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
│   │   ├── settings/         # Organization settings, branding, and SMTP controls
│   │   ├── dashboard/        # Top prospects lists and lead activity metrics
│   │   └── tasks/            # Task board, pipeline statuses, and workflows
│   └── src/app/shared/       # Shared layouts, components, and global tables
├── docker-compose.yml        # Docker containers configuration stack
└── DEPLOYMENT.md             # Detailed production Ubuntu deployment manual
```
