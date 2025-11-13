# Comandos para Desarrollo en Droplet

## Setup Inicial (Primera vez)

```bash
# 1. Navegar al directorio del frontend
cd /ruta/a/proyecto-taller/Frontend

# 2. Instalar dependencias de Node.js
npm install

# 3. Verificar que Node.js y npm estén instalados
node --version  # Debe ser >= 18
npm --version
```

## Desarrollo Local (con Vite)

```bash
# Iniciar servidor de desarrollo
npm run dev

# El servidor estará disponible en:
# http://localhost:5173
# http://tu-ip-droplet:5173
```

## Desarrollo con PM2 (Recomendado para servidor)

### Instalar PM2 (si no está instalado)
```bash
npm install -g pm2
```

### Iniciar en modo desarrollo con PM2
```bash
# Desde el directorio Frontend
pm2 start npm --name "frontend-dev" -- run dev

# Ver logs
pm2 logs frontend-dev

# Ver estado
pm2 status

# Reiniciar
pm2 restart frontend-dev

# Detener
pm2 stop frontend-dev

# Eliminar del proceso
pm2 delete frontend-dev
```

## Configuración de Nginx (Opcional - Proxy)

Si quieres usar Nginx como proxy reverso:

```nginx
server {
    listen 80;
    server_name tu-dominio.com;

    location / {
        proxy_pass http://localhost:5173;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # Proxy para API
    location /api {
        proxy_pass http://localhost:4001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

## Variables de Entorno

Crear archivo `.env` en el directorio Frontend (opcional):

```env
VITE_BACKEND_URL=http://localhost:4001
```

## Comandos Útiles

```bash
# Ver procesos de Node corriendo
ps aux | grep node

# Ver puertos en uso
netstat -tulpn | grep :5173

# Matar proceso en puerto 5173
lsof -ti:5173 | xargs kill -9

# Reinstalar dependencias
rm -rf node_modules package-lock.json
npm install
```

## Troubleshooting

### Puerto 5173 ya en uso
```bash
# Cambiar puerto en vite.config.js o usar:
npm run dev -- --port 5174
```

### Error de permisos
```bash
sudo chown -R $USER:$USER /ruta/a/proyecto-taller/Frontend
```

### Node modules corruptos
```bash
rm -rf node_modules
npm install
```

## Estructura de Comandos Rápida

```bash
# Setup inicial (una vez)
cd Frontend && npm install

# Desarrollo simple
npm run dev

# Desarrollo con PM2 (recomendado)
pm2 start npm --name "frontend-dev" -- run dev
pm2 logs frontend-dev
```

