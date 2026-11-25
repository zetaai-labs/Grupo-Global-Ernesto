# Production deployment

For the engineer installing the platform on the client's server. Recovery is covered in
[disaster-recovery.md](disaster-recovery.md) and the Cloudflare setup in [cloudflare.md](cloudflare.md).

The steps below were tested on 2026-11-23 in a throwaway environment on Docker 29. They have **not yet been
run on the client's real server, domain or TLS certificate.**

## What runs

| Container | Image | Purpose | Reachable from |
|---|---|---|---|
| `web` | nginx (unprivileged) | Serves the React app and proxies `/api` and `/socket.io` | `127.0.0.1:8080` on the host only |
| `backend` | Node 22 | API, background jobs, backups | Internal network only |
| `db` | PostgreSQL 16 | Database | Internal network only |
| `migrate` | Same as backend | One-off database updates | Run by hand |

Persistent data lives in two Docker volumes: `gg_pgdata` (database) and `gg_storage` (uploads and backup files).

## 1. Prepare the server

- A Linux server with Docker Engine and the Docker Compose plugin.
- DNS for `app.grupoglobalplataformabilateral.com.es` pointing at the server, or at Cloudflare.
- A TLS front end on the host that forwards `https://` traffic to `http://127.0.0.1:8080`. For example
  Caddy, host nginx, or Cloudflare with an Origin Certificate. The containers do not terminate TLS.
- A firewall that allows only 80/443 from the internet (only Cloudflare ranges if Cloudflare is used) and SSH.

## 2. Get the code and settings

```bash
git clone https://github.com/zetaai-labs/Grupo-Global-Ernesto.git
cd Grupo-Global-Ernesto/Extranet-Intranet
git checkout <release tag or commit>

cp .env.production.example .env.production
chmod 600 .env.production
```

Fill in `.env.production`. Generate every secret separately:

| Setting | How to create it |
|---|---|
| `DB_PASSWORD` | `openssl rand -hex 24` (letters and digits only) |
| `JWT_SECRET`, `WEBHOOK_SECRET` | `openssl rand -hex 32` |
| `STORAGE_ENCRYPTION_KEY`, `VAULT_ENCRYPTION_KEY` | `openssl rand -base64 32` |
| `TRUST_PROXY_HOPS` | `2` when a host TLS proxy sits in front of the `web` container, which is the usual setup. Wrong values break per-user login rate limits. |
| `FRONTEND_ORIGIN`, `WEBAUTHN_RP_ID` | The real app address and its host name |

Copy the encryption keys and `JWT_SECRET` into the company password manager **now**. Without
`STORAGE_ENCRYPTION_KEY` and `VAULT_ENCRYPTION_KEY`, encrypted files and Investor Vault data cannot be read,
even from a backup. Add email, S3, SSO and other services from `backend/.env.example` as their keys arrive.
The admin **Integrations** page shows what is still missing.

To keep the commands short, define this once per shell:

```bash
alias gg='docker compose --env-file .env.production -f docker-compose.prod.yml'
```

## 3. Build and create the database

```bash
gg build
gg up -d db
gg --profile ops run --rm migrate
```

The last command must end with `[OK] Database schema applied: 0000_baseline, …`. **Never run `npm run db:seed`
in production.** It creates demo accounts with a shared password.

## 4. Create the first Super Administrator

The parent company is created together with the first admin. Confirm the legal name and tax ID with the client
first. The values below are the ones used in the demo data.

```bash
gg run --rm -e ADMIN_INITIAL_PASSWORD='<at least 12 characters>' backend \
  npm run admin:create -- --email <admin email> --name "<full name>" \
  --org "Grupo Global Plataforma Bilateral (A.M.M. Servicios)" --tax-id G29837838 --country ESP
```

Without `ADMIN_INITIAL_PASSWORD`, a random password is printed once. After the first sign-in, change the
password under **Security** and, with `MFA_ENFORCE=true`, set up multi-factor authentication. Create all other
accounts from **User Management**.

## 5. Start and check

```bash
gg up -d --wait
gg ps
curl -fsS http://127.0.0.1:8080/healthz
curl -fsS http://127.0.0.1:8080/api/health
curl -sI https://app.grupoglobalplataformabilateral.com.es/login | grep -iE 'strict-transport|content-security'
```

Then sign in as the admin, open **Integrations**, and open **Team Chat** to confirm live updates work through the
proxy.

## Updating

```bash
git fetch && git checkout <new tag>
gg build
gg run --rm backend npm run db:migrate:status
gg --profile ops run --rm migrate
gg up -d --wait
```

Take a database backup before any update that has pending migrations. Migrations only move forward. Rolling back
means restoring a backup, as described in the recovery guide.

## Continuous integration

`.github/workflows/extranet-intranet-ci.yml` runs on every push to `venky` or `kuheli` and on pull requests. It runs:

- the backend tests on a fresh PostgreSQL with all migrations and throwaway secrets
- the frontend lint and build
- the production image builds

It does not deploy anything.

## Known limits

- **Backups:** they run once a day by default (`BACKUP_INTERVAL_HOURS`) and stay on the same server unless
  `BACKUP_TO_S3=true`. This does not meet the 15-minute data-loss target. See the recovery guide.
- **Disk space:** local backups older than `BACKUP_RETENTION_DAYS` (default 30) are deleted daily; the newest 7 of
  each type are always kept. Integrations > System health shows free space and warns below 10%.
- **Sessions:** they last 8 hours and are not revoked when a password changes or an account is suspended. Suspended
  accounts are refused on their next request, because every request reloads the account.
- **Course packages (SCORM / xAPI):** uploaded courses are unpacked into `storage/uploads/course-packages` on the
  server's disk, also when files use S3, and they are not encrypted at rest (the browser loads them directly).
  Upload only course content, never personal data. Keep the `gg_storage` volume large enough for them; nginx
  accepts package uploads up to 310 MB (`COURSE_PACKAGE_MAX_MB`, default 300).
- **AI assistant (Claude):** off until `ANTHROPIC_API_KEY` is set. When on, the text of the record, CRM relationship or
  document a staff member asks about is sent to Anthropic's API (confidential ZYLAX fields are never sent). Add Anthropic
  to the record of processing activities and the list of processors before enabling it. Each request is written to the
  audit log (feature and token counts, not the content); `AI_DAILY_LIMIT` caps requests per person per day (default 100).

- **Video bios:** off until the upload keys for the chosen `STREAMING_PROVIDER` are set (Mux: `MUX_TOKEN_ID`,
  `MUX_TOKEN_SECRET`, `MUX_WEBHOOK_SECRET`; Cloudflare: `CF_ACCOUNT_ID`, `CF_STREAM_API_TOKEN`,
  `CF_STREAM_WEBHOOK_SECRET`) together with the playback signing keys. Register the webhook
  `https://<api-domain>/api/webhooks/mux` (or `/api/webhooks/cloudflare-stream`) at the provider. Videos go from the
  browser straight to the provider, so they never pass through this server. They are capped at 5 minutes and played
  only through signed links that expire after 1 hour. The provider generates the transcript, which is stored here
  so the directory can search it. The provider stores the videos and their voices, so add it to the record of
  processing activities and the list of processors.
