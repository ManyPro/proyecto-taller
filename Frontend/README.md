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

---
Última actualización de esta sección: (cotización→venta + batch + paginación) 
