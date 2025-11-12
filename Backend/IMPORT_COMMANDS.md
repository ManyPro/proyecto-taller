# Comandos de Importación - Guía Completa

## ⚠️ IMPORTANTE: Antes de empezar

1. **Asegúrate de tener MongoDB corriendo** (local o remoto)
2. **Verifica que los archivos CSV estén en la carpeta correcta**: `Backend/data/legacy/`
3. **Reemplaza `TU_MONGODB_URI`** con tu cadena de conexión real

## 🔄 ¿Los scripts eliminan datos anteriores?

**NO**, los scripts NO eliminan datos automáticamente. Son **idempotentes**, lo que significa:

- ✅ **Puedes ejecutarlos múltiples veces sin crear duplicados**
- ✅ **Si un registro ya existe, lo actualiza en lugar de crear uno nuevo**
- ⚠️ **NO eliminan datos legacy anteriores automáticamente**

### Cómo evitan duplicados:

**Script de Clientes:**
- Busca por `companyId + identificationNumber` o `plate`
- Si existe → actualiza
- Si no existe → crea nuevo

**Script de Órdenes:**
- Busca por `legacyOrId` o patrón `LEGACY or_id=` en notas
- Si existe → actualiza
- Si no existe → crea nuevo

### Si necesitas limpiar datos legacy antes de reimportar:

Usa el script de limpieza (ver sección "🧹 Limpieza de Datos Legacy" más abajo)

## 📋 Archivos CSV Requeridos

Coloca estos archivos en `Backend/data/legacy/`:
- `ordenesfinal.csv`
- `clientesfinal.csv`
- `automovilfinal.csv`
- `relaorder.csv` (opcional pero recomendado)
- `productos.csv` (opcional pero recomendado)
- `relaservice.csv` (opcional pero recomendado)
- `servicios.csv` (opcional pero recomendado)
- `remisions.csv` (opcional pero recomendado)

---

## 🔵 1. IMPORTACIÓN DE CLIENTES CON MATCHING DE VEHÍCULOS

Este script importa clientes y los conecta automáticamente con vehículos de la base de datos.

### Paso 1: Prueba (Dry Run) - Ver qué se haría sin guardar

```powershell
cd Backend
$env:MONGODB_URI = "mongodb+srv://giovannymanriquelol_db_user:XfOvU9NYHxoNgKAl@cluster0.gs3ajdl.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0"
node scripts/import_clients_from_legacy.js --orders "data/legacy/ordenesfinal.csv" --clients "data/legacy/clientesfinal.csv" --vehicles "data/legacy/automovilfinal.csv" --mongo "$env:MONGODB_URI" --companyMap "2:68cb18f4202d108152a26e4c,3:68c871198d7595062498d7a1" --dry --progressInterval 50
```

### Paso 2: Importación Real

```powershell
cd Backend
$env:MONGODB_URI = "mongodb+srv://giovannymanriquelol_db_user:XfOvU9NYHxoNgKAl@cluster0.gs3ajdl.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0"
node scripts/import_clients_from_legacy.js --orders "data/legacy/ordenesfinal.csv" --clients "data/legacy/clientesfinal.csv" --vehicles "data/legacy/automovilfinal.csv" --mongo "$env:MONGODB_URI" --companyMap "2:68cb18f4202d108152a26e4c,3:68c871198d7595062498d7a1" --progressInterval 50
```

### Paso 3: Si quieres probar con pocos registros primero

```powershell
cd Backend
$env:MONGODB_URI = "TU_MONGODB_URI"
node scripts/import_clients_from_legacy.js --orders "data/legacy/ordenesfinal.csv" --clients "data/legacy/clientesfinal.csv" --vehicles "data/legacy/automovilfinal.csv" --mongo "$env:MONGODB_URI" --companyMap "2:68cb18f4202d108152a26e4c,3:68c871198d7595062498d7a1" --limit 100 --progressInterval 10
```

**Parámetros importantes:**
- `--progressInterval 50`: Muestra progreso cada 50 registros (más frecuente = más visible)
- `--limit 100`: Solo procesa los primeros 100 registros (útil para pruebas)
- `--dry`: Solo muestra qué haría sin guardar nada

---

## 🟢 2. IMPORTACIÓN DE ÓRDENES CON PRODUCTOS Y SERVICIOS

Este script importa las órdenes históricas con todos los detalles de productos y servicios.

### Paso 1: Prueba (Dry Run) - Ver qué se haría sin guardar

```powershell
cd Backend
$env:MONGODB_URI = "TU_MONGODB_URI"
node scripts/import_orders_from_legacy.js --orders "data/legacy/ordenesfinal.csv" --clients "data/legacy/clientesfinal.csv" --vehicles "data/legacy/automovilfinal.csv" --orderProducts "data/legacy/relaorder.csv" --products "data/legacy/productos.csv" --orderServices "data/legacy/relaservice.csv" --services "data/legacy/servicios.csv" --remisions "data/legacy/remisions.csv" --mongo "$env:MONGODB_URI" --companyMap "2:68cb18f4202d108152a26e4c,3:68c871198d7595062498d7a1" --dry --progressInterval 50
```

### Paso 2: Importación Real

```powershell
cd Backend
$env:MONGODB_URI = "TU_MONGODB_URI"
node scripts/import_orders_from_legacy.js --orders "data/legacy/ordenesfinal.csv" --clients "data/legacy/clientesfinal.csv" --vehicles "data/legacy/automovilfinal.csv" --orderProducts "data/legacy/relaorder.csv" --products "data/legacy/productos.csv" --orderServices "data/legacy/relaservice.csv" --services "data/legacy/servicios.csv" --remisions "data/legacy/remisions.csv" --mongo "$env:MONGODB_URI" --companyMap "2:68cb18f4202d108152a26e4c,3:68c871198d7595062498d7a1" --progressInterval 50
```

### Paso 3: Si quieres probar con pocos registros primero

```powershell
cd Backend
$env:MONGODB_URI = "TU_MONGODB_URI"
node scripts/import_orders_from_legacy.js --orders "data/legacy/ordenesfinal.csv" --clients "data/legacy/clientesfinal.csv" --vehicles "data/legacy/automovilfinal.csv" --orderProducts "data/legacy/relaorder.csv" --products "data/legacy/productos.csv" --orderServices "data/legacy/relaservice.csv" --services "data/legacy/servicios.csv" --remisions "data/legacy/remisions.csv" --mongo "$env:MONGODB_URI" --companyMap "2:68cb18f4202d108152a26e4c,3:68c871198d7595062498d7a1" --limit 100 --progressInterval 10
```

**Parámetros importantes:**
- `--progressInterval 50`: Muestra progreso cada 50 registros
- `--limit 100`: Solo procesa los primeros 100 registros (útil para pruebas)
- `--dry`: Solo muestra qué haría sin guardar nada
- `--noProfile`: Si NO quieres actualizar CustomerProfile durante la importación

---

## 📝 Ejemplo de URI de MongoDB

### MongoDB Local:
```powershell
$env:MONGODB_URI = "mongodb://localhost:27017/taller"
```

### MongoDB Atlas (Cloud):
```powershell
$env:MONGODB_URI = "mongodb+srv://usuario:password@cluster.mongodb.net/taller?retryWrites=true&w=majority"
```

### MongoDB en Docker:
```powershell
$env:MONGODB_URI = "mongodb://mongo:27017/taller"
```

---

## 🔍 Qué verás durante la ejecución

### Importación de Clientes:
```
🚀 Iniciando importación de clientes con matching de vehículos...
📂 Leyendo archivos CSV...
   - Órdenes: data/legacy/ordenesfinal.csv
   - Clientes: data/legacy/clientesfinal.csv
   - Vehículos: data/legacy/automovilfinal.csv
✅ Órdenes leídas: 5000
✅ Clientes leídos: 3000
✅ Vehículos leídos: 2500
📊 Procesando relaciones cliente-vehículo...
[████████████████████░░░░] 75.0% | 1500/2000 | ✅ 800 | 🔄 600 | 🚗 500 | ⚠️  100 | ⏱️  ETA: 2m 30s
```

### Importación de Órdenes:
```
Reading legacy CSV files...
Orders: 5000, Clients: 3000, Vehicles: 2500
OrderProducts: 15000, Products: 500, OrderServices: 8000, Services: 200, Remisions: 5000
📊 Total de órdenes a procesar: 5000
⏱️  Mostrando progreso cada 50 registros o cada 30 segundos

[████████████████████░░░░] 75.0% | 3750/5000 | ✅ 3000 | 🔄 700 | ⏭️  50 | ⏱️  ETA: 5m 15s
```

---

## ⚡ Comandos Rápidos (Todo en Uno)

### Si tienes un archivo .env con MONGODB_URI:

```powershell
# 1. Importar clientes
cd Backend
node scripts/import_clients_from_legacy.js --orders "data/legacy/ordenesfinal.csv" --clients "data/legacy/clientesfinal.csv" --vehicles "data/legacy/automovilfinal.csv" --companyMap "2:68cb18f4202d108152a26e4c,3:68c871198d7595062498d7a1" --progressInterval 50

# 2. Importar órdenes
node scripts/import_orders_from_legacy.js --orders "data/legacy/ordenesfinal.csv" --clients "data/legacy/clientesfinal.csv" --vehicles "data/legacy/automovilfinal.csv" --orderProducts "data/legacy/relaorder.csv" --products "data/legacy/productos.csv" --orderServices "data/legacy/relaservice.csv" --services "data/legacy/servicios.csv" --remisions "data/legacy/remisions.csv" --companyMap "2:68cb18f4202d108152a26e4c,3:68c871198d7595062498d7a1" --progressInterval 50
```

---

## 🐛 Solución de Problemas

### La consola se detiene sin mostrar nada:
1. Verifica que los archivos CSV existan en las rutas especificadas
2. Verifica que MongoDB esté corriendo y accesible
3. Usa `--progressInterval 10` para ver progreso más frecuente
4. Agrega `--limit 10` para probar con muy pocos registros

### Error de conexión a MongoDB:
- Verifica que la URI sea correcta
- Verifica que MongoDB esté corriendo
- Si es Atlas, verifica que tu IP esté en la whitelist

### Error de archivo no encontrado:
- Verifica las rutas de los archivos CSV
- Usa rutas absolutas si es necesario: `C:\ruta\completa\archivo.csv`

---

## 🧹 Limpieza de Datos Legacy (Opcional)

Si necesitas eliminar datos legacy anteriores antes de reimportar, usa este script:

### Paso 1: Preview (Ver qué se eliminaría)

```powershell
cd Backend
$env:MONGODB_URI = "TU_MONGODB_URI"
node scripts/clean_legacy_imports.js --mongo "$env:MONGODB_URI" --dry
```

### Paso 2: Limpieza Real

```powershell
cd Backend
$env:MONGODB_URI = "TU_MONGODB_URI"
node scripts/clean_legacy_imports.js --mongo "$env:MONGODB_URI" --force
```

### Limpiar solo empresas específicas:

```powershell
cd Backend
$env:MONGODB_URI = "TU_MONGODB_URI"
node scripts/clean_legacy_imports.js --mongo "$env:MONGODB_URI" --force --companyIds "68cb18f4202d108152a26e4c,68c871198d7595062498d7a1"
```

**⚠️ ADVERTENCIA:** Este script elimina:
- Ventas marcadas como legacy (`legacyOrId` o notas con `LEGACY or_id=`)
- Vehículos no asignados con `source: 'import'`
- Perfiles de clientes con placas sintéticas (`CATALOGO-*` o `CLIENT-*`)

**💡 Recomendación:** Siempre ejecuta primero con `--dry` para ver qué se eliminaría.

---

## 📊 Resultados Esperados

### Después de importar clientes:
- ✅ Clientes creados/actualizados
- 🚗 Vehículos asignados automáticamente (matching exacto)
- ⚠️ Vehículos pendientes de aprobación (matching por similitud o sin matching)

### Después de importar órdenes:
- ✅ Ventas importadas con todos los productos y servicios
- 📦 Items detallados en cada venta
- 💰 Totales calculados correctamente
- 📝 Notas con información legacy preservada

