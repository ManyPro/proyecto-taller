# Eliminar Ventas en Masa

## Uso desde la Consola del Navegador

1. Abre la consola del navegador (F12 o Ctrl+Shift+I)
2. Asegúrate de estar logueado en la empresa "SERVITECA SHELBY"
3. Ejecuta uno de los siguientes comandos:

### Eliminar todas las ventas con placa específica (solo draft)
```javascript
await API.sales.deleteBulk({ plate: 'HTQ648', limit: 1000 });
```

### Eliminar todas las ventas draft con esa placa (sin límite)
```javascript
await API.sales.deleteBulk({ plate: 'HTQ648', limit: 10000 });
```

### Eliminar ventas cerradas también (forzar)
```javascript
await API.sales.deleteBulk({ plate: 'HTQ648', force: true, limit: 10000 });
```

### Eliminar todas las ventas draft (sin filtrar por placa)
```javascript
await API.sales.deleteBulk({ status: 'draft', limit: 1000 });
```

## Parámetros disponibles:

- `plate`: Placa del vehículo (ej: 'HTQ648')
- `status`: Estado de la venta ('draft' o 'closed'). Si no se especifica, solo elimina 'draft'
- `limit`: Número máximo de ventas a eliminar (por defecto: 100)
- `force`: Si es `true`, permite eliminar ventas cerradas también

## Ejemplo completo:

```javascript
// Eliminar todas las ventas draft con placa HTQ648
const result = await API.sales.deleteBulk({ 
  plate: 'HTQ648', 
  limit: 10000 
});
console.log('Resultado:', result);
// Debería mostrar: { ok: true, deleted: X, found: X, message: "..." }
```

## Nota de Seguridad:

- Solo elimina ventas de la empresa en la que estás logueado
- Por defecto solo elimina ventas en estado 'draft' (no cerradas)
- Usa `force: true` con precaución para eliminar ventas cerradas

