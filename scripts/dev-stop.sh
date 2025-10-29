#!/bin/bash
# Script para parar el entorno de desarrollo

echo "🛑 Parando entorno de desarrollo..."

# Parar contenedores
docker-compose -f docker-compose.dev.yml down

echo "✅ Entorno de desarrollo parado!"
echo ""
echo "Para volver a iniciarlo:"
echo "   ./scripts/dev-setup.sh"
