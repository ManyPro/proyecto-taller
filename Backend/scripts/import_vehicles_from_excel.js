#!/usr/bin/env node
import fs from 'fs';
import readline from 'readline';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { connectDB } from '../src/db.js';
import Vehicle from '../src/models/Vehicle.js';
import XLSX from 'xlsx';

dotenv.config();

/*
Script: import_vehicles_from_excel.js
Goal: Importar vehículos desde un archivo Excel o CSV masivo

Usage:
  node scripts/import_vehicles_from_excel.js \
    --file Backend/data/vehiculos_colombia_2025_completo.csv \
    [--dry] [--skip-duplicates] [--delimiter ";"] [--encoding "utf8"]

Formato esperado del archivo:
  - Columna: Marca (MAKE)
  - Columna: Línea (LINE)
  - Columna: Cilindraje (DISPLACEMENT)
  - Columna: Modelo (MODEL_YEAR) - opcional, puede ser año fijo o rango

Flags:
  --file              Ruta al archivo Excel o CSV (requerido)
  --dry               Preview sin escribir a la base de datos
  --skip-duplicates   No mostrar error si ya existe el vehículo
  --delimiter         Delimitador CSV (default: "," o detectado automáticamente)
  --encoding          Codificación del archivo (default: "utf8")
*/

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    let token = argv[i];
    if (!token.startsWith('--')) continue;
    token = token.slice(2);
    if (token.includes('=')) {
      const [k, v] = token.split(/=(.*)/);
      out[k] = v;
    } else {
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) { out[token] = next; i++; }
      else out[token] = true;
    }
  }
  return out;
}

function cleanStr(v) {
  return String(v ?? '').trim().toUpperCase();
}

// Normalizar string removiendo acentos para comparación
function normalizeForMatch(str) {
  return String(str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();
}

function validateModelYear(modelYear) {
  if (!modelYear) return true;
  const trimmed = String(modelYear).trim();
  if (/^\d{4}$/.test(trimmed)) return true; // Single year
  if (/^\d{4}-\d{4}$/.test(trimmed)) { // Year range
    const [start, end] = trimmed.split('-').map(Number);
    return start <= end;
  }
  return false;
}

const args = parseArgs(process.argv.slice(2));

if (!args.file) {
  console.error('❌ Error: --file es requerido');
  console.error('Usage: node scripts/import_vehicles_from_excel.js --file <path> [--dry] [--skip-duplicates]');
  process.exit(1);
}

const filePath = args.file;
const dryRun = !!args.dry;
const skipDuplicates = !!args.skipDuplicates;
const delimiter = args.delimiter || ',';
const encoding = args.encoding || 'utf8';

if (!fs.existsSync(filePath)) {
  console.error(`❌ Error: El archivo no existe: ${filePath}`);
  process.exit(1);
}

const isCSV = filePath.toLowerCase().endsWith('.csv');
const isExcel = filePath.toLowerCase().endsWith('.xlsx') || filePath.toLowerCase().endsWith('.xls');

if (!isCSV && !isExcel) {
  console.error(`❌ Error: El archivo debe ser CSV (.csv) o Excel (.xlsx, .xls)`);
  process.exit(1);
}

// Función para parsear CSV
async function parseCSV(filePath, { delimiter, encoding }) {
  const rows = [];
  const rl = readline.createInterface({
    input: fs.createReadStream(filePath, { encoding }),
    crlfDelay: Infinity
  });
  let headers = null;
  for await (const rawLine of rl) {
    const line = rawLine.trim();
    if (!line) continue;
    const cols = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < rawLine.length; i++) {
      const ch = rawLine[i];
      if (ch === '"') { inQuotes = !inQuotes; continue; }
      if (ch === delimiter && !inQuotes) { cols.push(current.trim()); current = ''; continue; }
      current += ch;
    }
    if (current.length) cols.push(current.trim());
    const cleanCols = cols.map(c => c.replace(/^\"|\"$/g, '').trim());
    if (!headers) { headers = cleanCols; continue; }
    const obj = Object.fromEntries(headers.map((h, idx) => [h, cleanCols[idx] ?? '']));
    rows.push(obj);
  }
  return { headers, rows };
}

async function main() {
  try {
    if (!dryRun) {
      const uri = process.env.MONGODB_URI;
      if (!uri) {
        console.error('❌ Error: MONGODB_URI no está definido en las variables de entorno');
        console.error('   Asegúrate de tener un archivo .env con MONGODB_URI o ejecuta:');
        console.error('   MONGODB_URI="mongodb://..." node scripts/import_vehicles_from_excel.js --file ...');
        process.exit(1);
      }
      await connectDB(uri);
      console.log('✅ Conectado a MongoDB');
    } else {
      console.log('🔍 Modo DRY RUN - No se escribirán cambios');
    }

    let headers = [];
    let rows = [];
    let headerMap = {};

    // Leer archivo según tipo
    console.log(`📖 Leyendo archivo: ${filePath} (${isCSV ? 'CSV' : 'Excel'})`);
    
    if (isCSV) {
      const parsed = await parseCSV(filePath, { delimiter, encoding });
      headers = parsed.headers || [];
      rows = parsed.rows || [];
      console.log(`📊 Filas encontradas: ${rows.length}`);
      
      // Mapear headers por nombre de columna (normalizando para ignorar acentos)
      headers.forEach((h, idx) => {
        const key = normalizeForMatch(h);
        if (key.includes('MARCA') || key.includes('MAKE')) headerMap.make = h;
        if (key.includes('LINEA') || key.includes('LINE')) headerMap.line = h;
        if (key.includes('CILINDRAJE') || key.includes('DISPLACEMENT') || key.includes('MOTOR') || key.includes('ENGINE')) headerMap.displacement = h;
        if (key.includes('MODELO') || key.includes('MODEL') || key.includes('YEAR') || key.includes('ANO')) headerMap.modelYear = h;
      });
      
      // Si no se detectaron headers, usar primeras columnas por posición
      if (Object.keys(headerMap).length === 0 && headers.length > 0) {
        console.log('⚠️  No se detectaron headers, usando primeras columnas: Col1=Marca, Col2=Línea, Col3=Cilindraje, Col4=Modelo');
        headerMap.make = headers[0] || '';
        headerMap.line = headers[1] || '';
        headerMap.displacement = headers[2] || '';
        headerMap.modelYear = headers[3] || '';
      }
    } else {
      // Leer Excel
      const workbook = XLSX.readFile(filePath);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
      console.log(`📊 Filas encontradas: ${data.length}`);

      // Detectar headers (primera fila)
      headers = data[0] || [];
      headers.forEach((h, idx) => {
        const key = normalizeForMatch(h);
        if (key.includes('MARCA') || key.includes('MAKE')) headerMap.make = idx;
        if (key.includes('LINEA') || key.includes('LINE')) headerMap.line = idx;
        if (key.includes('CILINDRAJE') || key.includes('DISPLACEMENT') || key.includes('MOTOR') || key.includes('ENGINE')) headerMap.displacement = idx;
        if (key.includes('MODELO') || key.includes('MODEL') || key.includes('YEAR') || key.includes('ANO')) headerMap.modelYear = idx;
      });

      // Si no se detectaron headers, usar posiciones por defecto (A=0, B=1, C=2, D=3)
      if (Object.keys(headerMap).length === 0) {
        console.log('⚠️  No se detectaron headers, usando posiciones por defecto: A=Marca, B=Línea, C=Cilindraje, D=Modelo');
        headerMap.make = 0;
        headerMap.line = 1;
        headerMap.displacement = 2;
        headerMap.modelYear = 3;
      }
      
      // Para Excel, mantener data como array de arrays
      rows = data;
    }

    console.log('📋 Mapeo de columnas:', headerMap);

    let imported = 0;
    let skipped = 0;
    let errors = 0;
    const errorsList = [];

    // Determinar fila inicial (saltar header si existe)
    const startRow = isCSV ? 0 : (headers.some(h => cleanStr(h).includes('MARCA') || cleanStr(h).includes('MAKE')) ? 1 : 0);

    // Procesar filas
    for (let i = startRow; i < rows.length; i++) {
      const row = rows[i];
      let make, line, displacement, modelYearRaw;
      
      if (isCSV) {
        // CSV: row es un objeto con nombres de columnas
        make = cleanStr(row[headerMap.make] || '');
        line = cleanStr(row[headerMap.line] || '');
        displacement = cleanStr(row[headerMap.displacement] || '');
        modelYearRaw = row[headerMap.modelYear];
      } else {
        // Excel: row es un array, usar índices
        make = cleanStr((row[headerMap.make] || '').toString());
        line = cleanStr((row[headerMap.line] || '').toString());
        displacement = cleanStr((row[headerMap.displacement] || '').toString());
        modelYearRaw = row[headerMap.modelYear];
      }
      
      const modelYear = modelYearRaw ? cleanStr(String(modelYearRaw)) : '';

      // Validar campos requeridos
      if (!make || !line || !displacement) {
        errors++;
        errorsList.push(`Fila ${i + 1}: Faltan campos requeridos (Marca: ${make}, Línea: ${line}, Cilindraje: ${displacement})`);
        continue;
      }

      // Validar modelo
      if (modelYear && !validateModelYear(modelYear)) {
        errors++;
        errorsList.push(`Fila ${i + 1}: Modelo inválido "${modelYear}" (debe ser YYYY o YYYY-YYYY)`);
        continue;
      }

      const vehicleData = {
        make,
        line,
        displacement,
        modelYear: modelYear || null,
        active: true
      };

      if (dryRun) {
        console.log(`  [DRY] ${make} ${line} ${displacement} ${modelYear || '(sin modelo)'}`);
        imported++;
        continue;
      }

      try {
        // Buscar si ya existe
        const existing = await Vehicle.findOne({
          make,
          line,
          displacement,
          modelYear: modelYear || null,
          active: true
        });

        if (existing) {
          if (skipDuplicates) {
            skipped++;
            continue;
          } else {
            errors++;
            errorsList.push(`Fila ${i + 1}: Ya existe vehículo ${make} ${line} ${displacement} ${modelYear || '(sin modelo)'}`);
            continue;
          }
        }

        await Vehicle.create(vehicleData);
        imported++;
        if (imported % 100 === 0) {
          console.log(`  ✅ Importados: ${imported}...`);
        }
      } catch (err) {
        if (err.code === 11000) {
          if (skipDuplicates) {
            skipped++;
            continue;
          }
          errors++;
          errorsList.push(`Fila ${i + 1}: Duplicado (índice único): ${make} ${line} ${displacement} ${modelYear || '(sin modelo)'}`);
        } else {
          errors++;
          errorsList.push(`Fila ${i + 1}: Error: ${err.message}`);
        }
      }
    }

    console.log('\n📊 Resumen:');
    console.log(`  ✅ Importados: ${imported}`);
    console.log(`  ⏭️  Omitidos: ${skipped}`);
    console.log(`  ❌ Errores: ${errors}`);

    if (errorsList.length > 0 && errorsList.length <= 20) {
      console.log('\n❌ Errores detallados:');
      errorsList.forEach(e => console.log(`  - ${e}`));
    } else if (errorsList.length > 20) {
      console.log(`\n❌ Primeros 20 errores de ${errorsList.length}:`);
      errorsList.slice(0, 20).forEach(e => console.log(`  - ${e}`));
    }

    if (!dryRun) {
      console.log('\n✅ Importación completada');
      await mongoose.connection.close();
    }
  } catch (err) {
    console.error('❌ Error fatal:', err);
    process.exit(1);
  }
}

main();

