#!/usr/bin/env bash
# Ensure the PostgreSQL server + client are installed. No-op when already
# present (e.g. baked into a snapshot/base image). Only used by install.sh.
set -euo pipefail

if command -v pg_ctlcluster >/dev/null 2>&1 && ls /usr/lib/postgresql >/dev/null 2>&1; then
  echo "PostgreSQL already installed."
  exit 0
fi

echo "Installing PostgreSQL..."
export DEBIAN_FRONTEND=noninteractive
sudo apt-get update -y
sudo apt-get install -y postgresql postgresql-contrib
