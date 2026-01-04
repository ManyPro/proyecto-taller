# 🔍 Diagnóstico: Planilla de Servicios por Kilometraje

## 📋 Resumen Ejecutivo

**Estado:** ✅ **FACTIBLE** - La funcionalidad puede implementarse con modificaciones moderadas al flujo de cierre de venta.

**Complejidad:** Media-Alta  
**Tiempo estimado:** 4-6 horas de desarrollo  
**Impacto:** Bajo riesgo, mejora significativa en seguimiento de mantenimiento

---

## 🎯 Objetivo

Permitir que al cerrar una venta, el usuario pueda:
1. Seleccionar qué servicios de la venta se realizaron
2. Actualizar automáticamente la planilla de servicios por kilometraje del vehículo
3. Registrar el kilometraje actual del vehículo si se proporciona

---

## 🔧 Análisis Técnico

### 1. Modelo de Datos ✅

**Modelo existente:** `VehicleServiceSchedule`

El modelo ya está preparado para:
- ✅ Almacenar servicios programados por kilometraje
- ✅ Rastrear último kilometraje en que se realizó cada servicio
- ✅ Calcular próximo kilometraje debido
- ✅ Actualizar estados (pending, due, overdue, completed)

**Métodos disponibles:**
- `updateMileage(newMileage)` - Actualiza kilometraje y recalcula estados
- `markServiceCompleted(serviceId, mileage, date)` - Marca servicio como completado

**Conclusión:** El modelo está listo, no requiere cambios.

---

### 2. Flujo de Cierre de Venta

**Ubicación:** `Backend/src/controllers/sales.controller.js` - función `closeSale()`

**Flujo actual:**
1. Validar venta (status = 'draft', tiene items)
2. Validar slots abiertos completos
3. Procesar items y descontar inventario
4. Asignar empresa si aplica
5. Establecer datos de cierre (pago, técnico, mano de obra)
6. Actualizar estado a 'closed'
7. Registrar en flujo de caja
8. Crear cuenta por cobrar si hay crédito
9. Publicar eventos

**Punto de inserción recomendado:** Después del paso 5 (establecer datos de cierre), antes de actualizar estado a 'closed'.

---

### 3. Identificación de Servicios en la Venta

**Estructura actual de `Sale.items`:**
```javascript
{
  source: 'inventory' | 'price' | 'service',
  refId: ObjectId,
  sku: String,
  name: String,
  qty: Number,
  unitPrice: Number,
  total: Number
}
```

**Servicios se identifican por:**
- `source === 'service'` → Servicio explícito
- `source === 'price'` y `sku.startsWith('SRV-')` → Servicio desde PriceEntry
- `source === 'price'` y `refId` apunta a PriceEntry con `type === 'service'`

**Heurística adicional:**
- Nombre contiene palabras clave: "servicio", "mantenimiento", "reparación"

**Conclusión:** La identificación de servicios es posible, pero requiere:
1. Consultar PriceEntry cuando `source === 'price'` para verificar `type`
2. Usar heurística de nombres como respaldo

---

### 4. Integración con Planilla de Servicios

**Flujo propuesto:**

1. **Al cerrar venta:**
   - Si se proporciona `mileage` en el body → actualizar kilometraje del vehículo
   - Si se proporciona `completedServices` (array de IDs de items) → procesar servicios

2. **Procesamiento de servicios:**
   ```javascript
   // Pseudocódigo
   if (req.body.completedServices && Array.isArray(req.body.completedServices)) {
     const schedule = await VehicleServiceSchedule.findOne({
       companyId: req.companyId,
       plate: sale.vehicle.plate
     });
     
     if (!schedule) {
       // Crear planilla si no existe
       schedule = await VehicleServiceSchedule.create({
         companyId: req.companyId,
         plate: sale.vehicle.plate,
         customerProfileId: profile._id,
         currentMileage: sale.vehicle.mileage || null,
         services: []
       });
     }
     
     // Para cada servicio completado
     for (const itemId of req.body.completedServices) {
       const item = sale.items.id(itemId);
       if (!item) continue;
       
       // Identificar si es servicio
       const isService = identifyService(item);
       if (!isService) continue;
       
       // Buscar o crear entrada en planilla
       let scheduleService = schedule.services.find(s => 
         s.serviceName === item.name || 
         s.serviceKey === extractServiceKey(item)
       );
       
       if (!scheduleService) {
         // Crear nuevo servicio en planilla
         // Requiere: serviceName, mileageInterval (¿de dónde?)
         // PROBLEMA: No tenemos el intervalo de kilometraje
       } else {
         // Marcar como completado
         schedule.markServiceCompleted(
           scheduleService._id,
           sale.vehicle.mileage || schedule.currentMileage,
           sale.closedAt
         );
       }
     }
     
     await schedule.save();
   }
   ```

---

## ⚠️ Desafíos Identificados

### 1. **Intervalo de Kilometraje Desconocido**

**Problema:** Al crear un nuevo servicio en la planilla, necesitamos el `mileageInterval`, pero:
- Los servicios en `Sale.items` no tienen esta información
- El modelo `Service` (servicios del sistema) tiene variables pero no intervalos
- No hay configuración de intervalos por servicio

**Soluciones posibles:**

**Opción A: Configuración manual al crear servicio en planilla**
- Al cerrar venta, si el servicio no existe en planilla, mostrar modal/interfaz para configurar intervalo
- Guardar intervalo en `VehicleServiceSchedule.services[].mileageInterval`
- **Ventaja:** Flexible, permite diferentes intervalos por vehículo
- **Desventaja:** Requiere interacción del usuario

**Opción B: Configuración global de intervalos**
- Crear modelo `ServiceInterval` con intervalos por tipo de servicio
- Al crear servicio en planilla, buscar intervalo configurado
- **Ventaja:** Automático, consistente
- **Desventaja:** Requiere configuración previa

**Opción C: Valores predeterminados**
- Usar intervalos estándar (ej: cambio de aceite = 10,000 km)
- Permitir edición posterior
- **Ventaja:** Funciona inmediatamente
- **Desventaja:** Puede no ser preciso

**Recomendación:** Combinar Opción A + Opción C
- Intentar usar intervalo predeterminado si existe
- Si no, solicitar al usuario al cerrar venta
- Permitir edición posterior

---

### 2. **Mapeo Servicio → Entrada en Planilla**

**Problema:** ¿Cómo relacionar un servicio de la venta con una entrada en la planilla?

**Opciones:**

**Opción A: Por nombre (exacto)**
- Buscar `schedule.services` donde `serviceName === item.name`
- **Ventaja:** Simple
- **Desventaja:** Sensible a variaciones de nombre

**Opción B: Por serviceKey**
- Si el servicio tiene `refId` que apunta a PriceEntry/Service, usar su `key`
- Buscar en planilla por `serviceKey`
- **Ventaja:** Más robusto
- **Desventaja:** Requiere que servicios tengan key

**Opción C: Por ID de servicio del sistema**
- Si `item.refId` apunta a un `Service`, usar su `_id`
- **Ventaja:** Más preciso
- **Desventaja:** Solo funciona si el servicio está en el sistema

**Recomendación:** Combinar todas las opciones (fallback)
1. Intentar por serviceKey
2. Si no, intentar por nombre (fuzzy match)
3. Si no existe, crear nueva entrada

---

### 3. **Actualización de Kilometraje del Vehículo**

**Problema:** ¿Dónde se almacena el kilometraje actual?

**Ubicaciones actuales:**
- `CustomerProfile.vehicle.mileage` - Kilometraje del perfil
- `Sale.vehicle.mileage` - Kilometraje al momento de la venta
- `VehicleServiceSchedule.currentMileage` - Kilometraje en planilla

**Flujo propuesto:**
1. Al cerrar venta, si se proporciona `mileage`:
   - Actualizar `CustomerProfile.vehicle.mileage`
   - Actualizar `VehicleServiceSchedule.currentMileage`
   - Recalcular estados de servicios en planilla

**Implementación:**
```javascript
if (req.body.mileage && Number.isFinite(Number(req.body.mileage))) {
  const mileage = Number(req.body.mileage);
  
  // Actualizar perfil
  await CustomerProfile.updateOne(
    { companyId: req.companyId, plate: sale.vehicle.plate },
    { $set: { 'vehicle.mileage': mileage } }
  );
  
  // Actualizar planilla
  if (schedule) {
    schedule.updateMileage(mileage);
    await schedule.save();
  }
}
```

---

## 📝 Plan de Implementación

### Fase 1: Backend - Modificar `closeSale()`

**Archivo:** `Backend/src/controllers/sales.controller.js`

**Cambios:**
1. Agregar parámetros opcionales en `req.body`:
   - `mileage`: Number (kilometraje actual)
   - `completedServices`: Array<String> (IDs de items que son servicios completados)

2. Después de establecer datos de cierre, agregar:
   ```javascript
   // Actualizar kilometraje si se proporciona
   if (req.body.mileage) {
     // Actualizar CustomerProfile y VehicleServiceSchedule
   }
   
   // Procesar servicios completados
   if (req.body.completedServices) {
     // Identificar servicios, actualizar planilla
   }
   ```

3. Crear función helper `identifyService(item)`:
   - Verificar `source === 'service'`
   - Verificar `source === 'price'` y consultar PriceEntry
   - Usar heurística de nombres

4. Crear función helper `updateServiceSchedule(sale, completedServices, mileage)`:
   - Buscar o crear planilla
   - Para cada servicio, buscar o crear entrada
   - Marcar como completado

---

### Fase 2: Frontend - Modificar Modal de Cierre

**Archivo:** `Frontend/assets/js/sales.js` (o similar)

**Cambios:**
1. En el modal de cierre de venta, agregar:
   - Campo para ingresar kilometraje actual
   - Lista de checkboxes para seleccionar servicios completados
   - Mostrar solo items que son servicios

2. Al enviar cierre, incluir:
   ```javascript
   {
     // ... otros campos
     mileage: mileageInput.value,
     completedServices: Array.from(selectedServiceCheckboxes)
       .filter(cb => cb.checked)
       .map(cb => cb.dataset.itemId)
   }
   ```

3. Función para identificar servicios en la venta:
   - Similar a `extractServicesAndCombos()` existente
   - Filtrar solo servicios (no productos)

---

### Fase 3: Configuración de Intervalos (Opcional)

**Nuevo modelo:** `ServiceInterval` (opcional)

```javascript
{
  companyId: String,
  serviceKey: String, // Key del servicio
  defaultInterval: Number, // Intervalo predeterminado en km
  notes: String
}
```

**O usar configuración en `Service`:**
- Agregar campo `defaultMileageInterval` al modelo `Service`

---

## ✅ Checklist de Implementación

### Backend
- [ ] Modificar `closeSale()` para aceptar `mileage` y `completedServices`
- [ ] Crear función `identifyService(item)` 
- [ ] Crear función `updateServiceSchedule(sale, completedServices, mileage)`
- [ ] Actualizar `CustomerProfile.vehicle.mileage` al cerrar venta
- [ ] Manejar creación de nuevos servicios en planilla (con intervalo)
- [ ] Manejar actualización de servicios existentes
- [ ] Probar con diferentes escenarios

### Frontend
- [ ] Agregar campo de kilometraje en modal de cierre
- [ ] Agregar checkboxes para seleccionar servicios
- [ ] Filtrar y mostrar solo servicios (no productos)
- [ ] Enviar datos al backend al cerrar venta
- [ ] Mostrar confirmación/feedback

### Testing
- [ ] Cerrar venta sin servicios → no debe afectar planilla
- [ ] Cerrar venta con servicios → debe actualizar planilla
- [ ] Cerrar venta con kilometraje → debe actualizar kilometraje
- [ ] Servicio nuevo en planilla → debe crear entrada
- [ ] Servicio existente → debe marcar como completado
- [ ] Múltiples servicios → debe procesar todos

---

## 🎯 Conclusión

**Factibilidad:** ✅ **ALTA**

La funcionalidad es completamente factible y el modelo de datos ya está preparado. Los principales desafíos son:

1. **Configuración de intervalos:** Requiere decisión de diseño (manual vs automático)
2. **Identificación de servicios:** Requiere lógica adicional pero es manejable
3. **Mapeo servicio → planilla:** Requiere estrategia de matching (nombre/key/ID)

**Recomendación:** Implementar en 2 fases:
1. **Fase 1 (MVP):** Actualización manual de kilometraje y selección de servicios al cerrar venta
2. **Fase 2 (Mejora):** Configuración de intervalos y automatización

**Riesgo:** Bajo - Los cambios son aislados y no afectan funcionalidad existente.

---

**Última actualización:** 2025-01-20  
**Revisado por:** AI Assistant

