# Restoring the Deen Squad database from a backup

The Railway cron service `db-backup` (this folder) runs every night at 02:15 UTC. It saves a
`pg_dump` (custom format) to the private Railway bucket `db-backups` under `postgres/`, keeps 30
days, and proves each dump restores by loading it into a scratch database (`backup_restore_check`)
and comparing row counts. A failed run emails `ALERT_EMAIL` (or `ADMIN_EMAILS`) and shows as a
failed run on the service in Railway.

## Restore (do this calmly; the live app keeps serving the current data until the last step)

You need a machine with PostgreSQL 18 client tools (`pg_restore`, `psql`) and the AWS CLI, plus:

- the bucket's credentials: Railway → `db-backups` → Credentials (endpoint, access key, secret);
- the database's public URL: Railway → `Postgres` → Variables → `DATABASE_PUBLIC_URL`
  (add a TCP proxy under Settings → Networking if there isn't one).

1. Pick a backup:
   `aws --endpoint-url <ENDPOINT> s3 ls s3://<BUCKET>/postgres/`
2. Download it:
   `aws --endpoint-url <ENDPOINT> s3 cp s3://<BUCKET>/postgres/deensquad-<STAMP>.dump .`
3. Restore into a NEW database first and check it:
   ```
   psql "<DATABASE_PUBLIC_URL>" -c "create database restored"
   pg_restore --no-owner --exit-on-error --dbname="<DATABASE_PUBLIC_URL with /railway replaced by /restored>" deensquad-<STAMP>.dump
   psql "<.../restored>" -c "select count(*) from players"
   ```
   The `authenticated` role already exists on the Railway server. On a brand-new server, create it first:
   `create role authenticated nologin noinherit;`
4. Switch the app over: on `parent-app` (and `chase-ladder` if it uses the database), point
   `DATABASE_URL` at the `restored` database, or rename databases during a quiet moment:
   ```
   alter database railway rename to railway_broken;   -- needs no open connections: stop parent-app first
   alter database restored rename to railway;
   ```
5. Redeploy `parent-app`, sign in and check families, news and orders.

Remove the TCP proxy again afterwards if you added one.
