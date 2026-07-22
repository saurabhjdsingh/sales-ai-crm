# Sales AI CRM — Angular 20 Frontend Single Page Application 🚀

A modern, high-performance Single Page Application built with **Angular 20**, **Angular Material**, **TypeScript**, **Signals State Management**, and custom **Vanilla CSS/SCSS**.

---

## ✨ Key Features & Component Modules

- 📬 **Dual-Mailbox Strategy & Integrations Panel (`app/features/integrations`)**:
  - Connect **Primary Mailbox** via Google OAuth2 for inbox syncing and thread ingestion.
  - Connect **Secondary Outbound Mailbox** via **Secondary Google OAuth2** or **Custom SMTP (SendGrid, Mailgun, AWS SES, Custom Domain)**.
  - Interactive SMTP configuration dialog (`SmtpConfigDialogComponent`) with real-time connection verification.

- ⚡ **AI Sales Sequences & Campaign Progress (`app/features/sequences`)**:
  - Multi-step sequence rule builder supporting delay steps, AI email generation steps, manual review checkpoints, and contact enrollments.
  - Contact sequence progress column rendering enrolled campaign statuses (`IN_PROGRESS`, `COMPLETED`, `REPLIED`).

- ✉️ **Direct Contact Outreach & Interactive AI Email Drafts (`app/features/contacts`)**:
  - 4-Column Contact layout: **Timeline**, **Tasks**, **Notes**, and **Email Threads**.
  - **Email Threads Column**: Glimpse previews, direction badges (`SENT` / `RECEIVED`), timestamps, and open/click/reply tracking indicators.
  - **View Full Conversation Dialog**: Responsive popup rendering complete thread message history with auto-hyperlinked URLs.
  - **Interactive AI Email Composer (`ContactEmailComposerComponent`)**: Generate tailored outreach from prompts, edit body/subject in real-time, select outbound mailbox, and force primary `reply_to`.

- 📊 **Settings & AI Purpose Usage Analytics (`app/features/settings`)**:
  - Full white-labeling configuration (organization name, tab title, square & rectangular logos with auto-fit).
  - AI Usage Purpose breakdown card tracking token consumption and dollar costs across **AI Email Generation**, **ICP Lead Scoring**, **Copilot Chat**, and **Call Intelligence**.

- 📞 **Softphone Widget & Real-time AI Assist Copilot (`app/features/telephony`)**:
  - Draggable floating softphone with twin WebSocket streams (microphone & remote WebRTC audio) to local Whisper container.
  - Live speech analysis displaying objection badges, buying signals, and suggested discovery questions.

---

## 🛠️ Tech Stack & Architecture

| Layer | Technology |
|---|---|
| **Framework** | Angular 20 (Standalone Components & Signals API) |
| **UI Components** | Angular Material (Dialogs, Form Fields, Buttons, Signals) |
| **Styling** | Vanilla CSS, SCSS, Light/Dark Theme CSS Variables |
| **State Management** | Lightweight Signal Stores (`computed`, `signal`) |
| **HTTP Interceptors** | `authInterceptor` (JWT bearer), `errorInterceptor` (Token Rotation) |

---

## 📂 Directory Architecture

```
frontend/src/app/
├── core/
│   ├── auth/            # Auth guards & token storage
│   ├── interceptors/    # JWT header & 401 refresh interceptors
│   ├── models/          # Core TypeScript models (crm.model.ts)
│   └── services/        # ApiService, NotificationService, BrandingService
├── features/
│   ├── auth/            # Login & public invite onboarding screens
│   ├── companies/       # Companies list with ICP sorting and creation
│   ├── contacts/        # Contacts view (4 columns, AI draft generator, thread popups)
│   │   └── contact-email-composer/ # Real-time AI email composer modal
│   ├── dashboard/       # Sales overview & pipeline metrics
│   ├── integrations/    # Primary/Secondary OAuth & Custom SMTP config dialog
│   ├── sequences/       # Automated AI sequence creator & enrollment tracking
│   ├── settings/        # Branding, Organization Settings, AI Persona & AI Usage Purpose
│   ├── tasks/           # Task board, pipeline statuses, workflows
│   └── telephony/       # Softphone Widget, twin WS streaming, AI Assist Copilot
└── shared/              # Navbar, Sidebar, Shared Table components, Timeline dialogs
```

---

## 🚀 Development & Commands

### Development Server
To start a local development server:
```bash
npm start
# or
ng serve
```
Navigate to `http://localhost:4200/`. The app reloads automatically on code changes.

### Production Build
To build the optimized production bundle:
```bash
npm run build
```
Build output will be stored in `dist/frontend/browser` and served via Nginx in Docker container production.

### Unit Tests
To run Angular unit tests:
```bash
npm test
```
