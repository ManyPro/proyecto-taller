# Ejecutar Tests de Funciones Críticas

## En el Droplet (DigitalOcean)

```bash
# Conectarse al servidor
ssh root@tu-droplet-ip

# Ir al directorio del proyecto
cd ~/proyecto-taller

# Asegurarse de estar en el directorio Backend
cd Backend

# Ejecutar el test
node scripts/test_all_critical_functions.js
```

## Variables de Entorno

El script usa `MONGODB_URI` del archivo `.env` o la variable de entorno. Si necesitas especificar una URI diferente:

```bash
MONGODB_URI="mongodb://localhost:27017/taller" node scripts/test_all_critical_functions.js
```

## Qué Prueba el Test

1. **Descuento de inventario usando StockEntry y FIFO**
   - Verifica que el stock se descuenta correctamente usando entradas FIFO
   - Valida que StockEntry y Item.stock están sincronizados

2. **Movimientos automáticos de flujo de caja**
   - Verifica que las ventas cerradas generan entradas de flujo de caja correctamente
   - Valida que los montos y balances son correctos

3. **Mano de obra guardada correctamente**
   - Verifica que laborValue, laborPercent y laborShare se calculan correctamente
   - Valida que laborCommissions se guardan con los porcentajes correctos

4. **Horas correctas usando utilidades**
   - Prueba parseHours, formatHours, hoursToMinutes, minutesToHours
   - Verifica que workHoursPerMonth se guarda correctamente en técnicos

## Salida Esperada

El test mostrará:
- ✅ para pruebas que pasaron
- ❌ para pruebas que fallaron
- ⚠️ para advertencias (no críticas)

Al final mostrará un resumen con el estado de todas las pruebas.

