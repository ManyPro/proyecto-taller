# 🔄 Reconstruir Backend para Ver Logs

## ⚠️ IMPORTANTE: El código necesita reconstruirse

Los cambios que hice al código NO están en el contenedor todavía. Necesitas reconstruir el contenedor.

## 🚀 Opción 1: Reconstruir solo el backend (RÁPIDO)

```bash
cd ~/proyecto-taller

# Reconstruir solo el backend
docker compose -p taller-prod -f docker-compose.yml build backend

# Reiniciar el backend
docker compose -p taller-prod -f docker-compose.yml up -d backend
```

## 🚀 Opción 2: Reconstruir todo (si la opción 1 no funciona)

```bash
cd ~/proyecto-taller

# Parar contenedores
docker compose -p taller-prod -f docker-compose.yml down

# Reconstruir y levantar
docker compose -p taller-prod -f docker-compose.yml up --build -d
```

## 📝 Después de reconstruir:

1. **Verifica que el contenedor está corriendo:**
   ```bash
   docker ps | grep backend
   ```

2. **Monitorea los logs:**
   ```bash
   docker logs -f taller-prod-backend-1
   ```

3. **Intenta cerrar la venta** desde el frontend

4. **Deberías ver logs como:**
   ```
   ========================================
   [closeSale] INICIANDO CIERRE DE VENTA
   [closeSale] Sale ID: 6925ceccae9baf94b1998077
   [closeSale] Timestamp: 2025-11-25T22:30:00.000Z
   ========================================
   [closeSale] Dentro de transacción - Buscando venta: ...
   [closeSale] Venta encontrada: ...
   [closeSale] ===== Buscando Item =====
   ...
   ```

## 🔍 Si aún no ves logs:

1. **Verifica que el código se actualizó:**
   ```bash
   # Entrar al contenedor
   docker exec -it taller-prod-backend-1 sh
   
   # Dentro del contenedor, buscar el log
   grep -n "INICIANDO CIERRE" /app/src/controllers/sales.controller.js
   
   # Debería mostrar la línea con el log
   ```

2. **Verifica que el endpoint se está llamando:**
   - Abre las herramientas de desarrollador del navegador (F12)
   - Ve a la pestaña "Network"
   - Intenta cerrar la venta
   - Busca una petición a `/api/v1/sales/.../close`
   - Verifica el status code (200 = éxito, 400 = error)

3. **Ver logs del servidor web (si hay):**
   ```bash
   # Ver si hay algún proxy o nginx delante
   docker ps
   ```

