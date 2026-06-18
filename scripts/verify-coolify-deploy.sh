#!/usr/bin/env bash
set -euo pipefail

# Post-deploy smoke tests for Coolify staging.
# Usage: APP_URL=https://your-coolify-url bash scripts/verify-coolify-deploy.sh

BASE="${APP_URL:-}"
if [ -z "$BASE" ]; then
  echo "Usage: APP_URL=https://your-coolify-url bash scripts/verify-coolify-deploy.sh" >&2
  exit 2
fi

BASE="${BASE%/}"
PASS=0
FAIL=0

check() {
  local name="$1"
  local url="$2"
  local expect="${3:-200}"
  local code
  code=$(curl -sS -o /dev/null -w "%{http_code}" --max-time 15 "$url" || echo "000")
  if [ "$code" = "$expect" ]; then
    echo "  OK   $name ($code)"
    PASS=$((PASS + 1))
  else
    echo "  FAIL $name (expected $expect, got $code) — $url"
    FAIL=$((FAIL + 1))
  fi
}

echo "Verifying Mutale deploy at $BASE"
echo ""

check "API health"        "$BASE/api/health"
check "API db-test"       "$BASE/api/db-test"
check "Homepage (SPA)"    "$BASE/"
check "Admin login page"  "$BASE/admin/login"

echo ""
if [ "$FAIL" -eq 0 ]; then
  echo "All $PASS checks passed."
  exit 0
else
  echo "$FAIL check(s) failed, $PASS passed."
  exit 1
fi
