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

Frontend: barra superior de Ventas muestra “cápsulas” para cada venta abierta con placa, técnico y total. Un selector permite cambiar el técnico (lista fija configurable en el front por empresa).

Técnicos sugeridos (ejemplo Casa DUSTER): `DAVID, VALENTIN, SEDIEL, GIOVANNY, SANDRA`.

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

