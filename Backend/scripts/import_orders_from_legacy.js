#!/usr/bin/env node
import fs from 'fs';
import readline from 'readline';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { connectDB } from '../src/db.js';
import Sale from '../src/models/Sale.js';
import Vehicle from '../src/models/Vehicle.js';
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
const progressEvery = args.progressInterval ? parseInt(args.progressInterval, 10) : 2000;

const detailPaths = {
  orderProducts: args.orderProducts,
  products: args.products,
  orderServices: args.orderServices,
  services: args.services,
  remisions: args.remisions
};
const detailMode = Object.values(detailPaths).some(Boolean);

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
  duplicates: 0
};

async function main() {
  console.log('Reading legacy CSV files...');
  const ordersRows = await parseCSV(args.orders, { delimiter, encoding });
  const clientRows = await parseCSV(args.clients, { delimiter, encoding });
  const vehicleRows = await parseCSV(args.vehicles, { delimiter, encoding });

  let orderProductRows = [];
  let productRows = [];
  let orderServiceRows = [];
  let serviceRows = [];
  let remisionRows = [];

  if (detailPaths.orderProducts) orderProductRows = await parseCSV(detailPaths.orderProducts, { delimiter, encoding });
  if (detailPaths.products) productRows = await parseCSV(detailPaths.products, { delimiter, encoding });
  if (detailPaths.orderServices) orderServiceRows = await parseCSV(detailPaths.orderServices, { delimiter, encoding });
  if (detailPaths.services) serviceRows = await parseCSV(detailPaths.services, { delimiter, encoding });
  if (detailPaths.remisions) remisionRows = await parseCSV(detailPaths.remisions, { delimiter, encoding });

  console.log(`Orders: ${ordersRows.length}, Clients: ${clientRows.length}, Vehicles: ${vehicleRows.length}`);
  if (detailMode) {
    console.log(`OrderProducts: ${orderProductRows.length}, Products: ${productRows.length}, OrderServices: ${orderServiceRows.length}, Services: ${serviceRows.length}, Remisions: ${remisionRows.length}`);
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
  function logProgress() {
    if (!progressEvery) return;
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
    console.log(`[${percent}%] processed=${counters.total} imported=${counters.imported} updated=${counters.updated} duplicates=${counters.duplicates} skippedCompany=${counters.skippedCompany} skippedPlate=${counters.skippedNoPlate} skippedNoData=${counters.skippedNoData} ETA=${fmt(etaSec)}`);
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
      if (progressEvery && counters.total % progressEvery === 0) logProgress();
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
      if (progressEvery && counters.total % progressEvery === 0) logProgress();
      continue;
    }

    const plate = normalizePlate(veh['au_placa']);
    if (!plate || plate === 'VENTA') {
      counters.skippedNoPlate++;
      if (progressEvery && counters.total % progressEvery === 0) logProgress();
      continue;
    }

    const legacyClienteId = String(row['or_fk_cliente'] || '').trim();
    const cli = clientIndex.get(legacyClienteId) || {};

    const idNumber = clean(cli['cl_identificacion'] || '');
    const customerName = clean(cli['cl_nombre'] || '');
    const phone = clean(cli['cl_telefono'] || '');
    const email = clean(cli['cl_mail'] || '');
    const address = clean(cli['cl_direccion'] || '');

    const brand = veh && veh['au_marca'] ? clean(veh['au_marca']).toUpperCase() : '';
    const line = veh && veh['au_linea'] ? clean(veh['au_linea']).toUpperCase() : '';
    const engine = veh && veh['au_cilidraje'] ? String(veh['au_cilidraje']) : '';
    const year = parseNumber(veh && veh['au_modelo']);
    const mileage = parseNumber(row['or_kilometraje']);
    
    // Buscar vehículo en BD global
    let vehicleId = null;
    if (brand && line && engine && !dryRun) {
      try {
        const vehicle = await Vehicle.findOne({
          make: brand,
          line: line,
          displacement: engine.toUpperCase(),
          active: true
        });
        if (vehicle) vehicleId = vehicle._id;
      } catch (err) {
        // Ignorar errores de búsqueda
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
      if (progressEvery && counters.total % progressEvery === 0) logProgress();
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
      if (progressEvery && counters.total % progressEvery === 0) logProgress();
      continue;
    }

    let existing = await Sale.findOne({ companyId, legacyOrId });
    if (!existing) {
      const rx = new RegExp(`\\bor_id=${legacyOrId}\\b`);
      existing = await Sale.findOne({ companyId, notes: { $regex: rx } });
    }

    if (existing) {
      counters.duplicates++;
      const update = { $set: {} };

      if (items.length) update.$set.items = items;
      update.$set.subtotal = subtotal;
      update.$set.total = total;
      update.$set.tax = tax;
      update.$set.laborValue = laborValue;
      if (saleName && saleName !== existing.name) update.$set.name = saleName;

      if (closedAt && (!existing.closedAt || existing.closedAt.getTime() !== closedAt.getTime())) {
        update.$set.closedAt = closedAt;
      }

      if (!existing.customer?.name && customerName) update.$set['customer.name'] = customerName;
      if (!existing.customer?.idNumber && idNumber) update.$set['customer.idNumber'] = idNumber;
      if (!existing.customer?.phone && phone) update.$set['customer.phone'] = phone;
      if (!existing.customer?.email && email) update.$set['customer.email'] = email;
      if (!existing.customer?.address && address) update.$set['customer.address'] = address;

      if (!existing.vehicle?.plate || existing.vehicle.plate !== plate) update.$set['vehicle.plate'] = plate;
      if (brand && (!existing.vehicle?.brand || existing.vehicle.brand !== brand)) update.$set['vehicle.brand'] = brand;
      if (line && (!existing.vehicle?.line || existing.vehicle.line !== line)) update.$set['vehicle.line'] = line;
      if (!existing.vehicle?.engine && engine) update.$set['vehicle.engine'] = engine;
      if (year != null && (existing.vehicle?.year == null || existing.vehicle.year !== year)) update.$set['vehicle.year'] = year;
      if (mileage != null && (existing.vehicle?.mileage == null || existing.vehicle.mileage !== mileage)) update.$set['vehicle.mileage'] = mileage;
      if (vehicleId && (!existing.vehicle?.vehicleId || String(existing.vehicle.vehicleId) !== String(vehicleId))) update.$set['vehicle.vehicleId'] = vehicleId;

      if (notes && (!existing.notes || existing.notes.includes('LEGACY or_id='))) update.$set.notes = notes;

      if (Object.keys(update.$set).length) {
        await Sale.updateOne({ _id: existing._id }, update);
        counters.updated++;
      }

      if (progressEvery && counters.total % progressEvery === 0) logProgress();
      continue;
    }

    const saleDoc = await Sale.create({
      companyId,
      status: 'closed',
      origin: 'internal',
      technician: '',
      legacyOrId,
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
        await upsertProfileFromSource(
          String(companyId),
          { customer: saleDoc.customer, vehicle: saleDoc.vehicle },
          { source: 'script-legacy-orders', overwriteMileage: true, overwriteYear: true }
        );
      } catch (err) {
        console.warn(`Profile upsert failed for plate ${plate}: ${err.message}`);
      }
    }

    counters.imported++;
    if (progressEvery && counters.total % progressEvery === 0) logProgress();
  }

  console.log('Import summary:', JSON.stringify(counters, null, 2));
}

main()
  .then(() => {
    if (!dryRun) mongoose.connection.close().catch(() => {});
  })
  .catch(err => {
    console.error(err);
    process.exit(1);
  });

