#!/bin/sh
# Nightly backup of the Deen Squad database (Railway cron service "db-backup").
#
# 1. pg_dump (custom format) of the whole database.
# 2. Upload to the private Railway bucket under postgres/.
# 3. Restore check: restore the dump into a scratch database on the same server
#    (backup_restore_check), compare row counts with the live database, drop it.
# 4. Delete backups older than KEEP_DAYS (default 30).
# Any failure emails ALERT_EMAIL (or ADMIN_EMAILS) through Resend and exits non-zero.
#
# Variables: DATABASE_URL, BUCKET, ENDPOINT, REGION, ACCESS_KEY_ID, SECRET_ACCESS_KEY,
# optional KEEP_DAYS, RESEND_API_KEY, EMAIL_FROM, ALERT_EMAIL / ADMIN_EMAILS.
set -eu
export PGOPTIONS="-c client_min_messages=warning"

KEEP_DAYS="${KEEP_DAYS:-30}"
PREFIX="postgres"
CHECK_DB="backup_restore_check"
STAMP="$(date -u +%Y-%m-%dT%H%MZ)"
FILE="/tmp/deensquad-$STAMP.dump"
STEP="starting"

log() { echo "[backup] $*"; }

alert() {
  to="${ALERT_EMAIL:-${ADMIN_EMAILS:-}}"
  if [ -z "${RESEND_API_KEY:-}" ] || [ -z "$to" ] || [ -z "${EMAIL_FROM:-}" ]; then
    log "no alert sent (RESEND_API_KEY, EMAIL_FROM or ALERT_EMAIL/ADMIN_EMAILS missing)"
    return 0
  fi
  first_to="$(echo "$to" | cut -d, -f1 | tr -d ' ')"
  body="The nightly Deen Squad database backup failed at step: $STEP ($STAMP). Check the db-backup logs in Railway."
  curl -sS --max-time 15 -o /dev/null -w "[backup] alert email: HTTP %{http_code}\n" \
    -X POST https://api.resend.com/emails \
    -H "Authorization: Bearer $RESEND_API_KEY" -H "Content-Type: application/json" \
    -d "{\"from\":\"$EMAIL_FROM\",\"to\":[\"$first_to\"],\"subject\":\"Database backup failed\",\"text\":\"$body\"}" || true
}

on_exit() {
  code=$?
  rm -f "$FILE"
  if [ "$code" -ne 0 ]; then
    log "FAILED at step: $STEP (exit $code)"
    alert
  fi
}
trap on_exit EXIT

: "${DATABASE_URL:?DATABASE_URL is not set}"
: "${BUCKET:?BUCKET is not set}"
: "${ENDPOINT:?ENDPOINT is not set}"
export AWS_ACCESS_KEY_ID="${ACCESS_KEY_ID:?ACCESS_KEY_ID is not set}"
export AWS_SECRET_ACCESS_KEY="${SECRET_ACCESS_KEY:?SECRET_ACCESS_KEY is not set}"
export AWS_DEFAULT_REGION="${REGION:-auto}"
s3() { aws --endpoint-url "$ENDPOINT" s3 "$@"; }

# The scratch database's URL: the live URL with its database name swapped.
CHECK_URL="$(echo "$DATABASE_URL" | sed -E "s#/[^/?]*(\\?.*)?\$#/$CHECK_DB\\1#")"
case "$CHECK_URL" in *"/$CHECK_DB"*) ;; *) STEP="building the restore-check URL"; exit 1 ;; esac
[ "$CHECK_URL" != "$DATABASE_URL" ] || { STEP="building the restore-check URL"; exit 1; }

STEP="pg_dump"
log "dumping the database"
pg_dump --format=custom --compress=9 --file="$FILE" "$DATABASE_URL"
pg_restore --list "$FILE" > /dev/null
SIZE="$(wc -c < "$FILE" | tr -d ' ')"
log "dump ok: $SIZE bytes"

STEP="upload"
s3 cp "$FILE" "s3://$BUCKET/$PREFIX/deensquad-$STAMP.dump" --only-show-errors
log "uploaded s3://$BUCKET/$PREFIX/deensquad-$STAMP.dump"

STEP="restore check"
log "restoring into $CHECK_DB"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -qc "drop database if exists $CHECK_DB" -c "create database $CHECK_DB"
pg_restore --exit-on-error --no-owner --dbname="$CHECK_URL" "$FILE"

TABLES="$(psql "$DATABASE_URL" -Atc "select format('%I.%I', schemaname, tablename) from pg_tables where schemaname in ('public','auth') order by 1")"
live_total=0; restored_total=0; empty=""
for t in $TABLES; do
  live="$(psql "$DATABASE_URL" -Atc "select count(*) from $t")"
  restored="$(psql "$CHECK_URL" -Atc "select count(*) from $t" 2>/dev/null || echo missing)"
  if [ "$restored" = "missing" ]; then empty="$empty $t(missing)"; continue; fi
  live_total=$((live_total + live)); restored_total=$((restored_total + restored))
  if [ "$live" -gt 0 ] && [ "$restored" -eq 0 ]; then empty="$empty $t"; fi
  [ "$live" = "$restored" ] || log "  $t: live $live, restored $restored (changed since the dump)"
done
psql "$DATABASE_URL" -qc "drop database if exists $CHECK_DB"
log "restore check: $restored_total rows restored, $live_total live, tables: $(echo "$TABLES" | wc -w)"
if [ -n "$empty" ]; then log "tables empty or missing after restore:$empty"; exit 1; fi
# A few rows can change between the dump and the count; a big gap means the restore is wrong.
if [ $((restored_total * 100)) -lt $((live_total * 99)) ]; then log "too few rows restored"; exit 1; fi

STEP="removing old backups"
CUTOFF="$(date -u -d "@$(( $(date +%s) - KEEP_DAYS * 86400 ))" +%Y-%m-%dT%H%MZ)"
s3 ls "s3://$BUCKET/$PREFIX/" | awk '{print $4}' | while read -r name; do
  case "$name" in
    deensquad-*.dump)
      when="${name#deensquad-}"; when="${when%.dump}"
      if [ "$when" \< "$CUTOFF" ]; then s3 rm "s3://$BUCKET/$PREFIX/$name" --only-show-errors && log "removed $name"; fi ;;
  esac
done
COUNT="$(s3 ls "s3://$BUCKET/$PREFIX/" | grep -c 'deensquad-.*\.dump' || true)"

STEP="done"
log "backup complete: $COUNT backups kept (last $KEEP_DAYS days)"
