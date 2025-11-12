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
const progressEvery = args.progressInterval ? parseInt(args.progressInterval,10) : 100; // Mostrar progreso cada 100 registros

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

// Normalizar cilindraje para comparación (1.6 -> 1600, 2.0 -> 2000, etc.)
function normalizeEngine(engine) {
  if (!engine) return '';
  const str = String(engine).trim().toUpperCase();
  // Si es un número con punto decimal (ej: 1.6, 2.0)
  if (/^\d+\.\d+$/.test(str)) {
    const num = parseFloat(str);
    return String(Math.round(num * 1000)); // 1.6 -> 1600, 2.0 -> 2000
  }
  // Si ya es un número entero (ej: 1600, 2000)
  if (/^\d+$/.test(str)) {
    return str;
  }
  return str;
}

// Comparar cilindrajes considerando equivalencias (1.6 = 1600, 2.0 = 2000)
function enginesMatch(engine1, engine2) {
  if (!engine1 || !engine2) return false;
  const norm1 = normalizeEngine(engine1);
  const norm2 = normalizeEngine(engine2);
  return norm1 === norm2;
}

// Buscar vehículo en BD por matching exacto o por similitud
async function findVehicleMatch(brand, line, engine) {
  if (!engine) return null;
  
  const engineNorm = normalizeEngine(engine);
  const brandUpper = brand ? String(brand).trim().toUpperCase() : '';
  const lineUpper = line ? String(line).trim().toUpperCase() : '';
  
  // 1. Matching exacto: marca + línea + cilindraje
  if (brandUpper && lineUpper) {
    // Intentar primero con el cilindraje original
    let vehicle = await Vehicle.findOne({
      make: brandUpper,
      line: lineUpper,
      displacement: String(engine).trim().toUpperCase(),
      active: true
    });
    
    if (vehicle) return { vehicle, matchType: 'exact', confidence: 'Coincidencia exacta' };
    
    // Intentar con cilindraje normalizado (1.6 -> buscar también "1600")
    if (engineNorm && engineNorm !== String(engine).trim().toUpperCase()) {
      vehicle = await Vehicle.findOne({
        make: brandUpper,
        line: lineUpper,
        displacement: engineNorm,
        active: true
      });
      
      if (vehicle) return { vehicle, matchType: 'exact', confidence: `Coincidencia exacta (cilindraje normalizado: ${engineNorm})` };
    }
  }
  
  // 2. Matching por similitud de cilindraje (solo si hay marca y línea)
  if (brandUpper && lineUpper) {
    // Buscar vehículos con misma marca y línea pero cilindraje similar
    const vehicles = await Vehicle.find({
      make: brandUpper,
      line: lineUpper,
      active: true
    });
    
    for (const v of vehicles) {
      if (enginesMatch(v.displacement, engine)) {
        return { 
          vehicle: v, 
          matchType: 'engine_similarity', 
          confidence: `Similitud de cilindraje: ${v.displacement} vs ${engine}` 
        };
      }
    }
  }
  
  // 3. Matching solo por cilindraje (sin marca/línea)
  const vehiclesByEngine = await Vehicle.find({
    displacement: engineNorm,
    active: true
  }).limit(5);
  
  if (vehiclesByEngine.length === 1) {
    return { 
      vehicle: vehiclesByEngine[0], 
      matchType: 'engine_similarity', 
      confidence: `Solo cilindraje coincide: ${vehiclesByEngine[0].make} ${vehiclesByEngine[0].line} ${vehiclesByEngine[0].displacement}` 
    };
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
  const started = Date.now();
  function logProgress(){
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
    process.stdout.write(`[${bar}] ${p.toFixed(1)}% | ${counters.processed}/${totalToProcess} | ✅ ${counters.created} | 🔄 ${counters.updated} | 🚗 ${counters.vehiclesMatched} | ⚠️  ${counters.vehiclesUnassigned} | ⏱️  ETA: ${fmt(eta)}`);
    process.stdout.write(' '.repeat(20)); // Limpiar caracteres residuales
  }
  
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
          vehicleEngine = clean(veh['au_cilidraje'] || veh['au_cilindraje'] || '');
          vehicleYear = veh['au_modelo'] ? parseInt(veh['au_modelo'], 10) : null;
          vehiclePlate = clean(veh['au_placa'] || '');
          // Nota: au_fk_marca y au_fk_serie son IDs, no nombres directos
          // Intentaremos obtener marca/línea desde CustomerProfile existentes o desde el matching
          break; // Usar el primer vehículo encontrado
        }
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
        
        // Simular contadores
        if(vehicleMatch && vehicleMatch.matchType === 'exact'){
          counters.vehiclesMatched++;
          if(!existing){
            counters.created++;
          } else {
            // Verificar si necesita actualización
            const needsUpdate = !existing.customer?.idNumber && idNumber ||
                               !existing.customer?.name && name ||
                               !existing.customer?.phone && phone ||
                               !existing.customer?.email && email ||
                               !existing.customer?.address && address ||
                               !existing.vehicle?.vehicleId;
            if(needsUpdate){
              counters.updated++;
            } else {
              counters.unchanged++;
            }
          }
        } else {
          if(!existing){
            counters.created++;
          } else {
            const needsUpdate = !existing.customer?.idNumber && idNumber ||
                               !existing.customer?.name && name ||
                               !existing.customer?.phone && phone ||
                               !existing.customer?.email && email ||
                               !existing.customer?.address && address;
            if(needsUpdate){
              counters.updated++;
            } else {
              counters.unchanged++;
            }
          }
          if(vehicleEngine || vehicleMatch){
            counters.vehiclesUnassigned++;
          }
        }
        
        counters.processed++;
        if(progressEvery && counters.processed % progressEvery===0) logProgress();
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

      const query = { companyId: companyIdStr, $or: [ { identificationNumber: idNumber }, { plate: plateSynthetic } ] };
      const existing = await CustomerProfile.findOne(query);
      
      if(vehicleMatch && vehicleMatch.matchType === 'exact'){
        // Asignación directa: matching exacto
        vehicleId = vehicleMatch.vehicle._id;
        const vehicleData = {
          plate: vehiclePlate || plateSynthetic,
          vehicleId: vehicleId,
          brand: vehicleMatch.vehicle.make,
          line: vehicleMatch.vehicle.line,
          engine: vehicleMatch.vehicle.displacement,
          year: vehicleYear
        };
        
        if(!existing){
          await CustomerProfile.findOneAndUpdate(
            query,
            {
              $set: { 
                customer: { idNumber, name, phone, email, address },
                vehicle: vehicleData
              },
              $setOnInsert: { companyId: companyIdStr, identificationNumber: idNumber, plate: vehicleData.plate }
            },
            { upsert: true, new: true }
          );
          counters.created++;
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
          }
          if(Object.keys(update.$set).length){ 
            await CustomerProfile.updateOne({ _id: existing._id }, update); 
            counters.updated++; 
          } else {
            counters.unchanged++;
          }
        }
        counters.vehiclesMatched++;
      } else {
        // Sin matching exacto: crear/actualizar perfil sin vehículo asignado y guardar en UnassignedVehicle
        let profile;
        if(!existing){
          profile = await CustomerProfile.findOneAndUpdate(
            query,
            {
              $set: { customer: { idNumber, name, phone, email, address } },
              $setOnInsert: { companyId: companyIdStr, identificationNumber: idNumber, vehicle: { plate: plateSynthetic }, plate: plateSynthetic }
            },
            { upsert: true, new: true }
          );
          counters.created++;
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
          } else {
            counters.unchanged++;
          }
          profile = existing;
        }
        
        // Guardar en UnassignedVehicle si hay datos de vehículo o matching por similitud
        if(vehicleEngine || vehicleMatch){
          const unassignedData = {
            companyId: companyIdStr,
            profileId: profile._id,
            customer: { idNumber, name, phone, email, address },
            vehicleData: {
              plate: vehiclePlate || plateSynthetic,
              brand: vehicleBrand,
              line: vehicleLine,
              engine: vehicleEngine,
              year: vehicleYear
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
            profileId: profile._id,
            status: 'pending'
          });
          
          if(!existingUnassigned){
            await UnassignedVehicle.create(unassignedData);
            counters.vehiclesUnassigned++;
          }
        }
      }
      
      counters.processed++;
      if(progressEvery && counters.processed % progressEvery===0) logProgress();
    }
  }

  logProgress();
  console.log(''); // Nueva línea después del progreso
  showFinalSummary();
}

main().then(()=>{ if(!dryRun) mongoose.connection.close().catch(()=>{}); }).catch(e=>{ console.error(e); process.exit(1); });
