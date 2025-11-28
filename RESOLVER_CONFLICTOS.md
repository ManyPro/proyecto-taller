# 🔧 Guía para Resolver Conflictos de Merge

Si el script automático no funciona, aquí están los pasos manuales:

## 📋 Pasos Manuales

### 1. Verificar estado actual
```bash
git status
```

### 2. Resolver conflictos aceptando versión de develop

Los conflictos se resuelven aceptando la versión de `develop` (que tiene todos los cambios nuevos de Chats):

#### Archivos CSV (datos de importación):
```bash
git checkout --ours Backend/scripts/excels/AutomovilDB.csv
git checkout --ours Backend/scripts/excels/ClientesDB.csv
git checkout --ours Backend/scripts/excels/OrdenesDB.csv
git checkout --ours Backend/scripts/excels/RelacionordenproductosDB.csv
git checkout --ours Backend/scripts/excels/RelacionordenservicioDB.csv
git checkout --ours Backend/scripts/excels/RemisionesDB.csv
git checkout --ours Backend/scripts/excels/SeriesDB.csv
git checkout --ours Backend/scripts/excels/serviciosDB.csv
```

#### Archivos de código Backend:
```bash
git checkout --ours Backend/src/controllers/sales.controller.js
git checkout --ours Backend/src/models/Company.js
git checkout --ours Backend/src/routes/admin.company.routes.js
git checkout --ours Backend/src/server.js
```

#### Archivos Frontend:
```bash
git checkout --ours DEPLOY_CHECKLIST.md
git checkout --ours Frontend/admin.html
git checkout --ours Frontend/assets/js/prices.js
git checkout --ours Frontend/cartera.html
git checkout --ours Frontend/cashflow.html
git checkout --ours Frontend/cotizaciones.html
git checkout --ours Frontend/inventario.html
git checkout --ours Frontend/nomina.html
git checkout --ours Frontend/notas.html
git checkout --ours Frontend/precios.html
git checkout --ours Frontend/skus.html
git checkout --ours Frontend/templates.html
git checkout --ours Frontend/vehiculos-pendientes.html
git checkout --ours Frontend/ventas.html
```

### 3. Agregar archivos resueltos
```bash
git add Backend/scripts/excels/*.csv
git add Backend/src/controllers/sales.controller.js
git add Backend/src/models/Company.js
git add Backend/src/routes/admin.company.routes.js
git add Backend/src/server.js
git add DEPLOY_CHECKLIST.md
git add Frontend/admin.html
git add Frontend/assets/js/prices.js
git add Frontend/*.html
```

### 4. Completar el merge
```bash
git commit -m "Merge develop to main: Resolve conflicts, accept develop version"
```

### 5. Verificar que no quedan conflictos
```bash
git status
```

### 6. Push a main
```bash
git push origin main
```

## ⚠️ Nota Importante

- `--ours` en el contexto de un merge desde `develop` a `main` significa la versión de `main` (la rama actual).
- Pero como queremos la versión de `develop` (que tiene los cambios nuevos), debemos usar `--theirs` en lugar de `--ours`.

**Corrección**: Si estás en la rama `main` haciendo merge de `develop`:
- `--ours` = versión de `main` (rama actual)
- `--theirs` = versión de `develop` (rama que estás mergeando)

Por lo tanto, usa `--theirs` para aceptar los cambios de `develop`:

```bash
git checkout --theirs Backend/src/server.js
git checkout --theirs Frontend/admin.html
# etc...
```

## 🚀 Script Rápido (Usando --theirs)

```bash
# Resolver todos los conflictos aceptando develop (--theirs)
git checkout --theirs Backend/scripts/excels/*.csv
git checkout --theirs Backend/src/controllers/sales.controller.js
git checkout --theirs Backend/src/models/Company.js
git checkout --theirs Backend/src/routes/admin.company.routes.js
git checkout --theirs Backend/src/server.js
git checkout --theirs DEPLOY_CHECKLIST.md
git checkout --theirs Frontend/admin.html
git checkout --theirs Frontend/assets/js/prices.js
git checkout --theirs Frontend/cartera.html
git checkout --theirs Frontend/cashflow.html
git checkout --theirs Frontend/cotizaciones.html
git checkout --theirs Frontend/inventario.html
git checkout --theirs Frontend/nomina.html
git checkout --theirs Frontend/notas.html
git checkout --theirs Frontend/precios.html
git checkout --theirs Frontend/skus.html
git checkout --theirs Frontend/templates.html
git checkout --theirs Frontend/vehiculos-pendientes.html
git checkout --theirs Frontend/ventas.html

# Agregar todos
git add .

# Completar merge
git commit -m "Merge develop to main: Resolve conflicts, accept develop version"

# Push
git push origin main
```

