# 📋 Checklist de Deploy a Producción

## ✅ Revisión de Código Completada

### Estado General
- ✅ **Sin errores de linting** detectados
- ✅ **Estructura del proyecto** correcta
- ✅ **Dockerfiles** configurados correctamente
- ✅ **Scripts de deploy** disponibles
- ⚠️ **Tailwind CSS** usando CDN (ver sección específica)

---

## 🔍 Hallazgos y Recomendaciones

### 1. Tailwind CSS - CDN vs Build

**Estado Actual:**
- Tailwind está usando CDN (`cdn.tailwindcss.com`) en todos los archivos HTML
- Esto genera una advertencia en consola: "cdn.tailwindcss.com should not be used in production"

**Opciones:**

#### Opción A: Mantener CDN (Recomendado para este deploy)
- ✅ **Ventajas:** No requiere cambios, funciona inmediatamente
- ⚠️ **Desventajas:** Advertencia en consola, tamaño de bundle mayor
- **Acción:** Ninguna necesaria para este deploy

#### Opción B: Compilar Tailwind (Para futuros deploys)
- Requiere configurar PostCSS y Tailwind CLI
- Crear `tailwind.config.js`
- Compilar CSS antes del deploy
- **Tiempo estimado:** 2-3 horas

**Recomendación:** Mantener CDN por ahora, planificar migración para próximo deploy.

---

### 2. Console.log/Error en Código

**Encontrados:**
- `Frontend/assets/js/payroll.js`: 19 `console.error` y `console.log`
- Estos son útiles para debugging pero deberían limpiarse o usar un logger en producción

**Recomendación:** 
- Para este deploy: **No crítico**, pueden quedarse
- Para futuro: Implementar logger condicional basado en `NODE_ENV`

---

### 3. TODOs en Código

**Encontrado:**
- `Backend/src/controllers/payroll.controller.js:1566`: `// TODO: Implementar conversión HTML a PDF con puppeteer si es necesario`

**Estado:** No crítico, funcionalidad actual funciona con PDFKit

---

### 4. Índices de Base de Datos

**Importante:** El modelo `PayrollSettlement` tiene código para eliminar índices antiguos automáticamente. Esto se ejecutará al iniciar el servidor.

**Verificación necesaria:**
```bash
# Después del deploy, verificar en MongoDB:
db.payrollsettlements.getIndexes()
# Debe mostrar solo:
# - companyId_1_technicianName_1_periodId_1 (unique)
# - companyId_1_technicianId_1_periodId_1 (unique, sparse)
```

---

## 🚀 Proceso de Deploy

### Paso 1: Preparación Pre-Deploy

```bash
# 1. Asegurarse de estar en develop
git checkout develop
git pull origin develop

# 2. Verificar que no hay cambios sin commitear
git status

# 3. Verificar que los tests pasan (si existen)
# npm test  # Si hay tests configurados
```

### Paso 2: Merge a Main

```bash
# Opción A: Usar script automatizado
    cd proyecto-taller
    ./scripts/merge-develop-to-main.sh
    ./scripts/prod-deploy.sh
    ./scripts/restart-both.sh
# Opción B: Manual
git checkout main
git pull origin main
git merge develop
# Resolver conflictos si los hay
git push origin main
```
./scripts/merge-develop-to-main.sh
### Paso 3: Deploy Backend (Servidor)

**Si usas Docker:**
```bash
# En el servidor de producción
cd /ruta/al/proyecto-taller
./scripts/prod-deploy.sh
```

**Si usas PM2 o similar:**
```bash
# En el servidor
cd Backend
git pull origin main
npm ci --omit=dev
pm2 restart taller-backend
# o
systemctl restart taller-backend
```

### Paso 4: Deploy Frontend (Netlify)

**Automático:**
- Netlify detectará el push a `main` y hará deploy automático
- Verificar en el dashboard de Netlify

**Manual (si es necesario):**
```bash
# En Netlify dashboard:
# 1. Ir a "Deploys"
# 2. Click en "Trigger deploy" > "Deploy site"
# 3. Seleccionar branch "main"
```

### Paso 5: Verificación Post-Deploy

```bash
# 1. Verificar que el backend responde
curl https://tu-dominio.com/api/v1/health

# 2. Verificar que el frontend carga
# Abrir en navegador y revisar consola

# 3. Verificar logs del backend
docker logs taller-prod-backend-1
# o
pm2 logs taller-backend

# 4. Verificar índices de MongoDB (ver sección 4 arriba)
```

---

## 📦 Variables de Entorno Requeridas

### Backend (.env)

**Críticas:**
```env
MONGODB_URI=mongodb://...
MONGODB_DB=taller
JWT_SECRET=...
PORT=3000
NODE_ENV=production
```

**Opcionales pero recomendadas:**
```env
ALLOWED_ORIGINS=https://proyecto-taller.netlify.app,https://proyecto-taller-dev.netlify.app
PUBLIC_RATE_MAX=120
CHECKOUT_RATE_MAX=30
AUTH_RATE_MAX=40
```

**Cloudinary (si usas uploads):**
```env
CLOUDINARY_CLOUD_NAME=...
CLOUDINARY_API_KEY=...
CLOUDINARY_API_SECRET=...
```

### Frontend (Netlify Environment Variables)

No se requieren variables de entorno en el frontend (todo se maneja vía API).

---

## 🔧 Scripts Disponibles

### Backend Scripts (Backend/package.json)

```bash
# Desarrollo
npm run dev

# Producción
npm start

# Scripts de migración (ejecutar según necesidad)
npm run seed:templates
npm run seed:payroll
npm run templates:normalize
npm run fix:payroll:index  # Si hay problemas con índices
```

### Deploy Scripts (scripts/)

```bash
# Merge develop a main
    cd proyecto-taller
        ./scripts/merge-develop-to-main.sh

        # Deploy completo a producción
        ./scripts/prod-deploy.sh

        # Reiniciar servicios
        ./scripts/restart-both.sh
```

---

## ⚠️ Puntos de Atención

### 1. Índices de MongoDB
- El código intentará eliminar el índice problemático automáticamente
- Si hay errores, ejecutar manualmente:
```javascript
db.payrollsettlements.dropIndex("companyId_1_technicianId_1_periodId_1")
```

### 2. Tailwind CDN
- Funciona pero genera advertencia
- No afecta funcionalidad
- Considerar migración a build para futuro

### 3. Console.logs
- No críticos pero deberían limpiarse en futuro
- No afectan funcionalidad

### 4. Netlify Redirects
- Verificar que `netlify.toml` esté correcto
- Backend debe estar en puerto 4000 (producción) o 4001 (desarrollo)

---

## ✅ Checklist Final Pre-Deploy

- [ ] Código en `develop` está estable y probado
- [ ] No hay errores de linting
- [ ] Variables de entorno configuradas en servidor
- [ ] Backup de base de datos realizado
- [ ] Scripts de deploy probados en ambiente de staging (si existe)
- [ ] Documentación actualizada
- [ ] Notificar al equipo sobre el deploy

---

## 🆘 Rollback Plan

Si algo sale mal:

### Backend
```bash
# Revertir a commit anterior
git checkout main
git reset --hard <commit-anterior>
git push origin main --force

# Reiniciar servicios
./scripts/restart-both.sh
```

### Frontend
- En Netlify: Ir a "Deploys" > Seleccionar deploy anterior > "Publish deploy"

### Base de Datos
```bash
# Restaurar backup
mongorestore --db taller backup/
```

---

## 📝 Notas Adicionales

1. **Tailwind CDN:** Aunque genera advertencia, es funcional. La migración a build puede hacerse en un deploy futuro.

2. **Índices MongoDB:** El código maneja automáticamente la eliminación del índice problemático. Si persisten errores, verificar manualmente.

3. **Console.logs:** No son críticos pero deberían limpiarse en futuras iteraciones.

4. **Testing:** Considerar agregar tests automatizados para futuros deploys.

---

## 🎯 Resumen Ejecutivo

**Estado:** ✅ **LISTO PARA DEPLOY**

**Acciones Requeridas:**
1. Hacer merge de `develop` a `main`
2. Ejecutar script de deploy o hacer deploy manual
3. Verificar que todo funciona post-deploy
4. Monitorear logs las primeras horas

**No Crítico (Puede hacerse después):**
- Migrar Tailwind de CDN a build
- Limpiar console.logs
- Implementar logger condicional

---

**Última actualización:** $(date)
**Revisado por:** AI Assistant
**Próxima revisión:** Después del deploy a producción

