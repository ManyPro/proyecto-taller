#!/usr/bin/env bash
set -euo pipefail

# Script para hacer merge de develop a main y deploy a producción
# Uso: ./scripts/merge-and-deploy.sh

cd /root/proyecto-taller || cd "$(dirname "$0")/.." || exit 1

echo "🚀 Iniciando merge y deploy a producción..."
echo ""

# Colores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Función para mostrar errores
error() {
    echo -e "${RED}❌ Error: $1${NC}" >&2
    exit 1
}

# Función para mostrar éxito
success() {
    echo -e "${GREEN}✅ $1${NC}"
}

# Función para mostrar advertencia
warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

# Verificar que estamos en el directorio correcto
if [ ! -f "netlify.toml" ] && [ ! -f "docker-compose.yml" ]; then
    error "No se encontraron archivos del proyecto. Asegúrate de estar en el directorio raíz."
fi

# Verificar que git está disponible
if ! command -v git &> /dev/null; then
    error "Git no está instalado"
fi

# Verificar que Docker está disponible (para deploy)
if ! command -v docker &> /dev/null; then
    error "Docker no está instalado"
fi

# Paso 1: Asegurarse de tener los últimos cambios
echo "📥 [1/6] Actualizando branches desde remoto..."
git fetch origin main develop || error "No se pudo hacer fetch desde origin"

# Paso 2: Cambiar a develop y actualizar
echo ""
echo "📦 [2/6] Actualizando develop..."
git checkout develop || error "No se pudo cambiar a develop"

# Si hay cambios locales, hacer reset para evitar conflictos
if ! git diff-index --quiet HEAD --; then
    warning "Hay cambios locales en develop, haciendo reset..."
    git reset --hard origin/develop || error "No se pudo resetear develop"
fi

git pull origin develop || error "No se pudo hacer pull de develop"
success "Develop actualizado"

# Paso 3: Cambiar a main y actualizar
echo ""
echo "📦 [3/6] Cambiando a main y actualizando..."
git checkout main || error "No se pudo cambiar a main"
git pull origin main || error "No se pudo hacer pull de main"
success "Main actualizado"

# Paso 4: Hacer merge de develop a main
echo ""
echo "🔀 [4/6] Haciendo merge de develop a main..."
if git merge origin/develop --no-edit; then
    success "Merge exitoso sin conflictos"
else
    # Hay conflictos
    warning "Hay conflictos que necesitan resolverse manualmente"
    echo ""
    echo "Archivos con conflictos:"
    git diff --name-only --diff-filter=U
    echo ""
    echo "Para resolver:"
    echo "  1. Edita los archivos con conflictos"
    echo "  2. git add ."
    echo "  3. git commit"
    echo "  4. Ejecuta este script nuevamente o haz push manualmente"
    exit 1
fi

# Paso 5: Push a main
echo ""
echo "📤 [5/6] Haciendo push a main..."
if git push origin main; then
    success "Push a main completado"
else
    error "No se pudo hacer push a main"
fi

# Paso 6: Deploy a producción
echo ""
echo "🐳 [6/7] Iniciando deploy a producción..."
echo ""

# Verificar que existe el archivo .env
if [ ! -f ".env" ]; then
    warning "No se encontró el archivo .env"
    echo "   Asegúrate de tener las variables de entorno configuradas"
fi

# Parar contenedores de producción existentes
echo "🛑 Parando contenedores de producción existentes..."
docker compose -p taller-prod -f docker-compose.yml down || true

# Construir y levantar contenedores de producción
echo "🐳 Construyendo y levantando contenedores de producción..."
if docker compose -p taller-prod -f docker-compose.yml up --build -d; then
    success "Contenedores de producción levantados"
else
    error "No se pudieron levantar los contenedores de producción"
fi

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
    success "Deploy a producción completado exitosamente!"
    
    # Paso 7: Sincronizar develop con main (para que develop tenga todos los cambios)
    echo ""
    echo "🔄 [7/7] Sincronizando develop con main..."
    git checkout develop || error "No se pudo cambiar a develop"
    
    # Hacer merge de main a develop para mantenerlos sincronizados
    if git merge origin/main --no-edit; then
        success "Develop sincronizado con main"
        
        # Push a develop
        if git push origin develop; then
            success "Push a develop completado"
        else
            warning "No se pudo hacer push a develop, pero el merge local está completo"
        fi
    else
        warning "No se pudo hacer merge de main a develop automáticamente"
        echo "   Puedes hacerlo manualmente con:"
        echo "   git checkout develop"
        echo "   git merge origin/main"
        echo "   git push origin develop"
    fi
    
    echo ""
    echo "🌐 Servicios disponibles:"
    echo "   Frontend: http://tu-dominio.com (puerto 80)"
    echo "   Backend:  http://tu-dominio.com:4000"
    echo ""
    echo "📝 Comandos útiles:"
    echo "   Ver logs:     docker compose -p taller-prod -f docker-compose.yml logs -f"
    echo "   Ver estado:   docker compose -p taller-prod -f docker-compose.yml ps"
    echo "   Reiniciar:    ./scripts/restart-both.sh"
    echo ""
    success "¡Proceso completado! El sitio de Netlify debería hacer deploy automáticamente."
    echo ""
    success "✅ Cambios guardados en main (producción) y develop (desarrollo)"
else
    warning "Algunos contenedores pueden no estar corriendo"
    echo "   Revisa los logs con: docker compose -p taller-prod -f docker-compose.yml logs"
    exit 1
fi

