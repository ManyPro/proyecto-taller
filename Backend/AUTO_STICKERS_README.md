# Funcionalidad de Stickers Automáticos

## Descripción
Esta funcionalidad genera automáticamente un PDF de stickers cada vez que se agrega stock a un item en el inventario.

## Características
- **Generación automática**: Al agregar stock a un item, se genera automáticamente un PDF con stickers
- **Cantidad personalizada**: Se genera un sticker por cada unidad de stock agregada
- **Stock individual y masivo**: Funciona tanto para agregar stock a un item como para agregar stock masivo
- **Descarga automática**: El PDF se descarga automáticamente en el navegador

## Cómo funciona

### Backend
1. **Función `generateAutoStickers`**: Genera un PDF con stickers usando PDFKit y QRCode
2. **Integración en `addItemStock`**: Modifica la función para generar stickers al agregar stock individual
3. **Integración en `addItemsStockBulk`**: Modifica la función para generar stickers al agregar stock masivo

### Frontend
1. **Detección de PDF**: El frontend detecta cuando la respuesta es un PDF
2. **Descarga automática**: Descarga automáticamente el PDF generado
3. **Feedback visual**: Muestra mensajes apropiados al usuario

## Archivos modificados

### Backend
- `Backend/src/controllers/inventory.controller.js`
  - Nueva función `generateAutoStickers()`
  - Modificación de `addItemStock()` para generar stickers
  - Modificación de `addItemsStockBulk()` para generar stickers masivos

### Frontend
- `Frontend/assets/js/inventory.js`
  - Modificación de la función de agregar stock individual
  - Modificación de la función de agregar stock masivo
  - Detección y descarga automática de PDFs

## Uso

### Agregar stock individual
1. Ve al inventario
2. Haz clic en "Agregar stock" en cualquier item
3. Ingresa la cantidad
4. Haz clic en "Agregar"
5. El PDF de stickers se descargará automáticamente

### Agregar stock masivo
1. Ve al inventario
2. Selecciona múltiples items
3. Haz clic en "Agregar stock (masivo)"
4. Ingresa las cantidades para cada item
5. Haz clic en "Agregar"
6. El PDF de stickers se descargará automáticamente

## Configuración

### Personalizar el nombre de la empresa
En `Backend/src/controllers/inventory.controller.js`, línea 60:
```javascript
companyName: 'CASA RENAULT H&H', // Cambiar por el nombre deseado
```

### Personalizar el tamaño de los stickers
En `Backend/src/controllers/inventory.controller.js`, líneas 66-68:
```javascript
const STICKER_W = 5 * CM; // 5 cm de ancho
const STICKER_H = 3 * CM; // 3 cm de alto
const MARGIN = 0.25 * CM; // 0.25 cm de margen
```

## Dependencias
- `pdfkit`: Para generar PDFs
- `qrcode`: Para generar códigos QR
- `mongoose`: Para acceso a la base de datos

## Pruebas
Para probar la funcionalidad, ejecuta:
```bash
cd Backend
node test-auto-stickers.js
```

## Notas técnicas
- Los stickers se generan con un código QR que contiene el SKU del item
- El PDF se genera en formato A4 con múltiples stickers por página
- La funcionalidad es opcional y no afecta el flujo normal si falla
- Los errores se registran en la consola pero no interrumpen el proceso
