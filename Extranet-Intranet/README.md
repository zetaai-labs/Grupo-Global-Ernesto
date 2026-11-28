# 🌐 Global Group Platform

### A Unified Digital Workspace | Intranet & Extranet

<p align="center">

**Connecting People · Managing Documents · Simplifying Collaboration**

![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![Vite](https://img.shields.io/badge/Vite-Build%20Tool-646CFF?logo=vite&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-22-339933?logo=node.js&logoColor=white)
![Express](https://img.shields.io/badge/Express-5-000000?logo=express&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logoColor=white)
![Tests](https://img.shields.io/badge/Tests-290%20passing-2ea44f)
![Status](https://img.shields.io/badge/Development-Complete%20·%20Pre--launch-2ea44f)

</p>

---

## 🎬 Project Demo

<p align="center">

**[▶ Watch Extranet-Intranet Platform Demo Video](https://drive.google.com/file/d/1YEFBk3q8lZ2R5NVyE6IYEkPo9z0X_h_1/view)**

</p>

> The video shows an early version. The platform described below is the current one.

---

## 📌 1. Project Overview

Global Group Platform is the corporate **Intranet and Extranet** of **Grupo Global Plataforma Bilateral**, built by **Zeta AI Labs Pvt. Ltd.**

It brings document management, communication, business operations (the ZYLAX suite), company onboarding, billing and governance into one secure workspace for the Spain · EU · India corridor and the other delegations (UAE, LATAM, USA/Canada, Morocco).

| 🏢 Intranet (staff) | 🌍 Extranet (external) |
|:---|:---|
| Super Admin, Tech Admin, HR, Finance, Managers, Employees | Partner companies, clients, suppliers, investors |
| Dataprius-style document management | Shared documents, submissions and links |
| ZYLAX business modules | Quotes, orders, invoices and membership |
| KYC/KYB, CRM, projects, billing, investor vault | Project milestones and required training |
| Team chat, video, email, call center | Chat and video with the Global Group team |

| | |
|:---|:---|
| **Client** | Grupo Global Plataforma Bilateral — Ernesto Morilla Campos |
| **Development** | Zeta AI Labs Pvt. Ltd. — Chaitanya Rana |
| **Languages** | Spanish, English, Arabic (right-to-left), Russian, French |
| **Status** | All features from the client documents and meetings are built and tested. Go-live depends on the client's accounts and answers (see §10). |

---

## 🎯 2. Source Documents

Everything in the platform traces back to one of these client documents:

| Document | What it defines |
|:---|:---|
| Requerimiento Intranet (Dataprius / Data Plus) | The 12 core intranet modules and the bottom toolbar |
| Intranet and Extranet (ZYLAX) | The 29 ZYLAX business modules |
| Document 1 — System Schema & Data Architecture | Roles and consoles, 5-step KYC/KYB, data tables, Code of Ethics sanctions |
| Document 2 — Technical Specification | Community, events, CRM & billing, courses, SSO, AI engine, security, GDPR |
| Business proposal and meeting notes | Membership, India coordination, public assistant, call center, French |
| RoboShadow vulnerability report | Security headers (all addressed) |

The mapping of every requirement to code and tests is in [`docs/requirements-matrix.md`](docs/requirements-matrix.md).

---

## 👥 3. Roles & Dashboards

Each role signs in to its own console (Schema Document §3). The API enforces the same rules as the screens.

| Role | Level | Console | What they manage |
|:---|:---:|:---|:---|
| Super Administrator (Ernesto) | 0 | **Presidential Master Console** | Everything: to-do list, key numbers, recent activity, full audit log |
| Technical Administrator (Zeta) | 1 | **DevOps & Tech Control Center** | Backups, audit log, integrations, system health, accounts |
| HR Manager | 2 | **HR Operations Dashboard** | Staff accounts, onboarding, ethics compliance, courses, KYC review |
| Finance Manager | 2 | **Finance Control Panel** | Billing, memberships, invoices, budgets, contracts |
| Manager / Employee (delegates) | 3 | **Employee & Delegate Workspace** | Approvals, projects, milestones, courses, daily work |
| Partner / Client / Supplier | 4 | **Client & Partner Hub** | Invoices, quotes, shared documents, project milestones, chat |
| Confidential Investor | 0-S | **Investor Confidential Vault** | Encrypted deal rooms under NDA |

### How accounts are created

| Who | How |
|:---|:---|
| First Super Admin | Created on the server with `npm run admin:create` |
| Staff | Super Admin / Tech Admin create any role; HR creates managers and employees (User Management → Add user) |
| Companies | Apply through **Register your organisation** (5-step KYC/KYB). On approval the account is created and a set-password link is emailed |
| Investors | Added by the Super Admin only |

Admin, HR and Finance must use two-step sign-in (QR code with Google/Microsoft Authenticator, or a security key) when `MFA_ENFORCE=true`.

---

## 🧩 4. Platform Modules

### 4.1 Core intranet (Dataprius requirement)

| Module | What it does |
|:---|:---|
| Cloud Folders | Folder tree with per-folder permissions, versions, encrypted files |
| Recycle Bin | Restore deleted files and folders within the retention period |
| Backups | Automatic daily database and file backups, restore by admins |
| MetaLinks | Expiring, password-protected download links for outsiders |
| Emails | Company inbox (IMAP) and sending (SMTP) inside the platform |
| Linked Folder | Each person's quick-access folder linked to company storage |
| Web Received Files | Public upload page that drops files into an inbox |
| AutoFlow | Multi-step approvals and task workflows |
| User Management | Accounts, roles, regions, privacy status, GDPR export and erasure |
| External Shares | Folders shared with partners, clients and suppliers |
| System Web Page | Company announcements, news and resources |
| Bottom Toolbar | Profile, apps, live sync status, chat, video, help — plus the calendar |

### 4.2 ZYLAX business suite (29 modules)

| Area | Modules |
|:---|:---|
| Talent & Human Capital | People (org chart), Onboarding, Attendance & Leave (clock in/out), Workplace Safety |
| Finance & Supply Chain | Expenses & Finance, e-Procurement & Vendors (sealed bids), Supply Chain & Approvals |
| Technology & Operations | IT Assets, Bug & Incident Tracker, HelpDesk, Site Inspector |
| Projects | Projects & TaskzDone |
| Commercial (extranet) | Sales & Leads, Orders & CRM, Contacts & Quotes (RFQ → quote), POS with invoicing |
| Partnerships | Franchises & Distributors, Product Catalog |
| External support | Client Support tickets, Call Log |
| Sector modules | Events, Education, Volunteers, Hospitality, Fleet, Real Estate, Construction, Legal Cases, Facilities & Travel |

Every module has search, filters, Excel/CSV export and reports, and only shows each role what it may use.

### 4.3 Business, governance & community

| Module | What it does |
|:---|:---|
| Organizations & KYC/KYB | 5 steps: details → legal documents → NIF/VAT (VIES) and EU PIC checks → sanctions/PEP screening → approval and NDA |
| Paid membership | Survey at registration; 1, 2 or 3 years (€15k / €30k / €45k); card or PayPal; 50/50 revenue split report |
| CRM Pipeline | Lead → proposal → due diligence → active contract, with confidentiality levels |
| Commercial & Billing | Quotes, orders, compliant invoices, subscriptions, Stripe and PayPal |
| Projects & Programs | Budgets, phases, milestones shared with partners |
| Investor Vault | AES-256 encrypted profiles and deal rooms; every access logged |
| Ethics & Compliance | Code of Ethics signature by tier and the 3-tier sanction regime |
| Community | Activity feed, people directory, committees, video bios |
| Courses & Events | SCORM / xAPI courses, quizzes, signed certificates, hybrid events, B2B meetings |
| Call Center | Campaigns, contact lists, agent desk with scripts, callbacks, live supervisor board |
| Public AI assistant | "Ask us" for visitors and members, answering only from approved knowledge |
| Calendar | Meetings with invitations, reminders and private video rooms |

### 4.4 Communication

| Feature | Technology |
|:---|:---|
| Team chat | Socket.IO, messages encrypted at rest |
| Private chat | End-to-end encrypted (ECDH P-256 + AES-GCM) — not even admins can read it |
| Video meetings | WebRTC (LiveKit when configured) |
| Live translation | Chat and content translated on demand (Claude) |
| Phone alerts | Web Push; installable as an app (PWA) |

---

## 🛠️ 5. Technology Stack

| Layer | Technology |
|:---|:---|
| Frontend | React 19, Vite, React Router, plain CSS with light/dark themes, PWA |
| Backend | Node.js 22, Express 5, Socket.IO, zod validation |
| Database | PostgreSQL 16, 21 versioned migrations with checksums |
| Files | Local disk or Amazon S3, AES-256-GCM encryption |
| Security | JWT sessions, TOTP and WebAuthn MFA, RBAC, rate limits, CSP/COOP/COEP headers, tamper-evident audit log |
| Payments | Stripe, PayPal |
| Integrations | VIES, OpenSanctions, Google Workspace / Microsoft 365 provisioning, OIDC single sign-on, SMTP/IMAP, Mux or Cloudflare Stream, Claude (Anthropic) |
| Testing | `node:test` + supertest — **290 tests** against a real PostgreSQL |
| Deployment | Docker (`Dockerfile.prod`, `docker-compose.prod.yml`), nginx, Render blueprint |

---

## 📁 6. Project Structure

```
Extranet-Intranet/
├── backend/
│   ├── server.js                  # HTTP + Socket.IO entry point
│   ├── src/
│   │   ├── app.js                 # Express app, security headers, routes
│   │   ├── config/                # env, database, roles
│   │   ├── controllers/           # one per area (auth, users, organizations, billing…)
│   │   ├── routes/
│   │   ├── services/              # storage, email, backups, membership, GDPR…
│   │   ├── integrations/          # Stripe, PayPal, AI, vault keys, video…
│   │   ├── zylax/                 # the 29 ZYLAX modules (definitions + engine)
│   │   ├── sockets/               # chat and presence
│   │   └── jobs/                  # backups, email sync, reminders
│   ├── database/
│   │   ├── schema/init.sql
│   │   ├── migrations/            # 0001 … 0021
│   │   ├── scripts/               # migrate, create-admin, re-encrypt vault
│   │   └── seeds/                 # demo data (development only)
│   └── test/                      # 290 tests
├── frontend/
│   ├── src/
│   │   ├── main.jsx               # routes
│   │   ├── api/                   # axios client and session
│   │   ├── i18n/                  # es, ar, ru, fr translations
│   │   └── components/
│   │       ├── Landing Page/  Login/  Auth/  Onboarding/
│   │       └── Portals/
│   │           ├── Intranet/      # staff screens
│   │           ├── Extranet/      # partner, client, supplier, investor screens
│   │           └── Shared/        # navigation, ZYLAX, chat, video, privacy…
│   └── deploy/                    # nginx.conf, security-headers.conf
├── docs/                          # requirements matrix, architecture, deployment…
├── docker-compose.yml             # local stack
└── docker-compose.prod.yml        # production stack
```

---

## 💻 7. Local Development

### Prerequisites

Node.js 22+, PostgreSQL 16 (or Docker), Git.

### Quickest: root launcher

```bash
python run.py        # backend on :5000, frontend on :5173
```

### Manual

```bash
# Backend
cd Extranet-Intranet/backend
cp .env.example .env          # set JWT_SECRET, DATABASE_URL, SEED_USER_PASSWORD
npm install
npm run db:init               # base schema
npm run db:migrate            # migrations 0001–0021
npm run db:seed               # demo accounts and data (development only)
npm run dev

# Frontend (second terminal)
cd Extranet-Intranet/frontend
npm install
npm run dev                   # http://localhost:5173
```

The backend refuses to start without `JWT_SECRET` and `DATABASE_URL`. Demo accounts (`admin@gmail.com`, `hr@gmail.com`, `partner@gmail.com`, …) use the password from `SEED_USER_PASSWORD`.

**Sign in as a role directly (development only):** start the frontend with `VITE_DEMO_AS=hr npm run dev` and open `/`.

### Docker

```bash
cd Extranet-Intranet
JWT_SECRET=<random> SEED_USER_PASSWORD=<password> DB_PASSWORD=<db-password> docker compose up --build
```

---

## 🧪 8. Tests

```bash
cd Extranet-Intranet/backend
DATABASE_URL=postgres://user:pass@localhost:5432/test_db npm test
```

Use a **throwaway database** — the tests create and delete data. They cover login and MFA, every role's permissions, region and organisation isolation, KYC, billing and payments, the 29 ZYLAX modules, GDPR, consent, membership, the public assistant, the call center, end-to-end encrypted chat and the dashboards.

---

## 🚀 9. Deployment

| Option | Files | Notes |
|:---|:---|:---|
| Docker on a VPS / AWS | `docker-compose.prod.yml`, `backend/Dockerfile.prod`, `frontend/Dockerfile.prod` | nginx serves the app and proxies `/api` and `/socket.io` to the backend. Never seeds demo data |
| Render | `render.yaml` blueprint (repo root) | Backend as a private service with a persistent disk, Postgres in Frankfurt |

Steps for a new server:

1. Set the environment variables (see below) — keep secrets in a password manager, never in git.
2. `npm run db:migrate` — applies all migrations (runs automatically on Render before each deploy).
3. `npm run admin:create -- --email <email> --name "<name>"` — the first Super Admin.
4. Point the domain and HTTPS (Cloudflare) at the web service.
5. Save `STORAGE_ENCRYPTION_KEY` and `VAULT_ENCRYPTION_KEY` safely — losing them makes encrypted files unreadable.

More detail: [`docs/deployment.md`](docs/deployment.md), [`docs/cloudflare.md`](docs/cloudflare.md), [`docs/disaster-recovery.md`](docs/disaster-recovery.md).

### Main environment settings (`backend/.env.example` lists all)

| Group | Variables |
|:---|:---|
| Required | `DATABASE_URL`, `JWT_SECRET`, `FRONTEND_ORIGIN` |
| Encryption | `STORAGE_ENCRYPTION_KEY`, `VAULT_ENCRYPTION_KEY` (or AWS KMS / HashiCorp Vault) |
| Security | `MFA_ENFORCE`, `WEBAUTHN_RP_ID`, `WEBHOOK_SECRET`, `CLOUDFLARE_*` |
| Email | `SMTP_*`, `MAIL_FROM`, `IMAP_*` |
| Storage & backups | `STORAGE_DRIVER`, `S3_*`, `BACKUP_*` |
| Payments | `STRIPE_*`, `PAYPAL_*`, `MEMBERSHIP_REVENUE_SPLIT` |
| Compliance | `OPENSANCTIONS_API_KEY`, `VIES_ENABLED`, `PRIVACY_POLICY_*` |
| AI | `ANTHROPIC_API_KEY`, `AI_MODEL`, `ASSISTANT_MODEL` |
| Sign-in & accounts | `OIDC_*`, `GOOGLE_*`, `MS_*` |
| Video & alerts | `LIVEKIT_*`, `MUX_*` / `CF_STREAM_*`, `VAPID_*` |

Any integration without its keys switches itself off and says so on **System settings → Integrations**.

---

## 📊 10. Status

| Area | Status |
|:---|:---:|
| Core intranet (12 Dataprius modules) | ✅ Built & tested |
| ZYLAX suite (29 modules) | ✅ Built & tested |
| Roles, consoles and permissions | ✅ Built & tested |
| KYC/KYB onboarding and membership | ✅ Built & tested |
| CRM, billing, Stripe & PayPal | ✅ Built (test mode) |
| Investor vault, ethics, GDPR, audit log | ✅ Built & tested |
| Community, courses, events, call center | ✅ Built & tested |
| Chat (incl. end-to-end encrypted), video, email | ✅ Built & tested |
| 5 languages | ✅ Built (native-speaker review pending) |
| Security headers (RoboShadow report) | ✅ Addressed |
| Staging deployment (Render) | 🟡 Running |
| Live keys, client content, December testing | ⚪ Waiting for the client |
| Penetration test, load test | ⚪ Before go-live |
| Production go-live | ⚪ Planned for January 2027 |

---

## 🔐 11. Security

| Area | Implementation |
|:---|:---|
| Sign-in | Passwords hashed with bcrypt, rate-limited login, session revocation, "log out everywhere" |
| Two-step sign-in | TOTP (QR code) or WebAuthn security keys; mandatory for Admin, HR, Finance |
| Access control | Role-based permissions checked on every API call, region and organisation isolation |
| Data at rest | Files, chat and confidential fields encrypted with AES-256-GCM; investor vault with its own key |
| Audit trail | Every operation logged, hash-chained, searchable and exportable; optional S3 Object Lock |
| Privacy | Consent recorded per policy version; data export, rectification and erasure (GDPR ARCO) |
| Web | Strict CSP, HSTS, COOP/COEP, no framing, CORS limited to the platform's own origin |

---

## 🤝 12. Contributing

```bash
git checkout venky                          # working branch (main branch: kuheli)
git pull origin venky
git add <file> <file>                       # add files by name — never "git add ." 
git commit -m "Describe the change"
git push origin venky
```

| Rule | Why |
|:---|:---|
| Never commit `.env` files or keys | They contain real credentials |
| Add files by name | Avoids committing secrets or someone else's work |
| Never edit an applied migration | Add a new numbered migration instead (checksums are verified) |
| Run the tests before pushing | `npm test` in `backend` against a throwaway database |
| New screen text goes through `t()` | And into the translation files for es, ar, ru and fr |

The early day-by-day log (setup, landing page, backend planning) is kept in [`docs/development-log.md`](docs/development-log.md).

---

<p align="center">

**🌐 GLOBAL GROUP PLATFORM**

*One Workspace. Connected Everywhere.*

A unified digital workspace for document management, secure collaboration and global business operations.

</p>
