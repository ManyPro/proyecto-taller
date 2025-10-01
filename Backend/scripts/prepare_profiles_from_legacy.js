#!/usr/bin/env node
import fs from 'fs';
import readline from 'readline';
import { fileURLToPath } from 'url';
import { connectDB } from '../src/db.js';
import CustomerProfile from '../src/models/CustomerProfile.js';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

/*
 Script: prepare_profiles_from_legacy.js
 Objetivo:
  - Leer archivos CSV (ordenes.csv, clientes.csv, automoviles.csv) de la base de datos legacy.
  - Filtrar filas por columna or_fk_empresa (2 = Serviteca Shelby, 3 = Casa Renault H&H, descartar 1 u otros).
  - Usar or_fk_automovil y or_fk_cliente para buscar detalle en automoviles y clientes.
  - Generar (modo dry-run) un JSON y un resumen por empresa de los perfiles que se crearían.
  - En modo --import crear/actualizar documentos CustomerProfile asegurando unicidad (companyId + plate).

 Uso:
  node scripts/prepare_profiles_from_legacy.js --orders path/ordenes.csv --clients path/clientes.csv --vehicles path/automoviles.csv --companyMap "2:68cb18f4202d108152a26e4c,3:68c871198d7595062498d7a1" --mongo "mongodb://localhost:27017" [--import]

 Flags:
  --orders      Ruta al CSV de órdenes legacy.
  --clients     Ruta al CSV de clientes (cabeceras: cl_id, cl_identificacion, cl_nombre, cl_telefono, cl_direccion, cl_mail, ...)
  --vehicles    Ruta al CSV de automóviles (cabeceras: au_id, au_placa, au_cilidraje, au_fk_cliente, au_modelo, ...)
  --companyMap  Mapeo idLegacy:idMongo separados por coma.
  --mongo       Cadena de conexión Mongo (solo necesaria con --import).
  --delimiter   Delimitador CSV (default ';').
  --encoding    Encoding de archivo (default 'utf8').
  --limit       Procesar solo N filas (debug).
  --import      Ejecuta inserción/actualización en Mongo.
  --jsonOut     Ruta para escribir JSON con perfiles preparados.
  --bulk        Usa bulkWrite para mayor velocidad.
  --batchSize   Tamaño de lote para bulk (default 500).

 Nota: Este script asume (por ahora) que el CSV contiene las columnas mínimas de identificación de cliente/vehículo.
  Necesitamos confirmar nombres exactos de columnas para mapear a: idNumber, nombre, teléfono, email, dirección, placa, marca, linea, motor, año, kilometraje.
*/

// Argument parser que soporta:
//  --key=value
//  --key value
//  --flag (boolean true)
function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    let token = argv[i];
    if (!token.startsWith('--')) continue; // ignorar valores sueltos previos y prevenir claves mal formadas
    token = token.slice(2);
    if (token.includes('=')) {
      const [k, v] = token.split(/=(.*)/); // split solo en primer '='
      out[k] = v;
    } else {
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        out[token] = next;
        i++; // saltar valor
      } else {
        out[token] = true; // flag booleana
      }
    }
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
// console.log('DEBUG args:', args); // descomentar para depurar

if (!args.orders) {
  console.error('Falta --orders ruta al CSV de órdenes');
  process.exit(1);
}
if (!args.clients) {
  console.error('Falta --clients ruta al CSV de clientes');
  process.exit(1);
}
if (!args.vehicles) {
  console.error('Falta --vehicles ruta al CSV de automóviles');
  process.exit(1);
}

const delimiter = args.delimiter || ';';
const encoding = args.encoding || 'utf8';
const limit = args.limit ? parseInt(args.limit, 10) : null;

// Parse mapping legacy company id -> mongo objectId
let companyMap = {};
if (args.companyMap) {
  args.companyMap.split(',').forEach(pair => {
    const [legacy, mongo] = pair.split(':').map(s => s.trim());
    if (legacy && mongo) companyMap[legacy] = mongo;
  });
} else {
  companyMap = { '2': '68cb18f4202d108152a26e4c', '3': '68c871198d7595062498d7a1' }; // default per requerimiento
}

// Set of rows counters
const counters = {
  total: 0,
  skippedCompany: 0,
  processed: 0,
  byCompany: {}
};

function normalizePlate(p) {
  return (p || '').toString().trim().toUpperCase();
}

function parseNumber(n) {
  if (n === null || n === undefined || n === '') return null;
  const num = parseInt(String(n).replace(/[^0-9]/g, ''), 10);
  return isNaN(num) ? null : num;
}

// Utility to parse a CSV with given delimiter into array of objects
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
    // naive split respecting simple quoted fields (no embedded quotes)
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
    const clean = cols.map(c => c.replace(/^"|"$/g, '').trim());
    if (!headers) {
      headers = clean;
      continue;
    }
    const obj = Object.fromEntries(headers.map((h, i) => [h, clean[i] ?? '']));
    rows.push(obj);
  }
  return rows;
}

// We will build a map compositeKey -> profileData (to merge duplicates across orders)
const profiles = new Map();

async function main() {
  console.log('Leyendo CSV legacy...');
  const ordersRows = await parseCSV(args.orders, { delimiter, encoding });
  const clientRows = await parseCSV(args.clients, { delimiter, encoding });
  const vehicleRows = await parseCSV(args.vehicles, { delimiter, encoding });

  console.log(`Ordenes: ${ordersRows.length}, Clientes: ${clientRows.length}, Vehículos: ${vehicleRows.length}`);

  // Index clients by cl_id
  const clientIndex = new Map();
  for (const c of clientRows) {
    clientIndex.set(String(c['cl_id']), c);
  }
  // Index vehicles by au_id
  const vehicleIndex = new Map();
  for (const v of vehicleRows) {
    vehicleIndex.set(String(v['au_id']), v);
  }

  for (const row of ordersRows) {
    counters.total++;
    if (limit && counters.total > limit) break;
    const legacyCompanyId = row['or_fk_empresa'];
    if (!companyMap[legacyCompanyId]) { counters.skippedCompany++; continue; }
    const companyId = companyMap[legacyCompanyId];

    const legacyAutoId = String(row['or_fk_automovil'] || '');
    const legacyClienteId = String(row['or_fk_cliente'] || '');
    const veh = vehicleIndex.get(legacyAutoId);
    const cli = clientIndex.get(legacyClienteId);
    if (!veh) continue; // Sin vehículo no hay placa
    const plate = normalizePlate(veh['au_placa']);
    if (!plate || plate === 'VENTA') continue; // descartar registros placeholder

    const customerName = cli?.['cl_nombre'] || '';
    const idNumber = cli?.['cl_identificacion'] || '';
    const phone = cli?.['cl_telefono'] || '';
    const email = cli?.['cl_mail'] || '';
    const address = cli?.['cl_direccion'] || '';

    const engine = veh?.['au_cilidraje'] ? String(veh['au_cilidraje']) : '';
    const year = parseNumber(veh?.['au_modelo']);
    const mileage = parseNumber(row['or_kilometraje']);
    // brand / line not available in provided CSVs yet (au_fk_marca, au_fk_serie are numeric fks). Leave blank for now.
    const brand = '';
    const line = '';

    const key = companyId + '::' + plate;
    const existing = profiles.get(key) || {
      companyId,
      plate,
      customer: { idNumber: '', name: '', phone: '', email: '', address: '' },
      vehicle: { plate, brand: '', line: '', engine: '', year: null, mileage: null }
    };

    function fill(targetObj, sourceObj) {
      for (const k of Object.keys(sourceObj)) {
        if (sourceObj[k] && (!targetObj[k] || targetObj[k] === '')) {
          targetObj[k] = sourceObj[k];
        }
      }
    }
    fill(existing.customer, { idNumber, name: customerName, phone, email, address });
    fill(existing.vehicle, { engine });
    if (brand && !existing.vehicle.brand) existing.vehicle.brand = brand;
    if (line && !existing.vehicle.line) existing.vehicle.line = line;
    if (year && !existing.vehicle.year) existing.vehicle.year = year;
    if (mileage && (!existing.vehicle.mileage || mileage > existing.vehicle.mileage)) existing.vehicle.mileage = mileage;

    profiles.set(key, existing);
    counters.processed++;
    counters.byCompany[companyId] = (counters.byCompany[companyId] || 0) + 1;
  }

  // Summary
  console.log('Resumen procesamiento:');
  console.table({ totalLineas: counters.total, descartadasEmpresa: counters.skippedCompany, perfilesUnicos: profiles.size });
  console.log('Por empresa:', counters.byCompany);

  const outArr = Array.from(profiles.values());

  if (args.jsonOut) {
    fs.writeFileSync(args.jsonOut, JSON.stringify(outArr, null, 2), 'utf8');
    console.log('JSON escrito en', args.jsonOut);
  }

  if (args.import) {
    let mongoUri = args.mongo || process.env.MONGODB_URI;
    if (!mongoUri) {
      console.error('Falta --mongo o variable de entorno MONGODB_URI para importar');
      process.exit(1);
    }
    // Remover comillas externas si las hay
    mongoUri = mongoUri.replace(/^"|"$/g, '').replace(/^'|'$/g, '');
    // A veces en PowerShell las comillas se quedan literales al pasar como arg.
    if (!/^mongodb(\+srv)?:\/\//i.test(mongoUri)) {
      console.error('La URI de Mongo parece inválida. Debe comenzar con mongodb:// o mongodb+srv:// -> Recibido:', mongoUri);
      console.error('Ejemplo local:  --mongo mongodb://localhost:27017');
      process.exit(1);
    }
    console.log('Conectando a Mongo:', mongoUri);
    try {
      await connectDB(mongoUri);
    } catch (e) {
      console.error('Error conectando a Mongo:', e.message);
      process.exit(1);
    }
    const useBulk = !!args.bulk;
    if (useBulk) {
      const batchSize = args.batchSize ? parseInt(args.batchSize, 10) : 500;
      let totalInserted = 0, totalModified = 0, totalUpserts = 0, totalBatches = 0;
      let buffer = [];
      for (const profile of outArr) {
        buffer.push({
          updateOne: {
            filter: { companyId: profile.companyId, plate: profile.plate },
            update: { $set: profile },
            upsert: true
          }
        });
        if (buffer.length >= batchSize) {
          const res = await CustomerProfile.bulkWrite(buffer, { ordered: false });
            totalInserted += res.upsertedCount || 0;
            totalModified += res.modifiedCount || 0;
            totalUpserts += res.upsertedIds ? Object.keys(res.upsertedIds).length : 0;
            totalBatches++;
            buffer = [];
        }
      }
      if (buffer.length) {
        const res = await CustomerProfile.bulkWrite(buffer, { ordered: false });
        totalInserted += res.upsertedCount || 0;
        totalModified += res.modifiedCount || 0;
        totalUpserts += res.upsertedIds ? Object.keys(res.upsertedIds).length : 0;
        totalBatches++;
      }
      console.log('Import (bulk) terminado', { totalInserted, totalModified, totalUpserts, totalBatches });
    } else {
      let inserted = 0, updated = 0, errors = 0;
      for (const profile of outArr) {
        try {
          const res = await CustomerProfile.findOneAndUpdate(
            { companyId: profile.companyId, plate: profile.plate },
            { $set: profile },
            { upsert: true, new: true, setDefaultsOnInsert: true }
          );
          if (res.createdAt.getTime() === res.updatedAt.getTime()) inserted++; else updated++;
        } catch (e) {
          errors++;
          console.error('Error guardando perfil', profile.companyId, profile.plate, e.message);
        }
      }
      console.log('Import terminado (findOneAndUpdate loop)', { inserted, updated, errors });
    }
    await mongoose.disconnect();
  } else {
    console.log('Modo dry-run (sin --import). Use --jsonOut para exportar los perfiles.');
  }
}

main().catch(err => { console.error(err); process.exit(1); });
