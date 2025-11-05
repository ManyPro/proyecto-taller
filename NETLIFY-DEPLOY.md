# 🚀 Guía de Deploy a Netlify desde Develop

Esta guía te ayudará a configurar el deploy automático del frontend desde el branch `develop` a Netlify.

## 📋 Requisitos Previos

1. ✅ Cuenta de GitHub con el repositorio del proyecto
2. ✅ Cuenta de Netlify (gratis): [netlify.com](https://netlify.com)
3. ✅ Branch `develop` con los cambios más recientes

## ⚠️ IMPORTANTE: Separación de Producción y Desarrollo

**Para evitar conflictos, debes crear DOS SITIOS SEPARADOS en Netlify:**

1. **Sitio de PRODUCCIÓN** (si no existe ya):
   - Conectado al branch `main`
   - URL: `https://tu-app-prod.netlify.app` (o tu dominio personalizado)
   - Solo se actualiza cuando haces merge a `main`

2. **Sitio de DESARROLLO** (nuevo):
   - Conectado al branch `develop`
   - URL: `https://tu-app-dev.netlify.app` (o URL diferente)
   - Se actualiza automáticamente con cada push a `develop`

✅ **Esto garantiza que producción y desarrollo NO se interfieran entre sí.**

## 🔧 Paso 1: Crear Sitio de DESARROLLO en Netlify

### Opción A: Desde Netlify Dashboard (Recomendado)

1. **Inicia sesión en Netlify**
   - Ve a [app.netlify.com](https://app.netlify.com)
   - Inicia sesión con tu cuenta

2. **Crear NUEVO sitio para desarrollo** (separado del de producción)
   - Click en **"Add new site"** → **"Import an existing project"**
   - Selecciona **"GitHub"** como proveedor
   - Autoriza Netlify si es necesario
   - Selecciona tu repositorio: `proyecto-taller`
   - ⚠️ **IMPORTANTE:** Si ya tienes un sitio para producción, este debe ser UN SITIO DIFERENTE

3. **Configurar el sitio de desarrollo**
   - **Site name:** `proyecto-taller-dev` (o cualquier nombre que identifique que es desarrollo)
   - **Branch to deploy:** `develop` (¡IMPORTANTE!)
   - **Build command:** `echo "Frontend de desarrollo listo"`
   - **Publish directory:** `Frontend`

4. **Click en "Deploy site"**

### Opción B: Desde Netlify CLI

```bash
# Instalar Netlify CLI (si no lo tienes)
npm install -g netlify-cli

# Iniciar sesión
netlify login

# Inicializar sitio
netlify init

# Seleccionar:
# - Create & configure a new site
# - Team: tu equipo
# - Site name: proyecto-taller-dev (o el que prefieras)
# - Build command: echo "Frontend de desarrollo listo"
# - Directory to deploy: Frontend
```

## ⚙️ Paso 2: Configurar Variables de Entorno (Opcional)

Si necesitas variables de entorno específicas para desarrollo:

1. Ve a **Site settings** → **Environment variables**
2. Agrega las variables necesarias (solo si las necesitas):
   - `NODE_ENV=development`
   - `CLOUDINARY_CLOUD_NAME=dzj1yqcdf`
   - `CLOUDINARY_UPLOAD_PRESET=inventory_unsigned`

> **Nota:** El frontend ya está configurado para detectar automáticamente Netlify y usar el proxy `/api/*` configurado en `netlify.toml`

## 🔄 Paso 3: Configurar Branch de Deploy

### Para el Sitio de DESARROLLO (develop):

1. Ve a **Site settings** → **Build & deploy** → **Continuous Deployment**
2. Configura:
   - **Production branch:** `develop` (este es el branch principal para desarrollo)
   - **Branch deploys:** Activar para permitir previews de otros branches si quieres

### Para el Sitio de PRODUCCIÓN (main) - si ya existe:

1. Ve al sitio de producción en Netlify
2. **Site settings** → **Build & deploy** → **Continuous Deployment**
3. Verifica que:
   - **Production branch:** `main` (este debe ser el branch de producción)
   - **Branch deploys:** Puedes desactivarlo si solo quieres deploys desde `main`

✅ **Con dos sitios separados, cada uno despliega desde su branch correspondiente sin conflictos.**

## 🌐 Paso 4: Configurar Redirecciones y Proxy

El archivo `netlify.toml` ya está configurado con:

```toml
# Redirecciones para el API
[[redirects]]
  from = "/api/*"
  to = "http://143.110.131.35:4000/api/:splat"
  status = 200

[[redirects]]
  from = "/uploads/*"
  to = "http://143.110.131.35:4000/uploads/:splat"
  status = 200
```

**Si tu backend de desarrollo está en otra IP/puerto**, actualiza el `netlify.toml`:

```toml
[[redirects]]
  from = "/api/*"
  to = "http://TU_IP_DESARROLLO:4001/api/:splat"
  status = 200
```

## 📝 Paso 5: Verificar el Deploy

1. **Después del primer deploy**, Netlify te dará una URL como:
   - `https://random-name-123456.netlify.app`
   - O puedes configurar un dominio personalizado

2. **Verifica que funciona:**
   - Abre la URL en el navegador
   - Deberías ver el login de la aplicación
   - Intenta hacer login (esto verificará que el proxy `/api/*` funciona)

3. **Verifica los logs:**
   - Ve a **Deploys** → Click en el deploy → **View deploy log**
   - Deberías ver el mensaje: `Frontend de desarrollo listo`

## 🔄 Actualizar el Deploy

### Automático (Recomendado)
- Cada vez que hagas `git push` al branch `develop`, Netlify desplegará automáticamente
- Recibirás un email cuando el deploy esté listo

### Manual
Si necesitas forzar un deploy:

```bash
# Desde Netlify CLI
netlify deploy --prod

# O desde el dashboard:
# Deploys → Trigger deploy → Deploy site
```

## 🎯 Configuración de Sitios Separados (Recomendado)

### Arquitectura Recomendada:

1. **Sitio de PRODUCCIÓN:**
   - Nombre: `proyecto-taller` (o el nombre original)
   - Branch: `main`
   - URL: `https://tu-app-prod.netlify.app` o tu dominio personalizado
   - Se actualiza: Solo cuando haces merge a `main`

2. **Sitio de DESARROLLO:**
   - Nombre: `proyecto-taller-dev` (nombre diferente para distinguirlo)
   - Branch: `develop`
   - URL: `https://tu-app-dev.netlify.app` (URL completamente diferente)
   - Se actualiza: Automáticamente con cada push a `develop`

### Ventajas de esta configuración:

✅ **Separación completa:** Producción y desarrollo nunca se mezclan
✅ **URLs diferentes:** Fácil identificar qué entorno estás usando
✅ **Deploys independientes:** Un deploy no afecta al otro
✅ **Sin conflictos:** Cada sitio tiene su propia configuración
✅ **Rollback independiente:** Puedes revertir uno sin afectar el otro

### Alternativa (NO recomendada para producción):

Si prefieres usar el mismo sitio con branch deploys:
- **Site settings** → **Build & deploy** → **Branch deploys**
- Activa **"Deploy previews"** para que cada branch tenga su propio preview
- ⚠️ **Riesgo:** Puede haber confusión entre producción y desarrollo

## 🐛 Troubleshooting

### Problema: El deploy falla
- Verifica que el branch `develop` tenga el archivo `netlify.toml`
- Verifica que el directorio `Frontend` existe
- Revisa los logs del deploy en Netlify

### Problema: El API no funciona
- Verifica que la IP del backend en `netlify.toml` sea correcta
- Verifica que el backend esté corriendo y accesible
- Revisa la consola del navegador para errores de CORS

### Problema: Archivos estáticos no cargan
- Verifica que `Frontend/_redirects` exista
- Verifica los headers en `netlify.toml`

## 📚 Referencias

- [Documentación de Netlify](https://docs.netlify.com/)
- [Netlify Redirects](https://docs.netlify.com/routing/redirects/)
- [Netlify Branch Deploys](https://docs.netlify.com/site-deploys/overview/#branch-deploys)

---

## ✅ Checklist de Configuración

- [ ] Cuenta de Netlify creada
- [ ] Repositorio conectado a Netlify
- [ ] Branch `develop` configurado para deploy
- [ ] Build command: `echo "Frontend de desarrollo listo"`
- [ ] Publish directory: `Frontend`
- [ ] `netlify.toml` configurado con la IP correcta del backend
- [ ] Primer deploy exitoso
- [ ] Login funciona correctamente
- [ ] API proxy funciona (`/api/*` redirige correctamente)

---

**¡Listo!** Tu frontend de desarrollo ahora se desplegará automáticamente en Netlify cada vez que hagas push a `develop`.

