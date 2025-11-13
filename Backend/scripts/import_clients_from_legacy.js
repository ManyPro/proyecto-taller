#!/usr/bin/env node
import fs from 'fs';
import readline from 'readline';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { connectDB } from '../src/db.js';
import CustomerProfile from '../src/models/CustomerProfile.js';
import Vehicle from '../src/models/Vehicle.js';
import UnassignedVehicle from '../src/models/UnassignedVehicle.js';

dotenv.config();

/*
 Importar clientes con matching de vehículos desde legacy.
 - Toma clientes que aparezcan en órdenes de empresa 2 (Shelby) y 3 (Casa Renault) o el mapeo pasado.
 - Intenta conectar cada cliente con un vehículo de la BD por similitud exacta o por cilindraje.
 - Si hay coincidencia exacta (marca + línea + cilindraje), asigna el vehículo directamente.
 - Si hay similitud de cilindraje (1.6 = 1600, 2.0 = 2000, etc.) o no hay coincidencia, guarda en UnassignedVehicle para aprobación.
 - Crea/actualiza CustomerProfile con placa sintética única por cliente: CATALOGO-<idNumber> (si no hay idNumber, usa CLIENT-<cl_id>).
 - Idempotente y sin duplicados: busca por (companyId + identificationNumber) o por la placa sintética.

 Uso:
  node scripts/import_clients_from_legacy.js \
    --orders Backend/data/legacy/ordenesfinal.csv \
    --clients Backend/data/legacy/clientesfinal.csv \
    --vehicles Backend/data/legacy/automovilfinal.csv \
    --mongo "mongodb://localhost:27017" \
    --companyMap "2:<mongoCompanyIdShelby>,3:<mongoCompanyIdRenault>" \
    [--dry] [--limit 10000]
*/

function parseArgs(argv){
  const out = {};
  for(let i=0;i<argv.length;i++){
    let t = argv[i]; if(!t.startsWith('--')) continue; t=t.slice(2);
    if(t.includes('=')){ const [k,v]=t.split(/=(.*)/); out[k]=v; }
    else { const n=argv[i+1]; if(n && !n.startsWith('--')){ out[t]=n; i++; } else out[t]=true; }
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
if(!args.orders || !args.clients || !args.vehicles){ console.error('Faltan --orders, --clients y --vehicles'); process.exit(1); }
const delimiter = args.delimiter || ';';
const encoding = args.encoding || 'utf8';
const limit = args.limit ? parseInt(args.limit,10) : null;
const dryRun = !!args.dry;
const progressEvery = args.progressInterval ? parseInt(args.progressInterval,10) : 50; // Mostrar progreso cada 50 registros
const progressTimeInterval = 10000; // Forzar progreso cada 10 segundos

let companyMap = {};
if (args.companyMap) {
  args.companyMap.split(',').forEach(pair => { const [legacy, mongo] = pair.split(':').map(s=>s.trim()); if(legacy && mongo) companyMap[legacy]=mongo; });
} else if (process.env.COMPANY_MAP) {
  process.env.COMPANY_MAP.split(',').forEach(pair => { const [legacy, mongo] = pair.split(':').map(s=>s.trim()); if(legacy && mongo) companyMap[legacy]=mongo; });
} else {
  companyMap = { '2': '68cb18f4202d108152a26e4c', '3': '68c871198d7595062498d7a1' };
}

async function parseCSV(filePath, { delimiter, encoding }){
  const rows=[]; const rl = readline.createInterface({ input: fs.createReadStream(filePath,{encoding}), crlfDelay:Infinity });
  let headers=null; for await (const raw of rl){ const line=raw.trim(); if(!line) continue; const cols=[]; let cur=''; let inQ=false; for(let i=0;i<raw.length;i++){ const ch=raw[i]; if(ch==='"'){ inQ=!inQ; continue; } if(ch===delimiter && !inQ){ cols.push(cur.trim()); cur=''; continue; } cur+=ch; } if(cur.length) cols.push(cur.trim()); const clean = cols.map(c=>c.replace(/^\"|\"$/g,'').trim()); if(!headers){ headers=clean; continue; } rows.push(Object.fromEntries(headers.map((h,i)=>[h, clean[i] ?? '']))); }
  return rows;
}

function clean(s){ return (s==null)?'':String(s).trim(); }

// Normalizar cilindraje para comparación bidireccional
// Convierte entre formatos: 1.6 <-> 1600, 1.3 <-> 1300, 2.0 <-> 2000
function normalizeEngine(engine) {
  if (!engine) return '';
  const str = String(engine).trim().toUpperCase().replace(/[^0-9.]/g, '');
  if (!str) return '';
  
  // Si es un número con punto decimal (ej: 1.6, 2.0, 1.3)
  if (/^\d+\.\d+$/.test(str)) {
    const num = parseFloat(str);
    // Convertir a formato de 4 dígitos: 1.6 -> 1600, 1.3 -> 1300
    return String(Math.round(num * 1000));
  }
  
  // Si es un número entero de 4 dígitos (ej: 1600, 1300, 2000)
  if (/^\d{4}$/.test(str)) {
    const num = parseInt(str, 10);
    // Convertir a formato decimal: 1600 -> 1.6, 1300 -> 1.3, 2000 -> 2.0
    const decimal = (num / 1000).toFixed(1);
    return String(Math.round(parseFloat(decimal) * 1000)); // Volver a 4 dígitos para comparar
  }
  
  // Si es un número entero de 3 dígitos o menos (ej: 16, 13, 20) - asumir que es decimal * 10
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

// Comparar cilindrajes considerando equivalencias bidireccionales
// 1.6 = 1600, 1.3 = 1300, 2.0 = 2000, etc.
function enginesMatch(engine1, engine2) {
  if (!engine1 || !engine2) return false;
  
  // Normalizar ambos a formato de 4 dígitos para comparar
  const norm1 = normalizeEngine(engine1);
  const norm2 = normalizeEngine(engine2);
  
  // Comparación directa
  if (norm1 === norm2) return true;
  
  // También comparar formatos originales normalizados de forma alternativa
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

// Cache de vehículos para evitar consultas repetidas
let vehicleCache = null;
let vehicleCacheByDisplacement = null;

// Precargar vehículos en memoria para búsquedas rápidas
async function loadVehicleCache() {
  if (vehicleCache) return; // Ya está cargado
  
  console.log('📦 Cargando vehículos en memoria para búsquedas rápidas...');
  const vehicles = await Vehicle.find({ active: true });
  vehicleCache = vehicles;
  
  // Crear índice por displacement para búsquedas rápidas
  vehicleCacheByDisplacement = new Map();
  vehicles.forEach(v => {
    const disp = String(v.displacement).trim().toUpperCase();
    if (!vehicleCacheByDisplacement.has(disp)) {
      vehicleCacheByDisplacement.set(disp, []);
    }
    vehicleCacheByDisplacement.get(disp).push(v);
  });
  
  console.log(`✅ ${vehicles.length} vehículos cargados en memoria\n`);
}

// Buscar vehículo en BD por matching exacto o por similitud (usando cache)
async function findVehicleMatch(brand, line, engine) {
  if (!engine) return null;
  
  // Asegurar que el cache esté cargado
  if (!vehicleCache) {
    await loadVehicleCache();
  }
  
  const brandUpper = brand ? String(brand).trim().toUpperCase() : '';
  const lineUpper = line ? String(line).trim().toUpperCase() : '';
  const engineStr = String(engine).trim().toUpperCase().replace(/[^0-9.]/g, '');
  
  // Generar todas las variantes posibles del cilindraje para buscar
  const engineVariants = new Set();
  
  // Agregar formato original
  engineVariants.add(engineStr);
  
  // Si es decimal (ej: 1.6), agregar formato de 4 dígitos (1600)
  if (/^\d+\.\d+$/.test(engineStr)) {
    const num = parseFloat(engineStr);
    engineVariants.add(String(Math.round(num * 1000))); // 1.6 -> 1600
  }
  
  // Si es de 4 dígitos (ej: 1600), agregar formato decimal (1.6)
  if (/^\d{4}$/.test(engineStr)) {
    const num = parseInt(engineStr, 10);
    const decimal = (num / 1000).toFixed(1);
    engineVariants.add(decimal); // 1600 -> 1.6
    // También agregar sin el .0 si es entero (2000 -> 2.0 y 2)
    if (num % 1000 === 0) {
      engineVariants.add(String(num / 1000)); // 2000 -> 2
    }
  }
  
  // 1. Matching exacto: marca + línea + cilindraje (usando cache)
  if (brandUpper && lineUpper) {
    for (const variant of engineVariants) {
      const vehicle = vehicleCache.find(v => 
        v.active && 
        v.make === brandUpper && 
        v.line === lineUpper && 
        v.displacement === variant
      );
      
      if (vehicle) {
        return { 
          vehicle, 
          matchType: 'exact', 
          confidence: `Coincidencia exacta: ${brandUpper} ${lineUpper} ${variant} (cilindraje original: ${engine})` 
        };
      }
    }
    
    // Si no encontró con formato exacto, buscar por marca/línea y comparar cilindrajes equivalentes
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
  
  // 2. Matching solo por cilindraje (sin marca/línea) - usar cache
  for (const variant of engineVariants) {
    // Buscar en cache por displacement exacto
    const vehiclesByEngine = vehicleCacheByDisplacement.get(variant) || [];
    
    // También buscar variantes equivalentes
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
    
    // Si solo hay un vehículo con ese cilindraje, asignarlo automáticamente
    if (uniqueVehicles.length === 1) {
      return { 
        vehicle: uniqueVehicles[0], 
        matchType: 'exact',
        confidence: `Cilindraje único coincide: ${uniqueVehicles[0].make} ${uniqueVehicles[0].line} ${uniqueVehicles[0].displacement} (equivalente a ${engine})` 
      };
    }
    
    // Si hay pocos vehículos (2-3) con el mismo cilindraje, también asignar el primero
    if (uniqueVehicles.length >= 2 && uniqueVehicles.length <= 3) {
      return { 
        vehicle: uniqueVehicles[0], 
        matchType: 'engine_similarity',
        confidence: `Cilindraje coincide (${uniqueVehicles.length} opciones): ${uniqueVehicles[0].make} ${uniqueVehicles[0].line} ${uniqueVehicles[0].displacement} (equivalente a ${engine})` 
      };
    }
  }
  
  return null;
}

const counters = { 
  ordersRead:0, 
  clientsReferenced:0, 
  processed:0, 
  created:0, 
  updated:0, 
  unchanged:0,
  vehiclesMatched: 0,
  vehiclesUnassigned: 0
};

async function main(){
  console.log('🚀 Iniciando importación de clientes con matching de vehículos...');
  console.log(`📂 Leyendo archivos CSV...`);
  console.log(`   - Órdenes: ${args.orders}`);
  console.log(`   - Clientes: ${args.clients}`);
  console.log(`   - Vehículos: ${args.vehicles}`);
  
  const orders = await parseCSV(args.orders, { delimiter, encoding });
  console.log(`✅ Órdenes leídas: ${orders.length}`);
  
  const clients = await parseCSV(args.clients, { delimiter, encoding });
  console.log(`✅ Clientes leídos: ${clients.length}`);
  
  const vehicles = await parseCSV(args.vehicles, { delimiter, encoding });
  console.log(`✅ Vehículos leídos: ${vehicles.length}`);
  
  const clientIdx = new Map(clients.map(c => [ String(c['cl_id']), c ]));
  const vehicleIdx = new Map(vehicles.map(v => [ String(v['au_id'] || v['id'] || ''), v ]));
  
  console.log(`📊 Procesando relaciones cliente-vehículo...`);

  // Recolectar clientes con sus vehículos asociados por empresa
  // Estructura: legacyCompanyId -> Map(legacyClientId -> { client, vehicles: Set(legacyAutoId) })
  const perCompany = new Map();
  for(const row of orders){
    counters.ordersRead++;
    if(limit && counters.ordersRead>limit) break;
    const legacyCompany = String(row['or_fk_empresa']);
    if(!companyMap[legacyCompany]) continue;
    const legacyClientId = String(row['or_fk_cliente'] || '').trim();
    const legacyAutoId = String(row['or_fk_automovil'] || '').trim();
    if(!legacyClientId) continue;
    if(!perCompany.has(legacyCompany)) perCompany.set(legacyCompany, new Map());
    if(!perCompany.get(legacyCompany).has(legacyClientId)) {
      perCompany.get(legacyCompany).set(legacyClientId, { 
        client: clientIdx.get(String(legacyClientId)),
        vehicles: new Set()
      });
    }
    if(legacyAutoId) {
      perCompany.get(legacyCompany).get(legacyClientId).vehicles.add(legacyAutoId);
    }
  }

  let uri = args.mongo || process.env.MONGODB_URI;
  if(!dryRun && !uri){ console.error('Falta --mongo o MONGODB_URI'); process.exit(1); }
  
  if(dryRun){
    console.log(`\n⚠️  MODO DRY RUN: Solo simulación, NO se guardará nada en la base de datos`);
    console.log(`📊 Se mostrará qué haría el script sin ejecutar cambios reales\n`);
  }
  
  if(uri){
    await connectDB(uri);
    console.log(`✅ Conectado a MongoDB\n`);
  } else if(dryRun){
    console.log(`⚠️  ADVERTENCIA: No hay URI de MongoDB. El dry run solo contará registros sin verificar matching.\n`);
  }

  // Métrica total a procesar
  const totalToProcess = Array.from(perCompany.values()).reduce((a,m)=> a + m.size, 0);
  console.log(`\n📊 Total de clientes únicos a procesar: ${totalToProcess}`);
  
  // Precargar vehículos en memoria para búsquedas rápidas
  if(!dryRun || uri){
    await loadVehicleCache();
  }
  
  const started = Date.now();
  let lastProgressTime = Date.now();
  
  function logProgress(force = false){
    const now = Date.now();
    const timeSinceLastProgress = now - lastProgressTime;
    
    // Solo mostrar si es el umbral de registros O si han pasado 10 segundos
    if (!force && progressEvery && counters.processed % progressEvery !== 0 && timeSinceLastProgress < progressTimeInterval) {
      return;
    }
    
    lastProgressTime = now;
    
    const p = totalToProcess ? Math.min(100, (counters.processed/totalToProcess)*100) : 0;
    const elapsed = (Date.now()-started)/1000;
    const rate = counters.processed>0 ? elapsed/counters.processed : 0;
    const remaining = Math.max(0, totalToProcess - counters.processed);
    const eta = rate * remaining;
    const fmt = (s)=>{ if(!Number.isFinite(s)) return '---'; if(s<60) return `${s.toFixed(0)}s`; const m=Math.floor(s/60); const sec=Math.floor(s%60); return `${m}m ${sec}s`; };
    
    // Barra de progreso visual
    const barWidth = 40;
    const filled = Math.round((p / 100) * barWidth);
    const bar = '█'.repeat(filled) + '░'.repeat(barWidth - filled);
    
    // Limpiar línea anterior (si es posible)
    process.stdout.write('\r');
    process.stdout.write(`[${bar}] ${p.toFixed(1)}% | ${counters.processed}/${totalToProcess} | ✅ ${counters.created} | 🔄 ${counters.updated} | ➖ ${counters.unchanged} | 🚗 ${counters.vehiclesMatched} | ⚠️  ${counters.vehiclesUnassigned} | ⏱️  ETA: ${fmt(eta)}`);
    process.stdout.write(' '.repeat(20)); // Limpiar caracteres residuales
  }
  
  // Timer para forzar progreso cada 10 segundos
  const progressTimer = setInterval(() => {
    if (counters.processed > 0) {
      logProgress(true);
    }
  }, progressTimeInterval);
  
  // Función para mostrar resumen final
  function showFinalSummary() {
    const dur = ((Date.now()-started)/1000).toFixed(1);
    console.log('\n' + '='.repeat(60));
    if(dryRun){
      console.log('📊 SIMULACIÓN DE IMPORTACIÓN COMPLETADA (DRY RUN)');
      console.log('='.repeat(60));
      console.log('⚠️  NOTA: Esto es solo una simulación. Nada se guardó en la base de datos.');
      console.log('='.repeat(60));
    } else {
      console.log('✅ IMPORTACIÓN DE CLIENTES COMPLETADA');
      console.log('='.repeat(60));
    }
    console.log(`📊 Total procesado: ${counters.processed}/${totalToProcess}`);
    console.log(`✅ Creados: ${counters.created}`);
    console.log(`🔄 Actualizados: ${counters.updated}`);
    console.log(`➖ Sin cambios: ${counters.unchanged}`);
    console.log(`🚗 Vehículos asignados automáticamente: ${counters.vehiclesMatched}`);
    console.log(`⚠️  Vehículos pendientes de aprobación: ${counters.vehiclesUnassigned}`);
    console.log(`⏱️  Tiempo total: ${dur}s`);
    if(dryRun){
      console.log('\n💡 Para ejecutar la importación real, ejecuta el mismo comando sin --dry');
    }
    console.log('='.repeat(60));
  }

  for(const [legacyCompany, clientMap] of perCompany.entries()){
    const companyId = companyMap[legacyCompany];
    const companyIdStr = String(companyId);
    for(const [legacyClientId, clientData] of clientMap.entries()){
      counters.clientsReferenced++;
      const cli = clientData.client;
      if(!cli) continue;
      const idNumberRaw = clean(cli['cl_identificacion']);
      const idNumber = idNumberRaw.replace(/\.0$/,''); // limpiar .0 de exportes Excel
      const name = clean(cli['cl_nombre']);
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
      
      // Intentar obtener datos del vehículo desde los vehículos asociados
      for(const legacyAutoId of clientData.vehicles){
        const veh = vehicleIdx.get(String(legacyAutoId));
        if(veh){
          vehicleEngine = clean(veh['au_cilidraje'] || veh['au_cilindraje'] || veh['au_cilindraje'] || '');
          vehicleYear = veh['au_modelo'] ? parseInt(veh['au_modelo'], 10) : null;
          vehiclePlate = clean(veh['au_placa'] || veh['placa'] || '');
          // Nota: au_fk_marca y au_fk_serie son IDs, no nombres directos
          // Intentaremos obtener marca/línea desde CustomerProfile existentes o desde el matching
          break; // Usar el primer vehículo encontrado
        }
      }
      
      // Debug: mostrar primeros registros para entender qué datos tenemos
      if(counters.processed === 0 && vehicleEngine){
        console.log(`\n🔍 Ejemplo de datos encontrados:`);
        console.log(`   Cliente: ${name || 'Sin nombre'}`);
        console.log(`   Cilindraje: ${vehicleEngine}`);
        console.log(`   Placa: ${vehiclePlate || 'Sin placa'}`);
        console.log(`   Marca: ${vehicleBrand || 'Sin marca'}`);
        console.log(`   Línea: ${vehicleLine || 'Sin línea'}\n`);
      }

      // En modo dry run, simular el procesamiento sin guardar
      if(dryRun){
        // Intentar obtener marca/línea desde CustomerProfile existente si hay placa (solo lectura)
        if(vehiclePlate && !vehicleBrand){
          try {
            const existingProfile = await CustomerProfile.findOne({
              companyId: companyIdStr,
              $or: [
                { plate: vehiclePlate },
                { 'vehicle.plate': vehiclePlate }
              ]
            }).sort({ updatedAt: -1 });
            
            if(existingProfile && existingProfile.vehicle){
              vehicleBrand = existingProfile.vehicle.brand || '';
              vehicleLine = existingProfile.vehicle.line || '';
              if(existingProfile.vehicle.vehicleId){
                const existingVehicle = await Vehicle.findById(existingProfile.vehicle.vehicleId);
                if(existingVehicle){
                  vehicleBrand = existingVehicle.make;
                  vehicleLine = existingVehicle.line;
                }
              }
            }
          } catch(err){
            // Ignorar errores
          }
        }

        // Buscar matching de vehículo en BD (solo lectura)
        let vehicleMatch = null;
        if(vehicleBrand && vehicleLine && vehicleEngine){
          vehicleMatch = await findVehicleMatch(vehicleBrand, vehicleLine, vehicleEngine);
        } else if(vehicleEngine){
          vehicleMatch = await findVehicleMatch('', '', vehicleEngine);
        }

        // Verificar si el cliente ya existe (solo lectura)
        const query = { companyId: companyIdStr, $or: [ { identificationNumber: idNumber }, { plate: plateSynthetic } ] };
        const existing = await CustomerProfile.findOne(query);
        
        // SIEMPRE crear/actualizar cliente (simulación)
        // Primero verificar qué necesita actualización
        let needsUpdate = false;
        if(!existing){
          // Cliente nuevo, siempre crear
          counters.created++;
        } else {
          // Cliente existente, verificar si necesita actualización
          needsUpdate = (!existing.customer?.idNumber && idNumber) ||
                       (!existing.customer?.name && name) ||
                       (!existing.customer?.phone && phone) ||
                       (!existing.customer?.email && email) ||
                       (!existing.customer?.address && address) ||
                       (!existing.vehicle?.vehicleId && vehicleMatch);
          
          if(needsUpdate){
            counters.updated++;
          } else {
            counters.unchanged++;
          }
        }
        
        // Debug cada 50 registros si todos los contadores están en 0
        if(counters.processed > 0 && counters.processed % 50 === 0 && counters.created === 0 && counters.updated === 0 && counters.vehiclesMatched === 0 && counters.vehiclesUnassigned === 0){
          console.log(`\n⚠️  DEBUG: Después de ${counters.processed} registros, todos los contadores están en 0.`);
          console.log(`   Último cliente: ${name || 'Sin nombre'} | ID: ${idNumber || 'Sin ID'}`);
          console.log(`   ¿Existe en BD?: ${existing ? 'Sí' : 'No'}`);
          console.log(`   ¿Tiene cilindraje?: ${vehicleEngine ? 'Sí (' + vehicleEngine + ')' : 'No'}`);
          console.log(`   ¿Hay matching?: ${vehicleMatch ? 'Sí (' + vehicleMatch.matchType + ')' : 'No'}`);
          if(existing){
            console.log(`   Cliente existente tiene vehículo?: ${existing.vehicle?.vehicleId ? 'Sí' : 'No'}`);
            console.log(`   Cliente existente tiene datos?: ${existing.customer?.name ? 'Sí' : 'No'}`);
            console.log(`   ¿Necesita actualización?: ${needsUpdate ? 'Sí' : 'No'}`);
          }
          console.log(`   Contadores actuales: creados=${counters.created}, actualizados=${counters.updated}, sin cambios=${counters.unchanged}`);
          console.log('');
        }
        
        // Decidir si asignar vehículo automáticamente o dejarlo pendiente
        // Ser más permisivo: si hay matching (incluso por similitud), asignar automáticamente
        if(vehicleMatch){
          // Si es exacto O si hay marca/línea con similitud, asignar automáticamente
          if(vehicleMatch.matchType === 'exact' || (vehicleBrand && vehicleLine)){
            counters.vehiclesMatched++;
          } else {
            // Matching solo por cilindraje sin marca/línea -> pendiente pero con sugerencia
            counters.vehiclesUnassigned++;
          }
        } else if(vehicleEngine){
          // Hay cilindraje pero no hay matching -> pendiente sin sugerencia
          counters.vehiclesUnassigned++;
        }
        
        counters.processed++;
        
        // Debug cada 50 registros para ver qué está pasando
        if(counters.processed % 50 === 0){
          console.log(`\n📊 Progreso después de ${counters.processed} registros:`);
          console.log(`   ✅ Creados: ${counters.created}`);
          console.log(`   🔄 Actualizados: ${counters.updated}`);
          console.log(`   ➖ Sin cambios: ${counters.unchanged}`);
          console.log(`   🚗 Vehículos asignados: ${counters.vehiclesMatched}`);
          console.log(`   ⚠️  Vehículos pendientes: ${counters.vehiclesUnassigned}`);
          console.log(`   Último cliente procesado: ${name || 'Sin nombre'}`);
          console.log('');
        }
        
        logProgress(); // Siempre intentar mostrar progreso
        continue;
      }

      // Intentar obtener marca/línea desde CustomerProfile existente si hay placa
      if(vehiclePlate && !vehicleBrand){
        try {
          const existingProfile = await CustomerProfile.findOne({
            companyId: companyIdStr,
            $or: [
              { plate: vehiclePlate },
              { 'vehicle.plate': vehiclePlate }
            ]
          }).sort({ updatedAt: -1 });
          
          if(existingProfile && existingProfile.vehicle){
            vehicleBrand = existingProfile.vehicle.brand || '';
            vehicleLine = existingProfile.vehicle.line || '';
            if(existingProfile.vehicle.vehicleId){
              // Si ya tiene vehículo asignado, usarlo directamente
              const existingVehicle = await Vehicle.findById(existingProfile.vehicle.vehicleId);
              if(existingVehicle){
                vehicleBrand = existingVehicle.make;
                vehicleLine = existingVehicle.line;
              }
            }
          }
        } catch(err){
          // Ignorar errores
        }
      }

      // Buscar matching de vehículo en BD
      let vehicleMatch = null;
      let vehicleId = null;
      
      if(vehicleBrand && vehicleLine && vehicleEngine){
        vehicleMatch = await findVehicleMatch(vehicleBrand, vehicleLine, vehicleEngine);
      } else if(vehicleEngine){
        // Si solo tenemos cilindraje, buscar por similitud
        vehicleMatch = await findVehicleMatch('', '', vehicleEngine);
      }

      // Buscar perfil existente: primero por placa real, luego por ID o placa sintética
      let existing = null;
      const finalPlate = vehiclePlate || plateSynthetic;
      
      // 1. Buscar por placa real primero (más específico)
      if(vehiclePlate){
        existing = await CustomerProfile.findOne({
          companyId: companyIdStr,
          plate: vehiclePlate
        });
      }
      
      // 2. Si no existe, buscar por ID o placa sintética
      if(!existing){
        existing = await CustomerProfile.findOne({
          companyId: companyIdStr,
          $or: [
            { identificationNumber: idNumber },
            { plate: plateSynthetic }
          ]
        });
      }
      
      // 3. Si aún no existe pero la placa final ya está en uso, buscar por esa placa
      if(!existing && finalPlate){
        existing = await CustomerProfile.findOne({
          companyId: companyIdStr,
          plate: finalPlate
        });
      }
      
      // SIEMPRE crear/actualizar cliente primero
      let profile;
      const shouldAssignVehicle = vehicleMatch && (
        vehicleMatch.matchType === 'exact' || 
        (vehicleBrand && vehicleLine) // Si hay marca y línea, asignar aunque sea similitud
      );
      
      if(shouldAssignVehicle){
        // Asignación directa: matching exacto o similitud con marca/línea
        vehicleId = vehicleMatch.vehicle._id;
        const vehicleData = {
          plate: finalPlate,
          vehicleId: vehicleId,
          brand: vehicleMatch.vehicle.make,
          line: vehicleMatch.vehicle.line,
          engine: vehicleMatch.vehicle.displacement,
          year: vehicleYear
        };
        
        if(!existing){
          // Intentar crear nuevo perfil
          try {
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
              { upsert: true, new: true }
            );
            counters.created++;
          } catch(err){
            // Si hay error de duplicado, buscar el perfil existente
            if(err.code === 11000){
              profile = await CustomerProfile.findOne({
                companyId: companyIdStr,
                plate: finalPlate
              });
              if(profile){
                // Actualizar el existente
                const update = { $set: {} };
                if(!profile.customer?.idNumber && idNumber) update.$set['customer.idNumber']=idNumber;
                if(!profile.customer?.name && name) update.$set['customer.name']=name;
                if(!profile.customer?.phone && phone) update.$set['customer.phone']=phone;
                if(!profile.customer?.email && email) update.$set['customer.email']=email;
                if(!profile.customer?.address && address) update.$set['customer.address']=address;
                if(!profile.vehicle?.vehicleId) {
                  update.$set['vehicle.vehicleId'] = vehicleId;
                  update.$set['vehicle.brand'] = vehicleMatch.vehicle.make;
                  update.$set['vehicle.line'] = vehicleMatch.vehicle.line;
                  update.$set['vehicle.engine'] = vehicleMatch.vehicle.displacement;
                  update.$set['vehicle.plate'] = finalPlate;
                  if(vehicleYear) update.$set['vehicle.year'] = vehicleYear;
                }
                if(Object.keys(update.$set).length){
                  await CustomerProfile.updateOne({ _id: profile._id }, update);
                  counters.updated++;
                } else {
                  counters.unchanged++;
                }
              } else {
                counters.created++;
              }
            } else {
              throw err;
            }
          }
        } else {
          const update = { $set: {} };
          if(!existing.customer?.idNumber && idNumber) update.$set['customer.idNumber']=idNumber;
          if(!existing.customer?.name && name) update.$set['customer.name']=name;
          if(!existing.customer?.phone && phone) update.$set['customer.phone']=phone;
          if(!existing.customer?.email && email) update.$set['customer.email']=email;
          if(!existing.customer?.address && address) update.$set['customer.address']=address;
          if(!existing.vehicle?.vehicleId) {
            update.$set['vehicle.vehicleId'] = vehicleId;
            update.$set['vehicle.brand'] = vehicleMatch.vehicle.make;
            update.$set['vehicle.line'] = vehicleMatch.vehicle.line;
            update.$set['vehicle.engine'] = vehicleMatch.vehicle.displacement;
            if(vehiclePlate) update.$set['vehicle.plate'] = vehiclePlate;
            if(vehicleYear) update.$set['vehicle.year'] = vehicleYear;
          }
          if(Object.keys(update.$set).length){ 
            await CustomerProfile.updateOne({ _id: existing._id }, update); 
            counters.updated++; 
            profile = await CustomerProfile.findById(existing._id);
          } else {
            counters.unchanged++;
            profile = existing;
          }
        }
        counters.vehiclesMatched++;
      } else {
        // Sin matching automático: crear/actualizar perfil sin vehículo asignado y guardar en UnassignedVehicle
        if(!existing){
          // Intentar crear nuevo perfil
          try {
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
              { upsert: true, new: true }
            );
            counters.created++;
          } catch(err){
            // Si hay error de duplicado, buscar el perfil existente
            if(err.code === 11000){
              profile = await CustomerProfile.findOne({
                companyId: companyIdStr,
                plate: finalPlate
              });
              if(profile){
                // Actualizar el existente
                const update = { $set: {} };
                if(!profile.customer?.idNumber && idNumber) update.$set['customer.idNumber']=idNumber;
                if(!profile.customer?.name && name) update.$set['customer.name']=name;
                if(!profile.customer?.phone && phone) update.$set['customer.phone']=phone;
                if(!profile.customer?.email && email) update.$set['customer.email']=email;
                if(!profile.customer?.address && address) update.$set['customer.address']=address;
                if(Object.keys(update.$set).length){
                  await CustomerProfile.updateOne({ _id: profile._id }, update);
                  counters.updated++;
                } else {
                  counters.unchanged++;
                }
              } else {
                counters.created++;
              }
            } else {
              throw err;
            }
          }
        } else {
          const update = { $set: {} };
          if(!existing.customer?.idNumber && idNumber) update.$set['customer.idNumber']=idNumber;
          if(!existing.customer?.name && name) update.$set['customer.name']=name;
          if(!existing.customer?.phone && phone) update.$set['customer.phone']=phone;
          if(!existing.customer?.email && email) update.$set['customer.email']=email;
          if(!existing.customer?.address && address) update.$set['customer.address']=address;
          if(Object.keys(update.$set).length){ 
            await CustomerProfile.updateOne({ _id: existing._id }, update); 
            counters.updated++; 
            profile = await CustomerProfile.findById(existing._id);
          } else {
            counters.unchanged++;
            profile = existing;
          }
        }
        
        // SIEMPRE guardar en UnassignedVehicle si hay datos de vehículo (para depuración manual)
        if(vehicleEngine || vehicleMatch){
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
          
          if(vehicleMatch){
            unassignedData.suggestedVehicle = {
              vehicleId: vehicleMatch.vehicle._id,
              make: vehicleMatch.vehicle.make,
              line: vehicleMatch.vehicle.line,
              displacement: vehicleMatch.vehicle.displacement,
              matchType: vehicleMatch.matchType,
              confidence: vehicleMatch.confidence
            };
          }
          
          // Evitar duplicados: buscar si ya existe
          const existingUnassigned = await UnassignedVehicle.findOne({
            companyId: companyIdStr,
            $or: [
              { profileId: profile._id, status: 'pending' },
              { 'vehicleData.plate': vehiclePlate || plateSynthetic, companyId: companyIdStr, status: 'pending' }
            ]
          });
          
          if(!existingUnassigned){
            await UnassignedVehicle.create(unassignedData);
            counters.vehiclesUnassigned++;
          }
        }
      }
      
      counters.processed++;
      logProgress(); // Siempre intentar mostrar progreso
    }
  }

  // Limpiar timer de progreso
  clearInterval(progressTimer);
  
  logProgress(true);
  console.log(''); // Nueva línea después del progreso
  showFinalSummary();
}

main().then(()=>{ if(!dryRun) mongoose.connection.close().catch(()=>{}); }).catch(e=>{ console.error(e); process.exit(1); });
