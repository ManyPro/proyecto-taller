# 📋 Guía para Ver Logs del Backend en Docker

## 🔍 Comandos para Ver Logs

### Opción 1: Usando docker compose (RECOMENDADO)
```bash
# Ver logs en tiempo real del backend de producción
docker compose -p taller-prod -f docker-compose.yml logs -f backend

# Ver logs de todos los servicios
docker compose -p taller-prod -f docker-compose.yml logs -f

# Ver últimas 100 líneas y seguir
docker compose -p taller-prod -f docker-compose.yml logs --tail 100 -f backend
```

### Opción 2: Usando docker logs directamente
```bash
# Ver logs en tiempo real del contenedor
docker logs -f taller-prod-backend-1

# Ver últimas 100 líneas y seguir
docker logs -f --tail 100 taller-prod-backend-1

# Ver logs desde una fecha específica
docker logs --since 10m taller-prod-backend-1
```

### Opción 3: Filtrar logs por contenido
```bash
# Ver solo logs que contengan "closeSale"
docker logs -f taller-prod-backend-1 | grep -i "closeSale"

# Ver solo logs de error
docker logs -f taller-prod-backend-1 | grep -i "error"

# Ver logs con colores (si tienes ccze instalado)
docker logs -f taller-prod-backend-1 | ccze -A
```

## 🐛 Si los Logs No Aparecen

### 1. Verificar que el contenedor está corriendo
```bash
docker ps | grep taller-prod-backend
```

### 2. Verificar el nombre exacto del contenedor
```bash
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
```

### 3. Ver logs sin seguir (para verificar que hay logs)
```bash
docker logs --tail 50 taller-prod-backend-1
```

### 4. Entrar al contenedor y verificar
```bash
# Entrar al contenedor
docker exec -it taller-prod-backend-1 sh

# Dentro del contenedor, verificar que el proceso está corriendo
ps aux | grep node

# Verificar variables de entorno
env | grep LOG
```

### 5. Verificar configuración de logs de Docker
```bash
# Ver información del contenedor
docker inspect taller-prod-backend-1 | grep -A 10 LogConfig
```

## 🔧 Solución de Problemas

### Si los logs están vacíos:
1. **Verificar que el código se está ejecutando**: Los `console.log` deberían aparecer siempre
2. **Verificar LOG_LEVEL**: Si está en "warn" o "error", los logs "info" no aparecerán
3. **Reiniciar el contenedor**: `docker restart taller-prod-backend-1`

### Si solo ves logs JSON:
- Los logs ahora se escriben en dos formatos: JSON y legible
- Deberías ver ambos formatos en la consola

### Si los logs están buffered:
- Usa `docker logs -f` con `--tail` para ver logs recientes
- Los logs pueden tener un pequeño delay, pero deberían aparecer

## 📝 Logs Específicos para closeSale

Cuando intentes cerrar una venta, deberías ver estos logs:

```
[closeSale] ===== Buscando Item =====
[closeSale] SKU: LIGA02
[closeSale] RefId: ...
[closeSale] Qty requerida: 1
[closeSale] ===== Item encontrado =====
[closeSale] SKU: LIGA02
[closeSale] Stock (raw): 1
[closeSale] Stock (number): 1
[closeSale] ===== Verificación de Stock =====
[closeSale] ItemStock: 1
[closeSale] StockEntries encontradas: 0
[closeSale] Stock a usar: 1
[closeSale] Requerido: 1
[closeSale] Tiene stock suficiente: true
[closeSale] Descontando stock: SKU=LIGA02, Cantidad=1
[closeSale] Stock actualizado: SKU=LIGA02, Matched=1, Modified=1
```

## 🚀 Comando Rápido

```bash
# Ver logs en tiempo real (copia y pega esto)
docker logs -f taller-prod-backend-1 2>&1 | grep --line-buffered -E "closeSale|ERROR|Stock"
```

Este comando:
- Muestra logs en tiempo real (`-f`)
- Incluye stderr (`2>&1`)
- Filtra solo líneas con "closeSale", "ERROR" o "Stock"
- Usa `--line-buffered` para mostrar líneas inmediatamente

