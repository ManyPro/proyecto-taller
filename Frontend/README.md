# Taller Frontend (Vanilla JS + Netlify)

1) Edita `assets/config.js` y coloca la URL de tu backend desplegado.
2) Abre `index.html` en local para probar, o súbelo a Netlify.

El login es por **empresa** (email/contraseña). Cada empresa ve sus propios datos.

## Flujo Cotización → Venta

Ahora puedes reutilizar una cotización existente para crear / completar una venta (y su orden de trabajo preliminar) directamente desde la pestaña **Ventas**.

### 1. Cargar una cotización
- En la pestaña Ventas haz clic en: `Cargar cotización` (botón con id `sv-loadQuote`).
- Se abre un modal con buscador (cliente o placa) y listado paginado.
- Usa el campo de búsqueda y presiona "Buscar".
- Navega con los botones ◀ / ▶ (paginación basada en `metadata` del backend: `page`, `pages`, `hasPrev`, `hasNext`).
- Haz clic en una cotización para que se muestre en el panel mini (lado derecho). Se guarda en `localStorage` el último id (`sales:lastQuoteId`) para restaurar al recargar.

### 2. Pasar ítems individuales
Cada línea de la cotización tiene un botón "→". Al hacer clic:
- Si no existe una venta abierta, se crea automáticamente una nueva (estado `draft`).
- El item se agrega a la tabla de venta con su cantidad y precio.
- La fila en el panel de la cotización queda marcada (✔) y deshabilitada para evitar duplicados accidentales.

### 3. Pasar todos los ítems (batch)
- Usa el botón "Pasar TODO a venta" (id `sv-q-to-sale`).
- Internamente ahora se envía **un solo request** al endpoint batch: `POST /api/v1/sales/:id/items/batch`.
- Ventajas: menos latencia, consistencia de totales y reducción de errores parciales.
- Si algún item falla (ej. SKU inventario inexistente) se ignora silenciosamente. (Se puede mejorar devolviendo un summary de errores: futuro opcional.)

### 4. Aplicar datos de cliente y vehículo
- Botón "Aplicar cliente/vehículo" (id `sv-applyQuoteCV`).
- Crea la venta si no existe y luego mapea:
	- `quote.customer.{name,phone,email}` → `sale.customer`
	- `quote.vehicle.{plate,make,line,modelYear,displacement}` → `sale.vehicle.{plate,brand,line,year,engine}` (conversión a MAYÚSCULAS cuando aplica)
- Guarda y refresca el mini resumen.

### 5. Cerrar la venta
- Después de agregar ítems y/o ajustar datos, pulsa "Cerrar" para que se descuente inventario de líneas con `source: 'inventory'` y se genere el número secuencial.

## Endpoint Batch (Backend)

`POST /api/v1/sales/:id/items/batch`

Payload:
```json
{
	"items": [
		{ "source": "inventory", "refId": "..." },
		{ "source": "service", "sku": "MAN-001", "name": "Mano de obra", "qty": 2, "unitPrice": 50000 }
	]
}
```

Reglas:
- `source` soportado: `inventory`, `price`, `service`.
- `inventory`: admite `refId` o `sku`; toma `salePrice` si `unitPrice` no viene.
- `price`: con `refId` (usa PriceEntry) o línea manual (`name`, `unitPrice`).
- `service`: línea manual; se almacena como `service` (mismo mecanismo que antes).
- Calcula totales una sola vez y publica evento SSE `sale:updated`.

## Persistencia de última cotización
Al cargar una cotización se guarda `sales:lastQuoteId`. Si vuelves a la pestaña Ventas o recargas la página, el panel intenta restaurarla (`API.quoteGet`).

## Paginación de cotizaciones (Frontend)
- Se solicita con `?page=N&pageSize=25&q=texto`.
- Si la respuesta es el nuevo formato `{ metadata, items }`, se usan `metadata.page`, `metadata.pages`, `hasPrev`, `hasNext` para habilitar botones.
- Si (por compatibilidad) llega un array plano, se asume sin metadata y se deshabilita Prev en página 1; Next se habilita sólo si la longitud alcanza `pageSize`.

## Marcado visual de ítems agregados
Cuando un ítem pasa a la venta:
- Se añade clase `added` a la fila y el botón se transforma en ✔ deshabilitado.
- En batch se marcan todas las filas al finalizar.

## Aplicar cliente/vehículo desde la cotización
La función `applyQuoteCustomerVehicle()` mapea campos y llama a `PUT /api/v1/sales/:id/customer-vehicle`. Normaliza a mayúsculas `plate`, `brand`, `line`, `engine`.

## Errores parciales en batch (consideraciones)
El controlador actual ignora silenciosamente ítems inválidos. Próxima mejora sugerida:
- Acumular: `errors: [ { index, message } ]` y retornarlo junto con la venta.
- Mostrar un aviso en el frontend si `errors.length > 0`.

## Siguientes mejoras sugeridas (opcionales)
- Summary de errores en batch.
- Filtro adicional por rango de fechas en el modal de cotizaciones.
- Botón para volver a cargar (refresh) la cotización ya mostrada y detectar cambios.

## Tema Claro / Oscuro

Se agregó soporte de tema claro sin perder los contrastes del diseño original oscuro.

### Cómo funciona
- Todas las superficies y colores dependen de variables CSS en `:root` (`--bg`, `--card`, `--text`, etc.).
- El tema claro se activa añadiendo la clase `theme-light` al `<body>`.
- El botón con id `themeToggle` en el header cambia entre modos y guarda la preferencia en `localStorage` (`app:theme`).
- Si no hay preferencia guardada, se detecta `prefers-color-scheme` del sistema.

### Variables clave añadidas
`--card-alt`, `--border`, `--input-bg`, `--scroll-track`, `--scroll-thumb`, `--focus-ring`, `--table-head`, `--badge-bg`, además de `--text-invert` para botones/accentos.

### Extender componentes
Usa variables existentes en lugar de colores fijos. Si necesitas un nuevo color, define primero la variable en `:root` y opcionalmente override en `body.theme-light`.

### Accesibilidad
El contraste para texto principal en claro/dark se mantiene ≥ WCAG AA sobre sus superficies (`--text` sobre `--bg` / `--card`). Evita insertar colores duros manuales en nuevos componentes.

---
Última actualización de esta sección: (cotización→venta + batch + paginación) 

## Ítems de Inventario y Lista de Precios en Cotizaciones

Ahora puedes insertar directamente productos del inventario y registros de la lista de precios dentro de una cotización. Esto permite que, al convertir o reutilizar esa cotización en una venta, las líneas que provienen de inventario descuenten stock al cerrar la venta.

### Cómo agregar
En la sección de Ítems de la cotización:
- Botón "+ Agregar línea" (manual) sigue funcionando igual.
- Nuevos botones: "Desde inventario" y "Desde lista de precios" abren pickers livianos.

Picker Inventario:
1. Filtros rápidos por SKU / Nombre.
2. Lista (máx 25 resultados) con precio de venta.
3. Al hacer clic en "Agregar" se crea una fila tipo PRODUCTO con metadata.

Picker Lista de Precios:
1. Filtros por Marca / Línea (extensible a Motor / Año si se requiere).
2. Inserta fila tipo SERVICIO (por naturaleza del catálogo de precios) con su valor total.

### Metadata almacenada por ítem
Cada fila puede contener los atributos opcionales:
```jsonc
{
	"source": "inventory" | "price" | "manual", // default manual
	"refId": "<ObjectId del Item o PriceEntry>",
	"sku": "<SKU si aplica>",
	"type": "PRODUCTO" | "SERVICIO",
	"desc": "Descripción visible",
	"qty": 1,
	"price": 12345
}
```

Se guardan al persistir la cotización (`POST/PUT /quotes`) y también en el borrador local. Para cotizaciones antiguas (sin estos campos) todo sigue funcionando; se consideran `source:"manual"` y no afectarán stock al trasladarse a ventas.

### Traslado a Venta respetando origen
Al cargar una cotización en la pestaña Ventas:
- Items `source:"inventory"` generan payload `{ source:"inventory", refId, sku? }` → permitirán descuento de stock al cerrar.
- Items `source:"price"` generan `{ source:"price", refId }`.
- Items `source:"manual"` (o sin source) se tratan como `service` con nombre y precio manual.

Esto se aplica tanto al botón individual (→) como al batch "Pasar TODO a venta" usando el endpoint de items batch.

### Beneficios
- Uniformidad: una sola fuente de verdad (la cotización) para construir la venta.
- Stock confiable: evita volver a buscar manualmente en inventario al facturar.
- Auditoría: el origen del precio queda explícito.

### Posibles mejoras futuras
- Mostrar un badge visual en la fila (p.ej. INVENT / LISTA) para diferenciar origen.
- Filtro rápido en la cotización para ver sólo productos de inventario.
- Validación al editar una cotización si cambió el precio base de un PriceEntry (mostrar delta).

