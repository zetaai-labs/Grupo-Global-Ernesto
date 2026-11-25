# Disaster recovery

For the engineer on call. Commands use the `gg` alias from [deployment.md](deployment.md).

## Targets and the current gap

| | Technical Specification | Current setup |
|---|---|---|
| Data loss (RPO) | under 15 minutes | Up to 24 hours, the time since the last daily dump |
| Recovery time (RTO) | under 2 hours | Restore tested in 3 seconds on demo-sized data. Real data will take longer, so time the first drill. |

**To meet the 15-minute target**, the database needs continuous backup, which a nightly dump cannot give. Use either:

- a managed PostgreSQL with point-in-time recovery, such as Amazon RDS in the EU, and point `DATABASE_URL` at it
- WAL archiving to S3 with pgBackRest or WAL-G on this server

Both need the client's cloud account. Until then, treat the RPO as one backup interval, and shorten it with
`BACKUP_INTERVAL_HOURS` if needed.

## What is backed up

| Data | How | Where |
|---|---|---|
| Database | `pg_dump` every `BACKUP_INTERVAL_HOURS` (default 24) and on demand from **Backups** | `gg_storage` volume, `/app/storage/backups`. Also copied to S3 when `BACKUP_TO_S3=true` |
| Uploaded files (local storage) | Copy of the uploads folder | Same volume, so **not** off-site |
| Uploaded files (S3 storage) | S3 bucket versioning | The S3 bucket |
| Audit log | Hash chain in the database, with optional locked copies in S3 Object Lock | Database and audit bucket |
| Encryption keys and secrets | **Not backed up by the platform** | Company password manager |

A backup that stays on the server is lost with the server. Turn on `BACKUP_TO_S3` and S3 file storage before go-live.

## Restore the database (tested procedure)

This procedure was tested on 2026-11-23. The restored database matched the original in users, organisations,
ZYLAX records, quotes, products and stock.

Always restore into a **new, empty** database, check it, then switch over. Never restore over the live database.

```bash
# 1. Choose a dump
gg exec backend ls -lt /app/storage/backups
gg exec -T backend cat /app/storage/backups/database-<stamp>.sql > restore.sql

# 2. Restore into a new database. Stops at the first error and changes nothing if it fails.
gg exec -T db sh -c 'psql -U "$POSTGRES_USER" -d postgres -c "CREATE DATABASE restored"'
gg exec -T db sh -c 'psql -U "$POSTGRES_USER" -d restored --single-transaction -v ON_ERROR_STOP=1' < restore.sql

# 3. Compare key counts with what you expect
gg exec -T db sh -c 'psql -U "$POSTGRES_USER" -d restored -Atc "select (select count(*) from users), (select count(*) from organizations), (select count(*) from zx_records)"'

# 4. Switch the app to it: set DB_NAME=restored in .env.production, then
gg up -d --wait backend
```

After switching:

1. Sign in.
2. Run the integrity check on the **Audit Log** page.
3. Check a few recent records.
4. Keep the old database until the client confirms the restore. Do not drop it.

If the dump came from an older release, run `gg --profile ops run --rm migrate` before starting the backend.

**In-app restore (Backups page):** it runs all-or-nothing and stops at the first error. On a database that already
has data it fails safely, and changes nothing. Use the procedure above for real recovery.

## Restore uploaded files (local storage)

```bash
gg exec backend ls /app/storage/backups          # find files-<stamp>
gg exec backend cp -a /app/storage/backups/files-<stamp>/. /app/storage/uploads/
```

Files are encrypted with `STORAGE_ENCRYPTION_KEY`. A restored server must use the **same key**.

## Rebuild on a new server

1. Follow [deployment.md](deployment.md) steps 1 to 3 with the **original secrets and encryption keys**.
2. Restore the database as above, pointing `DB_NAME` at the restored database.
3. Restore the files, or point S3 settings at the existing bucket.
4. Update DNS or Cloudflare to the new server.
5. Sign in and check **Integrations**, **Audit Log** integrity, a file download, and an Investor Vault record.

## Drills

Run a restore drill every quarter and after any change to backups. Record:

- the date
- the dump used
- the time taken
- the count comparison
- who checked it

The first real drill should use a copy of production-sized data to measure the actual recovery time.
