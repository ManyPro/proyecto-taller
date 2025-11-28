#!/bin/bash

# Script para resolver conflictos de merge de develop a main
# Uso: ./scripts/resolve-merge-conflicts.sh

set -e

echo "🔧 Resolviendo conflictos de merge..."

# Verificar que estamos en el directorio correcto
if [ ! -f "package.json" ]; then
    echo "❌ Error: Debes ejecutar este script desde la raíz del proyecto"
    exit 1
fi

# Verificar estado de git
if ! git status &>/dev/null; then
    echo "❌ Error: No es un repositorio git"
    exit 1
fi

# Si hay un merge en progreso, continuar
if [ -f ".git/MERGE_HEAD" ]; then
    echo "📋 Merge en progreso detectado, continuando..."
else
    echo "⚠️  No hay merge en progreso. Ejecuta primero: git merge develop"
    exit 1
fi

echo ""
echo "📦 Resolviendo archivos CSV (aceptando versión de develop)..."
# Los CSV generalmente pueden resolverse aceptando la versión de develop
# Nota: --theirs = versión de develop (rama que estamos mergeando)
git checkout --theirs Backend/scripts/excels/AutomovilDB.csv 2>/dev/null || true
git checkout --theirs Backend/scripts/excels/ClientesDB.csv 2>/dev/null || true
git checkout --theirs Backend/scripts/excels/OrdenesDB.csv 2>/dev/null || true
git checkout --theirs Backend/scripts/excels/RelacionordenproductosDB.csv 2>/dev/null || true
git checkout --theirs Backend/scripts/excels/RelacionordenservicioDB.csv 2>/dev/null || true
git checkout --theirs Backend/scripts/excels/RemisionesDB.csv 2>/dev/null || true
git checkout --theirs Backend/scripts/excels/SeriesDB.csv 2>/dev/null || true
git checkout --theirs Backend/scripts/excels/serviciosDB.csv 2>/dev/null || true

echo "✅ Archivos CSV resueltos"

echo ""
echo "📝 Resolviendo archivos de código (aceptando versión de develop)..."
# Para los archivos de código, aceptamos la versión de develop que incluye los cambios de chats
git checkout --theirs Backend/src/controllers/sales.controller.js 2>/dev/null || true
git checkout --theirs Backend/src/models/Company.js 2>/dev/null || true
git checkout --theirs Backend/src/routes/admin.company.routes.js 2>/dev/null || true
git checkout --theirs Backend/src/server.js 2>/dev/null || true
git checkout --theirs DEPLOY_CHECKLIST.md 2>/dev/null || true
git checkout --theirs Frontend/admin.html 2>/dev/null || true
git checkout --theirs Frontend/assets/js/prices.js 2>/dev/null || true

echo "✅ Archivos de código resueltos"

echo ""
echo "🌐 Resolviendo archivos HTML del Frontend (aceptando versión de develop)..."
# Los archivos HTML tienen los cambios de navegación con Chats
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

echo "✅ Archivos HTML resueltos"

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
echo "✅ Conflictos resueltos y archivos agregados al staging"
echo ""
echo "📊 Estado actual:"
git status --short

echo ""
echo "💡 Siguiente paso:"
echo "   Si todos los conflictos están resueltos, ejecuta:"
echo "   git commit -m 'Merge develop to main: Resolve conflicts, accept develop version'"
echo ""
echo "   O si prefieres revisar manualmente algún archivo, hazlo antes de hacer commit."

