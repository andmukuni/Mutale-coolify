#!/usr/bin/env bash
set -euo pipefail

# Seed a Coolify staging database inside the running mutale container.
# Usage: bash scripts/coolify-seed.sh [container_name_or_id]
#
# If no argument given, auto-detects the first running container matching "mutale".

CONTAINER="${1:-}"
if [ -z "$CONTAINER" ]; then
  CONTAINER=$(docker ps --format '{{.Names}}' | grep -i mutale | head -1 || true)
fi

if [ -z "$CONTAINER" ]; then
  echo "No mutale container found. Usage: bash scripts/coolify-seed.sh <container>" >&2
  echo "Running containers:" >&2
  docker ps --format 'table {{.Names}}\t{{.Status}}' >&2
  exit 1
fi

echo "Seeding database via container: $CONTAINER"
echo ""

run_seed() {
  local label="$1"
  local cmd="$2"
  echo "→ $label"
  docker exec "$CONTAINER" sh -c "$cmd"
  echo ""
}

run_seed "Core seed (admin user, schema data)" "node server/seed.js"
run_seed "RBAC permissions" "node server/scripts/seed-rbac.js"
run_seed "Partner logos (demo SVGs)" "node server/scripts/seed-partner-logos.js"

echo "Done. Log in at /admin/login with DEFAULT_ADMIN_EMAIL / DEFAULT_ADMIN_PASSWORD from Coolify env vars."
