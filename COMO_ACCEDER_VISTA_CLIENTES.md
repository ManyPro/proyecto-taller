# 📱 Cómo Acceder a la Vista de Clientes

## 🌐 Acceso Directo

La vista de clientes es una página pública que se accede directamente desde el navegador.

### URL Base

```
http://tu-dominio.com/cliente.html
```

O si estás en desarrollo local:

```
http://localhost:puerto/cliente.html
```

### Con Parámetro de Company ID (Recomendado)

Si quieres especificar el ID del taller directamente en la URL:

```
http://tu-dominio.com/cliente.html?companyId=TU_COMPANY_ID
```

**Ejemplo:**
```
http://tu-dominio.com/cliente.html?companyId=68c871198d7595062498d7a1
```

## 🔐 Autenticación

Los clientes se autentican con:

1. **Placa del vehículo**: La placa registrada en el sistema
2. **Contraseña**: Los primeros 6 dígitos del número de celular registrado

### Ejemplo de Login

- **Placa**: `ABC123`
- **Contraseña**: `123456` (primeros 6 dígitos del teléfono)

## 📋 Funcionalidades Disponibles

Una vez autenticado, el cliente puede ver:

1. **Información del Vehículo**
   - Placa
   - Marca
   - Línea
   - Kilometraje actual

2. **Historial de Servicios**
   - Todas las ventas cerradas realizadas al vehículo
   - Detalle de servicios por venta
   - Fechas, técnicos, y montos

3. **Planilla de Mantenimiento**
   - Servicios programados por kilometraje
   - Estado de cada servicio (pendiente, próximo, vencido, completado)
   - Próximos servicios a realizar

## 🔗 Integración con el Sistema

### Desde el Backend

La vista de clientes usa las siguientes rutas públicas:

- `POST /api/v1/public/customer/:companyId/auth` - Autenticación
- `GET /api/v1/public/customer/:companyId/services` - Historial de servicios
- `GET /api/v1/public/customer/:companyId/schedule` - Planilla de mantenimiento

### Compartir con Clientes

Puedes compartir el enlace con tus clientes de varias formas:

1. **Enlace directo** (si conoces el companyId):
   ```
   https://tu-dominio.com/cliente.html?companyId=TU_COMPANY_ID
   ```

2. **Enlace sin companyId** (el cliente lo ingresa manualmente):
   ```
   https://tu-dominio.com/cliente.html
   ```

3. **QR Code**: Genera un código QR con el enlace para que los clientes lo escaneen

## 📝 Notas Importantes

- La vista es **pública** y no requiere autenticación del sistema interno
- Los clientes solo pueden ver información de **su propio vehículo**
- La autenticación se basa en la placa + primeros 6 dígitos del teléfono
- Si el cliente no tiene vehículo registrado o los datos no coinciden, verá un error

## 🛠️ Desarrollo

Si estás en desarrollo local:

1. Asegúrate de que el servidor frontend esté corriendo
2. Accede a `http://localhost:puerto/cliente.html`
3. Usa el `companyId` de tu base de datos de prueba

## 📱 Responsive

La vista está completamente optimizada para:
- 📱 Móviles
- 💻 Tablets
- 🖥️ Desktop

---

**Última actualización**: $(date)

