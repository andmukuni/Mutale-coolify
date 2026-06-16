#!/usr/bin/env bash
# Fix .env (JWT + CORS) and optionally build cPanel deploy zip.
# Usage:
#   ./scripts/fix-deployment.sh
#   ./scripts/fix-deployment.sh --domain mutalemubanga.org
#   ./scripts/fix-deployment.sh --domain https://mutalemubanga.org --zip
#
# After --zip: upload the generated .zip to cPanel, upload this .env beside app.js, Restart Node.

set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

ZIP=0
DOMAIN_ARGS=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --zip) ZIP=1; shift ;;
    --domain=*)
      DOMAIN_ARGS=("$1")
      shift
      ;;
    --domain)
      shift
      if [[ $# -lt 1 ]]; then
        echo "Usage: $0 [--domain HOST_OR_URL] [--zip]" >&2
        exit 2
      fi
      DOMAIN_ARGS=(--domain="$1")
      shift
      ;;
    *)
      echo "Unknown: $1" >&2
      echo "Usage: $0 [--domain HOST_OR_URL] [--zip]" >&2
      exit 2
      ;;
  esac
done

node scripts/fix-deployment.mjs "${DOMAIN_ARGS[@]}"

if [[ "$ZIP" -eq 1 ]]; then
  echo ""
  bash scripts/make-cpanel-update-zip.sh --zip-name="mutale-cpanel-deploy-$(date +%Y-%m-%d-%H%M).zip"
  echo ""
  echo "Next: upload zip to cPanel app root → extract → ensure .env is beside app.js → Restart Node."
fi
