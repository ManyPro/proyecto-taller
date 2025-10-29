#!/bin/bash
# Script para ver logs del entorno de desarrollo

echo "📊 Mostrando logs del entorno de desarrollo..."
echo "Presiona Ctrl+C para salir"
echo ""

# Mostrar logs de todos los servicios
docker-compose -f docker-compose.dev.yml logs -f
