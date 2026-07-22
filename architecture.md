# Sales AI CRM — System Architecture

This document describes the high-level architecture, design patterns, and workflows implemented in the Sales AI CRM.

---

## 1. High-Level Architecture Diagram

```mermaid
graph TD
    %% Define Frontend Subsystem Nodes
    subgraph Frontend ["Angular 20 Standalone Subsystem"]
        UI["Angular UI Components"]
        SignalStore["Signal State Stores"]
        AuthGuard["Route Guards"]
        ApiService["HTTP Client ApiService"]
        AuthInterceptor["Auth Interceptor: Add JWT Token"]
        ErrorInterceptor["Error Interceptor: Auto Refresh JWT"]
        CIService["ConversationIntelligenceService (Audio Chunking & Twin WS Streaming)"]
        PhoneWidget["PhoneWidgetComponent (Softphone & AI Assist Copilot Panel)"]
    end

    %% Define Backend Subsystem Nodes
    subgraph Backend ["Django 5 REST / ASGI Subsystem"]
        Router["Daphne ASGI Router (Daphne/get_asgi_application)"]
        AuthMiddleware["JWT Auth and Audit Middleware"]
        ViewSet["Django Rest Framework ViewSets"]
        Serializer["DRF Serializers"]
        ServiceLayer["Django App Service Layer"]
        DjangoModel["Django App Models"]
        Database["PostgreSQL DB"]
        WSConsumer["ConversationStreamConsumer (WebSocket Handler)"]
    end

    %% Define Background / Async Subsystem Nodes
    subgraph Async ["Celery Async Workstation"]
        Celery["Celery Task Broker"]
        ImportWorker["CSV Import Worker"]
        ScrapingWorker["AI Scraper Worker"]
        ICPWorker["ICP Scorer Worker"]
        AIAnalysisWorker["Post-Call AI Review Worker (CI Summary Generator)"]
        GmailSyncWorker["Gmail Thread Sync Worker"]
    end

    %% Define Telemetry / Local Whisper Subsystem Nodes
    subgraph LocalWhisper ["Local Whisper Transcription Service"]
        WhisperServer["Whisper Docker Container (faster-whisper-server)"]
    end

    %% Define External Integrations & APIs
    subgraph ExternalServices ["External Services & APIs"]
        GmailAPI["Google Gmail API (OAuth2)"]
        TwilioAPI["Twilio Voice API (TwiML / WebRTC)"]
    end

    %% Define Intelligence / AI Subsystem Nodes
    subgraph AI ["AI Processing Engine"]
        CopilotService["AI Copilot Service"]
        ContextBuilder["CRM Context Builder (Neutral Prompts & Org AI Persona)"]
        LLMProvider["BaseLLMProvider Interface"]
        ClaudeProvider["ClaudeProvider"]
        OpenAIProvider["OpenAIProvider"]
        AnthropicAPI["Anthropic Claude API"]
        OpenAIAPI["OpenAI API"]
    end

    %% Draw Connections
    UI -->|Read State| SignalStore
    UI -->|Actions| AuthGuard
    AuthGuard -->|Trigger API Calls| ApiService
    ApiService -->|Request| AuthInterceptor
    AuthInterceptor -->|Retry on 401| ErrorInterceptor

    ErrorInterceptor -->|HTTP JSON| Router
    Router -->|ASGI HTTP| ViewSet
    Router -->|ASGI WebSockets| WSConsumer
    
    WSConsumer -->|Asynchronous Audio Blocks| WhisperServer
    WhisperServer -->|Transcribed Text Segment| WSConsumer
    WSConsumer -->|Save Segment| DjangoModel

    ViewSet -->|Validation and Parsing| Serializer
    Serializer -->|Execute Business Logic| ServiceLayer
    ServiceLayer -->|Queries and Mutations| DjangoModel
    DjangoModel -->|SQL| Database

    ServiceLayer -->|Enqueue Background Tasks| Celery
    Celery -->|Process CSV Records| ImportWorker
    Celery -->|Process Automated Research| ScrapingWorker
    Celery -->|Process Automated Scoring| ICPWorker
    Celery -->|Process Post-Call Summaries| AIAnalysisWorker
    Celery -->|Sync Email Threads| GmailSyncWorker
    
    ImportWorker -->|Update DB Records| Database
    ScrapingWorker -->|Scrape Web and Call AI| LLMProvider
    ICPWorker -->|Write ICP Score| Database
    AIAnalysisWorker -->|Load Prompt & Generate Summary| LLMProvider
    AIAnalysisWorker -->|Write Call Outcomes| DjangoModel
    GmailSyncWorker -->|Fetch Threads via OAuth Tokens| GmailAPI
    GmailSyncWorker -->|Persist Email Messages| DjangoModel

    UI -->|Active Audio Streams| CIService
    CIService -->|WebSockets (JWT query auth)| Router
    PhoneWidget -->|Control Softphone & Copilot| CIService
    
    ServiceLayer -->|Trigger Copilot Chat| CopilotService
    CopilotService -->|Context Ingestion| ContextBuilder
    ContextBuilder -->|Fetch Entity Graph & Org Persona| Database
    ContextBuilder -->|Construct Payload| LLMProvider
    LLMProvider -->|Anthropic SDK| ClaudeProvider
    LLMProvider -->|OpenAI SDK| OpenAIProvider
    
    ClaudeProvider -->|API Call| AnthropicAPI
    OpenAIProvider -->|API Call| OpenAIAPI
```

---

## 2. Key Architecture Design Patterns

### A. Django Service Layer Pattern
Unlike standard Django where business logic is placed directly in ViewSets or models, this CRM decouples concerns using a dedicated **Service Layer** (`services.py` in each app):
* **ViewSets** act strictly as controllers, handling HTTP status codes, request routing, and pagination.
* **Serializers** handle structure parsing, data validation, and input sanitization.
* **Services** contain core transaction logic (e.g. `ImportService`, `CopilotService`, `ConversationService`, `GmailSyncService`).
* This enables backend code to be unit-tested without mock-request overhead and allows Celery tasks to call services directly.

### B. Provider Abstraction Pattern (AI & Speech)
We decouple backend engines from third-party integrations using the dependency inversion pattern:
1.  **AI Engine (`BaseLLMProvider`)**: Supports dynamic swapping between Anthropic Claude and OpenAI models.
2.  **Speech Engine (`BaseSpeechProvider`)**: Decouples transcription logic. The current implementation defaults to a local Whisper Docker container (`WhisperDockerProvider`) but is interface-compatible for future providers like Deepgram, Groq, or OpenAI Whisper Cloud.

### C. Universal Context Builder & Neutral Prompt Templates
AI prompts require context from related records without hardcoded domain bias:
* The `ContextBuilder` traverses the relational database graph, merging profiles, deals, notes, and activity timelines.
* Prompt templates across `icp.py`, `copilot.py`, and `research.py` operate universally and inherit system prompts and AI persona guidelines configured dynamically in Organization Settings.

### D. Signals-based Store Pattern (Angular 20)
State management uses lightweight **Signal-based state stores** (e.g. `CompanyStore`, `DealStore`, `CallStateService`) instead of heavy NgRx boilerplate:
* The store exposes read-only computed Signals (`computed(() => ...)`) to components.
* Under the hood, the store updates state in private writeable signals.
* Updates are reactive, fine-grained, and run without zone-change detection overhead.

### E. Functional Interceptors
* **`authInterceptor`**: Functional interceptor that automatically appends JWT tokens (`Authorization: Bearer <token>`) to outgoing API requests.
* **`errorInterceptor`**: Monitors response streams. On a `401 Unauthorized` response, it pauses pending queries, makes a background request to refresh the token, rotates storage, and retries the original request. On failure, it performs a clean logout redirect.

### F. Provider-Independent Audio Streaming Layer
The CRM captures microphone and remote WebRTC audio streams independently directly in the browser:
*   Streams are kept isolated (Microphone -> Sales Rep, Remote -> Customer) to eliminate diarization models.
*   Independent `MediaRecorder` processes package chunks in 4-second intervals and streams them over twin WebSocket channels.
*   The sockets authenticate using JWT query parameters and feed the local Whisper container.
*   A failure state machine automatically reconnects connections with exponential backoff without affecting call quality.

### G. Dual-Mailbox Strategy & Provider Factory Architecture (`SmtpProvider` & `GmailProvider`)
The email subsystem decouples transport mechanisms using a `ProviderFactory` and `BaseEmailProvider` contract:
* **Primary Account**: Configured via Google OAuth2 for inbox syncing and thread ingestion. Prospect replies automatically route here.
* **Secondary Outbound Account**: Configured via Secondary Google OAuth2 or Custom SMTP (`SmtpProvider`) for sales sequences and direct contact outreach.
* **Deliverability Guard**: When sending emails, the `SendContactEmailView` and `SequenceEngineService` select the Secondary Outbound Mailbox credentials for transport while injecting `Reply-To: <primary_email>`. This ensures cold outreach deliverability issues never impact the primary email domain's sender reputation.

### H. Automated AI Sales Sequence Engine (`apps/sequences`)
* Multi-step sequence workflows manage contact outreach automation.
* Step types include `EMAIL` (automated email), `AI_GENERATED_EMAIL` (AI draft generation based on CRM context), `WAIT` (delay step), and `TASK` (manual review checkpoint).
* Celery Beat periodic workers execute `process_sequence_steps_task` every 5 minutes to evaluate enrolled contact progress and dispatch ready steps.

---

## 3. End-to-End Workflows

### Workflow 1: AI-Powered Company Research & ICP Scoring
1. Sales representative uploads a CSV file containing domain names.
2. The `ImportService` uploads the file, matches headers, and schedules a Celery worker.
3. Once imported, `company.tasks.py` fires:
   * **Stage 1 (Web Scraping)**: Scrapes target website metadata and fetches news.
   * **Stage 2 (AI Enrichment)**: Passes information to `ClaudeProvider` to summarize business value, tech stack, and pain points.
   * **Stage 3 (ICP Scoring)**: Evaluates company parameters against Organization's Ideal Customer Profile guidelines, outputs a score between 0–100, writes explanations to the database, and flags high-match leads (ICP > 70) for immediate outreach.

### Workflow 2: Entity-Scoped AI Copilot Chat
1. User opens a Company or Contact detail page.
2. The Angular `ShellComponent` mounts `AIChatPanelComponent` with `[entityType]="'company'"` and `[entityId]="company.id"`.
3. The component queries backend `/ai/conversations/` to retrieve history or create a new session.
4. User asks a question regarding CRM context or strategy.
5. Backend views route the message to `CopilotService`.
6. The `ContextBuilder` pulls company details, contact profiles, deal values, and notes.
7. The prompt is assembled with organization system prompts and sent to Anthropic/OpenAI.
8. The response is returned to the user, rendered in Markdown format (`marked.js`), and saved to PostgreSQL.

### Workflow 3: Real-time Audio Stream Capture and Post-Call Review
1. User starts a call in the dialer panel.
2. Once connected, browser capture binds to microphone and WebRTC remote streams, opening twin WebSocket connections to `/ws/conversation/stream/<uuid:conversation_id>/<speaker>/`.
3. Slices of 4-second audio chunks stream to the server. The consumer transcribes them using `WhisperDockerProvider` and broadcasts results to the Channels Group for real-time UI display.
4. The call ends, saving metadata and scheduling Celery task `generate_conversation_summary_task`.
5. The LLM processes the full structured transcript and extracts executive summaries, pain points, objections, buying signals, and recommended follow-up tasks.
6. User edits generated insights on the post-call review screen and clicks **Confirm & Log**.
7. The services layer creates CRM Timeline Activities, Notes, approved Tasks, and updates Deal stages in PostgreSQL.

### Workflow 4: Gmail OAuth2 Integration & Thread Syncing
1. User clicks **Connect Gmail** under Settings > Integrations.
2. Backend generates a Google OAuth2 authorization link and redirects the user.
3. Upon approval, Google redirects to `/api/v1/integrations/gmail/callback/`, exchanging authorization codes for access and refresh tokens stored securely on `IntegrationAccount`.
4. Celery periodic task `sync_gmail_emails_task` queries the Gmail API for recent threads, matches sender/recipient email addresses to CRM Contacts, and persists structured email messages to the Contact activity timeline.

### Workflow 5: Softphone Widget & AI Assist Copilot Panel
1. The floating softphone widget (`PhoneWidgetComponent`) renders on all pages with `cdkDrag` constrained to `cdkDragBoundary="body"`.
2. When expanded, an optional side-panel **AI Assist Copilot** renders alongside the softphone.
3. During active calls, speech analysis streams objection badges, buying signals, and suggested discovery questions in real-time.
4. Sales reps can switch between **Split View**, **Insights**, **Live Transcript**, and **AI Chat** tabs.
5. Bounded flex containers (`height: 540px; max-height: calc(100vh - 48px);`) provide smooth vertical scrolling and keep chat input controls accessible at all times.

### Workflow 6: Secondary Outbound Email Outreach & Deliverability Guard
1. User configures a **Secondary Outbound Mailbox** via Google OAuth2 or Custom SMTP in Settings > Integrations.
2. Sales rep composes a direct 1-to-1 email or triggers an AI draft from the Contact detail page.
3. Rep reviews the generated email and clicks **Send Email**.
4. `SendContactEmailView` authenticates transport via the Secondary Outbound Mailbox credentials and injects `Reply-To: <primary_email>`.
5. Email pixel and link click tracking tags are attached, and sent status is logged to the Contact's Email Threads column.
6. When the prospect replies, the response lands directly in the sales rep's primary Gmail inbox, automatically syncing back to the CRM timeline.

### Workflow 7: Multi-Step AI Sales Sequences
1. Sales rep creates a Sequence with multi-step rules (e.g. Step 1: AI Email -> Step 2: Wait 2 Days -> Step 3: Follow-up Email).
2. Rep enrolls target Contacts into the Sequence.
3. Celery Beat periodic task `process_sequence_steps_task` evaluates enrollments every 5 minutes:
   * **Delay Check**: Verifies wait duration has elapsed.
   * **AI Email Generation**: Invokes `ai_engine` to generate personalized outreach based on target contact context.
   * **Dispatch & Tracking**: Transports message via Secondary Outbound Mailbox, updates enrolled progress state (`IN_PROGRESS`, `COMPLETED`, `REPLIED`), and logs tracking activity.

