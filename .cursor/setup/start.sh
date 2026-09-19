#!/usr/bin/env bash
# Per-boot startup: ensure the local PostgreSQL server is running and the
# app's role/database/auth-shim exist. The backend and frontend themselves run
# as long-lived `terminals` (see .cursor/environment.json).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
bash "$ROOT/.cursor/setup/provision-db.sh"
