#!/bin/bash
# ===========================================
# Mutale cPanel Deployment Script
# ===========================================
# Usage:
#   1. Upload mutale-cpanel-deploy.zip and this script to your cPanel app directory
#   2. SSH into your server or use cPanel Terminal
#   3. Run: bash deploy.sh
# ===========================================

set -e

echo ""
echo "========================================="
echo "  Mutale - cPanel Deployment Script"
echo "========================================="
echo ""

# Get the directory where this script lives
APP_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$APP_DIR"
echo "📁 Working directory: $APP_DIR"

# --- Step 1: Extract the zip ---
ZIP_FILE="mutale-cpanel-deploy.zip"
if [ -f "$ZIP_FILE" ]; then
    echo ""
    echo "📦 Extracting $ZIP_FILE ..."
    unzip -o "$ZIP_FILE"
    echo "✅ Extraction complete."
else
    echo "⚠️  No $ZIP_FILE found — assuming files are already extracted."
fi

# --- Step 2: Check required files exist ---
echo ""
echo "🔍 Checking required files..."
MISSING=0
for f in package.json server/index.js .env; do
    if [ ! -f "$f" ]; then
        echo "   ❌ Missing: $f"
        MISSING=1
    else
        echo "   ✅ Found: $f"
    fi
done
if [ -d "dist" ]; then
    echo "   ✅ Found: dist/ (frontend build)"
else
    echo "   ❌ Missing: dist/ folder"
    MISSING=1
fi
if [ $MISSING -eq 1 ]; then
    echo ""
    echo "❌ Some required files are missing. Aborting."
    exit 1
fi

# --- Step 3: Install production dependencies ---
echo ""
echo "📥 Installing production dependencies (npm install --production)..."
npm install --production
echo "✅ Dependencies installed."

# --- Step 4: Create uploads directories if missing ---
echo ""
echo "📂 Ensuring uploads directories exist..."
mkdir -p uploads/blog uploads/books uploads/events
echo "✅ Upload directories ready."

# --- Step 5: Set permissions ---
echo ""
echo "🔐 Setting file permissions..."
chmod -R 755 dist/
chmod -R 755 uploads/
chmod 600 .env
echo "✅ Permissions set."

# --- Step 6: Show summary ---
echo ""
echo "========================================="
echo "  ✅ DEPLOYMENT COMPLETE"
echo "========================================="
echo ""
echo "  App directory:    $APP_DIR"
echo "  Startup file:     server/index.js"
echo "  Node modules:     $(ls node_modules | wc -l | tr -d ' ') packages"
echo ""
echo "  NEXT STEPS:"
echo "  1. Go to cPanel → Setup Node.js App"
echo "  2. Set Application root:    $(basename $APP_DIR)"
echo "  3. Set Startup file:        server/index.js"
echo "  4. Set Node.js version:     18 or higher"
echo "  5. Set Application mode:    Production"
echo "  6. Click 'Create' or 'Save' then 'Start App'"
echo ""
echo "  If the app is already registered, just click"
echo "  'Restart' in cPanel Node.js App manager."
echo ""
echo "========================================="
