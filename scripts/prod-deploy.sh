#!/usr/bin/env bash
set -euo pipefail

# Script para hacer deploy a producción
# Hace pull de main, construye y levanta los servicios de producción
# Uso: ./scripts/prod-deploy.sh

# Cambiar al directorio del proyecto (ajustar según tu ubicación)
cd /root/proyecto-taller || cd "$(dirname "$0")/.." || exit 1

echo "🚀 Iniciando deploy a producción..."

# Verificar que estamos en el branch correcto
CURRENT_BRANCH=$(git branch --show-current)
if [ "$CURRENT_BRANCH" != "main" ]; then
    echo "⚠️  Cambiando al branch 'main'..."
    git checkout main || {
        echo "❌ Error: No se pudo cambiar al branch 'main'"
        exit 1
    }
fi

# Hacer pull de los últimos cambios
echo "📥 Haciendo pull de los últimos cambios desde origin/main..."
git pull origin main || {
    echo "❌ Error: No se pudo hacer pull desde origin/main"
    exit 1
}

# Verificar que Docker esté instalado
if ! command -v docker &> /dev/null; then
    echo "❌ Error: Docker no está instalado"
    exit 1
fi

# Verificar que existe el archivo .env
if [ ! -f ".env" ]; then
    echo "⚠️  Advertencia: No se encontró el archivo .env"
    echo "   Asegúrate de tener las variables de entorno configuradas"
fi

# Parar contenedores de producción existentes
echo "🛑 Parando contenedores de producción existentes..."
docker compose -p taller-prod -f docker-compose.yml down || true

# Construir y levantar contenedores de producción
echo "🐳 Construyendo y levantando contenedores de producción..."
docker compose -p taller-prod -f docker-compose.yml up --build -d

# Esperar a que los servicios estén listos
echo "⏳ Esperando a que los servicios estén listos..."
sleep 10

# Verificar estado de los contenedores
echo ""
echo "📊 Estado de los contenedores de producción:"
docker compose -p taller-prod -f docker-compose.yml ps

# Verificar que los contenedores estén corriendo
if docker compose -p taller-prod -f docker-compose.yml ps | grep -q "Up"; then
    echo ""
    echo "✅ Deploy a producción completado exitosamente!"
    echo ""
    echo "🌐 Servicios disponibles:"
    echo "   Frontend: http://tu-dominio.com (puerto 80)"
    echo "   Backend:  http://tu-dominio.com:4000"
    echo ""
    echo "📝 Comandos útiles:"
    echo "   Ver logs:     docker compose -p taller-prod -f docker-compose.yml logs -f"
    echo "   Ver estado:   docker compose -p taller-prod -f docker-compose.yml ps"
    echo "   Reiniciar:    ./scripts/restart-both.sh"
else
    echo ""
    echo "⚠️  Advertencia: Algunos contenedores pueden no estar corriendo"
    echo "   Revisa los logs con: docker compose -p taller-prod -f docker-compose.yml logs"
    exit 1
fi

