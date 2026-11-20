# Requirements Matrix — Global Group Platform

Status legend: ✅ implemented · 🟡 partial · ⬜ planned

## Core access & security

| Requirement | Status | Notes |
|---|---|---|
| Individual user login (email/password) | ✅ | JWT, bcrypt hashes, bcrypt from PostgreSQL users table |
| Role-based access control | ✅ | admin / employee / partner enforced on server and client |
| Regional delegation access (EU / India / Global) | ✅ | region in token, SQL-scoped queries |
| MFA (TOTP) | ✅ | setup, enable/disable, verify on login |
| Password reset flow | ✅ | token request + confirm (dev token returned without SMTP) |
| Suspended user blocked immediately | ✅ | active status reloaded from DB on every request |
| Login rate limiting | ✅ | 10 attempts / 15 minutes |
| Audit trail | ✅ | login, file, folder, share, workflow, MFA and backup events |
| Folder/file permissions (view/edit/share) | ✅ | `folder_permissions` table + middleware |
| Secret management | ✅ | server refuses to start without JWT_SECRET / DATABASE_URL |

## Intranet modules

| Module | Status | Notes |
|---|---|---|
| Overview dashboard | ✅ | real counts from `/api/dashboard` |
| Cloud Folders | ✅ | folders, files, upload/download, local disk storage |
| Linked Folder | ✅ | user shortcuts with API |
| MetaLinks | ✅ | token links, expiry, download cap, optional password |
| Web Received Files | ✅ | public submission page + staff review inbox |
| AutoFlow | ✅ | workflows with status transitions |
| Backups | ✅ | scheduled + on-demand DB and file backups with restore |
| Recycle Bin | ✅ | soft delete, restore, purge |
| Audit log | ✅ | admin-only list |
| User Management | ✅ | list, create, suspend/activate |
| System Web Page | ✅ | admin announcements |
| Calendar | ✅ | events, side panel, invitees |
| Emails | 🟡 | SMTP send + records; IMAP inbox planned |
| Chat | ✅ | Socket.IO + persisted messages |
| Video conferencing | 🟡 | WebRTC signaling via sockets; no hosted provider |
| External Shares | ✅ | share folders with partner accounts |
| Bottom toolbar | ✅ | profile, apps, sync status, chat/video shortcuts |

## Extranet modules

| Module | Status | Notes |
|---|---|---|
| Shared Documents | ✅ | reads folders shared with the partner |
| My Submissions | ✅ | upload with review status |
| Shared Links | ✅ | MetaLinks on shared folders |
| Project Updates / Resources | ✅ | routes wired to the shared feature page |
| Partner chat / video | ✅ | portal-scoped rooms |

## Data & delivery

| Requirement | Status | Notes |
|---|---|---|
| PostgreSQL schema | ✅ | Alembic-style `init.sql`, idempotent |
| Seed data | ✅ | roles, regions, users, folders, permissions, shares, conversations |
| Automated tests | ✅ | login, role checks, suspended user, region/file scoping |
| Docker Compose | ✅ | app + PostgreSQL |
| Root launcher script | ✅ | `run.py` starts both dev servers |
| HTTPS / production CORS | ⬜ | pending deployment confirmation |
| S3 storage | ⬜ | local disk for now |
| Off-site backups | ⬜ | local backups for now |
| File versioning & search | ⬜ | planned |
| GDPR export / retention | ⬜ | planned |
| India membership workflow / ZYLAX | ⬜ | separate project, per meeting notes |
