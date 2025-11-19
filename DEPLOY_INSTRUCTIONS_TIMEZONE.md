# Instrucciones de Deploy - Migración a UTC (GMT+0)

## 📋 Resumen de Cambios

Se ha migrado todo el sistema de manejo de fechas y horas a **UTC (GMT+0)** para evitar problemas de timezone. Todas las fechas se guardan y muestran en UTC.

## 🔧 Cambios Realizados

### Backend
- ✅ Instalado `date-fns` (versión 4.1.0)
- ✅ Eliminado `date-fns-tz` (no se usa)
- ✅ Reescrito `Backend/src/lib/dateTime.js` para usar UTC
- ✅ Actualizados controladores: `calendar.controller.js`, `cashflow.controller.js`, `payroll.controller.js`, `notes.controller.js`

### Frontend
- ✅ Reescrito `Frontend/assets/js/dateTime.js` para usar UTC
- ✅ Actualizados módulos: `calendar.js`, `notes.js`, `cashflow.js`, `payroll.js`
- ✅ Todas las fechas se muestran en UTC con indicador "(UTC)"

## 🚀 Pasos para Deploy

### 1. Backend - Instalar Dependencias

```bash
cd Backend
npm install
```

**Importante:** Esto instalará `date-fns@^4.1.0` y eliminará `date-fns-tz` si estaba instalado.

### 2. Verificar Instalación

```bash
cd Backend
npm list date-fns
```

Deberías ver: `date-fns@4.1.0` (o versión compatible)

### 3. Reiniciar Backend

```bash
# Si usas PM2
pm2 restart backend

# O si usas systemd
sudo systemctl restart taller-backend

# O manualmente
cd Backend
npm start
```

### 4. Frontend - No Requiere Cambios

El frontend **NO requiere instalación de dependencias** porque:
- No usa npm/package.json
- Usa funciones nativas de JavaScript con manejo de UTC
- Los cambios están en archivos `.js` que se sirven directamente

Solo necesitas:
- Asegurarte de que los archivos actualizados estén en el servidor
- Limpiar caché del navegador si es necesario

### 5. Verificar Funcionamiento

Después del deploy, verifica estos módulos:

#### ✅ Calendario
1. Crear una nueva cita con fecha y hora
2. Verificar que la hora se guarda correctamente (debe mostrar "(UTC)")
3. Editar una cita existente y verificar que la hora se carga correctamente

#### ✅ Cotizaciones
1. Crear una nueva cotización
2. Verificar que la fecha se guarda correctamente

#### ✅ Ventas
1. Crear una nueva venta
2. Verificar que la fecha se guarda correctamente

#### ✅ Notas
1. Crear una nota con recordatorio
2. Verificar que la fecha del recordatorio se guarda en UTC

#### ✅ Flujo de Caja
1. Crear un movimiento manual con fecha
2. Verificar que la fecha se guarda en UTC

#### ✅ Períodos de Liquidación (Nómina)
1. Crear un nuevo período
2. Verificar que las fechas de inicio y fin se guardan en UTC
3. Realizar un pago de liquidación
4. Verificar que la fecha del pago se guarda en UTC

## ⚠️ Notas Importantes

1. **Todas las fechas se muestran en UTC**: Las fechas en la interfaz mostrarán "(UTC)" para indicar que están en GMT+0
2. **No hay conversión de timezone**: Si el usuario ingresa "15:03", se guarda como "15:03 UTC" (no se convierte)
3. **Compatibilidad**: Los datos antiguos seguirán funcionando, pero las nuevas fechas se guardarán en UTC
4. **Caché del navegador**: Si ves problemas, limpia la caché del navegador (Ctrl+Shift+R o Cmd+Shift+R)

## 🔍 Verificación Post-Deploy

### Backend
```bash
# Verificar que date-fns está instalado
cd Backend
npm list date-fns

# Verificar que date-fns-tz NO está instalado
npm list date-fns-tz
# Debería mostrar: (empty) o error
```

### Logs
Revisa los logs del backend para asegurarte de que no hay errores relacionados con fechas:
```bash
# Si usas PM2
pm2 logs backend

# O revisa los logs del sistema
tail -f /var/log/taller-backend.log
```

## 📝 Rollback (Si es Necesario)

Si necesitas hacer rollback:

1. **Backend**: Revertir los cambios en `Backend/src/lib/dateTime.js` y controladores
2. **Frontend**: Revertir los cambios en `Frontend/assets/js/dateTime.js` y módulos
3. **Dependencias**: No es necesario cambiar `package.json` ya que `date-fns` es compatible

## ✅ Checklist Pre-Deploy

- [ ] Backup de la base de datos
- [ ] Backup del código actual
- [ ] Verificar que `date-fns` está en `package.json`
- [ ] Verificar que `date-fns-tz` NO está en `package.json`
- [ ] Ejecutar `npm install` en Backend
- [ ] Reiniciar backend
- [ ] Probar creación de cita en calendario
- [ ] Probar creación de cotización
- [ ] Probar creación de venta
- [ ] Probar creación de nota con recordatorio
- [ ] Probar movimiento en flujo de caja
- [ ] Probar período de liquidación

## 🎯 Resultado Esperado

Después del deploy:
- ✅ Todas las fechas se guardan en UTC (GMT+0)
- ✅ Todas las fechas se muestran en UTC con indicador "(UTC)"
- ✅ No hay problemas de conversión de timezone
- ✅ Las fechas se mantienen consistentes entre diferentes dispositivos

---

**Fecha de migración:** $(date)
**Versión:** 1.0.0

