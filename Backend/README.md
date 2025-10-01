# Taller Backend (Multi-tenant con MongoDB + Express)

## Scripts
- `npm run dev` → desarrollo (nodemon)
- `npm start` → producción

## Variables de entorno (.env)
- `PORT` (default 4000)
- `MONGODB_URI` (cadena Atlas/local)
- `JWT_SECRET` (requerido)
- `ALLOWED_ORIGINS` (CSV de orígenes para CORS, usa * en dev)

<!-- Se eliminaron instrucciones de importación legacy y CSV en preparación para un nuevo flujo de migración -->

## Importación (Perfiles desde legacy órdenes CSV)
Script inicial para preparar/crear perfiles (cliente + vehículo) a partir del archivo `ordenes.csv` de la BD legacy.

1. Coloca el archivo `ordenes.csv` (delimitador por defecto `;`).
2. Ejecuta en modo dry-run para ver resumen y exportar JSON:

```
npm run prepare:profiles -- --orders path/a/ordenes.csv --jsonOut perfiles.json
```

3. Importar a Mongo (usa tu `MONGODB_URI` o pasa `--mongo` explícito):

```
npm run prepare:profiles -- --orders path/a/ordenes.csv --import --mongo "${MONGODB_URI}" 
```

Parámetros opcionales:
- `--companyMap 2:68cb18f4202d108152a26e4c,3:68c871198d7595062498d7a1` (por defecto ya incluidos)
- `--delimiter ;` (cambiar si el archivo usa coma)
- `--limit 500` (para pruebas)
- `--jsonOut salida.json` (exporta los perfiles detectados)

Nota: El script intenta mapear columnas potenciales (`placa`, `veh_placa`, etc.). Si los nombres difieren confirma las cabeceras para ajustar el mapeo.

## Autocompletado de cotizaciones por placa

Endpoint para que el Front obtenga datos existentes de cliente/vehículo al ingresar una placa:

`GET /api/quotes/lookup/plate/:plate`

Respuesta ejemplo:
```json
{
	"customer": { "name": "JUAN PEREZ", "phone": "3001234567", "email": "" },
	"vehicle": { "plate": "ABC123", "make": "RENAULT", "line": "LOGAN", "modelYear": "2018", "displacement": "1600" }
}
```

Uso esperado en el Front:
1. Usuario escribe placa.
2. Front hace debounce y llama endpoint.
3. Si hay respuesta, llena formulario (no bloquea la edición manual).
4. Al guardar la cotización o venta, los campos completados/añadidos actualizan el `CustomerProfile` incrementalmente.

### Reglas de actualización incremental del perfil
- Crea el perfil si no existe (companyId + plate).
- Solo completa campos vacíos (brand, line, engine, year, mileage, datos de cliente) salvo kilometraje que toma el mayor.
- De-duplica perfiles repetidos de la misma placa conservando el más completo.
- Ventas y cotizaciones disparan el mismo mecanismo unificado.

Parámetro opcional: `?fuzzy=true` permite coincidencias parciales y confundir 0/O al inicio de la placa.

### Notas
- En cotización los campos vienen como: `vehicle.make`, `vehicle.line`, `vehicle.modelYear`, `vehicle.displacement`.
- En ventas: `vehicle.brand`, `vehicle.line`, `vehicle.engine`, `vehicle.year`, `vehicle.mileage`.
- El helper hace los mapeos y normaliza a mayúsculas.

## Lookup en ventas
`GET /api/v1/sales/lookup/plate/:plate` (alias de `/profile/by-plate/:plate`) devuelve el perfil consolidado. Acepta `?fuzzy=true` igual que en cotizaciones.

## Overwrite opcional de datos
El helper acepta flags internos (a futuro se pueden exponer vía query o payload admin):
- `overwriteCustomer`
- `overwriteVehicle`
- `overwriteMileage`
- `overwriteYear`
Actualmente se usan en el endpoint de reconstrucción (ver abajo).

## Historial de cambios de perfiles
Se almacena cada acción en `CustomerProfileHistory` con:
- `action`: created | updated | unchanged
- `diff`: campos antes/después (solo cuando cambian)
- `source`: sale | quote | rebuild | script
- `snapshotAfter`: estado completo luego del cambio

Endpoint: `GET /api/v1/profiles/history?plate=ABC123&page=1&pageSize=25`

## Reconstrucción de perfiles
Permite regenerar perfiles desde todas las ventas y cotizaciones.

`POST /api/v1/profiles/rebuild?mode=append&overwrite=false&limit=50000`

Parámetros:
- `mode`: append (por defecto) | replace (elimina perfiles previos de la empresa antes)
- `overwrite`: true/false para forzar reemplazo de campos existentes
- `limit`: número máximo de documentos de cada colección a procesar

Respuesta:
```json
{ "processed": 123, "created": 100, "updated": 23 }
```
