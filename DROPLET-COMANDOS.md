# 🚀 Comandos para Droplet - Ambos Entornos

## Configuración Inicial (Solo primera vez)

```bash
# Conectar al droplet
ssh root@tu-droplet-ip

# Ir al directorio del proyecto
cd /root/proyecto-taller

# Asegurar que estás en develop
git checkout develop
git pull origin develop
```

## 🔄 Actualizar Entorno de Desarrollo

```bash
cd /root/proyecto-taller
git checkout develop
git pull origin develop
./scripts/dev-update.sh
```

**O manualmente:**

```bash
cd /root/proyecto-taller
git checkout develop
git pull origin develop

# Parar contenedores de desarrollo
docker compose -p taller-dev -f docker-compose.dev.yml down

# Levantar contenedores de desarrollo
docker compose -p taller-dev -f docker-compose.dev.yml up --build -d
```

## 🏭 Actualizar Producción

```bash
cd /root/proyecto-taller
git checkout main
git pull origin main

# Parar contenedores de producción
docker compose down

# Levantar contenedores de producción
docker compose up --build -d
```

## 📊 Ver Estado de Contenedores

```bash
# Ver desarrollo
docker compose -p taller-dev -f docker-compose.dev.yml ps

# Ver producción
docker compose ps

# Ver todos
docker ps
```

## 📝 Ver Logs

```bash
# Logs de desarrollo
docker compose -p taller-dev -f docker-compose.dev.yml logs -f

# Logs de producción
docker compose logs -f

# Logs de un servicio específico (desarrollo)
docker compose -p taller-dev -f docker-compose.dev.yml logs -f backend

# Logs de un servicio específico (producción)
docker compose logs -f backend
```

## 🛑 Parar Ambos Entornos

```bash
# Parar desarrollo
docker compose -p taller-dev -f docker-compose.dev.yml down

# Parar producción
docker compose down

# O parar todo
docker compose -p taller-dev -f docker-compose.dev.yml down && docker compose down
```

## ✅ Verificar que Ambos Estén Corriendo

```bash
# Verificar puertos
netstat -tulpn | grep -E ':(4000|4001|8080|3000)'

# Verificar contenedores
docker ps | grep -E 'taller-dev|proyecto-taller'
```

## 🔧 Configurar CORS (Ya actualizado en el código)

El backend ya está configurado para aceptar:
- `https://proyecto-taller.netlify.app` (producción)
- `https://proyecto-taller-dev.netlify.app` (desarrollo)
- `http://localhost:8080` (local)
- `http://localhost:4001` (local desarrollo)

Si necesitas agregar más URLs, edita `Backend/src/server.js` línea 149-156.

## 📌 URLs de Acceso

**Desarrollo:**
- Frontend Netlify: https://proyecto-taller-dev.netlify.app
- Backend Droplet: http://tu-ip:4001

**Producción:**
- Frontend Netlify: https://proyecto-taller.netlify.app (o tu dominio)
- Backend Droplet: http://tu-ip:4000

