#!/usr/bin/env node
import fs from 'fs';
import readline from 'readline';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { connectDB } from '../src/db.js';
import CustomerProfile from '../src/models/CustomerProfile.js';

dotenv.config();

/*
 Importar clientes (sin vehículo) desde legacy, deduplicados por identificación.
 - Toma clientes que aparezcan en órdenes de empresa 2 (Shelby) y 3 (Casa Renault) o el mapeo pasado.
 - Crea/actualiza CustomerProfile con placa sintética única por cliente: CATALOGO-<idNumber> (si no hay idNumber, usa CLIENT-<cl_id>).
 - Idempotente y sin duplicados: busca por (companyId + identificationNumber) o por la placa sintética.

 Uso:
  node scripts/import_clients_from_legacy.js \
    --orders Backend/data/legacy/ordenesfinal.csv \
    --clients Backend/data/legacy/clientesfinal.csv \
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
if(!args.orders || !args.clients){ console.error('Faltan --orders y --clients'); process.exit(1); }
const delimiter = args.delimiter || ';';
const encoding = args.encoding || 'utf8';
const limit = args.limit ? parseInt(args.limit,10) : null;
const dryRun = !!args.dry;
const progressEvery = args.progressInterval ? parseInt(args.progressInterval,10) : 2000;

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

const counters = { ordersRead:0, clientsReferenced:0, processed:0, created:0, updated:0, unchanged:0 };

async function main(){
  const orders = await parseCSV(args.orders, { delimiter, encoding });
  const clients = await parseCSV(args.clients, { delimiter, encoding });
  const clientIdx = new Map(clients.map(c => [ String(c['cl_id']), c ]));

  // Recolectar clientes referenciados por empresas mapeadas
  const perCompany = new Map(); // legacyCompanyId -> Set(legacyClientId)
  for(const row of orders){
    counters.ordersRead++;
    if(limit && counters.ordersRead>limit) break;
    const legacyCompany = String(row['or_fk_empresa']);
    if(!companyMap[legacyCompany]) continue;
    const legacyClientId = String(row['or_fk_cliente'] || '').trim();
    if(!legacyClientId) continue;
    if(!perCompany.has(legacyCompany)) perCompany.set(legacyCompany, new Set());
    perCompany.get(legacyCompany).add(legacyClientId);
  }

  let uri = args.mongo || process.env.MONGODB_URI;
  if(!dryRun && !uri){ console.error('Falta --mongo o MONGODB_URI'); process.exit(1); }
  if(!dryRun) await connectDB(uri);

  // Métrica total a procesar
  const totalToProcess = Array.from(perCompany.values()).reduce((a,s)=> a + s.size, 0);
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
    process.stdout.write(`[${bar}] ${p.toFixed(1)}% | ${counters.processed}/${totalToProcess} | ✅ ${counters.created} | 🔄 ${counters.updated} | ⏱️  ETA: ${fmt(eta)}`);
    process.stdout.write(' '.repeat(20)); // Limpiar caracteres residuales
  }
  
  // Función para mostrar resumen final
  function showFinalSummary() {
    const dur = ((Date.now()-started)/1000).toFixed(1);
    console.log('\n' + '='.repeat(60));
    console.log('✅ IMPORTACIÓN DE CLIENTES COMPLETADA');
    console.log('='.repeat(60));
    console.log(`📊 Total procesado: ${counters.processed}/${totalToProcess}`);
    console.log(`✅ Creados: ${counters.created}`);
    console.log(`🔄 Actualizados: ${counters.updated}`);
    console.log(`➖ Sin cambios: ${counters.unchanged}`);
    console.log(`⏱️  Tiempo total: ${dur}s`);
    console.log('='.repeat(60));
  }

  for(const [legacyCompany, setIds] of perCompany.entries()){
    const companyId = companyMap[legacyCompany];
    const companyIdStr = String(companyId);
    for(const legacyClientId of setIds){
      counters.clientsReferenced++;
      const cli = clientIdx.get(String(legacyClientId));
      if(!cli) continue;
      const idNumberRaw = clean(cli['cl_identificacion']);
      const idNumber = idNumberRaw.replace(/\.0$/,''); // limpiar .0 de exportes Excel
      const name = clean(cli['cl_nombre']);
      const phone = clean(cli['cl_telefono']);
      const email = clean(cli['cl_mail']);
      const address = clean(cli['cl_direccion']);
      const hasId = !!idNumber;
      const plateSynthetic = hasId ? `CATALOGO-${idNumber.toUpperCase()}` : `CLIENT-${legacyClientId}`;

      if(dryRun){ counters.processed++; if(progressEvery && counters.processed % progressEvery===0) logProgress(); continue; }

      const query = { companyId: companyIdStr, $or: [ { identificationNumber: idNumber }, { plate: plateSynthetic } ] };
      const existing = await CustomerProfile.findOne(query);
      if(!existing){
        await CustomerProfile.findOneAndUpdate(
          query,
          {
            $set: { customer: { idNumber, name, phone, email, address } },
            $setOnInsert: { companyId: companyIdStr, identificationNumber: idNumber, vehicle: { plate: plateSynthetic }, plate: plateSynthetic }
          },
          { upsert: true, new: true }
        );
        counters.created++;
      } else {
        // merge simple: llenar campos cliente faltantes
        const update = { $set: {} };
        if(!existing.customer?.idNumber && idNumber) update.$set['customer.idNumber']=idNumber;
        if(!existing.customer?.name && name) update.$set['customer.name']=name;
        if(!existing.customer?.phone && phone) update.$set['customer.phone']=phone;
        if(!existing.customer?.email && email) update.$set['customer.email']=email;
        if(!existing.customer?.address && address) update.$set['customer.address']=address;
        if(Object.keys(update.$set).length){ await CustomerProfile.updateOne({ _id: existing._id }, update); counters.updated++; }
        else counters.unchanged++;
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
