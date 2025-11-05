# 🔒 Configuración Segura de Netlify: Producción vs Desarrollo

Esta guía explica cómo configurar Netlify para evitar conflictos entre producción y desarrollo.

## 🎯 Estrategia Recomendada: Dos Sitios Separados

### ✅ Arquitectura Segura

```
Repositorio GitHub
├── Branch: main (producción)
│   └── Deploy a → Sitio Netlify: "proyecto-taller-prod"
│       └── URL: https://tu-app-prod.netlify.app
│
└── Branch: develop (desarrollo)
    └── Deploy a → Sitio Netlify: "proyecto-taller-dev"
        └── URL: https://tu-app-dev.netlify.app
```

## 📋 Configuración Paso a Paso

### Paso 1: Verificar Sitio de Producción (si existe)

1. Ve a [app.netlify.com](https://app.netlify.com)
2. Busca tu sitio de producción
3. Verifica que esté configurado para el branch `main`
4. Anota el nombre del sitio y la URL

### Paso 2: Crear Sitio de Desarrollo (NUEVO)

1. **Crear nuevo sitio:**
   - Click en **"Add new site"** → **"Import an existing project"**
   - Selecciona **"GitHub"** → **"proyecto-taller"**
   
2. **Configuración inicial:**
   - **Site name:** `proyecto-taller-dev` ⚠️ **DEBE SER DIFERENTE al de producción**
   - **Branch to deploy:** `develop`
   - **Build command:** `echo "Frontend de desarrollo listo"`
   - **Publish directory:** `Frontend`

3. **Click en "Deploy site"**

### Paso 3: Verificar Configuración de Ambos Sitios

#### Sitio de PRODUCCIÓN:
- **Site settings** → **Build & deploy** → **Continuous Deployment**
  - ✅ Production branch: `main`
  - ✅ Branch deploys: Desactivado (opcional, solo si quieres)

#### Sitio de DESARROLLO:
- **Site settings** → **Build & deploy** → **Continuous Deployment**
  - ✅ Production branch: `develop`
  - ✅ Branch deploys: Activado (opcional)

## 🔐 Garantías de Seguridad

### ✅ Separación Completa

- **Código:** Cada sitio despliega desde su branch específico
- **URLs:** URLs completamente diferentes (no hay confusión)
- **Deploys:** Independientes (un deploy no afecta al otro)
- **Configuración:** Cada sitio puede tener diferentes configuraciones

### ✅ Flujo de Trabajo

```
Desarrollo:
develop → git push → Deploy automático a sitio-dev → Pruebas

Producción:
develop → merge → main → git push → Deploy automático a sitio-prod → Live
```

## 🚨 Qué NO Hacer

### ❌ NO usar el mismo sitio para ambos branches
- Puede causar confusión
- Un deploy puede sobrescribir al otro
- Difícil hacer rollback selectivo

### ❌ NO cambiar el branch de producción accidentalmente
- Siempre verifica qué sitio estás configurando
- Usa nombres claros para distinguir los sitios

## 📊 Comparación de Configuraciones

| Aspecto | Sitio Producción | Sitio Desarrollo |
|---------|------------------|------------------|
| **Nombre** | `proyecto-taller` | `proyecto-taller-dev` |
| **Branch** | `main` | `develop` |
| **URL** | `https://app-prod.netlify.app` | `https://app-dev.netlify.app` |
| **Deploy** | Solo desde `main` | Solo desde `develop` |
| **Propósito** | Usuarios finales | Pruebas y desarrollo |

## 🧪 Verificación

### Checklist de Configuración Segura:

- [ ] Sitio de producción existe y está configurado para `main`
- [ ] Sitio de desarrollo existe y está configurado para `develop`
- [ ] Los nombres de los sitios son diferentes
- [ ] Las URLs son diferentes
- [ ] Hacer push a `develop` solo despliega en sitio-dev
- [ ] Hacer merge a `main` solo despliega en sitio-prod
- [ ] No hay conflictos entre los deploys

## 🔄 Flujo de Trabajo Recomendado

```bash
# 1. Trabajar en desarrollo
git checkout develop
# ... hacer cambios ...
git add .
git commit -m "feat: nueva funcionalidad"
git push origin develop
# → Deploy automático a sitio-dev ✅

# 2. Probar en sitio-dev
# Abrir: https://app-dev.netlify.app
# Verificar que todo funciona

# 3. Cuando esté listo, promover a producción
git checkout main
git merge develop
git push origin main
# → Deploy automático a sitio-prod ✅

# 4. Verificar en producción
# Abrir: https://app-prod.netlify.app
```

## 🆘 Troubleshooting

### Problema: Ambos sitios despliegan el mismo código

**Solución:** Verifica que cada sitio tenga configurado su branch correcto:
- Sitio prod → `main`
- Sitio dev → `develop`

### Problema: No sé cuál sitio es cuál

**Solución:** 
1. Renombra los sitios con identificadores claros
2. Agrega un indicador visual en el frontend (solo en desarrollo)
3. Usa dominios personalizados diferentes

### Problema: Un deploy afecta al otro sitio

**Solución:** Esto NO debería pasar si los sitios están separados. Verifica:
- Que sean sitios diferentes (no el mismo sitio)
- Que cada uno tenga su branch configurado correctamente

---

**✅ Con esta configuración, producción y desarrollo están completamente separados y no hay riesgo de conflictos.**

