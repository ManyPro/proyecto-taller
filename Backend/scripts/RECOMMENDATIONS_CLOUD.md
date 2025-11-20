# Recomendaciones para Ejecutar el Import en la Nube

El script de importación puede ser muy demorado dependiendo del tamaño de los datos. Para ejecutarlo en la nube o en segundo plano, aquí tienes las mejores opciones:

## 🥇 Opción 1: Railway (RECOMENDADO)

**Por qué Railway:**
- ✅ Plan gratuito generoso (500 horas/mes)
- ✅ Terminal integrada con acceso completo
- ✅ Fácil de configurar
- ✅ Logs en tiempo real
- ✅ No requiere configuración compleja

**Pasos:**

1. **Crear cuenta en Railway**
   - Ve a https://railway.app
   - Regístrate con GitHub

2. **Crear nuevo proyecto**
   - Click en "New Project"
   - Selecciona "Empty Service"

3. **Subir archivos CSV**
   - Crea una carpeta `excels/` en el proyecto
   - Sube todos los archivos CSV necesarios:
     - `ordenesfinal.csv`
     - `clientesfinal.csv`
     - `automovilfinal.csv`
     - `remis.csv`
     - `productos.csv`
     - `servicios.csv`

4. **Configurar variables de entorno**
   - Ve a "Variables" en el panel de Railway
   - Agrega:
     ```
     MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/?retryWrites=true&w=majority
     COMPANY_MAP=1:<mongoId1>,3:<mongoId3>
     ```

5. **Ejecutar el script**
   - Abre la terminal de Railway
   - Navega al directorio: `cd Backend`
   - Ejecuta:
     ```bash
     node scripts/import_legacy_unified.js --mongo "$MONGODB_URI" --companyMap "$COMPANY_MAP"
     ```

**Costo:** Gratis hasta 500 horas/mes, luego $5/mes

---

## 🥈 Opción 2: Render

**Por qué Render:**
- ✅ Plan gratuito disponible
- ✅ Ejecución en segundo plano
- ✅ Logs persistentes
- ✅ Fácil despliegue

**Pasos:**

1. **Crear cuenta en Render**
   - Ve a https://render.com
   - Regístrate

2. **Crear Background Worker**
   - Click en "New" → "Background Worker"
   - Conecta tu repositorio GitHub
   - O sube los archivos manualmente

3. **Configurar**
   - Build Command: `cd Backend && npm install` (si es necesario)
   - Start Command: `node Backend/scripts/import_legacy_unified.js --mongo "$MONGODB_URI" --companyMap "$COMPANY_MAP"`
   - Variables de entorno:
     - `MONGODB_URI`
     - `COMPANY_MAP`

4. **Subir archivos CSV**
   - Sube los archivos CSV a la carpeta `Backend/scripts/excels/`

**Costo:** Gratis (con limitaciones), luego $7/mes

---

## 🥉 Opción 3: Heroku

**Por qué Heroku:**
- ✅ Muy estable y confiable
- ✅ Terminal integrada
- ✅ Logs en tiempo real

**Pasos:**

1. **Instalar Heroku CLI**
   ```bash
   # Windows (con Chocolatey)
   choco install heroku-cli
   
   # Mac
   brew install heroku/brew/heroku
   
   # Linux
   curl https://cli-assets.heroku.com/install.sh | sh
   ```

2. **Login y crear app**
   ```bash
   heroku login
   heroku create mi-import-app
   ```

3. **Configurar variables**
   ```bash
   heroku config:set MONGODB_URI="mongodb+srv://..."
   heroku config:set COMPANY_MAP="1:<id1>,3:<id3>"
   ```

4. **Subir código y archivos CSV**
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   heroku git:remote -a mi-import-app
   git push heroku main
   ```

5. **Ejecutar script**
   ```bash
   heroku run node Backend/scripts/import_legacy_unified.js --mongo "$MONGODB_URI" --companyMap "$COMPANY_MAP"
   ```

**Costo:** Plan gratuito limitado, luego $7/mes

---

## 🏢 Opción 4: AWS EC2 / Google Cloud / Azure

Si ya tienes infraestructura en la nube:

### AWS EC2

1. **Crear instancia t2.micro** (gratis por 12 meses)
2. **Conectar por SSH**
3. **Instalar Node.js**
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
   sudo apt-get install -y nodejs
   ```
4. **Subir archivos CSV y código**
5. **Ejecutar script**

### Google Cloud

1. **Crear instancia Compute Engine** (gratis $300 créditos)
2. **Conectar por SSH**
3. **Instalar Node.js y ejecutar**

### Azure

1. **Crear VM** (gratis $200 créditos)
2. **Conectar y ejecutar**

---

## 💡 Recomendación Final

**Para este caso específico, recomiendo Railway porque:**

1. ✅ **Más fácil de usar**: No requiere conocimientos avanzados de infraestructura
2. ✅ **Terminal integrada**: Puedes ver el progreso en tiempo real
3. ✅ **Gratis**: 500 horas/mes es más que suficiente para un import
4. ✅ **Sin configuración compleja**: Solo subes archivos y ejecutas

**Pasos rápidos en Railway:**

```bash
# 1. Crear proyecto en Railway
# 2. Subir archivos CSV a excels/
# 3. Configurar variables de entorno
# 4. Ejecutar en terminal:
cd Backend
node scripts/import_legacy_unified.js --mongo "$MONGODB_URI" --companyMap "$COMPANY_MAP"
```

---

## ⚠️ Notas Importantes

1. **Tamaño de archivos**: Asegúrate de que los archivos CSV no excedan los límites de la plataforma
2. **Tiempo de ejecución**: El import puede tardar varias horas dependiendo del tamaño
3. **Conexión a MongoDB**: Asegúrate de que la IP de la plataforma esté permitida en MongoDB Atlas (si usas Atlas)
4. **Backup**: Siempre haz un backup de tu base de datos antes de ejecutar el import
5. **Dry Run primero**: Siempre ejecuta con `--dry` primero para ver qué haría el script

---

## 🔧 Solución de Problemas

### Error de conexión a MongoDB

Si usas MongoDB Atlas, agrega la IP de Railway/Render a la whitelist:
- Ve a MongoDB Atlas → Network Access
- Agrega IP: `0.0.0.0/0` (permite todas las IPs) o la IP específica de Railway

### Script se detiene

- Verifica los logs en tiempo real
- Usa `--limit 100` para probar con menos registros primero
- Verifica que los archivos CSV no estén corruptos

### Memoria insuficiente

- Railway y Render tienen límites de memoria
- Si el import es muy grande, considera dividirlo en lotes usando `--limit`

