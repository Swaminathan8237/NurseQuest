#!/usr/bin/env bash
# Idempotently bring up the local PostgreSQL server and provision the app's
# role, database, and the Supabase `auth` schema shim. Safe to run repeatedly
# (used by both install.sh and start.sh).
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"

# Pick the highest installed PostgreSQL major version (falls back to 16).
PG_VER="$(ls /usr/lib/postgresql 2>/dev/null | sort -n | tail -1 || true)"
: "${PG_VER:=16}"

# Start the default cluster. Errors (e.g. "already running") are non-fatal.
sudo pg_ctlcluster "$PG_VER" main start 2>/dev/null || true

# Wait until the server accepts connections (max ~30s).
for _ in $(seq 1 30); do
  if sudo -u postgres psql -tAc 'SELECT 1' >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

# Application login role.
sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='nurse'" | grep -q 1 \
  || sudo -u postgres psql -c "CREATE ROLE nurse LOGIN PASSWORD 'nurse';"

# Application database, owned by the app role.
sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='nursequest'" | grep -q 1 \
  || sudo -u postgres createdb -O nurse nursequest

# Local shim for Supabase's managed `auth` schema so the unmodified backend can
# initialize its schema and seed. Idempotent.
PGPASSWORD=nurse psql -h 127.0.0.1 -U nurse -d nursequest -v ON_ERROR_STOP=1 \
  -f "$HERE/../local-postgres/auth-shim.sql" >/dev/null

echo "PostgreSQL ready: role=nurse db=nursequest (cluster $PG_VER/main)"
