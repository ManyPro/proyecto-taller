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
    echo "❌ Hay conflictos que necesitan resolverse manualmente."
    echo ""
    echo "Archivos con conflictos:"
    git diff --name-only --diff-filter=U
    echo ""
    echo "Para resolver:"
    echo "  1. Edita los archivos con conflictos"
    echo "  2. git add ."
    echo "  3. git commit"
    echo "  4. git push origin main"
    exit 1
fi

