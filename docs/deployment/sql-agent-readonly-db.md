# SQL Agent Read-Only Database Role

SQL Agent should connect to production databases with a dedicated read-only role. The application blocks unsafe SQL by default, but the database role is the final protection boundary.

## Recommended Defaults

Set these environment variables for production:

```bash
SQL_AGENT_WRITE_ENABLED=false
SQL_AGENT_DEFAULT_ROW_LIMIT=1000
SQL_AGENT_STATEMENT_TIMEOUT_MS=10000
```

With these defaults, SQL Agent accepts one `SELECT` statement, injects or lowers `LIMIT` to the configured row cap, and applies a PostgreSQL `statement_timeout` during execution.

## PostgreSQL Example

```sql
CREATE USER alata_sql_readonly WITH PASSWORD 'replace-with-a-strong-password';
GRANT CONNECT ON DATABASE your_database TO alata_sql_readonly;
GRANT USAGE ON SCHEMA public TO alata_sql_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO alata_sql_readonly;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT ON TABLES TO alata_sql_readonly;
```

Use this user in the SQL Agent connection string. Do not reuse the application owner, migration user, or a database superuser.

## Write Operations

`INSERT`, `UPDATE`, and `DELETE` are disabled by default. They require both:

- `SQL_AGENT_WRITE_ENABLED=true`
- the SQL Agent tool config `allowWrites=true`

`DROP`, `ALTER`, and `TRUNCATE` are always denied.
