#!/usr/bin/env node
import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDB } from '../src/db.js';
import CustomerProfile from '../src/models/CustomerProfile.js';

/*
 Reporta posibles duplicados de CustomerProfile por empresa.
 - Duplicados por identificationNumber (no vacío)
 - Duplicados por placa sintética (CATALOGO- / CLIENT-)

 Uso:
  node scripts/check_profile_dupes.js --mongo "mongodb://localhost:27017"
*/

function parseArgs(argv){ const o={}; for(let i=0;i<argv.length;i++){ let t=argv[i]; if(!t.startsWith('--')) continue; t=t.slice(2); const n=argv[i+1]; if(n && !n.startsWith('--')){ o[t]=n; i++; } else o[t]=true; } return o; }
const args = parseArgs(process.argv.slice(2));

async function main(){
  const uri = args.mongo || process.env.MONGODB_URI; if(!uri) { console.error('Falta --mongo o MONGODB_URI'); process.exit(1); }
  await connectDB(uri);

  const byId = await CustomerProfile.aggregate([
    { $match: { identificationNumber: { $exists: true, $ne: '' } } },
    { $group: { _id: { companyId: '$companyId', id: '$identificationNumber' }, count: { $sum: 1 }, ids: { $push: '$_id' } } },
    { $match: { count: { $gt: 1 } } },
    { $sort: { 'count': -1 } }
  ]);

  const byPlate = await CustomerProfile.aggregate([
    { $match: { plate: { $regex: /^(CATALOGO-|CLIENT-)/ } } },
    { $group: { _id: { companyId: '$companyId', plate: '$plate' }, count: { $sum: 1 }, ids: { $push: '$_id' } } },
    { $match: { count: { $gt: 1 } } },
    { $sort: { 'count': -1 } }
  ]);

  console.log('Duplicados por identificationNumber (>1):', JSON.stringify(byId, null, 2));
  console.log('Duplicados por placa sintética (>1):', JSON.stringify(byPlate, null, 2));
  await mongoose.connection.close();
}

main().catch(e=>{ console.error(e); process.exit(1); });

