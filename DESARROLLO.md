# 🚀 Guía de Desarrollo - Proyecto Taller

## 📋 Resumen

Este proyecto tiene un **entorno de desarrollo separado** que te permite trabajar de forma segura sin afectar el sistema de producción en uso.

## 🌳 Estructura de Branches

- **`main`** → Producción (sistema actual en uso)
- **`develop`** → Desarrollo/Pruebas (nuevas funcionalidades)

## 🛠️ Configuración Inicial

### 1. Configurar el entorno de desarrollo

```bash
# Crear archivo de configuración para desarrollo
cp env.dev.example .env.dev

# Editar las variables según tu configuración
nano .env.dev
```

### 2. Configurar variables de entorno

**Para desarrollo (`.env.dev`):**
- Usa la **misma base de datos** que producción (recomendado)
- O crea una base de datos separada para pruebas
- Configura Cloudinary o usa almacenamiento local
- JWT secret diferente para desarrollo

## 🚀 Flujo de Trabajo

### Desarrollo de nuevas funcionalidades

```bash
# 1. Cambiar al branch de desarrollo
git checkout develop

# 2. Hacer tus cambios
# ... editar archivos ...

# 3. Probar localmente
docker-compose -f docker-compose.dev.yml up --build

# 4. Verificar que funciona
# Frontend: http://localhost:8080
# Backend: http://localhost:4001

# 5. Commit y push
git add .
git commit -m "feat: nueva funcionalidad X"
git push origin develop
```

### Deploy del entorno de desarrollo

**Opción 1: Localhost (RECOMENDADO)**
```bash
# 1. Asegúrate de estar en develop
git checkout develop

# 2. Levanta el entorno de desarrollo
docker-compose -f docker-compose.dev.yml up --build

# 3. Accede a:
# Frontend: http://localhost:8080
# Backend: http://localhost:4001
```

**Opción 2: Netlify (opcional)**
```bash
# 1. Asegúrate de estar en develop
git checkout develop

# 2. Crea un nuevo sitio en Netlify
# 3. Conecta el branch 'develop'
# 4. Configura las variables de entorno
# 5. Deploy automático desde develop
```

### Promoción a Producción

```bash
# 1. Cuando esté listo, hacer merge a main
git checkout main
git merge develop

# 2. Deploy a producción (tu sistema actual)
git push origin main
# Tu sistema de producción actual se actualizará
```

## 🐳 Comandos Docker

### Desarrollo
```bash
# Levantar entorno de desarrollo
docker-compose -f docker-compose.dev.yml up --build

# Solo backend
docker-compose -f docker-compose.dev.yml up backend mongo

# Ver logs
docker-compose -f docker-compose.dev.yml logs -f

# Parar todo
docker-compose -f docker-compose.dev.yml down
```

### Producción
```bash
# Usar tu sistema de producción actual
# (no se modifica)
```

## 🌐 Opciones para el entorno de desarrollo

### Opción 1: Localhost (RECOMENDADO)
```bash
# Levantar entorno de desarrollo
docker-compose -f docker-compose.dev.yml up --build

# URLs:
# Frontend: http://localhost:8080
# Backend: http://localhost:4001
# MongoDB: localhost:27018
```

### Opción 2: Netlify (opcional)
Si quieres un entorno de desarrollo en la nube:

📖 **Guía completa:** Ver [NETLIFY-DEPLOY.md](./NETLIFY-DEPLOY.md) para instrucciones detalladas.

**Resumen rápido:**
1. **Crear sitio en Netlify:**
   - Ve a [netlify.com](https://netlify.com)
   - Crea un nuevo sitio
   - Conecta tu repo de GitHub
   - Selecciona el branch `develop`

2. **Configurar build:**
   - Build Command: `echo "Frontend de desarrollo listo"`
   - Publish Directory: `Frontend`

3. **El archivo `netlify.toml` ya está configurado** con las redirecciones necesarias para el API.

**Nota:** Las variables de entorno no son necesarias para el frontend en Netlify, ya que el frontend detecta automáticamente el entorno y usa el proxy configurado.

### Opción 3: Tu servidor actual (alternativa)
Si tienes un servidor donde puedas hacer deploy:
- Usa el mismo sistema que producción
- Solo cambia las variables de entorno
- Usa un subdominio como `dev.tu-dominio.com`

## 📊 Ventajas de esta configuración

### ✅ Ventajas
- **Mismo código base** - no duplicación
- **Misma base de datos** - pruebas reales
- **Deploy independiente** - cada entorno separado
- **Fácil integración** - merge cuando esté listo
- **Rollback fácil** - vuelves al commit anterior
- **Historial completo** - todo en el mismo repo

### 🔄 Flujo recomendado
1. **Desarrollo** → Trabaja en `develop`
2. **Pruebas** → Localhost o Netlify (desarrollo)
3. **Validación** → Prueba con datos reales
4. **Producción** → Merge a `main` cuando esté listo
5. **Deploy** → Tu sistema de producción actual

## 🚨 Consideraciones importantes

### Base de datos
- **Recomendado**: Usar la misma MongoDB para ambos entornos
- **Alternativa**: Base de datos separada para desarrollo
- **Nunca**: Modificar datos de producción desde desarrollo

### Cloudinary
- **Opción 1**: Misma cuenta, carpetas separadas (`taller` vs `taller-dev`)
- **Opción 2**: Cuenta separada para desarrollo
- **Ventaja**: No mezclar archivos de desarrollo y producción

### CORS
- **Desarrollo**: `ALLOWED_ORIGINS=*` (más permisivo)
- **Producción**: Dominios específicos únicamente

## 🆘 Troubleshooting

### Problema: No se conecta a la base de datos
```bash
# Verificar que MongoDB esté corriendo
docker-compose -f docker-compose.dev.yml ps

# Ver logs de MongoDB
docker-compose -f docker-compose.dev.yml logs mongo
```

### Problema: Frontend no carga
```bash
# Verificar que el backend esté corriendo
docker-compose -f docker-compose.dev.yml logs backend

# Verificar puertos
netstat -tulpn | grep :8080
```

### Problema: Deploy falla en Render
1. Verificar variables de entorno
2. Revisar logs de build en Render
3. Verificar que el branch sea correcto
4. Verificar que los archivos estén en el repo

## 📝 Notas adicionales

- Los archivos `.env.dev` y `.env.prod` están en `.gitignore`
- Usa `env.dev.example` y `env.prod.example` como plantillas
- Los scripts de deploy están en `scripts/`
- La configuración de Render está en `render.yaml`

---

## Nómina y Técnicos - Guía rápida

### Endpoints (backend)
- Base: `/api/v1/payroll` (requiere `authCompany`; escritura solo `owner/admin`)
- Conceptos: GET `/concepts`, POST `/concepts`, PATCH `/concepts/:id`, DELETE `/concepts/:id`
- Asignaciones por técnico (por nombre): GET `/assignments?technicianName=...`, POST `/assignments`, DELETE `/assignments`
- Períodos: GET `/periods/open`, POST `/periods`
- Liquidaciones: POST `/settlements/preview`, POST `/settlements/approve`, POST `/settlements/pay`, GET `/settlements`, GET `/settlements/:id/pdf`

### Frontend (desarrollo)
- Página: `Frontend/nomina.html`
- Funcionalidad: conceptos, asignaciones, períodos, liquidación, pago (flujo de caja), PDF básico.

### Seed (opcional)
```bash
cd Backend
npm ci --omit=dev
npm run seed:payroll
cd ..
```

### Flujo recomendado
1) Crear/confirmar conceptos por empresa
2) Crear período (semanal/quincenal/mensual)
3) Asignar overrides por técnico si aplica
4) Previsualizar y aprobar liquidación
5) Pagar → registra salida en Flujo de Caja
6) Descargar PDF (básico). Integración con plantillas en próxima fase.

### Despliegue rápido
```bash
cd /root/proyecto-taller
git checkout develop && git pull origin develop
./scripts/dev-update.sh
./scripts/dev-logs.sh
```
