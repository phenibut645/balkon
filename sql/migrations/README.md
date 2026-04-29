# SQL Migrations

Migrations are incremental SQL files that update an existing database schema over time.

## Rules

- Migrations are applied in filename order.
- Every schema change must use a new numbered migration file.
- Never edit old migration files after they were applied to any shared or production database.
- Never reuse a migration number.
- Prefer additive migrations.
- Destructive migrations must be clearly marked and reviewed manually.

## Creating a new migration

1. Choose the next number.
2. Use a descriptive file name.
3. Example: `003_create_streamer_obs_agents.sql`

The `000_template.sql` file exists as a comment-only template and is ignored by the migration runner.

## Running migrations

- `npm run db:migrate:dev`
- `npm run db:migrate:prod`

## Verifying applied migrations

Run this query:

```sql
SELECT * FROM schema_migrations ORDER BY applied_at;
```

## Baseline schema vs migrations

- `sql/tables.sql` is the baseline for fresh database initialization.
- `sql/migrations` contains incremental updates for existing databases.
- When adding a new table or column, update both:
  1. `sql/tables.sql`, so fresh databases are correct.
  2. A new migration file, so existing databases are updated.