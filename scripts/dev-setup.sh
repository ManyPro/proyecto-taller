#!/bin/bash
# Script para configurar el entorno de desarrollo en el droplet

echo "🚀 Configurando entorno de desarrollo..."

# Verificar que estamos en el branch correcto
CURRENT_BRANCH=$(git branch --show-current)
if [ "$CURRENT_BRANCH" != "develop" ]; then
    echo "⚠️  Cambiando al branch 'develop'..."
    git checkout develop
fi

# Hacer pull de los últimos cambios
echo "📥 Haciendo pull de los últimos cambios..."
git pull origin develop

# Verificar que Docker esté instalado
if ! command -v docker &> /dev/null; then
    echo "❌ Docker no está instalado. Instalando Docker..."
    curl -fsSL https://get.docker.com -o get-docker.sh
    sh get-docker.sh
    sudo usermod -aG docker $USER
    echo "✅ Docker instalado. Reinicia la sesión y ejecuta el script nuevamente."
    exit 1
fi

# Verificar que Docker Compose esté instalado
echo "ℹ️ Usando Docker Compose V2 (docker compose)"

# Crear archivo .env.dev si no existe
if [ ! -f ".env.dev" ]; then
    echo "📝 Creando archivo .env.dev..."
    cp env.dev .env.dev
    echo "⚠️  IMPORTANTE: Edita el archivo .env.dev con tus variables de entorno:"
    echo "   - MONGODB_URI (tu base de datos)"
    echo "   - CLOUDINARY_* (tus credenciales)"
    echo "   - JWT_SECRET (puedes usar el que está o cambiar)"
    echo ""
    echo "   Comando: nano .env.dev"
    echo ""
    read -p "¿Quieres editarlo ahora? (y/n): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        nano .env.dev
    fi
else
    echo "✅ Archivo .env.dev ya existe"
fi

# Parar contenedores existentes
echo "🛑 Parando contenedores existentes..."
docker compose -p taller-dev -f docker-compose.dev.yml down || true

# Construir y levantar contenedores
echo "🐳 Construyendo y levantando contenedores de desarrollo..."
docker compose -p taller-dev -f docker-compose.dev.yml up --build -d

# Esperar a que los servicios estén listos
echo "⏳ Esperando a que los servicios estén listos..."
sleep 10

# Verificar estado de los contenedores
echo "📊 Estado de los contenedores:"
docker compose -p taller-dev -f docker-compose.dev.yml ps

echo ""
echo "✅ Entorno de desarrollo configurado!"
echo ""
echo "🌐 URLs:"
echo "   Frontend: http://localhost:8080"
echo "   Backend:  http://localhost:4001"
echo "   MongoDB:  localhost:27018"
echo ""
echo "📝 Comandos útiles:"
echo "   Ver logs:     docker compose -p taller-dev -f docker-compose.dev.yml logs -f"
echo "   Parar:        docker compose -p taller-dev -f docker-compose.dev.yml down"
echo "   Reiniciar:    docker compose -p taller-dev -f docker-compose.dev.yml restart"
echo "   Actualizar:   ./scripts/dev-update.sh"
