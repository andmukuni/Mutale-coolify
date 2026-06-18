#!/usr/bin/env bash
set -euo pipefail

# Post-deploy workflow for Coolify staging.
# Usage: APP_URL=https://your-coolify-url bash scripts/coolify-postdeploy.sh [container]

BASE="${APP_URL:-}"
CONTAINER="${1:-}"

if [ -z "$BASE" ]; then
  echo "Usage: APP_URL=https://your-coolify-url bash scripts/coolify-postdeploy.sh [container]" >&2
  exit 2
fi

echo "=== Step 1: Smoke tests ==="
export APP_URL="$BASE"
bash "$(dirname "$0")/verify-coolify-deploy.sh"

echo ""
echo "=== Step 2: Seed database ==="
if [ -n "$CONTAINER" ]; then
  bash "$(dirname "$0")/coolify-seed.sh" "$CONTAINER"
else
  bash "$(dirname "$0")/coolify-seed.sh"
fi

echo ""
echo "=== Step 3: Manual checks ==="
echo "  1. Open ${BASE%/}/admin/login"
echo "  2. Log in with DEFAULT_ADMIN_EMAIL / DEFAULT_ADMIN_PASSWORD from Coolify env"
echo "  3. Register for a test event to verify branded confirmation email (SMTP required)"
echo ""
echo "Post-deploy complete."
