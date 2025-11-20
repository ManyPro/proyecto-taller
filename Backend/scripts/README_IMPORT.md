# Importación de Datos Legacy

Este directorio contiene el script unificado para importar datos desde el sistema legacy.

## Archivos Necesarios

Los archivos CSV deben estar en `Backend/scripts/excels/`:

- `ordenesfinal.csv` - Órdenes del sistema legacy
- `clientesfinal.csv` - Clientes del sistema legacy
- `automovilfinal.csv` - Vehículos del sistema legacy
- `remis.csv` - Remisiones (productos y servicios por orden)
- `productos.csv` - Catálogo de productos
- `servicios.csv` - Catálogo de servicios

## Uso

### Importación Básica

```bash
node scripts/import_legacy_unified.js \
  --mongo "mongodb+srv://user:pass@cluster.mongodb.net/?retryWrites=true&w=majority" \
  --companyMap "1:<mongoIdEmpresa1>,3:<mongoIdCasaRenault>"
```

### Modo Dry Run (Simulación)

Para ver qué haría el script sin guardar nada:

```bash
node scripts/import_legacy_unified.js \
  --mongo "mongodb+srv://..." \
  --companyMap "1:<id1>,3:<id3>" \
  --dry
```

### Con Límite de Registros

Para probar con un número limitado de registros:

```bash
node scripts/import_legacy_unified.js \
  --mongo "mongodb+srv://..." \
  --companyMap "1:<id1>,3:<id3>" \
  --limit 100
```

## Parámetros

- `--mongo`: URI de conexión a MongoDB (requerido a menos que uses `MONGODB_URI` en variables de entorno)
- `--companyMap`: Mapeo de empresas legacy a MongoDB IDs. Formato: `"1:<id1>,3:<id3>"`
- `--dry`: Modo simulación (no guarda nada)
- `--limit`: Limitar número de registros a procesar
- `--delimiter`: Delimitador CSV (por defecto: `;`)
- `--encoding`: Codificación de archivos (por defecto: `utf8`)
- `--progressInterval`: Mostrar progreso cada N registros (por defecto: 50)

## Mapeo de Empresas

**IMPORTANTE**: Casa Renault importa empresas **1 y 3** (no 2 y 3).

Para obtener los IDs de MongoDB de las empresas:

1. Conecta a tu base de datos MongoDB
2. Ejecuta: `db.companies.find({}, {_id: 1, name: 1, email: 1})`
3. Identifica los IDs correspondientes a las empresas que quieres importar

## Características

### Matching Inteligente de Vehículos

El script es **muy permisivo** con los cilindrajes:

- `1600` = `1.6`
- `2000` = `2.0`
- `1300` = `1.3` (incluyendo "1.3 TURBO" o "1.3T")
- `1300` = `1.3 turbo`

Si un vehículo no matchea, se guarda en **Pendientes** (`UnassignedVehicle`) para que puedas:
- Rechazar la creación del cliente
- Seleccionar el vehículo correcto manualmente

### Progreso en Consola

El script muestra:
- **Barra de progreso visual** con porcentaje completado
- **Contadores en tiempo real**: creados, actualizados, sin cambios, etc.
- **ETA** (tiempo estimado de finalización)
- **Resumen final** con estadísticas completas

### Importación de Órdenes

Todas las órdenes se importan como **ventas cerradas** con:
- Productos y servicios desde la BD legacy
- Fecha de la orden
- Kilometraje del vehículo en ese momento
- Datos completos del cliente

Esto permite ver en el historial:
- Qué se le hizo al cliente
- Cuándo se hizo
- El kilometraje del carro en ese momento

## Ejecución en la Nube

Para ejecutar el import en la nube o en segundo plano, se recomienda:

### Opción 1: Railway (Recomendado)

1. Crea una cuenta en [Railway](https://railway.app)
2. Crea un nuevo proyecto
3. Agrega un servicio "Empty Service"
4. Sube los archivos CSV a Railway
5. Configura las variables de entorno:
   - `MONGODB_URI`: Tu URI de MongoDB
   - `COMPANY_MAP`: `"1:<id1>,3:<id3>"`
6. Ejecuta el script desde la terminal de Railway

**Ventajas**:
- Gratis para empezar
- Terminal integrada
- Fácil de configurar
- No requiere servidor propio

### Opción 2: Render

1. Crea una cuenta en [Render](https://render.com)
2. Crea un "Background Worker"
3. Sube el código y archivos CSV
4. Configura variables de entorno
5. Ejecuta el script

**Ventajas**:
- Plan gratuito disponible
- Ejecución en segundo plano
- Logs en tiempo real

### Opción 3: Heroku

1. Crea una cuenta en [Heroku](https://heroku.com)
2. Crea una nueva app
3. Sube el código con Git
4. Configura variables de entorno
5. Ejecuta: `heroku run node scripts/import_legacy_unified.js ...`

**Ventajas**:
- Muy estable
- Terminal integrada
- Plan gratuito limitado

### Opción 4: AWS EC2 / Google Cloud / Azure

Si ya tienes infraestructura en la nube, puedes:
1. Crear una instancia pequeña (t2.micro en AWS es gratis por 12 meses)
2. Subir los archivos CSV
3. Ejecutar el script desde SSH

## Solución de Problemas

### Error: "Falta --mongo o MONGODB_URI"

Asegúrate de proporcionar la URI de MongoDB:
```bash
--mongo "mongodb+srv://user:pass@cluster.mongodb.net/..."
```

O configura la variable de entorno:
```bash
export MONGODB_URI="mongodb+srv://..."
```

### Error: "Debes proporcionar el mapeo de empresas 1 y 3"

Asegúrate de proporcionar el mapeo correcto:
```bash
--companyMap "1:507f1f77bcf86cd799439011,3:507f191e810c19729de860ea"
```

### El script se detiene o es muy lento

- Usa `--limit` para probar con menos registros primero
- Verifica que los archivos CSV no estén corruptos
- Asegúrate de tener buena conexión a MongoDB

### Muchos vehículos en Pendientes

Esto es normal. El script guarda en Pendientes los vehículos que no puede matchear automáticamente. Puedes:
1. Revisar la pestaña "Pendientes" en el panel de admin
2. Seleccionar el vehículo correcto manualmente
3. O rechazar la creación del cliente

## Notas Importantes

- El script es **idempotente**: puedes ejecutarlo múltiples veces sin duplicar datos
- Los clientes se buscan por `identificationNumber` o placa sintética
- Las órdenes se buscan por `legacyOrId` para evitar duplicados
- El script muestra progreso en tiempo real con porcentaje completado

