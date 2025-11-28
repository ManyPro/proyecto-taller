#!/usr/bin/env bash
set -euo pipefail

# Script para hacer merge de develop a main antes del deploy
# Uso: ./scripts/merge-develop-to-main.sh

cd /root/proyecto-taller || cd "$(dirname "$0")/.." || exit 1

echo "🔄 Haciendo merge de develop a main..."

# Asegurarse de tener los últimos cambios
echo "📥 Actualizando branches desde remoto..."
git fetch origin main develop

# Cambiar a main
echo "📦 Cambiando a branch 'main'..."
git checkout main

# Resetear main a origin/main para empezar limpio
echo "🧹 Reseteando main a origin/main..."
git reset --hard origin/main

# Hacer merge de develop
echo "🔀 Haciendo merge de develop a main..."
if git merge origin/develop --no-edit; then
    echo "✅ Merge exitoso!"
    echo ""
    echo "📤 ¿Quieres hacer push a main? (s/n)"
    read -r response
    if [[ "$response" =~ ^[Ss]$ ]]; then
        git push origin main
        echo "✅ Push completado!"
    else
        echo "⚠️  No se hizo push. Puedes hacerlo manualmente con: git push origin main"
    fi
else
    echo ""
    echo "⚠️  Hay conflictos detectados. Resolviendo automáticamente..."
    echo ""
    
    # Resolver conflictos aceptando la versión de develop (que tiene los cambios nuevos)
    # Nota: --theirs = versión de develop (rama que estamos mergeando)
    #       --ours = versión de main (rama actual)
    echo "📦 Resolviendo archivos CSV (aceptando versión de develop)..."
    git checkout --theirs Backend/scripts/excels/AutomovilDB.csv 2>/dev/null || true
    git checkout --theirs Backend/scripts/excels/ClientesDB.csv 2>/dev/null || true
    git checkout --theirs Backend/scripts/excels/OrdenesDB.csv 2>/dev/null || true
    git checkout --theirs Backend/scripts/excels/RelacionordenproductosDB.csv 2>/dev/null || true
    git checkout --theirs Backend/scripts/excels/RelacionordenservicioDB.csv 2>/dev/null || true
    git checkout --theirs Backend/scripts/excels/RemisionesDB.csv 2>/dev/null || true
    git checkout --theirs Backend/scripts/excels/SeriesDB.csv 2>/dev/null || true
    git checkout --theirs Backend/scripts/excels/serviciosDB.csv 2>/dev/null || true
    
    echo "📝 Resolviendo archivos de código (aceptando versión de develop)..."
    git checkout --theirs Backend/src/controllers/sales.controller.js 2>/dev/null || true
    git checkout --theirs Backend/src/models/Company.js 2>/dev/null || true
    git checkout --theirs Backend/src/routes/admin.company.routes.js 2>/dev/null || true
    git checkout --theirs Backend/src/server.js 2>/dev/null || true
    git checkout --theirs DEPLOY_CHECKLIST.md 2>/dev/null || true
    git checkout --theirs Frontend/admin.html 2>/dev/null || true
    git checkout --theirs Frontend/assets/js/prices.js 2>/dev/null || true
    
    echo "🌐 Resolviendo archivos HTML del Frontend (aceptando versión de develop)..."
    git checkout --theirs Frontend/cartera.html 2>/dev/null || true
    git checkout --theirs Frontend/cashflow.html 2>/dev/null || true
    git checkout --theirs Frontend/cotizaciones.html 2>/dev/null || true
    git checkout --theirs Frontend/inventario.html 2>/dev/null || true
    git checkout --theirs Frontend/nomina.html 2>/dev/null || true
    git checkout --theirs Frontend/notas.html 2>/dev/null || true
    git checkout --theirs Frontend/precios.html 2>/dev/null || true
    git checkout --theirs Frontend/skus.html 2>/dev/null || true
    git checkout --theirs Frontend/templates.html 2>/dev/null || true
    git checkout --theirs Frontend/vehiculos-pendientes.html 2>/dev/null || true
    git checkout --theirs Frontend/ventas.html 2>/dev/null || true
    
    echo ""
    echo "📋 Agregando archivos resueltos al staging..."
    git add Backend/scripts/excels/*.csv 2>/dev/null || true
    git add Backend/src/controllers/sales.controller.js 2>/dev/null || true
    git add Backend/src/models/Company.js 2>/dev/null || true
    git add Backend/src/routes/admin.company.routes.js 2>/dev/null || true
    git add Backend/src/server.js 2>/dev/null || true
    git add DEPLOY_CHECKLIST.md 2>/dev/null || true
    git add Frontend/admin.html 2>/dev/null || true
    git add Frontend/assets/js/prices.js 2>/dev/null || true
    git add Frontend/*.html 2>/dev/null || true
    
    echo ""
    echo "✅ Conflictos resueltos. Completando merge..."
    
    # Completar el merge
    if git commit --no-edit; then
        echo "✅ Merge completado exitosamente!"
        echo ""
        echo "📤 ¿Quieres hacer push a main? (s/n)"
        read -r response
        if [[ "$response" =~ ^[Ss]$ ]]; then
            git push origin main
            echo "✅ Push completado!"
        else
            echo "⚠️  No se hizo push. Puedes hacerlo manualmente con: git push origin main"
        fi
    else
        echo ""
        echo "❌ Error al completar el merge. Revisa manualmente:"
        echo "   git status"
        echo "   git diff --name-only --diff-filter=U"
        exit 1
    fi
fi

