# Verificación: Base de Datos Compartida

## Funciones Auxiliares Creadas

### 1. `getSaleCreationCompanyId(req)`
**Propósito**: Obtener el companyId para CREAR ventas
- **SIN base compartida**: Retorna `originalCompanyId` (empresa logueada)
- **CON base compartida**: Retorna `originalCompanyId` (empresa logueada)
- **Lógica**: Las ventas SIEMPRE se crean en la empresa logueada, nunca en la compartida

### 2. `getSaleQueryCompanyFilter(req)`
**Propósito**: Obtener el filtro para BUSCAR ventas
- **SIN base compartida**: Retorna `originalCompanyId` (único ID)
- **CON base compartida**: Retorna `{ $in: [originalCompanyId, effectiveCompanyId] }` (busca en ambas)
- **Validación**: Luego se valida con `validateSaleOwnership()` que la venta pertenece al `originalCompanyId`

### 3. `getPriceQueryCompanyFilter(req)`
**Propósito**: Obtener el filtro para BUSCAR precios
- **SIN base compartida**: Retorna `originalCompanyId` (único ID)
- **CON base compartida**: Retorna `{ $in: [originalCompanyId, effectiveCompanyId] }` (busca en ambas)
- **Lógica**: Los precios pueden estar en cualquiera de las dos empresas cuando hay base compartida

### 4. `validateSaleOwnership(sale, req)`
**Propósito**: Validar que una venta pertenece al originalCompanyId del usuario
- **SIN base compartida**: Valida que `sale.companyId === originalCompanyId`
- **CON base compartida**: Valida que `sale.companyId === originalCompanyId` (debe pertenecer a la empresa logueada)
- **Seguridad**: Aunque busquemos en ambas empresas, solo permitimos operaciones en ventas de la empresa logueada

## Escenarios de Uso

### Escenario A: SIN Base de Datos Compartida
```
req.originalCompanyId = "ABC123"
req.companyId = "ABC123" (igual)

✅ Crear venta: Se crea con companyId = "ABC123"
✅ Buscar venta: Busca con companyId = "ABC123"
✅ Buscar precio: Busca con companyId = "ABC123"
✅ Validar venta: Valida que pertenece a "ABC123"
```

### Escenario B: CON Base de Datos Compartida
```
req.originalCompanyId = "ABC123" (empresa logueada)
req.companyId = "XYZ789" (empresa compartida)

✅ Crear venta: Se crea con companyId = "ABC123" (empresa logueada)
✅ Buscar venta: Busca con { $in: ["ABC123", "XYZ789"] } pero valida que pertenece a "ABC123"
✅ Buscar precio: Busca con { $in: ["ABC123", "XYZ789"] } (puede estar en cualquiera)
✅ Validar venta: Valida que pertenece a "ABC123" (empresa logueada)
```

## Funciones Actualizadas

### Ventas
- ✅ `startSale` - Usa `getSaleCreationCompanyId()`
- ✅ `getSale` - Usa `getSaleQueryCompanyFilter()` + `validateSaleOwnership()`
- ✅ `addItem` - Usa `getSaleQueryCompanyFilter()` + `getPriceQueryCompanyFilter()` + `validateSaleOwnership()`
- ✅ `addItemsBatch` - Usa `getSaleQueryCompanyFilter()` + `getPriceQueryCompanyFilter()` + `validateSaleOwnership()`
- ✅ `updateItem` - Usa `getSaleQueryCompanyFilter()` + `validateSaleOwnership()`
- ✅ `removeItem` - Usa `getSaleQueryCompanyFilter()` + `validateSaleOwnership()`
- ✅ `updateTechnician` - Usa `getSaleQueryCompanyFilter()` + `validateSaleOwnership()`
- ✅ `setCustomerVehicle` - Usa `getSaleQueryCompanyFilter()` + `validateSaleOwnership()`
- ✅ `closeSale` - Usa `getSaleQueryCompanyFilter()` + `validateSaleOwnership()`
- ✅ `updateCloseSale` - Usa `getSaleQueryCompanyFilter()` + `validateSaleOwnership()`
- ✅ `cancelSale` - Usa `getSaleQueryCompanyFilter()` + `validateSaleOwnership()`
- ✅ `completeOpenSlot` - Usa `getSaleQueryCompanyFilter()` + `getPriceQueryCompanyFilter()` + `validateSaleOwnership()`
- ✅ `addByQR` - Usa `getSaleQueryCompanyFilter()` + `validateSaleOwnership()`
- ✅ `listSales` - Usa `originalCompanyId` directamente (solo muestra ventas de la empresa logueada)
- ✅ `deleteSalesBulk` - Usa `getSaleCreationCompanyId()`

### Precios
- ✅ `getPrice` (en prices.controller.js) - Busca en ambos companyId cuando hay base compartida
- ✅ `addItem` (busca PriceEntry) - Usa `getPriceQueryCompanyFilter()`
- ✅ `addItemsBatch` (busca PriceEntry) - Usa `getPriceQueryCompanyFilter()`
- ✅ `completeOpenSlot` (busca PriceEntry) - Usa `getPriceQueryCompanyFilter()`

## Items de Inventario

Los items de inventario usan `req.companyId` directamente, lo cual es correcto porque:
- Cuando hay base compartida y `shareInventory = true`, los items están en `effectiveCompanyId`
- Cuando no hay base compartida, `req.companyId === originalCompanyId`
- El middleware ya maneja esto correctamente

## Casos Edge Manejados

1. ✅ `originalCompanyId` no definido → Usa `req.companyId` como fallback
2. ✅ `effectiveCompanyId` no definido → Usa `originalCompanyId` como fallback
3. ✅ Ambos iguales (sin base compartida) → Usa cualquiera de los dos
4. ✅ Ambos diferentes (con base compartida) → Busca en ambos

## Testing Recomendado

1. **Sin base compartida**:
   - Crear venta ✅
   - Agregar item desde lista de precios ✅
   - Agregar item desde inventario ✅
   - Cerrar venta ✅

2. **Con base compartida**:
   - Crear venta (debe crearse en empresa logueada) ✅
   - Agregar item desde lista de precios (debe encontrar precios de ambas empresas) ✅
   - Agregar item desde inventario (debe encontrar items de empresa compartida) ✅
   - Cerrar venta ✅
   - Validar que no se pueden modificar ventas de la otra empresa ✅

