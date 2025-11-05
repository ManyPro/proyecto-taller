# 📋 Módulo de Nómina - Documentación Completa

## 🎯 Propósito General
El módulo de Nómina permite gestionar la liquidación de pagos a técnicos, combinando:
- **Conceptos configurados** (salario base, auxilios, descuentos)
- **Comisiones por ventas** (calculadas desde ventas cerradas)
- **Asignaciones personalizadas** por técnico
- **Períodos de liquidación** (mensual, quincenal, semanal)
- **Integración con Flujo de Caja** (registro de pagos)

---

## 📑 Estructura del Módulo

### 1️⃣ **Conceptos por Empresa** (`CompanyPayrollConcept`)
**¿Qué hace?**
- Define los conceptos de nómina que se aplican a **TODOS los técnicos** de la empresa
- Cada concepto puede ser: **Ingreso**, **Descuento** o **Recargo**
- Cada concepto puede calcularse como: **Fijo (COP)** o **Porcentaje (%)**

**Datos almacenados:**
```javascript
{
  companyId: ObjectId,      // Separado por empresa
  code: "SAL",             // Código único (mayúsculas)
  name: "Salario base",    // Nombre descriptivo
  type: "earning",         // earning | deduction | surcharge
  amountType: "fixed",     // fixed | percent
  defaultValue: 1000000,   // Valor base (COP o %)
  isActive: true,
  ordering: 0
}
```

**Ejemplos de conceptos:**
- **Ingreso fijo**: Salario base (1,000,000 COP)
- **Ingreso porcentaje**: Bono de productividad (5% del salario base)
- **Descuento fijo**: Auxilio de transporte (-50,000 COP)
- **Descuento porcentaje**: Salud (4% del salario base)
- **Descuento porcentaje**: Pensión (4% del salario base)

**Conexiones:**
- ✅ Se usa como base en **Asignaciones por técnico** (puede ser sobrescrito)
- ✅ Se aplica en **Liquidaciones** para calcular el total

---

### 2️⃣ **Asignaciones por Técnico** (`TechnicianAssignment`)
**¿Qué hace?**
- Permite **personalizar valores** de conceptos para técnicos específicos
- Si un técnico tiene una asignación, se usa ese valor en lugar del valor por defecto del concepto
- Si no tiene asignación, se usa el valor por defecto del concepto

**Datos almacenados:**
```javascript
{
  companyId: ObjectId,
  technicianName: "JUAN PÉREZ",  // Nombre del técnico (mayúsculas)
  conceptId: ObjectId,            // Referencia al concepto
  valueOverride: 1200000,         // Valor personalizado (opcional)
  isActive: true
}
```

**Ejemplo de uso:**
- Concepto "Salario base" tiene valor por defecto: 1,000,000 COP
- Técnico "JUAN PÉREZ" tiene asignación personalizada: 1,200,000 COP
- **Resultado**: Juan recibirá 1,200,000 en lugar de 1,000,000

**Conexiones:**
- ✅ Usa **Conceptos por empresa** como base
- ✅ Se aplica en **Liquidaciones** para calcular valores personalizados

---

### 3️⃣ **Períodos** (`PayrollPeriod`)
**¿Qué hace?**
- Define períodos de liquidación (mensual, quincenal, semanal)
- Permite delimitar el rango de fechas para calcular comisiones por ventas

**Datos almacenados:**
```javascript
{
  companyId: ObjectId,
  periodType: "monthly",        // monthly | biweekly | weekly
  startDate: Date,              // Fecha inicio
  endDate: Date,                // Fecha fin
  status: "open"                // open | closed
}
```

**Conexiones:**
- ✅ Se usa en **Liquidaciones** para:
  - Filtrar ventas cerradas en ese rango de fechas
  - Calcular comisiones por ventas del período

---

### 4️⃣ **Liquidaciones** (`PayrollSettlement`)
**¿Qué hace?**
- Calcula y almacena la liquidación completa de un técnico para un período
- Combina:
  1. **Conceptos de empresa** (con asignaciones personalizadas si existen)
  2. **Comisiones por ventas** (calculadas desde ventas cerradas del período)
  3. **Sueldo base** (ingresado manualmente)

**Flujo de cálculo:**
1. Se obtienen todos los **conceptos activos** de la empresa
2. Se obtienen las **asignaciones** del técnico (si tiene)
3. Para cada concepto:
   - Si el técnico tiene asignación → usa `valueOverride`
   - Si no → usa `defaultValue` del concepto
   - Si es `fixed` → suma directamente
   - Si es `percent` → calcula porcentaje del salario base
4. Se buscan **ventas cerradas** del período donde el técnico participó
5. Se suman todas las comisiones (`laborCommissions.share`) del técnico
6. Se calculan totales:
   - **Bruto** = Ingresos + Recargos
   - **Descuentos** = Suma de descuentos
   - **Neto** = Bruto - Descuentos

**Datos almacenados:**
```javascript
{
  companyId: ObjectId,
  technicianId: ObjectId,       // Opcional (futuro)
  technicianName: "JUAN PÉREZ", // Nombre del técnico
  periodId: ObjectId,           // Período de liquidación
  items: [
    {
      conceptId: ObjectId,
      name: "Salario base",
      type: "earning",
      value: 1000000,
      calcRule: "fixed"
    },
    {
      conceptId: null,
      name: "Comisión por ventas",
      type: "earning",
      value: 250000,
      calcRule: "sales.laborCommissions"
    },
    {
      conceptId: ObjectId,
      name: "Salud",
      type: "deduction",
      value: 40000,
      calcRule: "percent"
    }
  ],
  grossTotal: 1250000,      // Total ingresos
  deductionsTotal: 40000,   // Total descuentos
  netTotal: 1210000,        // Neto a pagar
  status: "approved"        // draft | approved | paid
}
```

**Conexiones:**
- ✅ Usa **Conceptos por empresa**
- ✅ Usa **Asignaciones por técnico**
- ✅ Usa **Períodos** para filtrar ventas
- ✅ **LEE Ventas** para calcular comisiones
- ✅ Se usa en **Pagar** para registrar el pago

---

### 5️⃣ **Pagar** (Integración con CashFlow)
**¿Qué hace?**
- Registra el pago de una liquidación aprobada en el **Flujo de Caja**
- Crea una entrada de salida (`OUT`) con:
  - Tipo: `MANUAL`
  - Descripción: "Pago a empleado (NOMBRE_TÉCNICO)"
  - Monto: Neto de la liquidación
  - Cuenta: Cuenta bancaria o efectivo seleccionada

**Datos almacenados en CashFlow:**
```javascript
{
  companyId: ObjectId,
  accountId: ObjectId,           // Cuenta de donde sale el dinero
  date: Date,
  kind: "OUT",                   // Salida
  source: "MANUAL",
  sourceRef: settlementId,       // ID de la liquidación
  description: "Pago a empleado (JUAN PÉREZ)",
  amount: 1210000,
  meta: {
    type: "PAYROLL",
    technicianId: ObjectId,
    settlementId: ObjectId
  }
}
```

**Conexiones:**
- ✅ Usa **Liquidaciones** aprobadas
- ✅ Crea registros en **Flujo de Caja**

---

## 🔗 Conexión con el Módulo de Ventas

### 📊 Estructura de Ventas (`Sale`)

**Campos relevantes para Nómina:**
```javascript
{
  companyId: ObjectId,
  status: "closed",              // Solo ventas cerradas cuentan
  closedAt: Date,                // Fecha de cierre (usado para filtrar por período)
  technician: "JUAN PÉREZ",     // Técnico asignado (legacy)
  closingTechnician: "JUAN PÉREZ", // Técnico que cerró la venta
  laborCommissions: [            // ⭐ DESPIECE DE COMISIONES
    {
      technician: "JUAN PÉREZ",
      kind: "MOTOR",
      laborValue: 500000,
      percent: 50,
      share: 250000              // ⭐ Este valor se suma en liquidaciones
    },
    {
      technician: "MARÍA LÓPEZ",
      kind: "SUSPENSION",
      laborValue: 300000,
      percent: 40,
      share: 120000
    }
  ]
}
```

### 🔄 Cómo se Calculan las Comisiones en Liquidaciones

**Código del cálculo** (`Backend/src/controllers/payroll.controller.js`):

```javascript
// 1. Buscar ventas cerradas del período
const sales = await Sale.find({
  companyId: req.companyId,
  status: 'closed',
  closedAt: { $gte: period.startDate, $lte: period.endDate },
  $or: [
    { 'laborCommissions.technician': technicianName },  // Busca en despiece
    { closingTechnician: technicianName },              // O en técnico de cierre
    { technician: technicianName }                      // O en técnico asignado
  ]
});

// 2. Sumar todas las comisiones del técnico
const commission = sales.reduce((acc, s) => {
  const fromBreakdown = (s.laborCommissions||[])
    .filter(lc => lc.technician === technicianName)  // Filtra por nombre
    .reduce((a, b) => a + (Number(b.share)||0), 0);  // Suma los "share"
  return acc + fromBreakdown;
}, 0);

// 3. Agregar como concepto de ingreso
if (commission > 0) {
  computed.items.unshift({
    conceptId: null,
    name: 'Comisión por ventas',
    type: 'earning',
    value: commission,
    calcRule: 'sales.laborCommissions'
  });
}
```

### 📝 Cómo se Registran las Comisiones en Ventas

**Al cerrar una venta** (`POST /api/v1/sales/:id/close`):

```javascript
// El frontend envía laborLines al cerrar:
{
  laborLines: [
    {
      technician: "JUAN PÉREZ",
      kind: "MOTOR",
      laborValue: 500000,
      percent: 50
    }
  ]
}

// El backend calcula share y guarda:
sale.laborCommissions = [
  {
    technician: "JUAN PÉREZ",
    kind: "MOTOR",
    laborValue: 500000,
    percent: 50,
    share: 250000  // ⭐ Este valor se usa en liquidaciones
  }
];
```

---

## 🔄 Flujo Completo de Trabajo

### **Configuración Inicial (Una vez por empresa):**
1. **Crear conceptos** → Definir salario base, auxilios, descuentos, etc.
2. **Crear técnicos** → Agregar nombres de técnicos en la empresa

### **Configuración Periódica (Opcional):**
3. **Asignaciones personalizadas** → Si un técnico necesita valores diferentes

### **Liquidación Mensual (Cada período):**
4. **Crear período** → Definir rango de fechas (ej: 1-31 de enero)
5. **Para cada técnico:**
   - Seleccionar período y técnico
   - Ingresar sueldo base del período
   - **Previsualizar** → Ver cálculo completo (conceptos + comisiones)
   - **Aprobar** → Guardar liquidación
6. **Pagar** → Registrar pago en flujo de caja

---

## 📊 Ejemplo Práctico Completo

### **Configuración:**
- **Concepto "Salario base"**: 1,000,000 COP (fijo, ingreso)
- **Concepto "Auxilio transporte"**: 50,000 COP (fijo, ingreso)
- **Concepto "Salud"**: 4% (porcentaje, descuento)
- **Concepto "Pensión"**: 4% (porcentaje, descuento)

### **Asignación personalizada:**
- **Técnico "JUAN PÉREZ"**: Salario base = 1,200,000 COP

### **Período:**
- **Enero 2025**: 2025-01-01 a 2025-01-31

### **Ventas del período:**
- Venta #1: Juan cerró, comisión 250,000 COP
- Venta #2: Juan cerró, comisión 180,000 COP
- **Total comisiones**: 430,000 COP

### **Liquidación de Juan:**
```
Ingresos:
  - Salario base: 1,200,000 COP (asignación personalizada)
  - Auxilio transporte: 50,000 COP (concepto por defecto)
  - Comisión por ventas: 430,000 COP (calculado desde ventas)
  Total Bruto: 1,680,000 COP

Descuentos:
  - Salud (4% de 1,200,000): 48,000 COP
  - Pensión (4% de 1,200,000): 48,000 COP
  Total Descuentos: 96,000 COP

Neto a pagar: 1,584,000 COP
```

### **Pago:**
- Se registra en Flujo de Caja: Salida de 1,584,000 COP desde cuenta bancaria
- Liquidación queda marcada como "paid"

---

## 🔐 Seguridad y Separación por Empresa

**Todos los modelos tienen `companyId`:**
- ✅ `CompanyPayrollConcept.companyId`
- ✅ `TechnicianAssignment.companyId`
- ✅ `PayrollPeriod.companyId`
- ✅ `PayrollSettlement.companyId`

**Middleware de autenticación:**
- Todas las rutas usan `authCompany` → establece `req.companyId`
- Todas las consultas filtran por `companyId`
- **Cada empresa solo ve y gestiona sus propios datos**

---

## 📄 Generación de Comprobantes

### **PDF Básico** (`GET /api/v1/payroll/settlements/:id/pdf`)
- Genera PDF simple con información de la liquidación
- Usa `pdfkit`

### **HTML con Template** (`GET /api/v1/payroll/settlements/:id/print`)
- Usa template de tipo `payroll` desde el módulo de Formatos
- Renderiza con Handlebars
- Permite personalización completa del formato

---

## 🎯 Resumen de Conexiones

```
┌─────────────────┐
│  Conceptos      │ ← Base para todos los técnicos
└────────┬────────┘
         │
         ↓
┌─────────────────┐
│  Asignaciones   │ ← Personalización por técnico
└────────┬────────┘
         │
         ↓
┌─────────────────┐     ┌──────────────┐
│  Períodos       │ ←───│   Ventas     │
└────────┬────────┘     │  (cerradas)   │
         │              └───────┬───────┘
         │                      │
         ↓                      │
┌─────────────────┐             │
│  Liquidaciones │ ←───────────┘
└────────┬────────┘
         │
         ↓
┌─────────────────┐
│   Flujo de      │
│     Caja        │
└─────────────────┘
```

---

## ✅ Checklist de Funcionalidad

- [x] Conceptos separados por empresa
- [x] Asignaciones personalizadas por técnico
- [x] Cálculo automático de comisiones desde ventas
- [x] Períodos de liquidación configurables
- [x] Previsualización antes de aprobar
- [x] Integración con Flujo de Caja
- [x] Generación de PDF/HTML
- [x] Separación total por empresa (seguridad)
- [x] Validaciones completas en frontend y backend
- [x] Manejo robusto de errores

---

**Última actualización**: 2025-01-29

