# Sales AI CRM — Backend API & Services

A Django 5 REST API backend powering an autonomous Sales AI CRM with agentic tool-calling capabilities, Gmail OAuth2 thread syncing, local Whisper speech-to-text, and multi-provider LLM support.

---

## Table of Contents

- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [Django Apps](#django-apps)
- [AI Engine & Provider Abstraction](#ai-engine--provider-abstraction)
- [Agentic AI Framework](#agentic-ai-framework)
  - [Architecture Overview](#architecture-overview)
  - [Tool Registry & Auto-Discovery](#tool-registry--auto-discovery)
  - [Registered Tools](#registered-tools)
  - [Agent Orchestrator Loop](#agent-orchestrator-loop)
  - [Human-in-the-Loop Approvals](#human-in-the-loop-approvals)
- [LinkedIn & Gmail Integrations](#linkedin--gmail-integrations)
  - [Cookie-Based Authentication](#cookie-based-authentication)
  - [Browser Automation Stack](#browser-automation-stack)
  - [LinkedIn Tools](#linkedin-tools)
- [API Endpoints](#api-endpoints)
  - [Authentication](#authentication)
  - [CRM Resources](#crm-resources)
  - [AI Chat](#ai-chat)
  - [Agent Framework](#agent-framework)
- [Background Tasks (Celery)](#background-tasks-celery)
- [Database Schema](#database-schema)
- [Testing](#testing)
- [Deployment](#deployment)

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Framework** | Django 5.1 + Django REST Framework 3.15 |
| **Database** | PostgreSQL 16 (via `psycopg3`) |
| **Task Queue** | Celery 5.4 + Redis |
| **AI Providers** | Anthropic Claude SDK, OpenAI SDK |
| **Browser Automation** | Playwright (Chromium, headless) |
| **Auth** | JWT via `djangorestframework-simplejwt` |
| **Integrations** | Google Gmail API (OAuth2) |
| **Web Scraping** | `httpx` + `beautifulsoup4` + `lxml` |
| **Encryption** | `cryptography` (Fernet symmetric encryption) |
| **WebSockets / ASGI** | Daphne 4.2 + Django Channels 4.3 |
| **Speech Recognition** | `faster-whisper-server` (local CPU-optimized Docker container) |
| **API Docs** | `drf-spectacular` (OpenAPI 3.0) |
| **Containerization** | Docker + Docker Compose |

---

## Project Structure

```
backend/
├── apps/
│   ├── accounts/         # User auth, JWT, team management, SMTP settings
│   ├── activities/       # Activity timeline logging
│   ├── agent/            # ★ Agentic AI Framework (tool calling, orchestrator, browser)
│   │   ├── browser/      # Playwright browser providers (base, playwright, linkedin)
│   │   ├── prompts/      # System prompts for ICP scoring & research
│   │   ├── services/     # AgentOrchestrator, AgentContext, ToolRouter
│   │   ├── tools/        # All registered tools
│   │   │   ├── crm/      # CRM context, search, timeline, tasks, notes
│   │   │   ├── research/  # Website crawler, LinkedIn research, news
│   │   │   ├── analysis/  # ICP scorer, sales strategy generator
│   │   │   └── outreach/  # LinkedIn connection, messaging, outreach
│   │   ├── models.py     # ResearchRun, ToolExecution, PendingApproval, UserLinkedInConfig
│   │   ├── serializers.py
│   │   ├── views.py
│   │   ├── tasks.py      # Celery background tasks
│   │   └── urls.py
│   ├── emails/           # Dual-Mailbox strategy (Primary/Secondary), SmtpProvider, thread sync & outreach
│   ├── sequences/        # Multi-step AI sales sequence engine & Celery Beat step evaluation
│   ├── integrations/     # Google OAuth2 integration and token exchange
│   ├── ai_engine/        # LLM provider abstraction, copilot service, context builder, usage cost tracking
│   ├── common/           # Shared models, enums, encryption utilities
│   ├── companies/        # Company CRUD, ICP scoring fields
│   ├── contacts/         # Contact CRUD, company size sorting, LinkedIn URLs
│   ├── deals/            # Deal pipeline management
│   ├── notes/            # Entity-scoped notes
│   ├── conversation_intelligence/ # Standalone speech & transcription pipeline
│   │   ├── models/       # Conversation, Session, Transcript schemas
│   │   ├── providers/    # Speech Engine providers (WhisperDockerProvider)
│   │   ├── serializers/  # Conversation serializers
│   │   ├── services/     # Conversation business service layer
│   │   ├── tasks/        # Post-call AI analysis Celery jobs
│   │   └── websocket/    # ASGI consumer and JWT middleware
│   ├── tasks/            # CRM task management & email reminders
│   ├── imports/          # CSV import engine
│   ├── dashboard/        # Analytics & metrics
│   ├── reports/          # Reporting views
│   └── search/           # Global multi-entity search
├── config/
│   ├── settings/         # base.py, local.py, production.py
│   ├── urls.py           # Root URL configuration
│   ├── celery.py         # Celery app configuration
│   └── wsgi.py
├── requirements/
│   ├── base.txt          # Production dependencies
│   └── dev.txt           # Development dependencies (includes playwright)
├── manage.py
├── Dockerfile
└── .env.example
```

---

## Getting Started

### Prerequisites

- Docker & Docker Compose
- Python 3.13+ (if running outside Docker)
- PostgreSQL 16+
- Redis 7+

### Quick Start (Docker)

```bash
# Clone the repository
cd "sales crm"

# Copy environment configuration
cp backend/.env.example backend/.env
# Edit backend/.env with your API keys

# Start all services
docker compose up --build

# Run migrations
docker compose exec backend python manage.py migrate

# Create superuser
docker compose exec backend python manage.py createsuperuser

# Install Playwright browsers (required for LinkedIn automation)
docker compose exec backend playwright install chromium
```

The API will be available at `http://localhost:8000/api/v1/`.

---

## Environment Variables

| Variable | Description | Default |
|---|---|---|
| `DJANGO_SECRET_KEY` | Django secret key for cryptographic signing | *required* |
| `DJANGO_DEBUG` | Enable debug mode | `True` |
| `DJANGO_ALLOWED_HOSTS` | Comma-separated allowed hostnames | `localhost,127.0.0.1` |
| `DB_NAME` | PostgreSQL database name | `radar36_crm` |
| `DB_USER` | PostgreSQL username | `postgres` |
| `DB_PASSWORD` | PostgreSQL password | `postgres` |
| `DB_HOST` | PostgreSQL hostname | `localhost` |
| `DB_PORT` | PostgreSQL port | `5432` |
| `CELERY_BROKER_URL` | Redis URL for Celery broker | `redis://localhost:6379/0` |
| `REDIS_URL` | Redis URL for caching | `redis://localhost:6379/1` |
| `ANTHROPIC_API_KEY` | Anthropic Claude API key | *required for Claude* |
| `ANTHROPIC_BASE_URL` | Custom Anthropic endpoint (e.g. Azure AI Foundry) | *optional* |
| `ANTHROPIC_MODEL` | Override Claude model name | *optional* |
| `OPENAI_API_KEY` | OpenAI API key | *required for OpenAI* |
| `AI_DEFAULT_PROVIDER` | Default LLM provider (`claude` or `openai`) | `claude` |
| `AI_CLAUDE_MODEL` | Default Claude model | `claude-3-5-sonnet-20241022` |
| `AI_OPENAI_MODEL` | Default OpenAI model | `gpt-4o` |
| `CORS_ALLOWED_ORIGINS` | Comma-separated CORS origins | `http://localhost:4200` |

---

## Django Apps

| `emails` | **Dual-Mailbox Strategy** (Primary/Secondary Outbound), SmtpProvider, thread sync, direct outreach & tracking |
| `sequences` | **Multi-step AI Sales Sequence Engine** — campaign rules, wait delay checking, step dispatchers |
| `accounts` | User registration, JWT authentication, team invite/management, SMTP settings |
| `activities` | Polymorphic activity timeline (auto-logged on entity changes) |
| `agent` | **Agentic AI Framework** — tool registry, orchestrator, browser automation, LinkedIn |
| `ai_engine` | LLM provider abstraction, copilot chat service, CRM context builder, usage purpose analytics |
| `common` | Shared base models (`TimeStampedModel`), enums, Fernet encryption utilities |
| `companies` | Company CRUD, ICP score/explanation fields, industry tagging |
| `contacts` | Contact CRUD, LinkedIn URL field, company association |
| `deals` | Deal pipeline, stages, value tracking, contact linking |
| `notes` | Rich markdown notes pinned to companies/contacts/deals |
| `tasks` | CRM task management with priority, status, type, and due dates |
| `imports` | CSV upload & import engine with header mapping and Celery processing |
| `dashboard` | Analytics endpoints (pipeline value, conversion rates, stage distribution) |
| `search` | Global multi-entity full-text search across companies, contacts, deals |

---

## AI Engine & Provider Abstraction

The `ai_engine` app implements a **Provider Abstraction Pattern** via `BaseLLMProvider`:

```
BaseLLMProvider (Interface)
├── ClaudeProvider     → Anthropic SDK (supports Azure AI Foundry endpoints)
└── OpenAIProvider     → OpenAI SDK (supports Azure OpenAI endpoints)
```

### Key Capabilities

| Method | Purpose |
|---|---|
| `chat(messages, system_prompt)` | Standard conversational completion |
| `chat_with_tools(messages, system_prompt, tools)` | **Native tool/function calling** — returns `tool_use` blocks |
| `generate_structured_response(prompt, schema)` | JSON-schema constrained generation |

### Custom AI Configuration

Users can configure their own AI provider and API keys through the Settings UI:
- **Cloud API**: Direct connection using provider's official API (OpenAI or Claude).
- **Custom Endpoint**: Bring-your-own endpoint (Azure AI Foundry, proxy servers, etc.).
- API keys are encrypted at rest using Fernet symmetric encryption before being stored in PostgreSQL.
- Per-user configurations override system defaults. If no user config exists, the system falls back to environment variables.

---

## Agentic AI Framework

### Architecture Overview

The `apps.agent` module transforms the AI from a simple chatbot into an **autonomous Sales Copilot** capable of researching, reasoning, and performing user-approved actions.

```
User Chat Message
       │
       ▼
┌─────────────────────┐
│  AgentOrchestrator   │ ← Agentic loop (max 10 iterations)
│  (orchestrator.py)   │
└────────┬────────────┘
         │
    ┌────▼────┐          ┌──────────────────┐
    │ LLM API │ ───────► │ Tool Call Request │
    │ (Claude │          │ (name + args)    │
    │ /OpenAI)│          └────────┬─────────┘
    └─────────┘                  │
                          ┌──────▼──────┐
                          │ ToolRouter   │ ← Validates, dispatches, logs
                          │ (router.py)  │
                          └──────┬──────┘
                                 │
                    ┌────────────▼────────────┐
                    │    BaseTool.execute()    │
                    │  (17 registered tools)   │
                    └────────────┬────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │   ToolExecution (DB)     │ ← Audit log
                    │   PendingApproval (DB)   │ ← For gated actions
                    └─────────────────────────┘
```

### Tool Registry & Auto-Discovery

Tools are registered via a `@register_tool` decorator that auto-discovers and compiles schemas at Django startup:

```python
from apps.agent.tools.base import BaseTool, ToolParameter, ToolResult
from apps.agent.tools.registry import register_tool

@register_tool
class MyCustomTool(BaseTool):
    name = "my_tool"
    description = "What this tool does — the LLM reads this to decide when to call it."
    parameters = [
        ToolParameter(name="query", type="string", description="Search query", required=True),
    ]

    def execute(self, context, query: str, **kwargs) -> ToolResult:
        # Your logic here
        return ToolResult(success=True, data={"result": "..."}, summary="Done.")
```

The registry is a singleton (`ToolRegistry`) that:
- Auto-imports all tool modules at app startup via `AgentConfig.ready()`.
- Compiles OpenAI-compatible function schemas for the LLM provider.
- Exposes `GET /api/v1/agent/tools/` to list all available tools.

### Registered Tools

#### CRM Context Tools

| Tool | Description |
|---|---|
| `retrieve_company_context` | Fetches complete company profile, contacts, deals, notes, and activity timeline |
| `retrieve_contact_context` | Fetches contact details, associated company, notes, and activities |
| `retrieve_deal_context` | Fetches deal info, linked contacts, stage, and value |
| `search_crm` | Global full-text search across companies, contacts, and deals |
| `retrieve_activity_timeline` | Queries recent activity events for any entity |
| `manage_tasks` | List, create, and update CRM tasks |
| `manage_notes` | List, create, and pin notes to entities |

> **Robust Entity Resolution**: All CRM tools use a 3-tier lookup strategy:
> 1. Check the active conversation context (`AgentContext`)
> 2. Parse the argument as a UUID
> 3. Fallback to fuzzy name search (`icontains`)
>
> This means the LLM can pass either a UUID string or a company/contact name, and the tool will resolve it correctly.

#### Research Tools

| Tool | Description |
|---|---|
| `crawl_website` | Crawls up to 5 pages from a domain, extracts text with BeautifulSoup, detects tech stack and pain points |
| `research_company_linkedin` | Scrapes LinkedIn company page for description, specialties, employee count, and recent posts |
| `research_person_linkedin` | Scrapes LinkedIn person profile for title, experience, decision-making role, and recent activity |
| `research_news` | Searches web for recent press releases and funding announcements |

#### Analysis Tools

| Tool | Description |
|---|---|
| `score_company_icp` | Evaluates company against Ideal Customer Profile criteria, outputs 0-100 score with reasoning |
| `generate_sales_strategy` | Produces a comprehensive outbound strategy including objection handling, demo focus, email/LinkedIn copy, and follow-up cadence |

#### Outreach Tools (Gated — Require Approval)

| Tool | Description | Approval Required |
|---|---|---|
| `generate_linkedin_connection_request` | Drafts a personalized 300-char LinkedIn connection note | ✅ Yes |
| `generate_linkedin_message` | Drafts a direct message pitch for a prospect | ✅ Yes |
| `check_connection_status` | Checks the LinkedIn connection degree for a profile URL | ❌ No |
| `summarize_recent_posts` | Scrapes and summarizes a prospect's recent LinkedIn posts | ❌ No |
| `prepare_outreach_strategy` | Compiles a multi-channel outreach playbook | ❌ No |

### Agent Orchestrator Loop

The `AgentOrchestrator` implements a polling-based agentic loop:

1. **User sends a chat message** → saved as `AIMessage(role="user")`.
2. **Build context** → `AgentContext` packages the active entity (company/contact/deal), user info, and conversation history.
3. **Call LLM with tools** → sends message history + all 17 tool schemas via `chat_with_tools()`.
4. **Process response**:
   - If the LLM returns a **text response** → save as `AIMessage(role="assistant")`, loop ends.
   - If the LLM returns **tool calls** → route each through `ToolRouter`, execute, and append results.
5. **Re-call LLM** with tool results → repeat from step 4.
6. **Safety limits**:
   - Maximum **10 iterations** per message to prevent runaway loops.
   - **Duplicate call detection** — if the same tool + same arguments are called twice consecutively, the loop breaks.

### Human-in-the-Loop Approvals

Outreach actions (LinkedIn messages, connection requests) don't execute immediately. Instead:

1. The tool creates a `PendingApproval` record with `status=PENDING`.
2. The tool returns `ToolResult(requires_approval=True, data={"pending_approval_id": ...})`.
3. The LLM receives this and informs the user: *"I've drafted a connection request. Please review and approve it."*
4. The user reviews the draft via `GET /api/v1/agent/approvals/` and approves via `POST /api/v1/agent/approvals/<id>/approve/`.
5. Upon approval, a **Celery task** executes the action using Playwright browser automation.

---

## LinkedIn Integration

### Cookie-Based Authentication

LinkedIn automation uses **session cookie injection** instead of API keys or browser profile paths. This approach is server-deployment-friendly:

1. The user exports their LinkedIn cookies from a browser (using extensions like *EditThisCookie*).
2. The cookies (JSON array) are pasted into the **Settings → LinkedIn Integration** panel in the CRM UI.
3. The backend encrypts the cookies using **Fernet symmetric encryption** and stores them in the `UserLinkedInConfig` model.
4. When a LinkedIn tool executes, Playwright launches a headless Chromium instance, decrypts the cookies, and injects them into the browser context.

**Key cookies required:**
- `li_at` — LinkedIn authentication token
- `JSESSIONID` — Session identifier

### Browser Automation Stack

```
LinkedInBrowserProvider (linkedin.py)
    └── PlaywrightProvider (playwright_provider.py)
            └── BaseBrowserProvider (base.py)     ← Abstract interface
```

| Layer | Responsibility |
|---|---|
| `BaseBrowserProvider` | Abstract interface defining `navigate()`, `get_page_content()`, `click()`, `type_text()`, `close()` |
| `PlaywrightProvider` | Manages Chromium lifecycle, cookie injection, headless/headed modes, page timeouts |
| `LinkedInBrowserProvider` | High-level LinkedIn actions: `get_profile()`, `get_company_page()`, `send_message()`, `send_connection_request()`, `get_recent_posts()`, `check_connection_degree()` |

### LinkedIn Tools

| Tool | What It Does | Uses Browser |
|---|---|---|
| `research_company_linkedin` | Scrapes company page for description, specialties, posts | ✅ |
| `research_person_linkedin` | Scrapes person profile for title, experience, skills | ✅ |
| `check_connection_status` | Reads connection degree badge from a profile | ✅ |
| `summarize_recent_posts` | Fetches and summarizes recent LinkedIn posts | ✅ |
| `generate_linkedin_connection_request` | Drafts connection note (LLM-generated, gated) | ❌ (LLM only) |
| `generate_linkedin_message` | Drafts direct message (LLM-generated, gated) | ❌ (LLM only) |

> **Graceful Degradation**: If LinkedIn cookies are not configured, browser tools return simulated/fallback data with a warning instead of crashing.

---

## API Endpoints

All endpoints are prefixed with `/api/v1/` and require JWT authentication unless noted.

### Authentication

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/auth/register/` | Register a new user |
| `POST` | `/auth/login/` | Obtain JWT access + refresh tokens |
| `POST` | `/auth/refresh/` | Refresh JWT access token |
| `GET` | `/auth/me/` | Get current user profile |
| `PUT` | `/auth/me/` | Update profile |
| `POST` | `/auth/change-password/` | Change password |
| `GET` | `/auth/team/` | List team members |
| `POST` | `/auth/team/invite/` | Invite a new team member |

### CRM Resources

| Method | Endpoint | Description |
|---|---|---|
| `GET/POST` | `/companies/` | List/create companies |
| `GET/PUT/DELETE` | `/companies/<id>/` | Company detail CRUD |
| `GET/POST` | `/contacts/` | List/create contacts |
| `GET/PUT/DELETE` | `/contacts/<id>/` | Contact detail CRUD |
| `GET/POST` | `/deals/` | List/create deals |
| `GET/PUT/DELETE` | `/deals/<id>/` | Deal detail CRUD |
| `GET/POST` | `/notes/` | List/create notes |
| `GET/POST` | `/tasks/` | List/create tasks |
| `GET` | `/activities/` | Activity timeline |
| `POST` | `/imports/upload/` | Upload CSV for import |
| `GET` | `/search/?q=<query>` | Global entity search |
| `GET` | `/dashboard/stats/` | Dashboard analytics |

### AI Chat

| Method | Endpoint | Description |
|---|---|---|
| `GET/POST` | `/ai/conversations/` | List/create AI chat conversations |
| `GET/DELETE` | `/ai/conversations/<id>/` | Get/delete conversation |
| `GET/POST` | `/ai/conversations/<id>/messages/` | List/send messages (triggers agent loop) |
| `GET/PUT/DELETE` | `/ai/config/` | Manage user AI provider configuration |

### Agent Framework

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/agent/tools/` | List all registered tools with schemas |
| `POST` | `/agent/tools/<name>/execute/` | Manually execute a tool |
| `GET` | `/agent/research/<company_id>/` | Get research insights for a company |
| `POST` | `/agent/research/<company_id>/refresh/` | Trigger background research refresh |
| `GET` | `/agent/approvals/` | List pending approval items |
| `POST` | `/agent/approvals/<id>/approve/` | Approve a pending outreach action |
| `POST` | `/agent/approvals/<id>/reject/` | Reject a pending outreach action |
| `GET` | `/agent/executions/` | View tool execution audit log |
| `GET` | `/agent/llm-stats/` | Retrieve aggregated token usage and LLM costs |
| `GET/PUT/DELETE` | `/agent/linkedin-config/` | Manage LinkedIn cookie configuration |

---

## Background Tasks (Celery)

| Task | Module | Description |
|---|---|---|
| `run_company_research_pipeline` | `agent.tasks` | Full company research: website crawl → LinkedIn scrape → news search |
| `run_icp_scoring` | `agent.tasks` | Run ICP scoring via LLM analysis on gathered research |
| `run_sales_strategy_generation` | `agent.tasks` | Generate comprehensive sales strategy document |
| `execute_approved_outreach` | `agent.tasks` | Execute approved LinkedIn actions (messages, connections) via Playwright |
| `process_import_file` | `imports.tasks` | Process uploaded CSV files and create CRM records |

---

## Database Schema

### Agent Framework Models

| Model | Purpose |
|---|---|
| `ResearchRun` | Tracks a research pipeline execution per company (status, timestamps) |
| `ResearchSource` | Individual data source within a run (website, LinkedIn, news) |
| `ResearchInsight` | Extracted insights categorized by type (tech stack, pain points, growth signals) |
| `ResearchSummary` | Executive summary + sales strategy JSON blob |
| `ResearchArtifact` | Binary artifacts (screenshots, exported PDFs) |
| `ToolExecution` | Audit log of every tool invocation (tool name, parameters, status, duration, result) |
| `PendingApproval` | Queue of outreach actions awaiting user approval (action payload, drafted content) |
| `UserLinkedInConfig` | Per-user encrypted LinkedIn session cookies + profile URL |
| `LLMCallLog` | Log of every LLM provider call (model, tokens, cost, purpose) |

### Security

- **API Keys**: Encrypted at rest using Fernet symmetric encryption (`apps.common.encryption`).
- **LinkedIn Cookies**: Encrypted the same way. Never returned in plaintext to the frontend.
- **Audit Trail**: Every tool execution is logged with timestamp, duration, user, parameters, and status.

---

## Testing

```bash
# Run all agent framework tests
docker compose exec backend python manage.py test apps.agent

# Run all tests
docker compose exec backend python manage.py test

# Run with verbose output
docker compose exec backend python manage.py test apps.agent -v 2
```

### Test Coverage

| Test | What It Verifies |
|---|---|
| `test_tool_registry_registration` | All 17 tools are auto-discovered and schema compilation succeeds |
| `test_tool_router_logging` | Tool executions are routed and logged to `ToolExecution` model |
| `test_pending_approval_generation` | Outreach tools create `PendingApproval` records with correct status |
| `test_user_linkedin_config_encryption` | Cookies are encrypted at rest and decrypt correctly |
| `test_agent_orchestrator_loop` | The orchestrator processes a message through the agentic loop end-to-end |

---

## Deployment

### Docker Compose (Development)

```bash
docker compose up --build
```

Services:
- `backend` — Django dev server on port `8000`
- `frontend` — Angular dev server on port `4200`
- `db` — PostgreSQL 16
- `redis` — Redis 7
- `celery_worker` — Celery worker for background tasks
- `celery_beat` — Celery Beat for scheduled tasks

### Production Considerations

1. **Set `DJANGO_DEBUG=False`** and configure a proper `DJANGO_SECRET_KEY`.
2. **Use `gunicorn`** as the WSGI server (already in requirements).
3. **Install Playwright** in the production Docker image:
   ```dockerfile
   RUN pip install playwright && playwright install chromium --with-deps
   ```
4. **LinkedIn cookies** must be configured per-user through the Settings UI — no server-level browser profiles are needed.
5. **Scale Celery workers** independently for research-heavy workloads.
6. Configure **`CORS_ALLOWED_ORIGINS`** to match your frontend domain.
