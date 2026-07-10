# Radar 36 Sales CRM — System Architecture

This document describes the high-level architecture, design patterns, and workflows implemented in the Radar 36 Sales CRM MVP.

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
    end

    %% Define Backend Subsystem Nodes
    subgraph Backend ["Django 5 REST Subsystem"]
        Router["Django API Routing"]
        AuthMiddleware["JWT Auth and Audit Middleware"]
        ViewSet["Django Rest Framework ViewSets"]
        Serializer["DRF Serializers"]
        ServiceLayer["Django App Service Layer"]
        DjangoModel["Django App Models"]
        Database["PostgreSQL DB"]
    end

    %% Define Background / Async Subsystem Nodes
    subgraph Async ["Celery Async Workstation"]
        Celery["Celery Task Broker"]
        ImportWorker["CSV Import Worker"]
        ScrapingWorker["AI Scraper Worker"]
        ICPWorker["ICP Scorer Worker"]
    end

    %% Define Intelligence / AI Subsystem Nodes
    subgraph AI ["AI Processing Engine"]
        CopilotService["AI Copilot Service"]
        ContextBuilder["CRM Context Builder"]
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
    Router -->|Request Context| AuthMiddleware
    AuthMiddleware -->|Authenticated API Request| ViewSet
    ViewSet -->|Validation and Parsing| Serializer
    Serializer -->|Execute Business Logic| ServiceLayer
    ServiceLayer -->|Queries and Mutations| DjangoModel
    DjangoModel -->|SQL| Database

    ServiceLayer -->|Enqueue Background Tasks| Celery
    Celery -->|Process CSV Records| ImportWorker
    Celery -->|Process Automated Research| ScrapingWorker
    Celery -->|Process Automated Scoring| ICPWorker
    
    ImportWorker -->|Update DB Records| Database
    ScrapingWorker -->|Scrape Web and Call AI| LLMProvider
    ICPWorker -->|Write ICP Score| Database

    ServiceLayer -->|Trigger Copilot Chat| CopilotService
    CopilotService -->|Context Ingestion| ContextBuilder
    ContextBuilder -->|Fetch Entity Graph| Database
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
* **Services** contain core transaction logic (e.g. `ImportService`, `CopilotService`, `CompanyService`).
* This enables backend code to be unit-tested without mock-request overhead and allows Celery tasks to call services directly.

### B. Provider Abstraction Pattern (AI Providers)
The AI Engine employs a dependency inversion interface `BaseLLMProvider`:
* Supports multiple LLM targets (`ClaudeProvider` and `OpenAIProvider`) through standard `generate_response()` and `generate_structured_response()` contracts.
* Default providers are configured dynamically via environment variables (`AI_DEFAULT_PROVIDER`).
* If a primary provider experiences rate limits, it falls back seamlessly to the secondary provider.

### C. Context Builder Pattern
AI prompts require context from related records. The `ContextBuilder` app-level service:
* Traverses the relational database graph.
* Merges a company's profile with its linked contacts, deals, notes, and activity timeline.
* Compiles this information into structured XML templates for the LLM without code redundancy across features.

### D. Signals-based Store Pattern (Angular 20)
State management uses lightweight **Signal-based state stores** (e.g. `CompanyStore`, `DealStore`) instead of heavy NgRx boilerplate:
* The store exposes read-only computed Signals (`computed(() => ...)`) to components.
* Under the hood, the store updates state in private writeable signals.
* Updates are reactive, fine-grained, and run without zone-change detection overhead.

### E. Functional Interceptors
* **`authInterceptor`**: Functional interceptor that automatically appends JWT tokens (`Authorization: Bearer <token>`) to outgoing API requests.
* **`errorInterceptor`**: Monitors response streams. On a `401 Unauthorized` response, it pauses pending queries, makes a background request to refresh the token, rotates storage, and retries the original request. On failure, it performs a clean logout redirect.

---

## 3. End-to-End Worfklows

### Workflow 1: AI-Powered Company Research & ICP Scoring
1. Sales representative uploads a CSV file containing domain names.
2. The `ImportService` uploads the file, matches headers, and schedules a Celery worker.
3. Once imported, `company.tasks.py` fires:
   * **Stage 1 (Web Scraping)**: Scrapes target website metadata and fetches news.
   * **Stage 2 (AI Enrichment)**: Passes information to `ClaudeProvider` to summarize business value, tech stack, and pain points.
   * **Stage 3 (ICP Scoring)**: Evaluates company parameters against Radar 36's Ideal Customer Profile guidelines, outputs a score between 0–100, writes explanations to the database, and flags high-match leads (ICP > 70) for immediate outreach.

### Workflow 2: Entity-Scoped AI Copilot Chat
1. User opens a Company detail page.
2. The Angular `ShellComponent` mounts `AIChatPanelComponent` with `[entityType]="'company'"` and `[entityId]="company.id"`.
3. The component queries the backend `/ai/conversations/` to retrieve history or create a new session.
4. User types: *"Write a follow-up email focusing on their security pain points."*
5. Backend views route the message to `CopilotService`.
6. The `ContextBuilder` pulls company details, CISO contact profiles, pending deals values, and previous notes.
7. The prompt is assembled and sent to Anthropic.
8. The response is returned to the user, rendered in Markdown format (`marked.js`), and saved to the database.
