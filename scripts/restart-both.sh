#!/usr/bin/env bash
set -euo pipefail

# Script para reiniciar ambos servicios (producción y desarrollo)
# Uso: ./scripts/restart-both.sh

# Cambiar al directorio del proyecto (ajustar según tu ubicación)
cd /root/proyecto-taller || cd "$(dirname "$0")/.." || exit 1

echo "🔄 Reiniciando servicios de producción y desarrollo..."

echo "[1/2] Reiniciando producción (taller-prod)..."
docker compose -p taller-prod -f docker-compose.yml restart || \
docker compose -p taller-prod -f docker-compose.yml up -d

echo "[2/2] Reiniciando desarrollo (taller-dev)..."
docker compose -p taller-dev -f docker-compose.dev.yml restart || \
docker compose -p taller-dev -f docker-compose.dev.yml up -d

echo ""
echo "✅ Servicios reiniciados. Estado:"
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" | grep -E "(taller-prod|taller-dev|NAMES)" || \
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
