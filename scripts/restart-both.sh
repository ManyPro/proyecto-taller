#!/usr/bin/env bash
set -euo pipefail

# Go to repo root (directory above this script)
REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_DIR"

echo "[1/2] (prod) up -d"
docker compose -p taller-prod -f docker-compose.yml up -d

echo "[2/2] (dev) up -d"
docker compose -p taller-dev -f docker-compose.dev.yml up -d

echo "OK. Estado:"
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
