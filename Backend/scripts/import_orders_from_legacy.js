#!/usr/bin/env node
import fs from 'fs';
import readline from 'readline';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { connectDB } from '../src/db.js';
import Sale from '../src/models/Sale.js';
import { upsertProfileFromSource } from '../src/controllers/profile.helper.js';

dotenv.config();

/*
 Script: import_orders_from_legacy.js
 Objetivo:
  - Importar órdenes de la BD legacy desde CSV (ordenes, clientes, automóviles).
  - Filtrar por empresa (or_fk_empresa) únicamente 2 (Shelby) y 3 (Casa Renault) o el mapeo que se pase por bandera.
  - Enlazar por placa y crear ventas (Sale) cerradas con datos mínimos (cliente/vehículo/observaciones).
  - Idempotente: si ya existe una venta con marcador LEGACY or_id=N, no duplica.
  - Opcionalmente, actualiza/crea CustomerProfile por placa para autocomplete y reportes.

 Uso:
  node scripts/import_orders_from_legacy.js \
    --orders C:/ruta/ordenesfinal.csv \
    --clients C:/ruta/clientesfinal.csv \
    --vehicles C:/ruta/automovilfinal.csv \
    --mongo "mongodb://localhost:27017" \
    --companyMap "2:<mongoCompanyIdShelby>,3:<mongoCompanyIdRenault>" \
    [--dry] [--limit 1000]

 Flags:
  --orders      Ruta al CSV de órdenes legacy (delimitador por defecto ';').
  --clients     Ruta al CSV de clientes (cl_*).
  --vehicles    Ruta al CSV de automóviles (au_*).
  --mongo       Cadena de conexión Mongo (requerida para importar).
  --companyMap  Mapeo idLegacy:idMongo separados por coma. Ej: "2:68cb...,3:68c8...". Si no se pasa, usa valores por defecto.
  --delimiter   Delimitador CSV (default ';').
  --encoding    Encoding de archivo (default 'utf8').
  --limit       Procesar solo N filas (debug).
  --dry         Solo simula (no escribe en DB).
  --noProfile   No actualiza/crea CustomerProfile.
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

const args = parseArgs(process.argv.slice(2));
if (!args.orders || !args.clients || !args.vehicles) {
  console.error('Faltan rutas: --orders --clients --vehicles');
  process.exit(1);
}

const delimiter = args.delimiter || ';';
const encoding = args.encoding || 'utf8';
const limit = args.limit ? parseInt(args.limit, 10) : null;
const dryRun = !!args.dry;
const doProfile = !args.noProfile;
const progressEvery = args.progressInterval ? parseInt(args.progressInterval, 10) : 2000; // filas

let companyMap = {};
// 1) Bandera --companyMap tiene prioridad
if (args.companyMap) {
  args.companyMap.split(',').forEach(pair => {
    const [legacy, mongo] = pair.split(':').map(s => s.trim());
    if (legacy && mongo) companyMap[legacy] = mongo;
  });
} else if (process.env.COMPANY_MAP) {
  // 2) Variable de entorno COMPANY_MAP ej: "2:xxx,3:yyy"
  process.env.COMPANY_MAP.split(',').forEach(pair => {
    const [legacy, mongo] = pair.split(':').map(s => s.trim());
    if (legacy && mongo) companyMap[legacy] = mongo;
  });
} else if (process.env.COMPANY_ID_SHELBY || process.env.COMPANY_ID_RENAULT || process.env.COMPANY_ID_2 || process.env.COMPANY_ID_3) {
  // 3) Variables dedicadas por empresa
  const id2 = process.env.COMPANY_ID_2 || process.env.COMPANY_ID_SHELBY;
  const id3 = process.env.COMPANY_ID_3 || process.env.COMPANY_ID_RENAULT;
  if (id2) companyMap['2'] = id2;
  if (id3) companyMap['3'] = id3;
} else {
  // 4) Valores por defecto de desarrollo (ajustar en prod)
  companyMap = { '2': '68cb18f4202d108152a26e4c', '3': '68c871198d7595062498d7a1' };
}

function normalizePlate(p) { return (p || '').toString().trim().toUpperCase(); }
function clean(s) { return (s == null) ? '' : String(s).trim(); }
function parseNumber(n) {
  if (n === null || n === undefined || n === '') return null;
  const num = parseInt(String(n).replace(/[^0-9]/g, ''), 10);
  return isNaN(num) ? null : num;
}
function parseDate(s) { if (!s) return null; const d = new Date(String(s).replace(/\"/g,'').trim()); return isNaN(d.getTime()) ? null : d; }

async function parseCSV(filePath, { delimiter, encoding }) {
  const rows = [];
  const rl = readline.createInterface({ input: fs.createReadStream(filePath, { encoding }), crlfDelay: Infinity });
  let headers = null;
  for await (const rawLine of rl) {
    const trimmed = rawLine.trim();
    if (!trimmed) continue;
    // split con comillas simples (sin comillas escapadas internas)
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
    const obj = Object.fromEntries(headers.map((h, i) => [h, cleanCols[i] ?? '']));
    rows.push(obj);
  }
  return rows;
}

const counters = { total: 0, skippedCompany: 0, skippedNoPlate: 0, imported: 0, updated: 0, duplicates: 0 };

async function main() {
  console.log('Leyendo CSV legacy...');
  const ordersRows = await parseCSV(args.orders, { delimiter, encoding });
  const clientRows = await parseCSV(args.clients, { delimiter, encoding });
  const vehicleRows = await parseCSV(args.vehicles, { delimiter, encoding });
  console.log(`Ordenes: ${ordersRows.length}, Clientes: ${clientRows.length}, Vehículos: ${vehicleRows.length}`);

  const clientIndex = new Map(clientRows.map(c => [String(c['cl_id']), c]));
  const vehicleIndex = new Map(vehicleRows.map(v => [String(v['au_id']), v]));
  const started = Date.now();
  const totalRows = ordersRows.length;
  function logProgress() {
    const p = Math.min(100, (counters.total / totalRows) * 100);
    const elapsed = (Date.now() - started) / 1000; // seg
    const rate = counters.total > 0 ? elapsed / counters.total : 0; // seg por fila
    const remaining = Math.max(0, totalRows - counters.total);
    const etaSec = rate * remaining;
    const fmt = (s)=>{ if (!Number.isFinite(s)) return '---'; if (s < 60) return `${s.toFixed(0)}s`; const m=Math.floor(s/60); const sec=Math.floor(s%60); return `${m}m ${sec}s`; };
    console.log(`[${p.toFixed(1)}%] ${counters.total}/${totalRows} · importados=${counters.imported} · actualizados=${counters.updated} · skippedEmp=${counters.skippedCompany} · sinPlaca=${counters.skippedNoPlate} · ETA ${fmt(etaSec)}`);
  }

  if (!dryRun) {
    const uri = args.mongo || process.env.MONGODB_URI;
    if (!uri) {
      console.error('Falta cadena Mongo: --mongo o MONGODB_URI');
      process.exit(1);
    }
    await connectDB(uri);
  }

  for (const row of ordersRows) {
    counters.total++;
    if (limit && counters.total > limit) break;

    const legacyCompanyId = String(row['or_fk_empresa']);
    if (!companyMap[legacyCompanyId]) { counters.skippedCompany++; continue; }
    const companyId = new mongoose.Types.ObjectId(companyMap[legacyCompanyId]);

    const legacyAutoId = String(row['or_fk_automovil'] || '');
    const legacyClienteId = String(row['or_fk_cliente'] || '');
    const veh = vehicleIndex.get(legacyAutoId);
    if (!veh) { counters.skippedNoPlate++; continue; }
    const plate = normalizePlate(veh['au_placa']);
    if (!plate || plate === 'VENTA') { counters.skippedNoPlate++; continue; }

    const cli = clientIndex.get(legacyClienteId) || {};
    const idNumber = clean(cli['cl_identificacion'] || '');
    const customerName = clean(cli['cl_nombre'] || '');
    const phone = clean(cli['cl_telefono'] || '');
    const email = clean(cli['cl_mail'] || '');
    const address = clean(cli['cl_direccion'] || '');

    const engine = veh?.['au_cilidraje'] ? String(veh['au_cilidraje']) : '';
    const year = parseNumber(veh?.['au_modelo']);
    const mileage = parseNumber(row['or_kilometraje']);
    const obs = clean(row['or_observacion'] || '');
    const otros = clean(row['or_otros'] || '');
    const legacyOrId = String(row['or_id'] || '').trim();
    const fecha = clean(row['or_fecha'] || '');
    const fechaEntrega = clean(row['or_fecha_entrega'] || '');
    const createdAt = parseDate(fecha) || new Date();
    const closedAt = parseDate(fechaEntrega) || createdAt;

    const legacyMarker = `LEGACY or_id=${legacyOrId} empresa=${legacyCompanyId}`;
    const notes = [legacyMarker, obs && `Obs: ${obs}`, otros && `Otros: ${otros}`].filter(Boolean).join('\n');

    if (dryRun) { counters.imported++; if (progressEvery && counters.total % progressEvery === 0) logProgress(); continue; }

    // Idempotencia: buscar por marcador en notas
    const existing = await Sale.findOne({ companyId, notes: { $regex: new RegExp(`\\b${legacyOrId}\\b`) }, 'vehicle.plate': plate });
    if (existing) {
      counters.duplicates++;
      // opcional: actualizar campos faltantes
      const update = { $set: {} };
      if (!existing.closedAt && closedAt) update.$set.closedAt = closedAt;
      if (!existing.customer?.name && customerName) update.$set['customer.name'] = customerName;
      if (!existing.customer?.idNumber && idNumber) update.$set['customer.idNumber'] = idNumber;
      if (!existing.customer?.phone && phone) update.$set['customer.phone'] = phone;
      if (!existing.customer?.email && email) update.$set['customer.email'] = email;
      if (!existing.customer?.address && address) update.$set['customer.address'] = address;
      if (!existing.vehicle?.engine && engine) update.$set['vehicle.engine'] = engine;
      if (existing.vehicle?.year == null && year != null) update.$set['vehicle.year'] = year;
      if (existing.vehicle?.mileage == null && mileage != null) update.$set['vehicle.mileage'] = mileage;
      if (Object.keys(update.$set).length) { await Sale.updateOne({ _id: existing._id }, update); counters.updated++; }
      if (progressEvery && counters.total % progressEvery === 0) logProgress();
      continue;
    }

    const saleDoc = await Sale.create({
      companyId,
      status: 'closed',
      origin: 'internal',
      technician: '',
      items: [],
      customer: { idNumber, name: customerName, phone, email, address },
      vehicle: { plate, brand: '', line: '', engine, year, mileage },
      notes,
      subtotal: 0,
      tax: 0,
      total: 0,
      closedAt
    });
    // Ajustar timestamps para reflejar fechas legacy (opcional)
    try { await Sale.updateOne({ _id: saleDoc._id }, { $set: { createdAt, updatedAt: closedAt || createdAt } }); } catch {}

    if (doProfile) {
      try { await upsertProfileFromSource(String(companyId), { customer: saleDoc.customer, vehicle: saleDoc.vehicle }, { source: 'script-legacy-orders', overwriteMileage: true, overwriteYear: true }); } catch {}
    }

    counters.imported++;
    if (progressEvery && counters.total % progressEvery === 0) logProgress();
  }

  console.log('Resumen importación:', JSON.stringify(counters, null, 2));
}

main().then(() => { if (!dryRun) mongoose.connection.close().catch(()=>{}); }).catch(err => { console.error(err); process.exit(1); });
