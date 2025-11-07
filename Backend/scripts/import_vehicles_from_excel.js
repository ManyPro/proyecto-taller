#!/usr/bin/env node
import fs from 'fs';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { connectDB } from '../src/db.js';
import Vehicle from '../src/models/Vehicle.js';
import XLSX from 'xlsx';

dotenv.config();

/*
Script: import_vehicles_from_excel.js
Goal: Importar vehículos desde un archivo Excel masivo

Usage:
  node scripts/import_vehicles_from_excel.js \
    --file Backend/data/vehiculos_renault.xlsx \
    [--dry] [--skip-duplicates]

Formato esperado del Excel:
  - Columna A: Marca (MAKE)
  - Columna B: Línea (LINE)
  - Columna C: Cilindraje (DISPLACEMENT)
  - Columna D: Modelo (MODEL_YEAR) - opcional, puede ser año fijo o rango

Flags:
  --file              Ruta al archivo Excel (requerido)
  --dry               Preview sin escribir a la base de datos
  --skip-duplicates   No mostrar error si ya existe el vehículo
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

if (!fs.existsSync(filePath)) {
  console.error(`❌ Error: El archivo no existe: ${filePath}`);
  process.exit(1);
}

async function main() {
  try {
    if (!dryRun) {
      await connectDB();
      console.log('✅ Conectado a MongoDB');
    } else {
      console.log('🔍 Modo DRY RUN - No se escribirán cambios');
    }

    // Leer Excel
    console.log(`📖 Leyendo archivo: ${filePath}`);
    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

    console.log(`📊 Filas encontradas: ${data.length}`);

    // Detectar headers (primera fila)
    const headers = data[0] || [];
    const headerMap = {};
    headers.forEach((h, idx) => {
      const key = cleanStr(h);
      if (key.includes('MARCA') || key.includes('MAKE')) headerMap.make = idx;
      if (key.includes('LINEA') || key.includes('LINE')) headerMap.line = idx;
      if (key.includes('CILINDRAJE') || key.includes('DISPLACEMENT') || key.includes('MOTOR') || key.includes('ENGINE')) headerMap.displacement = idx;
      if (key.includes('MODELO') || key.includes('MODEL') || key.includes('YEAR') || key.includes('AÑO')) headerMap.modelYear = idx;
    });

    // Si no se detectaron headers, usar posiciones por defecto (A=0, B=1, C=2, D=3)
    if (Object.keys(headerMap).length === 0) {
      console.log('⚠️  No se detectaron headers, usando posiciones por defecto: A=Marca, B=Línea, C=Cilindraje, D=Modelo');
      headerMap.make = 0;
      headerMap.line = 1;
      headerMap.displacement = 2;
      headerMap.modelYear = 3;
    }

    console.log('📋 Mapeo de columnas:', headerMap);

    let imported = 0;
    let skipped = 0;
    let errors = 0;
    const errorsList = [];

    // Procesar filas (saltar header si existe)
    const startRow = headers.some(h => cleanStr(h).includes('MARCA') || cleanStr(h).includes('MAKE')) ? 1 : 0;

    for (let i = startRow; i < data.length; i++) {
      const row = data[i] || [];
      const make = cleanStr(row[headerMap.make]);
      const line = cleanStr(row[headerMap.line]);
      const displacement = cleanStr(row[headerMap.displacement]);
      const modelYearRaw = row[headerMap.modelYear];
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

