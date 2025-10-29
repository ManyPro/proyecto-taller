# 🚀 Configuración en el Droplet - Entorno de Desarrollo

## 📋 Instrucciones para configurar el entorno de desarrollo en tu droplet

### 1. Conectar al droplet y clonar el repo

```bash
# Conectar al droplet
ssh root@tu-droplet-ip

# Navegar al directorio donde quieres el proyecto
cd /var/www

# Clonar el repo (si no lo tienes)
git clone https://github.com/tu-usuario/proyecto-taller.git
cd proyecto-taller

# Cambiar al branch de desarrollo
git checkout develop
```

### 2. Configurar el entorno de desarrollo

```bash
# Ejecutar el script de configuración
./scripts/dev-setup.sh
```

**El script hará:**
- ✅ Cambiar al branch `develop`
- ✅ Hacer pull de los últimos cambios
- ✅ Instalar Docker y Docker Compose (si no están)
- ✅ Crear el archivo `.env.dev`
- ✅ Construir y levantar los contenedores

### 3. Editar variables de entorno

```bash
# Editar el archivo de configuración
nano .env.dev
```

**Variables importantes a cambiar:**
- `MONGODB_URI` - Tu base de datos de MongoDB
- `CLOUDINARY_CLOUD_NAME` - Tu nombre de cloud
- `CLOUDINARY_API_KEY` - Tu API key
- `CLOUDINARY_API_SECRET` - Tu API secret
- `JWT_SECRET` - Puedes usar el que está o cambiar

### 4. Reiniciar el entorno

```bash
# Reiniciar con las nuevas variables
./scripts/dev-update.sh
```

## 🔄 Comandos para el día a día

### Cuando hagas cambios en el código:

```bash
# 1. Hacer commit y push de tus cambios
git add .
git commit -m "feat: nueva funcionalidad"
git push origin develop

# 2. En el droplet, actualizar el entorno
./scripts/dev-update.sh
```

### Comandos útiles:

```bash
# Ver logs en tiempo real
./scripts/dev-logs.sh

# Parar el entorno
./scripts/dev-stop.sh

# Ver estado de contenedores
docker-compose -f docker-compose.dev.yml ps

# Reiniciar solo un servicio
docker-compose -f docker-compose.dev.yml restart backend
```

## 🌐 URLs del entorno de desarrollo

- **Frontend**: `http://tu-droplet-ip:8080`
- **Backend**: `http://tu-droplet-ip:4001`
- **MongoDB**: `tu-droplet-ip:27018`

## 🔧 Configuración del firewall

Si no puedes acceder a las URLs, configura el firewall:

```bash
# Abrir puertos necesarios
ufw allow 8080
ufw allow 4001
ufw allow 27018

# Verificar estado del firewall
ufw status
```

## 🆘 Troubleshooting

### Problema: No se puede acceder a las URLs
```bash
# Verificar que los contenedores estén corriendo
docker-compose -f docker-compose.dev.yml ps

# Ver logs para errores
./scripts/dev-logs.sh
```

### Problema: Error de permisos
```bash
# Hacer los scripts ejecutables
chmod +x scripts/*.sh
```

### Problema: Puerto ocupado
```bash
# Ver qué está usando el puerto
netstat -tulpn | grep :8080
netstat -tulpn | grep :4001

# Parar el proceso que esté usando el puerto
sudo kill -9 PID_DEL_PROCESO
```

## 📝 Notas importantes

- El entorno de desarrollo usa la **misma base de datos** que producción
- Los archivos se suben a Cloudinary con la carpeta `taller-dev`
- Los logs están en modo `debug` para desarrollo
- Los rate limits son más permisivos para desarrollo
