#!/bin/bash
# Script para actualizar el entorno de desarrollo cuando haces cambios

echo "🔄 Actualizando entorno de desarrollo..."

# Verificar que estamos en el branch correcto
CURRENT_BRANCH=$(git branch --show-current)
if [ "$CURRENT_BRANCH" != "develop" ]; then
    echo "⚠️  Cambiando al branch 'develop'..."
    git checkout develop
fi

# Hacer pull de los últimos cambios
echo "📥 Haciendo pull de los últimos cambios..."
git pull origin develop

# Parar contenedores existentes
echo "🛑 Parando contenedores existentes (taller-dev)..."
docker compose -p taller-dev -f docker-compose.dev.yml down || true

# Construir y levantar contenedores con los cambios
echo "🐳 Construyendo y levantando contenedores con los cambios (taller-dev)..."
docker compose -p taller-dev -f docker-compose.dev.yml up --build -d

# Esperar a que los servicios estén listos
echo "⏳ Esperando a que los servicios estén listos..."
sleep 5

# Verificar estado de los contenedores
echo "📊 Estado de los contenedores (taller-dev):"
docker compose -p taller-dev -f docker-compose.dev.yml ps

echo ""
echo "✅ Entorno de desarrollo actualizado!"
echo ""
echo "🌐 URLs:"
echo "   Frontend: http://localhost:8080"
echo "   Backend:  http://localhost:4001"
echo ""
echo "📝 Para ver logs en tiempo real:"
echo "   docker compose -p taller-dev -f docker-compose.dev.yml logs -f"
