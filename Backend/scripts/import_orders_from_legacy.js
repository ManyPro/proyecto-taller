#!/usr/bin/env node
import fs from 'fs';
import readline from 'readline';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { connectDB } from '../src/db.js';
import Sale from '../src/models/Sale.js';
import Vehicle from '../src/models/Vehicle.js';
import CustomerProfile from '../src/models/CustomerProfile.js';
import { upsertProfileFromSource } from '../src/controllers/profile.helper.js';

dotenv.config();

/*
 Script: import_orders_from_legacy.js
 Goal:
  - Import legacy orders from CSV files (orders, clients, vehicles and optional product/service details).
  - Attach detailed service and product lines so the sales history mirrors the legacy totals.
  - Filter by company using --companyMap (defaults to legacy ids 2=Shelby, 3=Casa Renault).
  - Idempotent based on legacyOrId marker: LEGACY or_id=<id>.
  - Optionally refresh CustomerProfile entries per plate.

 Usage:
  node scripts/import_orders_from_legacy.js \
    --orders C:/path/ordenesfinal.csv \
    --clients C:/path/clientesfinal.csv \
    --vehicles C:/path/automovilfinal.csv \
    --orderProducts C:/path/relaorder.csv \
    --products C:/path/productos.csv \
    --orderServices C:/path/relaservice.csv \
    --services C:/path/servicios.csv \
    --remisions C:/path/remisions.csv \
    --mongo "mongodb://localhost:27017" \
    --companyMap "2:<mongoCompanyIdShelby>,3:<mongoCompanyIdRenault>" \
    [--dry] [--limit 1000] [--noProfile]

 Flags:
  --orders, --clients, --vehicles   Required CSV paths.
  --orderProducts                   Optional CSV with product lines per order (relaorder.csv).
  --products                        Optional CSV catalog of products (productos.csv).
  --orderServices                   Optional CSV with service lines per order (relaservice.csv).
  --services                        Optional CSV catalog of services (servicios.csv).
  --remisions                       Optional CSV with order totals (remisions.csv).
  --mongo                           Mongo connection string (required unless --dry).
  --companyMap                      LegacyId:MongoId pairs separated by comma.
  --delimiter                       CSV delimiter (default ';').
  --encoding                        File encoding (default 'utf8').
  --limit                           Process only the first N orders.
  --dry                             Preview without writing to Mongo.
  --noProfile                       Skip CustomerProfile upserts.
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
  console.error('Missing required CSV paths: --orders --clients --vehicles');
  process.exit(1);
}

const delimiter = args.delimiter || ';';
const encoding = args.encoding || 'utf8';
const limit = args.limit ? parseInt(args.limit, 10) : null;
const dryRun = !!args.dry;
const doProfile = !args.noProfile;
const progressEvery = args.progressInterval ? parseInt(args.progressInterval, 10) : 100; // Mostrar progreso cada 100 registros
const progressTimeInterval = 30000; // Mostrar progreso cada 30 segundos aunque no haya llegado al umbral

const detailPaths = {
  orderProducts: args.orderProducts,
  products: args.products,
  orderServices: args.orderServices,
  services: args.services,
  remisions: args.remisions || (args.remisions === undefined && args.orders ? args.orders.replace(/ordenesfinal\.csv$/i, 'remis.csv') : null)
};
const detailMode = Object.values(detailPaths).some(Boolean);

// Auto-detectar archivos en la misma carpeta que orders
if (args.orders) {
  const baseDir = args.orders.replace(/[^/\\]+$/, '');
  
  // Auto-detectar remis.csv
  if (!detailPaths.remisions) {
    const remisPath = baseDir + 'remis.csv';
    if (fs.existsSync(remisPath)) {
      detailPaths.remisions = remisPath;
      console.log(`Auto-detected remis.csv: ${remisPath}`);
    }
  }
  
  // Auto-detectar productos.csv
  if (!detailPaths.products) {
    const productsPath = baseDir + 'productos.csv';
    if (fs.existsSync(productsPath)) {
      detailPaths.products = productsPath;
      console.log(`Auto-detected productos.csv: ${productsPath}`);
    }
  }
  
  // Auto-detectar servicios.csv
  if (!detailPaths.services) {
    const servicesPath = baseDir + 'servicios.csv';
    if (fs.existsSync(servicesPath)) {
      detailPaths.services = servicesPath;
      console.log(`Auto-detected servicios.csv: ${servicesPath}`);
    }
  }
}

let companyMap = {};
if (args.companyMap) {
  args.companyMap.split(',').forEach(pair => {
    const [legacy, mongo] = pair.split(':').map(s => s.trim());
    if (legacy && mongo) companyMap[legacy] = mongo;
  });
} else if (process.env.COMPANY_MAP) {
  process.env.COMPANY_MAP.split(',').forEach(pair => {
    const [legacy, mongo] = pair.split(':').map(s => s.trim());
    if (legacy && mongo) companyMap[legacy] = mongo;
  });
} else if (process.env.COMPANY_ID_SHELBY || process.env.COMPANY_ID_RENAULT || process.env.COMPANY_ID_2 || process.env.COMPANY_ID_3) {
  const id2 = process.env.COMPANY_ID_2 || process.env.COMPANY_ID_SHELBY;
  const id3 = process.env.COMPANY_ID_3 || process.env.COMPANY_ID_RENAULT;
  if (id2) companyMap['2'] = id2;
  if (id3) companyMap['3'] = id3;
} else {
  companyMap = { '2': '68cb18f4202d108152a26e4c', '3': '68c871198d7595062498d7a1' };
}

function normalizePlate(p) { return (p || '').toString().trim().toUpperCase(); }
function clean(value) { return value == null ? '' : String(value).trim(); }
function parseNumber(n) {
  if (n === null || n === undefined || n === '') return null;
  const num = parseInt(String(n).replace(/[^0-9]/g, ''), 10);
  return Number.isNaN(num) ? null : num;
}
function parseDate(value) {
  if (!value && value !== 0) return null;
  const raw = String(value).replace(/\"/g, '').trim();
  if (!raw) return null;
  const isoGuess = raw.includes('T') ? raw : raw.replace(' ', 'T');
  const first = new Date(isoGuess);
  if (!Number.isNaN(first.getTime())) return first;
  const fallback = new Date(raw);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
}

const DIFF_TOLERANCE = 0.0001;

function parseMoney(value) {
  if (value === null || value === undefined) return 0;
  const str = String(value).replace(/[^0-9\-.,]/g, '').trim();
  if (!str) return 0;
  const normalized = str.replace(/,/g, '');
  const num = Number.parseFloat(normalized);
  return Number.isFinite(num) ? num : 0;
}

function parseFloatSafe(value) {
  if (value === null || value === undefined || value === '') return 0;
  const str = String(value).replace(/[^0-9\-.,]/g, '').trim();
  if (!str) return 0;
  const normalized = str.replace(/,/g, '');
  const num = Number.parseFloat(normalized);
  return Number.isFinite(num) ? num : 0;
}

function asMoney(n) {
  const num = Number(n);
  if (!Number.isFinite(num)) return 0;
  return Math.round(num * 100) / 100;
}

function asQuantity(n) {
  const num = Number(n);
  if (!Number.isFinite(num)) return 0;
  return Math.round(num * 1000) / 1000;
}

function indexRows(rows, fieldName) {
  const map = new Map();
  for (const row of rows || []) {
    const key = String(row[fieldName] ?? '').trim();
    if (!key) continue;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  }
  return map;
}

function mapRows(rows, fieldName) {
  const map = new Map();
  for (const row of rows || []) {
    const key = String(row[fieldName] ?? '').trim();
    if (!key) continue;
    map.set(key, row);
  }
  return map;
}

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
  return rows;
}

function buildLegacyItems({ productRows = [], serviceRows = [], productCatalog, serviceCatalog, remisionRow }) {
  const items = [];
  let productTotal = 0;
  let serviceTotal = 0;

  for (const row of productRows) {
    const productId = String(row['rpo_fk_producto'] ?? row['rpo_producto'] ?? '').trim();
    let qty = parseFloatSafe(row['rpo_cantidad'] ?? row['cantidad'] ?? '');
    let unitPrice = parseMoney(row['rpo_precio'] ?? row['precio'] ?? '');
    let total = parseMoney(row['rpo_total'] ?? row['total'] ?? '');
    if (total === 0 && unitPrice && qty) total = unitPrice * qty;
    if (!unitPrice && total && qty) unitPrice = total / qty;
    if (!qty || qty <= 0) {
      if (unitPrice && total) qty = total / unitPrice;
      else if (total && !unitPrice) { unitPrice = total; qty = 1; }
      else if (unitPrice && !total) { total = unitPrice; qty = 1; }
    }
    if ((!qty || qty <= 0) && !total && !unitPrice) continue;

    qty = qty && qty > 0 ? qty : 1;
    unitPrice = asMoney(unitPrice || (total / qty) || 0);
    total = asMoney(total || unitPrice * qty);
    qty = asQuantity(qty);

    const catalog = productCatalog.get(productId) || {};
    // Intentar múltiples nombres de columnas posibles
    const skuSource = clean(catalog['pr_codigo'] ?? catalog['codigo'] ?? catalog['pr_cod'] ?? catalog['cod'] ?? '');
    const nameSource = clean(catalog['pr_nombre'] ?? catalog['nombre'] ?? catalog['pr_name'] ?? catalog['name'] ?? catalog['descripcion'] ?? catalog['desc'] ?? '');
    
    // Si no hay nombre en catálogo, intentar usar descripción de la relación si existe
    const descFromRow = clean(row['rpo_descripcion'] ?? row['descripcion'] ?? row['desc'] ?? '');
    
    const sku = skuSource || (productId ? `LEGACY-PROD-${productId}` : 'LEGACY-PROD');
    const name = nameSource || descFromRow || (productId ? `Producto ${productId}` : 'Producto Legacy');

    items.push({
      source: 'inventory',
      refId: null,
      sku,
      name,
      qty,
      unitPrice,
      total
    });
    productTotal += total;
  }

  for (const row of serviceRows) {
    const serviceId = String(row['rso_idServiciofk'] ?? row['rso_servicio'] ?? row['servicio'] ?? '').trim();
    const price = parseMoney(row['rso_precio'] ?? row['precio'] ?? '');
    const total = asMoney(price);
    const catalog = serviceCatalog.get(serviceId) || {};
    // Intentar múltiples nombres de columnas posibles
    const nameSource = clean(catalog['ser_nombre'] ?? catalog['nombre'] ?? catalog['ser_name'] ?? catalog['name'] ?? catalog['descripcion'] ?? catalog['desc'] ?? '');
    
    // Si no hay nombre en catálogo, intentar usar descripción de la relación si existe
    const descFromRow = clean(row['rso_descripcion'] ?? row['descripcion'] ?? row['desc'] ?? '');
    
    const sku = serviceId ? `LEGACY-SRV-${serviceId}` : 'LEGACY-SRV';
    const name = nameSource || descFromRow || (serviceId ? `Servicio ${serviceId}` : 'Servicio Legacy');
    
    items.push({
      source: 'service',
      refId: null,
      sku,
      name,
      qty: 1,
      unitPrice: total,
      total
    });
    serviceTotal += total;
  }

  const remProducts = remisionRow ? parseMoney(remisionRow['rm_valor_productos']) : 0;
  const remServices = remisionRow ? parseMoney(remisionRow['rm_valor_servicios']) : 0;
  const remTotal = remisionRow ? parseMoney(remisionRow['rm_valor_total']) : 0;
  let laborValue = remisionRow ? parseMoney(remisionRow['rm_mano_de_obra']) : 0;
  if (!laborValue && remServices) laborValue = remServices;

  if (remProducts > 0) {
    const rawDiff = remProducts - productTotal;
    if (Math.abs(rawDiff) > DIFF_TOLERANCE) {
      const diff = asMoney(rawDiff);
      if (diff !== 0) {
        items.push({
          source: 'inventory',
          refId: null,
          sku: 'LEGACY-PROD-AJUSTE',
          name: 'AJUSTE PRODUCTOS LEGACY',
          qty: 1,
          unitPrice: diff,
          total: diff
        });
        productTotal += diff;
      }
    }
  }

  if (remServices > 0) {
    const rawDiff = remServices - serviceTotal;
    if (Math.abs(rawDiff) > DIFF_TOLERANCE) {
      const diff = asMoney(rawDiff);
      if (diff !== 0) {
        items.push({
          source: 'service',
          refId: null,
          sku: 'LEGACY-SRV-AJUSTE',
          name: 'AJUSTE SERVICIOS LEGACY',
          qty: 1,
          unitPrice: diff,
          total: diff
        });
        serviceTotal += diff;
      }
    }
  }

  if (remTotal > 0) {
    const rawDiff = remTotal - asMoney(productTotal + serviceTotal);
    if (Math.abs(rawDiff) > DIFF_TOLERANCE) {
      const diff = asMoney(rawDiff);
      if (diff !== 0) {
        items.push({
          source: 'service',
          refId: null,
          sku: 'LEGACY-TOTAL-AJUSTE',
          name: 'AJUSTE TOTAL LEGACY',
          qty: 1,
          unitPrice: diff,
          total: diff
        });
        serviceTotal += diff;
      }
    }
  }

  const subtotal = asMoney(productTotal + serviceTotal);
  const total = remTotal > 0 ? asMoney(remTotal) : subtotal;
  const tax = 0;

  if (!laborValue && serviceTotal > 0) laborValue = serviceTotal;
  laborValue = asMoney(laborValue);

  return { items, subtotal, total, tax, laborValue };
}

const counters = {
  total: 0,
  skippedCompany: 0,
  skippedNoPlate: 0,
  skippedNoData: 0,
  imported: 0,
  updated: 0,
  duplicates: 0,
  unchanged: 0,
  errors: 0
};

async function main() {
  console.log('🚀 Iniciando importación de órdenes con productos y servicios...');
  console.log('📂 Leyendo archivos CSV...');
  console.log(`   - Órdenes: ${args.orders}`);
  console.log(`   - Clientes: ${args.clients}`);
  console.log(`   - Vehículos: ${args.vehicles}`);
  
  const ordersRows = await parseCSV(args.orders, { delimiter, encoding });
  console.log(`✅ Órdenes leídas: ${ordersRows.length}`);
  
  const clientRows = await parseCSV(args.clients, { delimiter, encoding });
  console.log(`✅ Clientes leídos: ${clientRows.length}`);
  
  const vehicleRows = await parseCSV(args.vehicles, { delimiter, encoding });
  console.log(`✅ Vehículos leídos: ${vehicleRows.length}`);

  let orderProductRows = [];
  let productRows = [];
  let orderServiceRows = [];
  let serviceRows = [];
  let remisionRows = [];

  // Si no se proporcionan archivos de relaciones pero sí remis.csv, usarlo
  if (!detailPaths.orderProducts && !detailPaths.orderServices && detailPaths.remisions) {
    console.log('Using remis.csv for order details (products and services)');
  }
  
  if (detailPaths.orderProducts) {
    console.log(`📦 Leyendo productos por orden: ${detailPaths.orderProducts}`);
    orderProductRows = await parseCSV(detailPaths.orderProducts, { delimiter, encoding });
    console.log(`✅ Relaciones producto-orden leídas: ${orderProductRows.length}`);
  }
  if (detailPaths.products) {
    console.log(`📦 Leyendo catálogo de productos: ${detailPaths.products}`);
    productRows = await parseCSV(detailPaths.products, { delimiter, encoding });
    console.log(`✅ Productos en catálogo: ${productRows.length}`);
  }
  if (detailPaths.orderServices) {
    console.log(`🔧 Leyendo servicios por orden: ${detailPaths.orderServices}`);
    orderServiceRows = await parseCSV(detailPaths.orderServices, { delimiter, encoding });
    console.log(`✅ Relaciones servicio-orden leídas: ${orderServiceRows.length}`);
  }
  if (detailPaths.services) {
    console.log(`🔧 Leyendo catálogo de servicios: ${detailPaths.services}`);
    serviceRows = await parseCSV(detailPaths.services, { delimiter, encoding });
    console.log(`✅ Servicios en catálogo: ${serviceRows.length}`);
  }
  if (detailPaths.remisions) {
    console.log(`📄 Leyendo remisiones: ${detailPaths.remisions}`);
    remisionRows = await parseCSV(detailPaths.remisions, { delimiter, encoding });
    console.log(`✅ Remisiones leídas: ${remisionRows.length}`);
  }

  console.log(`\n📊 Resumen de archivos cargados:`);
  console.log(`   - Órdenes: ${ordersRows.length}`);
  console.log(`   - Clientes: ${clientRows.length}`);
  console.log(`   - Vehículos: ${vehicleRows.length}`);
  if (detailMode) {
    console.log(`   - Relaciones producto-orden: ${orderProductRows.length}`);
    console.log(`   - Productos en catálogo: ${productRows.length}`);
    console.log(`   - Relaciones servicio-orden: ${orderServiceRows.length}`);
    console.log(`   - Servicios en catálogo: ${serviceRows.length}`);
    console.log(`   - Remisiones: ${remisionRows.length}`);
  }

  const clientIndex = new Map(clientRows.map(row => [String(row['cl_id'] ?? row['id'] ?? ''), row]));
  const vehicleIndex = new Map(vehicleRows.map(row => [String(row['au_id'] ?? row['id'] ?? ''), row]));
  
  // Mapear catálogo de productos con múltiples posibles nombres de columna
  const productCatalog = new Map();
  for (const row of productRows) {
    const id = String(row['pr_id'] ?? row['id'] ?? row['producto_id'] ?? '').trim();
    if (id) productCatalog.set(id, row);
  }
  
  // Mapear catálogo de servicios con múltiples posibles nombres de columna
  const serviceCatalog = new Map();
  for (const row of serviceRows) {
    const id = String(row['ser_id'] ?? row['id'] ?? row['servicio_id'] ?? '').trim();
    if (id) serviceCatalog.set(id, row);
  }
  
  // Mapear relaciones con múltiples posibles nombres de columna
  const orderProductMap = new Map();
  for (const row of orderProductRows) {
    const orderId = String(row['rpo_fk_orden'] ?? row['orden'] ?? row['orden_id'] ?? '').trim();
    if (orderId) {
      if (!orderProductMap.has(orderId)) orderProductMap.set(orderId, []);
      orderProductMap.get(orderId).push(row);
    }
  }
  
  const orderServiceMap = new Map();
  for (const row of orderServiceRows) {
    const orderId = String(row['rso_idOrdenfk'] ?? row['rso_orden'] ?? row['orden'] ?? row['orden_id'] ?? '').trim();
    if (orderId) {
      if (!orderServiceMap.has(orderId)) orderServiceMap.set(orderId, []);
      orderServiceMap.get(orderId).push(row);
    }
  }
  
  const remisionMap = new Map();
  for (const row of remisionRows) {
    const orderId = String(row['rm_fk_orden'] ?? row['orden'] ?? row['orden_id'] ?? '').trim();
    if (orderId) remisionMap.set(orderId, row);
  }
  
  // Log de depuración
  if (detailMode) {
    console.log(`Product catalog size: ${productCatalog.size}, Service catalog size: ${serviceCatalog.size}`);
    console.log(`Order-Product mappings: ${orderProductMap.size}, Order-Service mappings: ${orderServiceMap.size}`);
    if (productCatalog.size > 0) {
      const firstProd = Array.from(productCatalog.entries())[0];
      console.log(`Sample product catalog entry keys: ${Object.keys(firstProd[1]).join(', ')}`);
    }
    if (serviceCatalog.size > 0) {
      const firstSvc = Array.from(serviceCatalog.entries())[0];
      console.log(`Sample service catalog entry keys: ${Object.keys(firstSvc[1]).join(', ')}`);
    }
  }

  const started = Date.now();
  const totalRows = ordersRows.length;
  let lastProgressTime = Date.now();
  
  console.log(`\n${'='.repeat(60)}`);
  console.log(`📊 INICIANDO PROCESAMIENTO DE ÓRDENES`);
  console.log(`${'='.repeat(60)}`);
  console.log(`📈 Total de órdenes a procesar: ${totalRows}`);
  console.log(`⏱️  Mostrando progreso cada ${progressEvery} registros o cada ${progressTimeInterval/1000} segundos`);
  console.log(`💾 Modo: ${dryRun ? 'DRY RUN (preview, no guarda)' : 'REAL (guardando en BD)'}`);
  if (limit) console.log(`🔢 Límite: ${limit} registros`);
  console.log(`${'='.repeat(60)}\n`);
  
  function logProgress(force = false) {
    if (!progressEvery && !force) return;
    
    const now = Date.now();
    const timeSinceLastProgress = now - lastProgressTime;
    
    // Solo mostrar si es el umbral de registros O si han pasado 30 segundos
    if (!force && counters.total % progressEvery !== 0 && timeSinceLastProgress < progressTimeInterval) {
      return;
    }
    
    lastProgressTime = now;
    
    const percent = counters.total > 0 ? ((counters.total / totalRows) * 100).toFixed(1) : '0.0';
    const elapsed = (Date.now() - started) / 1000;
    const rate = counters.total > 0 ? elapsed / counters.total : 0;
    const remaining = Math.max(0, totalRows - counters.total);
    const etaSec = rate * remaining;
    const fmt = (seconds) => {
      if (!Number.isFinite(seconds)) return '---';
      if (seconds < 60) return `${Math.round(seconds)}s`;
      const m = Math.floor(seconds / 60);
      const s = Math.floor(seconds % 60);
      return `${m}m ${s}s`;
    };
    
    // Barra de progreso visual
    const barWidth = 40;
    const filled = Math.round((Number(percent) / 100) * barWidth);
    const bar = '█'.repeat(filled) + '░'.repeat(barWidth - filled);
    
    // Limpiar línea anterior
    process.stdout.write('\r');
    process.stdout.write(`[${bar}] ${percent}% | ${counters.total}/${totalRows} | ✅ ${counters.imported} | 🔄 ${counters.updated} | ➖ ${counters.unchanged} | ⏭️  ${counters.duplicates} | ❌ ${counters.errors} | ⏱️  ETA: ${fmt(etaSec)}`);
    process.stdout.write(' '.repeat(30)); // Limpiar caracteres residuales
  }
  
  // Timer para forzar progreso cada 30 segundos
  const progressTimer = setInterval(() => {
    if (counters.total > 0) {
      logProgress(true);
    }
  }, progressTimeInterval);
  
  // Función para mostrar resumen final
  function showFinalSummary() {
    const dur = ((Date.now()-started)/1000).toFixed(1);
    console.log('\n' + '='.repeat(60));
    console.log('✅ IMPORTACIÓN DE ÓRDENES COMPLETADA');
    console.log('='.repeat(60));
    console.log(`📊 Total procesado: ${counters.total}/${totalRows}`);
    console.log(`✅ Importadas: ${counters.imported}`);
    console.log(`🔄 Actualizadas: ${counters.updated}`);
    console.log(`➖ Sin cambios: ${counters.unchanged}`);
    console.log(`⏭️  Duplicadas (saltadas): ${counters.duplicates}`);
    console.log(`⏩ Saltadas (sin empresa): ${counters.skippedCompany}`);
    console.log(`🚫 Saltadas (sin placa): ${counters.skippedNoPlate}`);
    console.log(`📭 Saltadas (sin datos): ${counters.skippedNoData}`);
    console.log(`❌ Errores: ${counters.errors}`);
    console.log(`⏱️  Tiempo total: ${dur}s`);
    console.log('='.repeat(60));
  }

  if (!dryRun) {
    const uri = args.mongo || process.env.MONGODB_URI;
    if (!uri) {
      console.error('Missing Mongo connection string: use --mongo or set MONGODB_URI');
      process.exit(1);
    }
    await connectDB(uri);
  }

  for (const row of ordersRows) {
    counters.total++;
    if (limit && counters.total > limit) break;

    const legacyCompanyId = String(row['or_fk_empresa']).trim();
    if (!companyMap[legacyCompanyId]) {
      counters.skippedCompany++;
      logProgress(); // Mostrar progreso (la función decide si realmente muestra)
      continue;
    }

    let companyId;
    try {
      companyId = new mongoose.Types.ObjectId(companyMap[legacyCompanyId]);
    } catch (err) {
      console.warn(`Invalid companyId mapping for legacy company ${legacyCompanyId}: ${companyMap[legacyCompanyId]}`);
      counters.skippedCompany++;
      continue;
    }

    const legacyAutoId = String(row['or_fk_automovil'] || '').trim();
    const veh = vehicleIndex.get(legacyAutoId);
    if (!veh) {
      counters.skippedNoPlate++;
      logProgress(); // Mostrar progreso (la función decide si realmente muestra)
      continue;
    }

    const plate = normalizePlate(veh['au_placa']);
    if (!plate || plate === 'VENTA') {
      counters.skippedNoPlate++;
      logProgress(); // Mostrar progreso (la función decide si realmente muestra)
      continue;
    }

    const legacyClienteId = String(row['or_fk_cliente'] || '').trim();
    const cli = clientIndex.get(legacyClienteId) || {};

    const idNumber = clean(cli['cl_identificacion'] || '');
    const customerName = clean(cli['cl_nombre'] || '');
    const phone = clean(cli['cl_telefono'] || '');
    const email = clean(cli['cl_mail'] || '');
    const address = clean(cli['cl_direccion'] || '');

    // Intentar obtener marca y línea desde el vehículo
    // Nota: au_fk_marca y au_fk_serie son IDs, no nombres directos
    // Por ahora intentamos buscar por placa en CustomerProfile primero
    const engine = veh && veh['au_cilidraje'] ? String(veh['au_cilidraje']) : '';
    const year = parseNumber(veh && veh['au_modelo']);
    const mileage = parseNumber(row['or_kilometraje']);
    
    let brand = '';
    let line = '';
    let vehicleId = null;
    
    if (!dryRun) {
      // Primero intentar buscar por placa en CustomerProfile para obtener marca/línea
      try {
        const profile = await CustomerProfile.findOne({
          companyId,
          $or: [{ plate }, { 'vehicle.plate': plate }]
        }).sort({ updatedAt: -1 });
        
        if (profile && profile.vehicle) {
          brand = clean(profile.vehicle.brand || '').toUpperCase();
          line = clean(profile.vehicle.line || '').toUpperCase();
          vehicleId = profile.vehicle.vehicleId || null;
        }
      } catch (err) {
        // Ignorar errores
      }
      
      // Si no encontramos en profile, intentar buscar en Vehicle por cilindraje y placa
      // (búsqueda más flexible sin marca/línea)
      if (!vehicleId && engine) {
        try {
          // Buscar vehículos que coincidan con el cilindraje
          const vehicles = await Vehicle.find({
            displacement: engine.toUpperCase(),
            active: true
          }).limit(10);
          
          // Si solo hay uno, usarlo
          if (vehicles.length === 1) {
            vehicleId = vehicles[0]._id;
            if (!brand) brand = vehicles[0].make;
            if (!line) line = vehicles[0].line;
          }
        } catch (err) {
          // Ignorar errores
        }
      }
      
      // Si tenemos marca, línea y cilindraje, buscar vehículo exacto
      if (!vehicleId && brand && line && engine) {
        try {
          const vehicle = await Vehicle.findOne({
            make: brand,
            line: line,
            displacement: engine.toUpperCase(),
            active: true
          });
          if (vehicle) vehicleId = vehicle._id;
        } catch (err) {
          // Ignorar errores
        }
      }
    }
    const obs = clean(row['or_observacion'] || '');
    const otros = clean(row['or_otros'] || '');
    const legacyOrId = String(row['or_id'] || '').trim();
    const fecha = clean(row['or_fecha'] || '');
    const fechaEntrega = clean(row['or_fecha_entrega'] || '');
    const createdAt = parseDate(fecha) || new Date();

    const productRowsForOrder = orderProductMap.get(legacyOrId) || [];
    const serviceRowsForOrder = orderServiceMap.get(legacyOrId) || [];
    const remisionRow = remisionMap.get(legacyOrId);

    const { items, subtotal, total, tax, laborValue } = buildLegacyItems({
      productRows: productRowsForOrder,
      serviceRows: serviceRowsForOrder,
      productCatalog,
      serviceCatalog,
      remisionRow
    });

    if (!items.length && total === 0) {
      counters.skippedNoData++;
      logProgress(); // Mostrar progreso (la función decide si realmente muestra)
      continue;
    }

    const serviceDates = serviceRowsForOrder
      .map(s => parseDate(s['rso_fecha']))
      .filter(Boolean)
      .sort((a, b) => b.getTime() - a.getTime());
    const remisionDate = remisionRow ? parseDate(remisionRow['rm_fecha_plazo_pago']) : null;
    const closedCandidates = [
      parseDate(fechaEntrega),
      serviceDates.length ? serviceDates[0] : null,
      remisionDate
    ].filter(Boolean);
    const closedAt = closedCandidates.length ? closedCandidates[0] : createdAt;

    const legacyMarker = `LEGACY or_id=${legacyOrId} empresa=${legacyCompanyId}`;
    const notesParts = [legacyMarker];
    if (obs) notesParts.push(`Obs: ${obs}`);
    if (otros) notesParts.push(`Otros: ${otros}`);
    if (remisionRow) {
      const remSaldo = parseMoney(remisionRow['rm_saldo']);
      const remPago = clean(remisionRow['rm_pago']);
      const remTipoPago = clean(remisionRow['rm_tipo_pago']);
      const remObs = clean(remisionRow['rm_observacion']);
      const remBits = [];
      if (remObs) remBits.push(`Remision: ${remObs}`);
      if (remSaldo) remBits.push(`Saldo=${asMoney(remSaldo)}`);
      if (remPago) remBits.push(`Pagos=${remPago}`);
      if (remTipoPago) remBits.push(`TipoPago=${remTipoPago}`);
      if (remBits.length) notesParts.push(remBits.join(' | '));
    }
    const notes = notesParts.join('\n');
    const saleName = plate ? `Venta - ${plate}` : `Venta Legacy ${legacyOrId}`;

    if (dryRun) {
      counters.imported++;
      if (counters.imported <= 5) {
        console.log(`[DRY] or_id=${legacyOrId} plate=${plate} items=${items.length} total=${total}`);
      }
      logProgress(); // Mostrar progreso (la función decide si realmente muestra)
      continue;
    }

    // Buscar orden existente por legacyOrId
    let existing = null;
    try {
      // Primero buscar por legacyOrId exacto (companyId es ObjectId)
      existing = await Sale.findOne({ 
        companyId: companyId, 
        legacyOrId: String(legacyOrId).trim() 
      });
      
      // Si no se encuentra, buscar por regex en notes
      if (!existing && legacyOrId) {
        const rx = new RegExp(`\\bor_id=${String(legacyOrId).trim()}\\b`);
        existing = await Sale.findOne({ 
          companyId: companyId, 
          notes: { $regex: rx } 
        });
      }
    } catch (err) {
      console.warn(`Error buscando orden existente or_id=${legacyOrId}: ${err.message}`);
      counters.errors++;
      logProgress();
      continue;
    }

    if (existing) {
      // Orden existente encontrada - verificar si necesita actualización
      const update = { $set: {} };
      let hasChanges = false;

      // Actualizar items si hay cambios
      if (items.length > 0) {
        const existingItemsStr = JSON.stringify(existing.items || []);
        const newItemsStr = JSON.stringify(items);
        if (existingItemsStr !== newItemsStr) {
          update.$set.items = items;
          hasChanges = true;
        }
      }

      // Actualizar totales si hay diferencias
      if (Math.abs((existing.subtotal || 0) - subtotal) > DIFF_TOLERANCE) {
        update.$set.subtotal = subtotal;
        hasChanges = true;
      }
      if (Math.abs((existing.total || 0) - total) > DIFF_TOLERANCE) {
        update.$set.total = total;
        hasChanges = true;
      }
      if (Math.abs((existing.tax || 0) - tax) > DIFF_TOLERANCE) {
        update.$set.tax = tax;
        hasChanges = true;
      }
      if (Math.abs((existing.laborValue || 0) - laborValue) > DIFF_TOLERANCE) {
        update.$set.laborValue = laborValue;
        hasChanges = true;
      }

      // Actualizar nombre si cambió
      if (saleName && saleName !== existing.name) {
        update.$set.name = saleName;
        hasChanges = true;
      }

      // Actualizar fecha de cierre si cambió
      if (closedAt && (!existing.closedAt || Math.abs(existing.closedAt.getTime() - closedAt.getTime()) > 1000)) {
        update.$set.closedAt = closedAt;
        hasChanges = true;
      }

      // Actualizar información del cliente (solo si falta o cambió)
      if (customerName && (!existing.customer?.name || existing.customer.name !== customerName)) {
        update.$set['customer.name'] = customerName;
        hasChanges = true;
      }
      if (idNumber && (!existing.customer?.idNumber || existing.customer.idNumber !== idNumber)) {
        update.$set['customer.idNumber'] = idNumber;
        hasChanges = true;
      }
      if (phone && (!existing.customer?.phone || existing.customer.phone !== phone)) {
        update.$set['customer.phone'] = phone;
        hasChanges = true;
      }
      if (email && (!existing.customer?.email || existing.customer.email !== email)) {
        update.$set['customer.email'] = email;
        hasChanges = true;
      }
      if (address && (!existing.customer?.address || existing.customer.address !== address)) {
        update.$set['customer.address'] = address;
        hasChanges = true;
      }

      // Actualizar información del vehículo
      if (plate && (!existing.vehicle?.plate || existing.vehicle.plate !== plate)) {
        update.$set['vehicle.plate'] = plate;
        hasChanges = true;
      }
      if (brand && (!existing.vehicle?.brand || existing.vehicle.brand !== brand)) {
        update.$set['vehicle.brand'] = brand;
        hasChanges = true;
      }
      if (line && (!existing.vehicle?.line || existing.vehicle.line !== line)) {
        update.$set['vehicle.line'] = line;
        hasChanges = true;
      }
      if (engine && (!existing.vehicle?.engine || existing.vehicle.engine !== engine)) {
        update.$set['vehicle.engine'] = engine;
        hasChanges = true;
      }
      if (year != null && (existing.vehicle?.year == null || existing.vehicle.year !== year)) {
        update.$set['vehicle.year'] = year;
        hasChanges = true;
      }
      if (mileage != null && (existing.vehicle?.mileage == null || existing.vehicle.mileage !== mileage)) {
        update.$set['vehicle.mileage'] = mileage;
        hasChanges = true;
      }
      if (vehicleId && (!existing.vehicle?.vehicleId || String(existing.vehicle.vehicleId) !== String(vehicleId))) {
        update.$set['vehicle.vehicleId'] = vehicleId;
        hasChanges = true;
      }

      // Actualizar notes si cambió o si no tiene el marcador legacy
      if (notes && (!existing.notes || !existing.notes.includes('LEGACY or_id=') || existing.notes !== notes)) {
        update.$set.notes = notes;
        hasChanges = true;
      }

      // Asegurar que legacyOrId esté guardado
      if (!existing.legacyOrId || existing.legacyOrId !== String(legacyOrId).trim()) {
        update.$set.legacyOrId = String(legacyOrId).trim();
        hasChanges = true;
      }

      // Ejecutar actualización si hay cambios
      if (hasChanges && Object.keys(update.$set).length > 0) {
        try {
          await Sale.updateOne({ _id: existing._id }, update);
          counters.updated++;
          
          // Debug: mostrar algunas actualizaciones
          if (counters.updated <= 5) {
            console.log(`\n[UPDATE] or_id=${legacyOrId} plate=${plate} - Campos actualizados: ${Object.keys(update.$set).join(', ')}`);
          }
        } catch (err) {
          console.warn(`\nError actualizando orden or_id=${legacyOrId}: ${err.message}`);
          counters.errors++;
        }
      } else {
        counters.unchanged++;
      }

      logProgress();
      continue;
    }

    // Crear nueva orden
    try {
      const saleDoc = await Sale.create({
        companyId: companyId, // ObjectId, no String
        status: 'closed',
        origin: 'internal',
        technician: '',
        legacyOrId: String(legacyOrId).trim(),
        name: saleName,
        items,
        customer: { idNumber, name: customerName, phone, email, address },
        vehicle: { plate, brand, line, engine, year, mileage, vehicleId },
        notes,
        subtotal,
        tax,
        total,
        laborValue,
        closedAt
      });

      // Actualizar timestamps
      try {
        await Sale.updateOne(
          { _id: saleDoc._id },
          { $set: { createdAt, updatedAt: closedAt || createdAt } }
        );
      } catch (err) {
        console.warn(`Could not backfill timestamps for sale ${saleDoc._id}: ${err.message}`);
      }

      if (doProfile) {
        try {
          // Usar upsertProfileFromSource para crear/actualizar perfil y conectar vehículo
          await upsertProfileFromSource(
            String(companyId),
            { customer: saleDoc.customer, vehicle: saleDoc.vehicle },
            { source: 'script-legacy-orders', overwriteMileage: true, overwriteYear: true, overwriteVehicle: false }
          );
          
          // Si el perfil ahora tiene vehicleId pero la venta no, actualizar la venta
          if (saleDoc.vehicle && !saleDoc.vehicle.vehicleId) {
            const profile = await CustomerProfile.findOne({
              companyId: companyId, // ObjectId
              $or: [{ plate }, { 'vehicle.plate': plate }]
            }).sort({ updatedAt: -1 });
            
            if (profile && profile.vehicle && profile.vehicle.vehicleId) {
              await Sale.updateOne(
                { _id: saleDoc._id },
                { $set: { 'vehicle.vehicleId': profile.vehicle.vehicleId } }
              );
              saleDoc.vehicle.vehicleId = profile.vehicle.vehicleId;
            }
          }
        } catch (err) {
          console.warn(`Profile upsert failed for plate ${plate}: ${err.message}`);
        }
      }

      counters.imported++;
      
      // Debug: mostrar algunas importaciones
      if (counters.imported <= 5) {
        console.log(`\n[CREATE] or_id=${legacyOrId} plate=${plate} items=${items.length} total=${total}`);
      }
    } catch (err) {
      console.warn(`\nError creando orden or_id=${legacyOrId} plate=${plate}: ${err.message}`);
      counters.errors++;
    }

    logProgress(); // Mostrar progreso (la función decide si realmente muestra)
  }

  // Limpiar timer de progreso
  clearInterval(progressTimer);
  
  logProgress(true);
  console.log(''); // Nueva línea después del progreso
  showFinalSummary();
}

main()
  .then(() => {
    if (!dryRun) mongoose.connection.close().catch(() => {});
  })
  .catch(err => {
    console.error(err);
    process.exit(1);
  });

