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

## Importación (Órdenes legacy por placa)
Importa órdenes históricas (solo empresas legacy 2=Shelby y 3=Casa Renault por defecto) y las enlaza por placa creando ventas cerradas con los datos disponibles. Incluye un marcador en `notes` para idempotencia: `LEGACY or_id=<N> empresa=<2|3>`.

1. Ejecuta en modo simulación (dry-run) para validar conteos:

```
npm run import:legacy:orders -- --orders path/a/ordenesfinal.csv --clients path/a/clientesfinal.csv --vehicles path/a/automovilfinal.csv --dry
```

2. Importar a Mongo (pasa `--mongo` o define `MONGODB_URI`):

```
npm run import:legacy:orders -- --orders path/a/ordenesfinal.csv --clients path/a/clientesfinal.csv --vehicles path/a/automovilfinal.csv --mongo "${MONGODB_URI}"
```

Parámetros útiles:
- `--companyMap 2:<mongoIdShelby>,3:<mongoIdRenault>` para ajustar IDs reales de tu DB.
- `--limit 1000` para pruebas.
- `--noProfile` si no deseas actualizar/crear `CustomerProfile` durante la importación.

Notas:
- Si `or_fecha_entrega` está vacía se usa `or_fecha` como `closedAt`.
- Se guardan `customer` y `vehicle` mínimos (placa, cilindraje como `engine`, `year`, `mileage`).
- Las observaciones se guardan en `notes` junto con el marcador LEGACY para evitar duplicados en re-ejecuciones.

### Company IDs (produccion)
Puedes fijar los IDs reales de cada empresa por cualquiera de estas opciones (prioridad descendente):
- Bandera: `--companyMap "2:<ID_SHELBY>,3:<ID_RENAULT>"`
- Variable: `COMPANY_MAP=2:<ID_SHELBY>,3:<ID_RENAULT>`
- Variables dedicadas: `COMPANY_ID_SHELBY` y `COMPANY_ID_RENAULT` (o `COMPANY_ID_2`, `COMPANY_ID_3`)

### Ubicacion de CSVs
Sugerido: `Backend/data/legacy/` (excluido del repo por .gitignore). Ejemplo:
```
npm run import:legacy:orders -- --orders Backend/data/legacy/ordenesfinal.csv --clients Backend/data/legacy/clientesfinal.csv --vehicles Backend/data/legacy/automovilfinal.csv --mongo "${MONGODB_URI}"
```

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

## Técnico asignado en ventas

Cada venta (`Sale`) ahora incluye el campo `technician` (string, mayúsculas) para asignar rápidamente la persona responsable del trabajo.

Campo en modelo:
```js
technician: { type: String, default: '' }
```

Endpoint para actualizar mientras la venta está en estado `draft`:
```
PATCH /api/v1/sales/:id/technician
{ "technician": "DAVID" }
```

## Reset de contraseña (empresas)

Flujo implementado para permitir a una empresa restablecer su contraseña.

### 1. Solicitar reset
`POST /api/v1/auth/company/password/forgot`
Body:
```json
{ "email": "empresa@dominio.com" }
```
Respuesta siempre `{ ok: true }` (no filtra si el correo existe). En entorno no productivo incluye:
```json
{ "ok": true, "debugToken": "<token>", "resetUrl": "http://.../reset.html?token=...&email=..." }
```

### 2. Enlace de reset
El email debe contener un enlace hacia el frontend:
```
<FRONTEND_BASE_URL>/reset.html?token=<token>&email=<correo>
```
Configura `FRONTEND_BASE_URL` en variables de entorno para que el backend construya la URL (fallback: header Origin).

### 3. Consumir el token
`POST /api/v1/auth/company/password/reset`
Body:
```json
{ "email": "empresa@dominio.com", "token": "<tokenPlano>", "password": "NuevaPass123" }
```
Requisitos:
- Token válido, sin expirar (30 minutos) y no usado.
- Al aplicar el reset se invalida (se borran hash y expiración).

### Campos añadidos al modelo `Company`
```js
passwordResetTokenHash: String
passwordResetExpires: Date
```

### Seguridad
- El token se guarda hasheado (`bcrypt`) y se compara en el reset.
- Expiración de 30 minutos (`passwordResetExpires`).
- Respuesta del endpoint `forgot` es genérica (no revela si el correo existe).
- Recomendación: añadir un rate-limit externo en producción.

### Frontend
- Página `forgot.html` permite solicitar enlace.
- Página `reset.html` captura `token` y `email`, y ejecuta el cambio de contraseña.
- En modo desarrollo se expone `debugToken` y `resetUrl` para pruebas rápidas.

Responde el documento de la venta actualizado.

Reglas:
- Solo editable cuando `status === 'draft'`.
- Se guarda en mayúsculas (`DAVID`, `VALENTIN`, etc.).
- No afecta el cierre ni el cómputo de totales.

Frontend: barra superior de Ventas muestra “cápsulas” para cada venta abierta con placa, técnico y total. Un selector permite cambiar el técnico. La lista ya NO está hardcodeada: se carga dinámicamente de `Company.technicians` y puede ampliarse con el botón “+ Téc” (tanto en la barra como en el modal de cierre). 

Ejemplo de flujo: usuario pulsa “+ Téc”, ingresa nombre → se persiste vía `POST /api/v1/company/technicians` y ambos selects (externo y modal de cierre) se repueblan.

## Cierre de ventas: pago y mano de obra

Al cerrar una venta ahora se pueden registrar datos adicionales:

Campos añadidos al modelo `Sale`:
```js
paymentMethod: String
paymentReceiptUrl: String
laborValue: Number          // valor base de mano de obra
laborPercent: Number        // % asignado al técnico
laborShare: Number          // valor calculado = laborValue * laborPercent / 100
// Técnicos (histórico)
technician: String          // técnico actual (legacy / compatibilidad)
initialTechnician: String   // técnico asignado al iniciar (primera vez)
closingTechnician: String   // técnico registrado al cerrar
technicianAssignedAt: Date  // timestamp cuando se asignó por primera vez
technicianClosedAt: Date    // timestamp de cierre (cuando se registra closingTechnician)
```

Endpoint de cierre:
```
POST /api/v1/sales/:id/close
Body opcional:
{
	"paymentMethod": "EFECTIVO|TRANSFERENCIA|TARJETA|OTRO",
	"technician": "NOMBRE",
	"laborValue": 120000,
	"laborPercent": 40,
	"paymentReceiptUrl": "https://.../uploads/comprobante.png"
}
```
Validaciones:
- `laborValue` ≥ 0
- `laborPercent` entre 0 y 100
- Si ambos existen se calcula y persiste `laborShare`.
- Si se envía `technician` y la venta no tiene aún `initialTechnician`, se guarda también allí y se marca `technicianAssignedAt`.
- Al cerrar, si llega `technician`, se establece además `closingTechnician` y `technicianClosedAt`. Si no había `initialTechnician` todavía, se rellena para mantener consistencia.

### Notas sobre técnicos
- `technician` se mantiene por compatibilidad y refleja el técnico "actual" (en cierre coincide con el de cierre).
- Reportes futuros pueden usar `initialTechnician` para saber quién empezó y `closingTechnician` para quién finalizó.
- Si el técnico no cambia durante el flujo, los tres (`technician`, `initialTechnician`, `closingTechnician`) quedarán con el mismo valor.

## Técnicos y preferencias por empresa

Se añadieron campos al modelo `Company`:
```js
technicians: [String]              // lista configurable
preferences: { laborPercents: [Number] } // porcentajes sugeridos
```

Endpoints:
```
GET    /api/v1/company/technicians
POST   /api/v1/company/technicians        { name }
DELETE /api/v1/company/technicians/:name

GET    /api/v1/company/preferences
PUT    /api/v1/company/preferences        { laborPercents: [30,40,50] }
```

## Reporte de técnicos (participación mano de obra)

Endpoint (filtra por fecha de cierre `closedAt`):
```
GET /api/v1/sales/technicians/report?from=YYYY-MM-DD&to=YYYY-MM-DD&technician=NOMBRE&page=1&limit=100
```
Parámetros (opcionales):
- `from`, `to`: rango de fechas (usa `createdAt` / cierre) en formato `YYYY-MM-DD`.
- `technician`: filtra por cualquier coincidencia en `technician`, `initialTechnician` o `closingTechnician`.
- `page`, `limit`: paginación (por defecto `page=1`, `limit=100`, máx 500).

Respuesta:
```jsonc
{
	"filters": { "from": "2025-10-01", "to": "2025-10-31", "technician": "DAVID" },
	"pagination": { "page":1, "limit":100, "total":42, "pages":1 },
	"aggregate": {
		"laborShareTotal": 1230000,     // suma de laborShare en rango
		"salesTotal": 8500000,          // suma de total de ventas
		"count": 42                     // cantidad de ventas consideradas
	},
	"items": [
		{
			"_id": "...",
			"number": 15,
			"createdAt": "...",
			"closedAt": "...",
			"vehicle": { "plate": "ABC123" },
			"customer": { "name": "Cliente Ejemplo" },
			"technician": "DAVID",
			"initialTechnician": "DAVID",
			"closingTechnician": "DAVID",
			"laborValue": 120000,
			"laborPercent": 40,
			"laborShare": 48000,
			"total": 300000
		}
	]
}
```

Notas:
- Si el técnico cambió en el proceso se pueden ver ambos (`initialTechnician` → `closingTechnician`).
- El filtro por `technician` considera coincidencia en cualquiera de los tres campos.
- La UI del frontend muestra: filtros arriba, resumen (ventas, total ventas, participación total) y debajo el historial paginado.
Notas:
- Nombres de técnicos se almacenan en mayúsculas y sin duplicados.
- `laborPercents` se deduplica y ordena ascendente (0–100).
- El frontend usa esta lista para ofrecer selección rápida del % de mano de obra.

## Flujo frontend de cierre
1. Botón "Cerrar venta" abre modal.
2. Usuario selecciona método de pago, técnico, valor mano de obra y % (de la lista o manual).
3. (Opcional) Sube comprobante -> se obtiene URL y se envía en el cierre.
4. Backend descuenta inventario y guarda datos de pago/labor.
5. `laborShare` queda listo para reportes futuros por técnico.

## Feature flags por empresa (UI/BE)

Cada empresa puede habilitar/deshabilitar módulos principales mediante `Company.features`:

```jsonc
{
	"notas": true,
	"ventas": true,
	"cotizaciones": true,
	"inventario": true,
	"precios": true,
	"cashflow": true,
	"templates": true,
	"skus": true,
	"techreport": true
}
```

Endpoints:

```
GET    /api/v1/company/features
PATCH  /api/v1/company/features   { "cashflow": false }
```

Notas:
- Si un flag no existe, se considera habilitado (backward compatible).
- El frontend oculta pestañas según estos flags.
- El backend protege `cashflow` con un chequeo de feature (retorna 403 si está deshabilitado).


### Envío real de correos (SMTP)

Para enviar el email de recuperación configura estas variables en `.env` del backend:

```
SMTP_HOST=smtp.tu-proveedor.com
SMTP_PORT=587            # 465 si usas SSL directo
SMTP_USER=usuario@dominio.com
SMTP_PASS=contraseña_o_api_key
MAIL_FROM="Taller App <no-reply@dominio.com>"   # opcional, usa SMTP_USER si no se define
FRONTEND_BASE_URL=https://tu-frontend.com        # base para construir el enlace reset
```

Si faltan las variables SMTP el sistema no falla: registra en consola un mensaje
`[mailer] Falta configuración SMTP` y simula el envío (`[mailer:DEV]`).

El correo generado incluye:
- Texto: instrucciones y enlace válido 30 minutos.
- HTML: link clickeable.

Buenas prácticas:
1. Añade un rate limit (por IP y por email) a `/api/v1/auth/company/password/forgot`.
2. Configura SPF/DKIM en tu dominio para evitar spam.
3. Considera un servicio transaccional (SendGrid / Resend / SES) si tu SMTP es inestable.
4. No cambies la respuesta JSON genérica para no revelar si un correo existe.

Prueba sin SMTP (dev):
1. No definas las variables.
2. Haz la solicitud.
3. Observa en la respuesta `debugToken` y en consola el log simulado.
4. Usa la `resetUrl` para completar el flujo.

## Despliegue seguro de Catálogo Público (Migración de metadatos de publicación)

Antes de habilitar el catálogo público y los toggles de publicación en producción, ejecuta un backfill para asegurar que todos los ítems ya publicados tengan `publishedAt` (y opcionalmente `publicPrice`).

### Objetivo del script
`Backend/scripts/backfill_publication_metadata.js`:
- Rellena `publishedAt` con `createdAt` (o `Date.now()` si falta) cuando `published=true` y no existe.
- Asigna `publicPrice = salePrice` sólo si `publicPrice` está `undefined` (no lo toca si es 0 u otro valor definido).
- No modifica `publishedBy` (si falta lo deja en `null`).
- Idempotente (puedes correrlo varias veces).

### Pasos recomendados
1. Crea un backup de tu base de datos (dump Mongo completo).
2. Despliega el nuevo código (sin activar frontend público todavía) y verifica logs de arranque.
3. Ejecuta el script de backfill:
	```powershell
	node ./Backend/scripts/backfill_publication_metadata.js MONGODB_URI="mongodb://localhost:27017" COMPANY_ID="<opcionalCompanyId>"
	```
4. Revisa el resumen: `Items updated` y muestras de cambios.
5. (Opcional) Ejecuta una consulta rápida en Mongo para validar:
	```js
	db.items.find({ published: true, publishedAt: { $exists: false } }).count()
	```
	Debe devolver `0`.
6. Habilita la UI de catálogo público y prueba endpoints:
	- `GET /public/catalog/items`
	- `GET /public/catalog/items/:id`
	- `GET /public/catalog/sitemap.xml`
7. Monitorea rendimiento y rate limit en logs (IPs recurrentes / 429).
8. Configura monitoreo básico (CPU, memoria, latencia).

### Rollback
Si necesitas revertir:
- Restaura el backup de Mongo.
- Reinstala la versión anterior del código.

### Troubleshooting rápido
| Síntoma | Posible causa | Acción |
|--------|---------------|--------|
| `Items updated = 0` pero faltan fechas | Items no tenían `published=true` | Verifica que realmente deban estar publicados y realiza `PATCH` para publicarlos, publicaAt se asignará automáticamente |
| Catálogo vacío | Ningún ítem con `published=true` | Publica ítems desde panel interno |
| 429 frecuentes | Rate limit agresivo | Ajusta bucket/ventana en middleware (server.js) |
| Descripciones con HTML recortado | Sanitización eliminó etiquetas no permitidas | Revisa allowlist, edita descripción con solo etiquetas soportadas |

### Próximos pasos sugeridos
- Endpoint futuro para promociones dinámicas.
- Estadísticas de clics / vistas en catálogo.
- Revisión periódica de XSS via auditoría automática.

## Catálogo Público Segmentado por Empresa

Ahora cada endpoint del catálogo público exige un `:companyId` en la ruta para evitar mezclar ítems de distintas empresas y garantizar aislamiento:

Endpoints:
```
GET    /api/v1/public/catalog/:companyId/items?page=1&limit=20&q=SKU123&category=FILTROS&tags=FRENO,MOTOR&stock=1
GET    /api/v1/public/catalog/:companyId/items/:id
GET    /api/v1/public/catalog/:companyId/customer?idNumber=123456
POST   /api/v1/public/catalog/:companyId/checkout
GET    /api/v1/public/catalog/:companyId/sitemap.xml
GET    /api/v1/public/catalog/:companyId/sitemap.txt
GET    /api/v1/public/catalog/:companyId/feed.csv?key=SECRET
```

Reglas y validaciones:
- `companyId` debe ser un ObjectId válido y la empresa debe estar `active=true`.
- Listado filtra siempre por `{ published: true, companyId }`.
- El detalle (`items/:id`) retorna 404 si el ítem no pertenece a la empresa o no está publicado.
- Checkout valida que todos los ítems solicitados pertenezcan a la misma empresa.
- Rate limit diferencia buckets por empresa (`public:<companyId>`, `checkout:<companyId>`).
- Sitemap y feed generan URLs con el segmento `/:companyId/`.

Impacto en frontend:
- `catalogo.html` ahora requiere `?companyId=<id>` o un atributo `data-company-id` para cargar ítems.
- Botón “Catálogo público” en `inventario.html` abre una nueva pestaña con la URL segmentada.

Consideraciones SEO:
- Si cada empresa debe indexar su catálogo, proporcionar enlaces internos al sitemap: `/api/v1/public/catalog/<companyId>/sitemap.xml`.
- Para subdominios futuros, se puede mapear `companyId` a slug y reescribir rutas.

Seguridad:
- No se exponen datos de otras empresas por error de filtrado.
- Flag `publicCatalogEnabled` controla si la empresa expone el catálogo (si está en false, endpoints devuelven 404).

### Flag de habilitación `publicCatalogEnabled`

Campo en modelo `Company`:
```js
publicCatalogEnabled: { type: Boolean, default: false }
```
Mientras esté en `false` los endpoints bajo `/api/v1/public/catalog/:companyId/*` retornan:
```json
{ "error": "Catálogo no habilitado para esta empresa" }
```

Activar / desactivar:
```
PATCH /api/v1/company/public-catalog
{ "enabled": true } // o false
```
Respuesta:
```json
{ "publicCatalogEnabled": true }
```

Incluido en autenticación:
```
POST /api/v1/auth/company/login
POST /api/v1/auth/company/register
GET  /api/v1/auth/company/me
// -> company: { id, name, email, publicCatalogEnabled }
```

Frontend: botón “Catálogo público” se deshabilita si `publicCatalogEnabled === false`.

Script opcional para habilitar masivamente (idempotente):
```js
// Backend/enable-public-catalog-all.js
import mongoose from 'mongoose';
import Company from './src/models/Company.js';
await mongoose.connect(process.env.MONGODB_URI);
const res = await Company.updateMany({ publicCatalogEnabled: { $ne: true } }, { $set: { publicCatalogEnabled: true } });
console.log('Empresas habilitadas:', res.modifiedCount);
await mongoose.disconnect();
```
Ejecución:
```powershell
node ./Backend/enable-public-catalog-all.js MONGODB_URI="mongodb://localhost:27017/tu-db"
```

Checklist antes de ponerlo en `true`:
1. Backfill de metadatos (script).
2. Revisar sanitización de `publicDescription`.
3. Confirmar rate limits.
4. Activar flag.
5. Validar carga y checkout.

Migración desde versión previa (sin segmentación):
1. Actualizar frontend para incluir `companyId` en URLs (o usar botón generado internamente tras login).
2. Verificar que los ítems existentes tengan `companyId` correcto (parte del modelo ya presente).
3. Invalidar caches anteriores (cambiar `CACHE_VERSION`).
4. Revisar analytics / logs para adaptar dashboards a nuevo patrón de ruta.

