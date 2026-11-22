# Database migrations

Add each schema change as a new file named `NNNN_description.sql`, for example `0001_add_contract_end_date.sql`.

- `npm run db:migrate` applies everything pending. Each file runs once, in its own transaction.
- `npm run db:migrate:status` shows what is applied and pending without changing anything.
- Never edit a migration after it has been applied. Add a new one instead.
- Migrations only move forward. Take a backup before running them in production.
- `schema/init.sql` is the baseline. It must stay safe to run repeatedly.
