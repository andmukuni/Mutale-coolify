#!/usr/bin/env bash
set -euo pipefail

# Creates a cPanel-friendly update ZIP.
# Default behavior excludes uploads/ (because it should persist on server).

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

INCLUDE_UPLOADS=0
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
ZIP_NAME="mutale-cpanel-update-${TIMESTAMP}.zip"
LATEST_ALIAS="mutale-cpanel-deploy.zip"

for arg in "$@"; do
  case "$arg" in
    --include-uploads) INCLUDE_UPLOADS=1 ;;
    --zip-name=*) ZIP_NAME="${arg#*=}" ;;
    *)
      echo "Unknown argument: $arg" >&2
      echo "Usage: bash scripts/make-cpanel-update-zip.sh [--include-uploads] [--zip-name=NAME.zip]" >&2
      exit 2
      ;;
  esac
done

echo "Building frontend (vite)..."
npm run build

if [ ! -d "dist" ]; then
  echo "dist/ not found after build. Aborting." >&2
  exit 1
fi

# NOTE: .htaccess is intentionally NOT included.
# The production .htaccess contains Passenger config (PassengerAppRoot, PassengerNodejs)
# that is specific to the live cPanel account and must not be overwritten by deploy zips.
FILES=(
  "dist"
  "server"
  "shared"
  "app.js"
  "lsentry.cjs"
  ".npmrc"
  "Logo-Website-Mutale-08.png"
  "package.json"
  "package-lock.json"
  "DEPLOY_CPANEL.md"
)

if [ "$INCLUDE_UPLOADS" -eq 1 ]; then
  FILES+=("uploads")
fi

rm -f "$ZIP_NAME"

echo "Creating $ZIP_NAME ..."
zip -r "$ZIP_NAME" "${FILES[@]}" \
  -x "*.DS_Store" \
  -x ".env" -x ".env.*" \
  -x ".htaccess" \
  -x "node_modules/*" \
  -x "*.zip"

cp -f "$ZIP_NAME" "$LATEST_ALIAS"

echo "Done: $ZIP_NAME"
echo "Updated latest alias: $LATEST_ALIAS"
