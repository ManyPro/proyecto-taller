# Migración a Svelte - Páginas de Login

Este proyecto está siendo migrado de HTML vanilla a Svelte manteniendo Tailwind CSS.

## Estructura

```
Frontend/
├── src/
│   ├── lib/
│   │   ├── components/
│   │   │   ├── PortalSelector.svelte      # Selector de tipo de login
│   │   │   ├── CompanyLogin.svelte        # Login de empresa
│   │   │   ├── AdminLogin.svelte          # Login de admin
│   │   │   ├── PasswordRecovery.svelte    # Recuperación de contraseña
│   │   │   ├── PasswordReset.svelte       # Reset de contraseña
│   │   │   ├── ThemeToggle.svelte         # Toggle de tema
│   │   │   └── styles/
│   │   │       ├── portal.css
│   │   │       ├── login.css
│   │   │       └── recovery.css
│   │   └── utils/
│   │       ├── theme.js                   # Utilidades de tema
│   │       └── api.js                     # Utilidades de API
│   ├── pages/
│   │   ├── LoginPage.svelte               # Página principal de login
│   │   ├── AdminPage.svelte               # Página de admin
│   │   ├── ForgotPage.svelte             # Página de recuperación
│   │   └── ResetPage.svelte              # Página de reset
│   ├── app.css                            # Estilos globales con Tailwind
│   └── main.js                            # Punto de entrada
├── package.json
├── vite.config.js
├── svelte.config.js
├── tailwind.config.js
└── postcss.config.js
```

## Instalación

```bash
cd Frontend
npm install
```

## Desarrollo

```bash
npm run dev
```

El servidor de desarrollo estará disponible en `http://localhost:5173`

## Build

```bash
npm run build
```

## Componentes Migrados

### ✅ Completados
- PortalSelector: Selector de tipo de acceso (Empresa/Admin)
- CompanyLogin: Login de empresa con registro
- AdminLogin: Login de admin con registro
- PasswordRecovery: Recuperación de contraseña local
- PasswordReset: Reset de contraseña con token

### Características
- ✅ Separación de estilos CSS en archivos dedicados
- ✅ Mantiene compatibilidad con Tailwind CSS
- ✅ Soporte para tema claro/oscuro
- ✅ Conexión con backend mantenida
- ✅ Manejo de errores y estados de carga

## Próximos Pasos

1. Migrar el resto de páginas de la aplicación
2. Crear componentes reutilizables para elementos comunes
3. Optimizar el rendimiento
4. Eliminar archivos HTML obsoletos después de verificar funcionamiento

