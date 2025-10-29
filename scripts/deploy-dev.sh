#!/bin/bash
# Script para deploy en Render - Entorno de DESARROLLO
# Este script se ejecuta en el branch 'develop'

echo "🚀 Deploying to DEVELOPMENT environment..."

# Verificar que estamos en el branch correcto
CURRENT_BRANCH=$(git branch --show-current)
if [ "$CURRENT_BRANCH" != "develop" ]; then
    echo "❌ Error: Deploy solo se puede hacer desde el branch 'develop'"
    echo "Current branch: $CURRENT_BRANCH"
    exit 1
fi

# Verificar que las variables de entorno estén configuradas
if [ -z "$MONGODB_URI" ]; then
    echo "❌ Error: MONGODB_URI no está configurada"
    exit 1
fi

if [ -z "$JWT_SECRET" ]; then
    echo "❌ Error: JWT_SECRET no está configurada"
    exit 1
fi

echo "✅ Variables de entorno verificadas"

# Instalar dependencias del backend
echo "📦 Instalando dependencias del backend..."
cd Backend
npm ci --omit=dev
cd ..

# Construir y ejecutar con Docker Compose para desarrollo
echo "🐳 Construyendo y ejecutando contenedores de desarrollo..."
docker-compose -f docker-compose.dev.yml down
docker-compose -f docker-compose.dev.yml up --build -d

echo "✅ Deploy de desarrollo completado!"
echo "🌐 Frontend: http://localhost:8080"
echo "🔧 Backend: http://localhost:4001"
echo "🗄️  MongoDB: localhost:27018"
