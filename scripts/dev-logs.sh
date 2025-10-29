#!/bin/bash
# Script para ver logs del entorno de desarrollo

echo "📊 Mostrando logs del entorno de desarrollo (proyecto: taller-dev)..."
echo "Presiona Ctrl+C para salir"
echo ""

# Mostrar logs de todos los servicios
docker compose -p taller-dev -f docker-compose.dev.yml logs -f
