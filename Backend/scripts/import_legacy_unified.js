#!/usr/bin/env node
/**
 * Script unificado de importación de datos legacy
 * 
 * Importa clientes y órdenes desde archivos CSV legacy, con:
 * - Matching inteligente de vehículos (permisivo con cilindrajes: 1600=1.6, 2000=2.0, 1300=1.3 turbo)
 * - Guardado en Pendientes (UnassignedVehicle) para clientes sin vehículo matcheado
 * - Importación de órdenes como ventas cerradas con productos y servicios
 * - Progreso en consola con % completado y resumen
 * 
 * Uso:
 *   node scripts/import_legacy_unified.js \
 *     --mongo "mongodb://..." \
 *     --companyMap "1:<mongoId1>,3:<mongoId3>" \
 *     [--dry] [--limit 1000]
 * 
 * Mapeo de empresas por defecto:
 *   - Empresa 1: (configurar con --companyMap)
 *   - Empresa 3: Casa Renault (configurar con --companyMap)
 * 
 * El script busca automáticamente los archivos CSV en Backend/scripts/excels/
 */

import fs from 'fs';
import path from 'path';
import readline from 'readline';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { fileURLToPath } from 'url';
import { connectDB } from '../src/db.js';
import CustomerProfile from '../src/models/CustomerProfile.js';
import Vehicle from '../src/models/Vehicle.js';
import UnassignedVehicle from '../src/models/UnassignedVehicle.js';
import Sale from '../src/models/Sale.js';
import { upsertProfileFromSource } from '../src/controllers/profile.helper.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ==================== CONFIGURACIÓN ====================

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
      if (next && !next.startsWith('--')) {
        out[token] = next;
        i++;
      } else {
        out[token] = true;
      }
    }
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));

// Rutas de archivos CSV (por defecto en excels/) - Archivos actualizados
const baseDir = path.join(__dirname, 'excels');
const ordersPath = args.orders || path.join(baseDir, 'OrdenesDB.csv');
const clientsPath = args.clients || path.join(baseDir, 'ClientesDB.csv');
const vehiclesPath = args.vehicles || path.join(baseDir, 'AutomovilDB.csv');
const remisPath = args.remisions || path.join(baseDir, 'RemisionesDB.csv');
const productsPath = args.products || path.join(baseDir, 'ProductosDB.csv');
const servicesPath = args.services || path.join(baseDir, 'serviciosDB.csv');
const orderProductsPath = args.orderProducts || path.join(baseDir, 'RelacionordenproductosDB.csv');
const orderServicesPath = args.orderServices || path.join(baseDir, 'RelacionordenservicioDB.csv');
const brandsPath = args.brands || path.join(baseDir, 'MarcasDB.csv');
const seriesPath = args.series || path.join(baseDir, 'SeriesDB.csv');

const delimiter = args.delimiter || ';';
const encoding = args.encoding || 'utf8';
const limit = args.limit ? parseInt(args.limit, 10) : null;
const dryRun = !!args.dry;
const progressEvery = args.progressInterval ? parseInt(args.progressInterval, 10) : 50;
const progressTimeInterval = 10000; // 10 segundos

// Mapeo de empresas: Casa Renault importa empresas 1 y 3
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
} else {
  // Por defecto: empresa 1 y 3 (Casa Renault)
  // NOTA: El usuario debe proporcionar los IDs reales de MongoDB
  console.warn('⚠️  ADVERTENCIA: No se proporcionó --companyMap. Usando valores por defecto.');
  console.warn('   Por favor, proporciona los IDs reales: --companyMap "1:<id1>,3:<id3>"');
  companyMap = { '1': '', '3': '' }; // Vacíos para que falle si no se configuran
}

// ==================== UTILIDADES ====================

function clean(s) {
  return s == null ? '' : String(s).trim();
}

function parseNumber(n) {
  if (n === null || n === undefined || n === '') return null;
  const num = parseInt(String(n).replace(/[^0-9]/g, ''), 10);
  return Number.isNaN(num) ? null : num;
}

function parseMoney(value) {
  if (value === null || value === undefined) return 0;
  const str = String(value).replace(/[^0-9\-.,]/g, '').trim();
  if (!str) return 0;
  const normalized = str.replace(/,/g, '');
  const num = Number.parseFloat(normalized);
  return Number.isFinite(num) ? num : 0;
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

function normalizePlate(p) {
  return (p || '').toString().trim().toUpperCase();
}

// Normalizar cilindraje para comparación bidireccional (muy permisivo)
function normalizeEngine(engine) {
  if (!engine) return '';
  let str = String(engine).trim().toUpperCase();
  
  // Eliminar caracteres no numéricos excepto punto y coma
  str = str.replace(/[^0-9.]/g, '');
  if (!str) return '';
  
  // Manejar "TURBO" o "T" al final (ej: 1.3 TURBO, 1.3T)
  const hasTurbo = /TURBO|T$/i.test(String(engine));
  
  // Si es decimal (ej: 1.6, 2.0, 1.3)
  if (/^\d+\.\d+$/.test(str)) {
    const num = parseFloat(str);
    // Convertir a formato de 4 dígitos: 1.6 -> 1600, 1.3 -> 1300
    return String(Math.round(num * 1000));
  }
  
  // Si es de 4 dígitos (ej: 1600, 1300, 2000)
  if (/^\d{4}$/.test(str)) {
    return str; // Ya está normalizado
  }
  
  // Si es de 3 dígitos o menos (ej: 16, 13, 20) - asumir que es decimal * 10
  if (/^\d{1,3}$/.test(str)) {
    const num = parseInt(str, 10);
    if (num >= 12 && num <= 99) {
      // Tratar como decimal: 16 -> 1.6 -> 1600
      const decimal = (num / 10).toFixed(1);
      return String(Math.round(parseFloat(decimal) * 1000));
    }
  }
  
  return str;
}

// Comparar cilindrajes considerando equivalencias (muy permisivo)
function enginesMatch(engine1, engine2) {
  if (!engine1 || !engine2) return false;
  
  const norm1 = normalizeEngine(engine1);
  const norm2 = normalizeEngine(engine2);
  
  // Comparación directa
  if (norm1 === norm2) return true;
  
  // Comparar formatos originales normalizados
  const str1 = String(engine1).trim().toUpperCase().replace(/[^0-9.]/g, '');
  const str2 = String(engine2).trim().toUpperCase().replace(/[^0-9.]/g, '');
  
  // Si uno es decimal y otro es entero de 4 dígitos
  if (/^\d+\.\d+$/.test(str1) && /^\d{4}$/.test(str2)) {
    const decimal1 = parseFloat(str1);
    const int2 = parseInt(str2, 10);
    return Math.round(decimal1 * 1000) === int2;
  }
  
  if (/^\d{4}$/.test(str1) && /^\d+\.\d+$/.test(str2)) {
    const int1 = parseInt(str1, 10);
    const decimal2 = parseFloat(str2);
    return int1 === Math.round(decimal2 * 1000);
  }
  
  return false;
}

// ==================== PARSING CSV ====================

async function parseCSV(filePath, { delimiter, encoding }) {
  const rows = [];
  if (!fs.existsSync(filePath)) {
    console.warn(`⚠️  Archivo no encontrado: ${filePath}`);
    return rows;
  }
  
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
      if (ch === '"') {
        inQuotes = !inQuotes;
        continue;
      }
      if (ch === delimiter && !inQuotes) {
        cols.push(current.trim());
        current = '';
        continue;
      }
      current += ch;
    }
    if (current.length) cols.push(current.trim());
    
    const cleanCols = cols.map(c => c.replace(/^\"|\"$/g, '').trim());
    if (!headers) {
      headers = cleanCols;
      continue;
    }
    
    const obj = Object.fromEntries(headers.map((h, idx) => [h, cleanCols[idx] ?? '']));
    rows.push(obj);
  }
  
  return rows;
}

// ==================== MATCHING DE VEHÍCULOS ====================

let vehicleCache = null;
let vehicleCacheByDisplacement = null;

async function loadVehicleCache() {
  if (vehicleCache) return;
  
  console.log('📦 Cargando vehículos en memoria para búsquedas rápidas...');
  const vehicles = await Vehicle.find({ active: true });
  vehicleCache = vehicles;
  
  // Crear índice por displacement normalizado
  vehicleCacheByDisplacement = new Map();
  vehicles.forEach(v => {
    const disp = normalizeEngine(v.displacement);
    if (disp) {
      if (!vehicleCacheByDisplacement.has(disp)) {
        vehicleCacheByDisplacement.set(disp, []);
      }
      vehicleCacheByDisplacement.get(disp).push(v);
    }
  });
  
  console.log(`✅ ${vehicles.length} vehículos cargados en memoria\n`);
}

async function findVehicleMatch(brand, line, engine) {
  if (!engine) return null;
  
  if (!vehicleCache) {
    await loadVehicleCache();
  }
  
  const brandUpper = brand ? String(brand).trim().toUpperCase() : '';
  const lineUpper = line ? String(line).trim().toUpperCase() : '';
  const engineNorm = normalizeEngine(engine);
  
  // Generar variantes del cilindraje
  const engineVariants = new Set([engineNorm]);
  const engineStr = String(engine).trim().toUpperCase().replace(/[^0-9.]/g, '');
  
  if (/^\d+\.\d+$/.test(engineStr)) {
    const num = parseFloat(engineStr);
    engineVariants.add(String(Math.round(num * 1000)));
  }
  
  if (/^\d{4}$/.test(engineStr)) {
    const num = parseInt(engineStr, 10);
    const decimal = (num / 1000).toFixed(1);
    engineVariants.add(decimal);
    if (num % 1000 === 0) {
      engineVariants.add(String(num / 1000));
    }
  }
  
  // 1. Matching exacto: marca + línea + cilindraje
  if (brandUpper && lineUpper) {
    for (const variant of engineVariants) {
      const vehicle = vehicleCache.find(v =>
        v.active &&
        v.make === brandUpper &&
        v.line === lineUpper &&
        enginesMatch(v.displacement, variant)
      );
      
      if (vehicle) {
        return {
          vehicle,
          matchType: 'exact',
          confidence: `Coincidencia exacta: ${brandUpper} ${lineUpper} ${vehicle.displacement}`
        };
      }
    }
    
    // Buscar por marca/línea y comparar cilindrajes equivalentes
    const vehiclesByBrandLine = vehicleCache.filter(v =>
      v.active && v.make === brandUpper && v.line === lineUpper
    );
    
    for (const v of vehiclesByBrandLine) {
      for (const variant of engineVariants) {
        if (enginesMatch(v.displacement, variant)) {
          return {
            vehicle: v,
            matchType: 'exact',
            confidence: `Coincidencia exacta (cilindraje equivalente: ${v.displacement} = ${engine})`
          };
        }
      }
    }
  }
  
  // 2. Matching solo por cilindraje (muy permisivo)
  for (const variant of engineVariants) {
    const allMatching = [];
    vehicleCacheByDisplacement.forEach((vehicles, disp) => {
      for (const variant2 of engineVariants) {
        if (enginesMatch(disp, variant2)) {
          allMatching.push(...vehicles);
          break;
        }
      }
    });
    
    const uniqueVehicles = Array.from(new Map(allMatching.map(v => [String(v._id), v])).values());
    
    // Si solo hay un vehículo con ese cilindraje, asignarlo
    if (uniqueVehicles.length === 1) {
      return {
        vehicle: uniqueVehicles[0],
        matchType: 'exact',
        confidence: `Cilindraje único coincide: ${uniqueVehicles[0].make} ${uniqueVehicles[0].line} ${uniqueVehicles[0].displacement}`
      };
    }
    
    // Si hay pocos vehículos (2-3) con el mismo cilindraje, asignar el primero
    if (uniqueVehicles.length >= 2 && uniqueVehicles.length <= 3) {
      return {
        vehicle: uniqueVehicles[0],
        matchType: 'engine_similarity',
        confidence: `Cilindraje coincide (${uniqueVehicles.length} opciones): ${uniqueVehicles[0].make} ${uniqueVehicles[0].line} ${uniqueVehicles[0].displacement}`
      };
    }
  }
  
  return null;
}

// ==================== CONTADORES ====================

const counters = {
  // Clientes
  clientsProcessed: 0,
  clientsCreated: 0,
  clientsUpdated: 0,
  clientsUnchanged: 0,
  vehiclesMatched: 0,
  vehiclesPending: 0,
  
  // Órdenes
  ordersProcessed: 0,
  ordersImported: 0,
  ordersUpdated: 0,
  ordersUnchanged: 0,
  ordersSkipped: 0,
  ordersErrors: 0
};

// ==================== IMPORTACIÓN DE CLIENTES ====================

async function importClients(orders, clients, vehicles, brands, series, companyMap) {
  console.log('\n' + '='.repeat(60));
  console.log('📋 IMPORTANDO CLIENTES');
  console.log('='.repeat(60));
  
  const clientIdx = new Map(clients.map(c => [String(c['cl_id']), c]));
  const vehicleIdx = new Map(vehicles.map(v => [String(v['au_id'] || v['id'] || ''), v]));
  
  // Crear índices para marcas y series
  const brandIndex = new Map();
  for (const row of brands) {
    const id = String(row['mr_id'] ?? row['id'] ?? '').trim();
    if (id) brandIndex.set(id, clean(row['mr_nombre'] ?? row['nombre'] ?? ''));
  }
  
  const seriesIndex = new Map();
  for (const row of series) {
    const id = String(row['sr_id'] ?? row['id'] ?? '').trim();
    if (id) seriesIndex.set(id, clean(row['sr_nombre'] ?? row['nombre'] ?? ''));
  }
  
  // Recolectar clientes con sus vehículos asociados por empresa desde órdenes
  // Las órdenes tienen or_fk_cliente y or_fk_automovil que nos dan las relaciones correctas
  const perCompany = new Map();
  
  // Primero, crear un mapa de vehículos por cliente desde órdenes
  const vehiclesByClient = new Map();
  for (const order of orders) {
    const legacyCompany = String(order['or_fk_empresa'] || '').trim();
    if (!companyMap[legacyCompany]) continue;
    
    const clientId = String(order['or_fk_cliente'] || '').trim();
    const autoId = String(order['or_fk_automovil'] || '').trim();
    
    if (clientId && clientId !== '0' && autoId && autoId !== '0') {
      if (!vehiclesByClient.has(clientId)) {
        vehiclesByClient.set(clientId, new Set());
      }
      vehiclesByClient.get(clientId).add(autoId);
    }
  }
  
  // Obtener empresas desde órdenes
  for (const legacyCompany of Object.keys(companyMap)) {
    perCompany.set(legacyCompany, new Map());
    
    // Para cada cliente que tiene vehículos en órdenes, agregarlo
    for (const [clientId, vehicleIds] of vehiclesByClient.entries()) {
      const client = clientIdx.get(clientId);
      if (client) {
        perCompany.get(legacyCompany).set(clientId, {
          client: client,
          vehicles: vehicleIds
        });
      }
    }
  }
  
  const totalToProcess = Array.from(perCompany.values()).reduce((a, m) => a + m.size, 0);
  console.log(`📊 Total de clientes únicos a procesar: ${totalToProcess}\n`);
  
  if (!dryRun) {
    await loadVehicleCache();
  }
  
  const started = Date.now();
  let lastProgressTime = Date.now();
  
  function logProgress(force = false) {
    const now = Date.now();
    const timeSinceLastProgress = now - lastProgressTime;
    
    if (!force && progressEvery && counters.clientsProcessed % progressEvery !== 0 && timeSinceLastProgress < progressTimeInterval) {
      return;
    }
    
    lastProgressTime = now;
    
    const p = totalToProcess ? Math.min(100, (counters.clientsProcessed / totalToProcess) * 100) : 0;
    const elapsed = (Date.now() - started) / 1000;
    const rate = counters.clientsProcessed > 0 ? elapsed / counters.clientsProcessed : 0;
    const remaining = Math.max(0, totalToProcess - counters.clientsProcessed);
    const eta = rate * remaining;
    const fmt = (s) => {
      if (!Number.isFinite(s)) return '---';
      if (s < 60) return `${s.toFixed(0)}s`;
      const m = Math.floor(s / 60);
      const sec = Math.floor(s % 60);
      return `${m}m ${sec}s`;
    };
    
    const barWidth = 40;
    const filled = Math.round((p / 100) * barWidth);
    const bar = '█'.repeat(filled) + '░'.repeat(barWidth - filled);
    
    process.stdout.write('\r');
    process.stdout.write(`[${bar}] ${p.toFixed(1)}% | ${counters.clientsProcessed}/${totalToProcess} | ✅ ${counters.clientsCreated} | 🔄 ${counters.clientsUpdated} | ➖ ${counters.clientsUnchanged} | 🚗 ${counters.vehiclesMatched} | ⚠️  ${counters.vehiclesPending} | ⏱️  ETA: ${fmt(eta)}`);
    process.stdout.write(' '.repeat(20));
  }
  
  const progressTimer = setInterval(() => {
    if (counters.clientsProcessed > 0) {
      logProgress(true);
    }
  }, progressTimeInterval);
  
  for (const [legacyCompany, clientMap] of perCompany.entries()) {
    const companyId = companyMap[legacyCompany];
    const companyIdStr = String(companyId);
    
    for (const [legacyClientId, clientData] of clientMap.entries()) {
      counters.clientsProcessed++;
      if (limit && counters.clientsProcessed > limit) break;
      
      const cli = clientData.client;
      if (!cli) {
        counters.clientsProcessed++;
        logProgress();
        continue;
      }
      
      // Validación temprana: verificar datos mínimos del cliente
      const idNumberRaw = clean(cli['cl_identificacion'] || '');
      const idNumber = idNumberRaw.replace(/\.0$/, '');
      const name = clean(cli['cl_nombre'] || '');
      if (!idNumber && !name) {
        counters.clientsProcessed++;
        logProgress();
        continue; // Saltar clientes sin datos mínimos
      }
      const phone = clean(cli['cl_telefono']);
      const email = clean(cli['cl_mail']);
      const address = clean(cli['cl_direccion']);
      const hasId = !!idNumber;
      const plateSynthetic = hasId ? `CATALOGO-${idNumber.toUpperCase()}` : `CLIENT-${legacyClientId}`;
      
      // Obtener datos del vehículo desde el primer vehículo asociado
      let vehicleBrand = '';
      let vehicleLine = '';
      let vehicleEngine = '';
      let vehicleYear = null;
      let vehiclePlate = '';
      
      for (const legacyAutoId of clientData.vehicles) {
        const veh = vehicleIdx.get(String(legacyAutoId));
        if (veh) {
          vehicleEngine = clean(veh['au_cilidraje'] || veh['au_cilindraje'] || '');
          vehicleYear = veh['au_modelo'] ? parseInt(veh['au_modelo'], 10) : null;
          vehiclePlate = clean(veh['au_placa'] || veh['placa'] || '');
          
          // Obtener marca y línea desde los índices
          const marcaId = String(veh['au_fk_marca'] || '').trim();
          const serieId = String(veh['au_fk_serie'] || '').trim();
          
          if (marcaId && brandIndex.has(marcaId)) {
            vehicleBrand = brandIndex.get(marcaId);
          }
          if (serieId && seriesIndex.has(serieId)) {
            vehicleLine = seriesIndex.get(serieId);
          }
          
          break;
        }
      }
      
      if (dryRun) {
        // Simulación
        let vehicleMatch = null;
        if (vehicleEngine) {
          vehicleMatch = await findVehicleMatch(vehicleBrand, vehicleLine, vehicleEngine);
        }
        
        const existing = await CustomerProfile.findOne({
          companyId: companyIdStr,
          $or: [{ identificationNumber: idNumber }, { plate: plateSynthetic }]
        });
        
        if (!existing) {
          counters.clientsCreated++;
        } else {
          counters.clientsUpdated++;
        }
        
        if (vehicleMatch && (vehicleMatch.matchType === 'exact' || (vehicleBrand && vehicleLine))) {
          counters.vehiclesMatched++;
        } else if (vehicleEngine) {
          counters.vehiclesPending++;
        }
        
        counters.clientsProcessed++;
        logProgress();
        continue;
      }
      
      // Buscar matching de vehículo
      let vehicleMatch = null;
      let vehicleId = null;
      
      if (vehicleEngine) {
        vehicleMatch = await findVehicleMatch(vehicleBrand, vehicleLine, vehicleEngine);
      }
      
      // Buscar perfil existente (optimizado: buscar primero por placa que es más específico)
      const finalPlate = vehiclePlate || plateSynthetic;
      let existing = null;
      
      // Intentar primero por placa (más rápido con índice, usar lean para mejor performance)
      if (finalPlate && finalPlate !== 'VENTA') {
        existing = await CustomerProfile.findOne({
          companyId: companyIdStr,
          plate: finalPlate
        }).lean();
      }
      
      // Si no se encontró, buscar por identificationNumber (solo si hay idNumber)
      if (!existing && idNumber && idNumber.trim()) {
        existing = await CustomerProfile.findOne({
          companyId: companyIdStr,
          identificationNumber: idNumber
        }).lean();
      }
      
      // Si aún no se encontró y hay plateSynthetic diferente, buscar por ese (solo si es diferente)
      if (!existing && plateSynthetic && plateSynthetic !== finalPlate && plateSynthetic !== 'VENTA') {
        existing = await CustomerProfile.findOne({
          companyId: companyIdStr,
          plate: plateSynthetic
        }).lean();
      }
      
      const shouldAssignVehicle = vehicleMatch && (
        vehicleMatch.matchType === 'exact' ||
        (vehicleBrand && vehicleLine)
      );
      
      let profile;
      
      if (shouldAssignVehicle) {
        // Asignación directa
        vehicleId = vehicleMatch.vehicle._id;
        const vehicleData = {
          plate: finalPlate,
          vehicleId: vehicleId,
          brand: vehicleMatch.vehicle.make,
          line: vehicleMatch.vehicle.line,
          engine: vehicleMatch.vehicle.displacement,
          year: vehicleYear
        };
        
        if (!existing) {
          profile = await CustomerProfile.findOneAndUpdate(
            { companyId: companyIdStr, plate: finalPlate },
            {
              $set: {
                customer: { idNumber, name, phone, email, address },
                vehicle: vehicleData
              },
              $setOnInsert: {
                companyId: companyIdStr,
                identificationNumber: idNumber,
                plate: finalPlate
              }
            },
            { upsert: true, new: true, lean: false }
          );
          counters.clientsCreated++;
        } else {
          const update = { $set: {} };
          if (!existing.customer?.idNumber && idNumber) update.$set['customer.idNumber'] = idNumber;
          if (!existing.customer?.name && name) update.$set['customer.name'] = name;
          if (!existing.customer?.phone && phone) update.$set['customer.phone'] = phone;
          if (!existing.customer?.email && email) update.$set['customer.email'] = email;
          if (!existing.customer?.address && address) update.$set['customer.address'] = address;
          if (!existing.vehicle?.vehicleId) {
            update.$set['vehicle.vehicleId'] = vehicleId;
            update.$set['vehicle.brand'] = vehicleMatch.vehicle.make;
            update.$set['vehicle.line'] = vehicleMatch.vehicle.line;
            update.$set['vehicle.engine'] = vehicleMatch.vehicle.displacement;
            update.$set['vehicle.plate'] = finalPlate;
            if (vehicleYear) update.$set['vehicle.year'] = vehicleYear;
          }
          if (Object.keys(update.$set).length) {
            await CustomerProfile.updateOne({ _id: existing._id }, update);
            counters.clientsUpdated++;
            profile = await CustomerProfile.findById(existing._id);
          } else {
            counters.clientsUnchanged++;
            profile = existing;
          }
        }
        counters.vehiclesMatched++;
      } else {
        // Sin matching: crear/actualizar perfil sin vehículo y guardar en Pendientes
        if (!existing) {
          profile = await CustomerProfile.findOneAndUpdate(
            { companyId: companyIdStr, plate: finalPlate },
            {
              $set: { customer: { idNumber, name, phone, email, address } },
              $setOnInsert: {
                companyId: companyIdStr,
                identificationNumber: idNumber,
                vehicle: { plate: finalPlate },
                plate: finalPlate
              }
            },
            { upsert: true, new: true, lean: false }
          );
          counters.clientsCreated++;
        } else {
          const update = { $set: {} };
          if (!existing.customer?.idNumber && idNumber) update.$set['customer.idNumber'] = idNumber;
          if (!existing.customer?.name && name) update.$set['customer.name'] = name;
          if (!existing.customer?.phone && phone) update.$set['customer.phone'] = phone;
          if (!existing.customer?.email && email) update.$set['customer.email'] = email;
          if (!existing.customer?.address && address) update.$set['customer.address'] = address;
          if (Object.keys(update.$set).length) {
            await CustomerProfile.updateOne({ _id: existing._id }, update);
            counters.clientsUpdated++;
            // No necesitamos recargar, actualizar en memoria
            profile = { ...existing, customer: { ...existing.customer, ...Object.fromEntries(Object.entries(update.$set).filter(([k]) => k.startsWith('customer.')).map(([k, v]) => [k.replace('customer.', ''), v])) } };
          } else {
            counters.clientsUnchanged++;
            profile = existing;
          }
        }
        
        // Guardar en Pendientes si hay datos de vehículo
        if (vehicleEngine || vehicleMatch) {
          const unassignedData = {
            companyId: companyIdStr,
            profileId: profile._id,
            customer: { idNumber, name, phone, email, address },
            vehicleData: {
              plate: vehiclePlate || plateSynthetic,
              brand: vehicleBrand || '',
              line: vehicleLine || '',
              engine: vehicleEngine || '',
              year: vehicleYear || null
            },
            status: 'pending',
            source: 'import',
            legacyData: { legacyClientId, legacyCompany }
          };
          
          if (vehicleMatch) {
            unassignedData.suggestedVehicle = {
              vehicleId: vehicleMatch.vehicle._id,
              make: vehicleMatch.vehicle.make,
              line: vehicleMatch.vehicle.line,
              displacement: vehicleMatch.vehicle.displacement,
              matchType: vehicleMatch.matchType,
              confidence: vehicleMatch.confidence
            };
          }
          
          // Verificar si ya existe un UnassignedVehicle para este perfil (optimizado)
          const existingUnassigned = await UnassignedVehicle.findOne({
            companyId: companyIdStr,
            $or: [
              { profileId: profile._id, status: 'pending' },
              { 'vehicleData.plate': vehiclePlate || plateSynthetic, companyId: companyIdStr, status: 'pending' }
            ]
          }).lean();
          
          if (!existingUnassigned) {
            try {
              await UnassignedVehicle.create(unassignedData);
              counters.vehiclesPending++;
            } catch (err) {
              // Ignorar errores de duplicados u otros
              if (err.code !== 11000) {
                console.warn(`⚠️  Error creando UnassignedVehicle: ${err.message}`);
              }
            }
          }
        }
      }
      
      logProgress();
    }
  }
  
  clearInterval(progressTimer);
  logProgress(true);
  console.log('');
  
  const dur = ((Date.now() - started) / 1000).toFixed(1);
  console.log('✅ Importación de clientes completada');
  console.log(`📊 Total procesado: ${counters.clientsProcessed}`);
  console.log(`✅ Creados: ${counters.clientsCreated}`);
  console.log(`🔄 Actualizados: ${counters.clientsUpdated}`);
  console.log(`➖ Sin cambios: ${counters.clientsUnchanged}`);
  console.log(`🚗 Vehículos asignados: ${counters.vehiclesMatched}`);
  console.log(`⚠️  Vehículos pendientes: ${counters.vehiclesPending}`);
  console.log(`⏱️  Tiempo: ${dur}s\n`);
}

// ==================== IMPORTACIÓN DE ÓRDENES ====================

function buildLegacyItems({ productRows = [], serviceRows = [], productCatalog, serviceCatalog, remisionRow }) {
  const items = [];
  let productTotal = 0;
  let serviceTotal = 0;
  
  for (const row of productRows) {
    const productId = String(row['rpo_fk_producto'] ?? row['rpo_producto'] ?? '').trim();
    let qty = parseFloat(String(row['rpo_cantidad'] ?? row['cantidad'] ?? '0').replace(/,/g, '')) || 1;
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
    unitPrice = Math.round((unitPrice || (total / qty) || 0) * 100) / 100;
    total = Math.round((total || unitPrice * qty) * 100) / 100;
    
    const catalog = productCatalog.get(productId) || {};
    const skuSource = clean(catalog['pr_codigo'] ?? catalog['codigo'] ?? '');
    const nameSource = clean(catalog['pr_nombre'] ?? catalog['nombre'] ?? catalog['descripcion'] ?? '');
    const descFromRow = clean(row['rpo_descripcion'] ?? row['descripcion'] ?? '');
    
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
    const serviceId = String(row['rso_idServiciofk'] ?? row['rso_servicio'] ?? '').trim();
    const price = parseMoney(row['rso_precio'] ?? row['precio'] ?? '');
    const total = Math.round(price * 100) / 100;
    
    const catalog = serviceCatalog.get(serviceId) || {};
    const nameSource = clean(catalog['ser_nombre'] ?? catalog['nombre'] ?? catalog['descripcion'] ?? '');
    const descFromRow = clean(row['rso_descripcion'] ?? row['descripcion'] ?? '');
    
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
  
  const DIFF_TOLERANCE = 0.01;
  
  if (remProducts > 0) {
    const diff = remProducts - productTotal;
    if (Math.abs(diff) > DIFF_TOLERANCE) {
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
  
  if (remServices > 0) {
    const diff = remServices - serviceTotal;
    if (Math.abs(diff) > DIFF_TOLERANCE) {
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
  
  if (remTotal > 0) {
    const diff = remTotal - (productTotal + serviceTotal);
    if (Math.abs(diff) > DIFF_TOLERANCE) {
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
  
  const subtotal = Math.round((productTotal + serviceTotal) * 100) / 100;
  const total = remTotal > 0 ? Math.round(remTotal * 100) / 100 : subtotal;
  const tax = 0;
  laborValue = Math.round(laborValue * 100) / 100;
  
  return { items, subtotal, total, tax, laborValue };
}

async function importOrders(orders, clients, vehicles, remisions, orderProducts, orderServices, products, services, brands, series, companyMap) {
  console.log('\n' + '='.repeat(60));
  console.log('📋 IMPORTANDO ÓRDENES');
  console.log('='.repeat(60));
  
  const clientIndex = new Map(clients.map(row => [String(row['cl_id'] ?? row['id'] ?? ''), row]));
  const vehicleIndex = new Map(vehicles.map(row => [String(row['au_id'] ?? row['id'] ?? ''), row]));
  
  // Caché de CustomerProfiles por placa/companyId para evitar consultas repetidas
  const profileCache = new Map();
  
  // Caché de vehículos por marca/línea/cilindraje para evitar consultas repetidas
  const vehicleCacheBySpec = new Map();
  
  // Función helper para obtener perfil desde caché o BD
  async function getProfileCached(companyId, plate) {
    const cacheKey = `${String(companyId)}:${plate}`;
    if (profileCache.has(cacheKey)) {
      return profileCache.get(cacheKey);
    }
    
    if (dryRun) return null;
    
    try {
      const profile = await CustomerProfile.findOne({
        companyId: String(companyId),
        $or: [{ plate }, { 'vehicle.plate': plate }]
      }).sort({ updatedAt: -1 }).lean();
      
      if (profile) {
        profileCache.set(cacheKey, profile);
      }
      return profile;
    } catch (err) {
      return null;
    }
  }
  
  // Función helper para obtener vehículo desde caché o BD
  async function getVehicleCached(brand, line, engine) {
    if (!brand || !line || !engine) return null;
    
    const cacheKey = `${brand.toUpperCase()}:${line.toUpperCase()}:${engine.toUpperCase()}`;
    if (vehicleCacheBySpec.has(cacheKey)) {
      return vehicleCacheBySpec.get(cacheKey);
    }
    
    if (dryRun) return null;
    
    try {
      const vehicle = await Vehicle.findOne({
        make: brand.toUpperCase(),
        line: line.toUpperCase(),
        displacement: engine.toUpperCase(),
        active: true
      }).lean();
      
      if (vehicle) {
        vehicleCacheBySpec.set(cacheKey, vehicle);
      }
      return vehicle;
    } catch (err) {
      return null;
    }
  }
  
  // Crear índices para marcas y series
  const brandIndex = new Map();
  for (const row of brands) {
    const id = String(row['mr_id'] ?? row['id'] ?? '').trim();
    if (id) brandIndex.set(id, clean(row['mr_nombre'] ?? row['nombre'] ?? ''));
  }
  
  const seriesIndex = new Map();
  for (const row of series) {
    const id = String(row['sr_id'] ?? row['id'] ?? '').trim();
    if (id) seriesIndex.set(id, clean(row['sr_nombre'] ?? row['nombre'] ?? ''));
  }
  
  const productCatalog = new Map();
  for (const row of products) {
    const id = String(row['pr_id'] ?? row['id'] ?? '').trim();
    if (id) productCatalog.set(id, row);
  }
  
  const serviceCatalog = new Map();
  for (const row of services) {
    const id = String(row['ser_id'] ?? row['id'] ?? '').trim();
    if (id) serviceCatalog.set(id, row);
  }
  
  // Mapear productos por orden
  const orderProductMap = new Map();
  for (const row of orderProducts) {
    const orderId = String(row['rpo_fk_orden'] ?? row['orden'] ?? '').trim();
    if (orderId) {
      if (!orderProductMap.has(orderId)) orderProductMap.set(orderId, []);
      orderProductMap.get(orderId).push(row);
    }
  }
  
  // Mapear servicios por orden
  const orderServiceMap = new Map();
  for (const row of orderServices) {
    const orderId = String(row['rso_idOrdenfk'] ?? row['rso_orden'] ?? row['orden'] ?? '').trim();
    if (orderId) {
      if (!orderServiceMap.has(orderId)) orderServiceMap.set(orderId, []);
      orderServiceMap.get(orderId).push(row);
    }
  }
  
  // Mapear remisiones por orden
  const remisionMap = new Map();
  for (const row of remisions) {
    const orderId = String(row['rm_fk_orden'] ?? row['orden'] ?? '').trim();
    if (orderId) remisionMap.set(orderId, row);
  }
  
  // Crear índice de órdenes por ID para acceso rápido
  const orderIndex = new Map();
  for (const order of orders) {
    const orderId = String(order['or_id'] ?? order['id'] ?? '').trim();
    if (orderId) orderIndex.set(orderId, order);
  }
  
  // Filtrar órdenes por empresa del mapeo
  const filteredOrders = orders.filter(order => {
    const legacyCompanyId = String(order['or_fk_empresa'] ?? '').trim();
    return companyMap[legacyCompanyId] !== undefined;
  });
  
  const totalRows = filteredOrders.length;
  console.log(`📊 Total de órdenes a procesar: ${totalRows}\n`);
  
  // Validación previa: verificar que hay órdenes para procesar
  if (totalRows === 0) {
    console.log('⚠️  No hay órdenes para procesar con el mapeo de empresas proporcionado');
    return;
  }
  
  const started = Date.now();
  let lastProgressTime = Date.now();
  
  function logProgress(force = false) {
    const now = Date.now();
    const timeSinceLastProgress = now - lastProgressTime;
    
    if (!force && progressEvery && counters.ordersProcessed % progressEvery !== 0 && timeSinceLastProgress < progressTimeInterval) {
      return;
    }
    
    lastProgressTime = now;
    
    const percent = totalRows > 0 ? ((counters.ordersProcessed / totalRows) * 100).toFixed(1) : '0.0';
    const elapsed = (Date.now() - started) / 1000;
    const rate = counters.ordersProcessed > 0 ? elapsed / counters.ordersProcessed : 0;
    const remaining = Math.max(0, totalRows - counters.ordersProcessed);
    const etaSec = rate * remaining;
    const fmt = (seconds) => {
      if (!Number.isFinite(seconds)) return '---';
      if (seconds < 60) return `${Math.round(seconds)}s`;
      const m = Math.floor(seconds / 60);
      const s = Math.floor(seconds % 60);
      return `${m}m ${s}s`;
    };
    
    const barWidth = 40;
    const filled = Math.round((Number(percent) / 100) * barWidth);
    const bar = '█'.repeat(filled) + '░'.repeat(barWidth - filled);
    
    process.stdout.write('\r');
    process.stdout.write(`[${bar}] ${percent}% | ${counters.ordersProcessed}/${totalRows} | ✅ ${counters.ordersImported} | 🔄 ${counters.ordersUpdated} | ➖ ${counters.ordersUnchanged} | ⏭️  ${counters.ordersSkipped} | ❌ ${counters.ordersErrors} | ⏱️  ETA: ${fmt(etaSec)}`);
    process.stdout.write(' '.repeat(30));
  }
  
  const progressTimer = setInterval(() => {
    if (counters.ordersProcessed > 0) {
      logProgress(true);
    }
  }, progressTimeInterval);
  
  // Procesar órdenes directamente (cada orden tiene cliente y vehículo)
  // Validación previa: verificar que hay órdenes para procesar
  if (filteredOrders.length === 0) {
    console.log('⚠️  No hay órdenes para procesar con el mapeo de empresas proporcionado');
    return;
  }
  
  for (const orderRow of filteredOrders) {
    counters.ordersProcessed++;
    if (limit && counters.ordersProcessed > limit) break;
    
    const legacyOrId = String(orderRow['or_id'] ?? orderRow['id'] ?? '').trim();
    if (!legacyOrId || legacyOrId === '0') {
      counters.ordersSkipped++;
      logProgress();
      continue;
    }
    
    // Obtener empresa desde la orden
    const legacyCompanyId = String(orderRow['or_fk_empresa'] ?? '').trim();
    if (!companyMap[legacyCompanyId]) {
      counters.ordersSkipped++;
      logProgress();
      continue;
    }
    
    let companyId;
    try {
      companyId = new mongoose.Types.ObjectId(companyMap[legacyCompanyId]);
    } catch (err) {
      counters.ordersSkipped++;
      logProgress();
      continue;
    }
    
    // Obtener cliente y vehículo directamente desde la orden
    const legacyClienteId = String(orderRow['or_fk_cliente'] || '').trim();
    const legacyAutoId = String(orderRow['or_fk_automovil'] || '').trim();
    
    if (!legacyClienteId || legacyClienteId === '0' || !legacyAutoId || legacyAutoId === '0') {
      counters.ordersSkipped++;
      logProgress();
      continue;
    }
    
    const cli = clientIndex.get(legacyClienteId) || {};
    const veh = vehicleIndex.get(legacyAutoId);
    
    if (!veh) {
      counters.ordersSkipped++;
      logProgress();
      continue;
    }
    
    const plate = normalizePlate(veh['au_placa'] || '');
    if (!plate || plate === 'VENTA') {
      counters.ordersSkipped++;
      logProgress();
      continue;
    }
    
    const idNumber = clean(cli['cl_identificacion'] || '');
    const customerName = clean(cli['cl_nombre'] || '');
    const phone = clean(cli['cl_telefono'] || '');
    const email = clean(cli['cl_mail'] || '');
    const address = clean(cli['cl_direccion'] || '');
    
    const engine = veh && veh['au_cilidraje'] ? String(veh['au_cilidraje']) : '';
    const year = parseNumber(veh && veh['au_modelo']);
    const mileage = parseNumber(orderRow['or_kilometraje']);
    
    // Obtener marca y línea desde los índices
    const marcaId = String(veh['au_fk_marca'] || '').trim();
    const serieId = String(veh['au_fk_serie'] || '').trim();
    
    let brand = '';
    let line = '';
    if (marcaId && brandIndex.has(marcaId)) {
      brand = brandIndex.get(marcaId).toUpperCase();
    }
    if (serieId && seriesIndex.has(serieId)) {
      line = seriesIndex.get(serieId).toUpperCase();
    }
    
    // Obtener productos y servicios para esta orden
    const productRowsForOrder = orderProductMap.get(legacyOrId) || [];
    const serviceRowsForOrder = orderServiceMap.get(legacyOrId) || [];
    const remisionRow = remisionMap.get(legacyOrId);
    
    let vehicleId = null;
    
    // Ya tenemos brand y line desde los índices arriba
    // Ahora buscar vehicleId en la BD si no es dry run (usando caché)
    if (!dryRun) {
      // Buscar por placa en CustomerProfile (usando caché)
      const profile = await getProfileCached(companyId, plate);
      
      if (profile && profile.vehicle) {
        if (!brand) brand = clean(profile.vehicle.brand || '').toUpperCase();
        if (!line) line = clean(profile.vehicle.line || '').toUpperCase();
        vehicleId = profile.vehicle.vehicleId || null;
      }
      
      // Buscar vehículo por marca, línea y cilindraje si no se encontró (usando caché)
      if (!vehicleId && brand && line && engine) {
        const vehicle = await getVehicleCached(brand, line, engine);
        if (vehicle) vehicleId = vehicle._id;
      }
      
      // Buscar vehículo solo por cilindraje si aún no encontramos (solo si no hay muchos)
      if (!vehicleId && engine) {
        try {
          const vehicles = await Vehicle.find({
            displacement: engine.toUpperCase(),
            active: true
          }).limit(10).lean();
          
          if (vehicles.length === 1) {
            vehicleId = vehicles[0]._id;
            if (!brand) brand = vehicles[0].make;
            if (!line) line = vehicles[0].line;
            // Guardar en caché
            if (brand && line) {
              vehicleCacheBySpec.set(`${brand.toUpperCase()}:${line.toUpperCase()}:${engine.toUpperCase()}`, vehicles[0]);
            }
          }
        } catch (err) {
          // Ignorar
        }
      }
    }
    
    // Fecha desde la orden
    const fecha = clean(orderRow['or_fecha'] || '');
    const fechaEntrega = clean(orderRow['or_fecha_entrega'] || '');
    const createdAt = parseDate(fecha) || new Date();
    const closedAt = parseDate(fechaEntrega) || createdAt;
    
    // Construir items desde productos y servicios de la orden
    const { items, subtotal, total, tax, laborValue } = buildLegacyItems({
      productRows: productRowsForOrder,
      serviceRows: serviceRowsForOrder,
      productCatalog,
      serviceCatalog,
      remisionRow
    });
    
    // Validación: verificar que hay items o total válido
    if (!items.length && (!total || total <= 0)) {
      counters.ordersSkipped++;
      logProgress();
      continue;
    }
    
    // Validación adicional: verificar que el total es razonable (no negativo, no excesivo)
    if (total < 0 || total > 100000000) { // 100 millones como límite superior
      logWarning(`⚠️  Orden ${legacyOrId} tiene total sospechoso: ${total}`);
      counters.ordersSkipped++;
      logProgress();
      continue;
    }
    
    const legacyMarker = `LEGACY or_id=${legacyOrId} empresa=${legacyCompanyId}`;
    const obs = clean(orderRow['or_observacion'] || '');
    const otros = clean(orderRow['or_otros'] || '');
    const notesParts = [legacyMarker];
    if (obs) notesParts.push(`Obs: ${obs}`);
    if (otros) notesParts.push(`Otros: ${otros}`);
    const notes = notesParts.join('\n');
    const saleName = plate ? `Venta - ${plate}` : `Venta Legacy ${legacyOrId}`;
    
    if (dryRun) {
      counters.ordersImported++;
      logProgress();
      continue;
    }
    
    // Buscar orden existente (optimizado: solo buscar si legacyOrId es válido, usar lean)
    let existing = null;
    if (legacyOrId && legacyOrId !== '0') {
      try {
        existing = await Sale.findOne({
          companyId: companyId,
          legacyOrId: String(legacyOrId).trim()
        }).lean();
        
        // Buscar en notes como fallback solo si no se encontró (evitar regex si es posible)
        if (!existing) {
          const rx = new RegExp(`\\bor_id=${String(legacyOrId).trim()}\\b`);
          existing = await Sale.findOne({
            companyId: companyId,
            notes: { $regex: rx }
          }).lean();
        }
      } catch (err) {
        counters.ordersErrors++;
        logProgress();
        continue;
      }
    }
    
    if (existing) {
      // Actualizar orden existente
      const update = { $set: {} };
      let hasChanges = false;
      
      if (items.length > 0) {
        const existingItemsStr = JSON.stringify(existing.items || []);
        const newItemsStr = JSON.stringify(items);
        if (existingItemsStr !== newItemsStr) {
          update.$set.items = items;
          hasChanges = true;
        }
      }
      
      if (Math.abs((existing.total || 0) - total) > 0.01) {
        update.$set.total = total;
        update.$set.subtotal = subtotal;
        update.$set.tax = tax;
        update.$set.laborValue = laborValue;
        hasChanges = true;
      }
      
      if (hasChanges && Object.keys(update.$set).length > 0) {
        try {
          await Sale.updateOne({ _id: existing._id }, update);
          counters.ordersUpdated++;
        } catch (err) {
          counters.ordersErrors++;
        }
      } else {
        counters.ordersUnchanged++;
      }
    } else {
      // Crear nueva orden
      try {
        const saleDoc = await Sale.create({
          companyId: companyId,
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
        
        // Actualizar timestamps (optimizado: hacer en una sola operación)
        try {
          await Sale.updateOne(
            { _id: saleDoc._id },
            { $set: { createdAt, updatedAt: closedAt || createdAt } }
          );
        } catch (err) {
          // Ignorar errores menores de timestamps
        }
        
        // Actualizar perfil de cliente (solo si hay placa y datos válidos)
        if (plate && plate !== 'VENTA' && (customerName || idNumber)) {
          try {
            await upsertProfileFromSource(
              String(companyId),
              { customer: saleDoc.customer, vehicle: saleDoc.vehicle },
              { source: 'script-legacy-orders', overwriteMileage: true, overwriteYear: true, overwriteVehicle: false }
            );
          } catch (err) {
            // Ignorar errores de actualización de perfil (no crítico)
          }
        }
        
        counters.ordersImported++;
      } catch (err) {
        counters.ordersErrors++;
      }
    }
    
    logProgress();
  }
  
  clearInterval(progressTimer);
  logProgress(true);
  console.log('');
  
  const dur = ((Date.now() - started) / 1000).toFixed(1);
  console.log('✅ Importación de órdenes completada');
  console.log(`📊 Total procesado: ${counters.ordersProcessed}`);
  console.log(`✅ Importadas: ${counters.ordersImported}`);
  console.log(`🔄 Actualizadas: ${counters.ordersUpdated}`);
  console.log(`➖ Sin cambios: ${counters.ordersUnchanged}`);
  console.log(`⏭️  Saltadas: ${counters.ordersSkipped}`);
  console.log(`❌ Errores: ${counters.ordersErrors}`);
  console.log(`⏱️  Tiempo: ${dur}s\n`);
}

// ==================== MAIN ====================

async function main() {
  console.log('🚀 INICIANDO IMPORTACIÓN UNIFICADA DE DATOS LEGACY');
  console.log('='.repeat(60));
  console.log(`📂 Archivos CSV:`);
  console.log(`   - Órdenes: ${ordersPath}`);
  console.log(`   - Clientes: ${clientsPath}`);
  console.log(`   - Vehículos: ${vehiclesPath}`);
  console.log(`   - Remisiones: ${remisPath}`);
  console.log(`   - Productos: ${productsPath}`);
  console.log(`   - Servicios: ${servicesPath}`);
  console.log(`   - Relaciones orden-producto: ${orderProductsPath}`);
  console.log(`   - Relaciones orden-servicio: ${orderServicesPath}`);
  console.log(`   - Marcas: ${brandsPath}`);
  console.log(`   - Series: ${seriesPath}`);
  console.log(`\n🏢 Mapeo de empresas: ${JSON.stringify(companyMap)}`);
  console.log(`💾 Modo: ${dryRun ? 'DRY RUN (simulación)' : 'REAL (guardando en BD)'}`);
  if (limit) console.log(`🔢 Límite: ${limit} registros`);
  console.log('='.repeat(60));
  
  // Validar mapeo de empresas (empresa 1 y 3 para Casa Renault, empresa 2 para Serviteca Shelby)
  if (!companyMap['1'] || !companyMap['3']) {
    console.error('\n❌ ERROR: Debes proporcionar el mapeo de empresas 1 y 3 para Casa Renault');
    console.error('   Uso: --companyMap "1:<mongoId1>,3:<mongoId3>,2:<mongoId2>"');
    console.error('   Empresa 1 y 3 -> Casa Renault');
    console.error('   Empresa 2 -> Serviteca Shelby');
    process.exit(1);
  }
  
  // Leer archivos CSV
  console.log('\n📖 Leyendo archivos CSV...');
  const orders = await parseCSV(ordersPath, { delimiter, encoding });
  console.log(`✅ Órdenes: ${orders.length}`);
  
  const clients = await parseCSV(clientsPath, { delimiter, encoding });
  console.log(`✅ Clientes: ${clients.length}`);
  
  const vehicles = await parseCSV(vehiclesPath, { delimiter, encoding });
  console.log(`✅ Vehículos: ${vehicles.length}`);
  
  const remisions = await parseCSV(remisPath, { delimiter, encoding });
  console.log(`✅ Remisiones: ${remisions.length}`);
  
  const products = await parseCSV(productsPath, { delimiter, encoding });
  console.log(`✅ Productos: ${products.length}`);
  
  const services = await parseCSV(servicesPath, { delimiter, encoding });
  console.log(`✅ Servicios: ${services.length}`);
  
  const orderProducts = await parseCSV(orderProductsPath, { delimiter, encoding });
  console.log(`✅ Relaciones orden-producto: ${orderProducts.length}`);
  
  const orderServices = await parseCSV(orderServicesPath, { delimiter, encoding });
  console.log(`✅ Relaciones orden-servicio: ${orderServices.length}`);
  
  const brands = await parseCSV(brandsPath, { delimiter, encoding });
  console.log(`✅ Marcas: ${brands.length}`);
  
  const series = await parseCSV(seriesPath, { delimiter, encoding });
  console.log(`✅ Series: ${series.length}`);
  
  // Conectar a MongoDB
  if (!dryRun) {
    const uri = args.mongo || process.env.MONGODB_URI;
    if (!uri) {
      console.error('\n❌ ERROR: Falta --mongo o MONGODB_URI');
      process.exit(1);
    }
    await connectDB(uri);
    console.log('\n✅ Conectado a MongoDB\n');
  } else {
    console.log('\n⚠️  MODO DRY RUN: No se guardará nada en la base de datos\n');
  }
  
  // Importar clientes (usando órdenes para obtener relaciones correctas)
  await importClients(orders, clients, vehicles, brands, series, companyMap);
  
  // Importar órdenes (usando órdenes directamente)
  await importOrders(orders, clients, vehicles, remisions, orderProducts, orderServices, products, services, brands, series, companyMap);
  
  // Resumen final
  console.log('\n' + '='.repeat(60));
  console.log('✅ IMPORTACIÓN COMPLETADA');
  console.log('='.repeat(60));
  console.log('\n📊 RESUMEN FINAL:');
  console.log(`\n👥 CLIENTES:`);
  console.log(`   ✅ Creados: ${counters.clientsCreated}`);
  console.log(`   🔄 Actualizados: ${counters.clientsUpdated}`);
  console.log(`   ➖ Sin cambios: ${counters.clientsUnchanged}`);
  console.log(`   🚗 Vehículos asignados: ${counters.vehiclesMatched}`);
  console.log(`   ⚠️  Vehículos pendientes: ${counters.vehiclesPending}`);
  console.log(`\n📦 ÓRDENES:`);
  console.log(`   ✅ Importadas: ${counters.ordersImported}`);
  console.log(`   🔄 Actualizadas: ${counters.ordersUpdated}`);
  console.log(`   ➖ Sin cambios: ${counters.ordersUnchanged}`);
  console.log(`   ⏭️  Saltadas: ${counters.ordersSkipped}`);
  console.log(`   ❌ Errores: ${counters.ordersErrors}`);
  console.log('\n' + '='.repeat(60));
  
  if (dryRun) {
    console.log('\n💡 Para ejecutar la importación real, ejecuta el mismo comando sin --dry');
  }
}

main()
  .then(() => {
    if (!dryRun) mongoose.connection.close().catch(() => {});
  })
  .catch(err => {
    console.error('\n❌ ERROR:', err);
    process.exit(1);
  });

