#!/usr/bin/env bash
# Script bantu update deployment di VPS.
# Jalankan dari VPS: bash deploy/deploy.sh
# Urutan: git pull -> npm install --production -> pm2 restart
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"   # folder oven-node
REPO_DIR="$(cd "$APP_DIR/.." && pwd)"          # root repo git (isinya folder oven-node)

echo "==> git pull di $REPO_DIR"
cd "$REPO_DIR"
git pull origin main

echo "==> npm install --production di $APP_DIR"
cd "$APP_DIR"
npm install --omit=dev

echo "==> pm2 restart oven-dryer-monitor"
pm2 restart ecosystem.config.js --update-env

echo "==> selesai. Cek status:"
pm2 status oven-dryer-monitor
