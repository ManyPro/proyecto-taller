#!/bin/bash
# Script para parar el entorno de desarrollo

echo "🛑 Parando entorno de desarrollo (taller-dev)..."

# Parar contenedores
docker compose -p taller-dev -f docker-compose.dev.yml down

echo "✅ Entorno de desarrollo parado!"
echo ""
echo "Para volver a iniciarlo:"
echo "   docker compose -p taller-dev -f docker-compose.dev.yml up -d"
