# Importar Vehículos desde CSV

## Instrucciones

El script está listo para importar vehículos desde el archivo CSV. Solo necesitas ejecutarlo con la URI correcta de MongoDB.

### Opción 1: Si tienes MongoDB local corriendo

```bash
cd Backend
$env:MONGODB_URI = "mongodb://localhost:27017/taller"
node scripts/import_vehicles_from_excel.js --file "data/vehiculos_colombia_2025_completo.csv" --skip-duplicates
```

### Opción 2: Si usas Docker

```bash
cd Backend
$env:MONGODB_URI = "mongodb://mongo:27017/taller"  # Si MongoDB está en Docker
node scripts/import_vehicles_from_excel.js --file "data/vehiculos_colombia_2025_completo.csv" --skip-duplicates
```

### Opción 3: Si tienes un archivo .env

Asegúrate de que tu archivo `.env` en el directorio raíz tenga:
```
MONGODB_URI=mongodb://tu_servidor:27017/taller
```

Luego ejecuta:
```bash
cd Backend
node scripts/import_vehicles_from_excel.js --file "data/vehiculos_colombia_2025_completo.csv" --skip-duplicates
```

### Opción 4: Usando npm script

Si tienes MONGODB_URI en tu .env:
```bash
cd Backend
npm run import:vehicles -- --file "data/vehiculos_colombia_2025_completo.csv" --skip-duplicates
```

## Características del script

- ✅ Soporta CSV y Excel
- ✅ Detecta automáticamente columnas (MARCA, LÍNEA, CILINDRAJE, MODELO)
- ✅ Ignora acentos en nombres de columnas
- ✅ Omite duplicados si usas `--skip-duplicates`
- ✅ Modo dry-run disponible con `--dry`

## Resultado esperado

El script importará **419 vehículos** desde el archivo CSV.

