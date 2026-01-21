#!/usr/bin/env node
/**
 * Convierte precios vinculados a vehículos en precios GENERALES.
 *
 * Uso:
 *  node scripts/generalize_prices.js --mongo "mongodb://..." [--companyId "<id>"] [--dry]
 *
 * Si no se especifica --mongo, usa MONGODB_URI.
 */

import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { connectDB } from '../src/db.js';
import PriceEntry from '../src/models/PriceEntry.js';

dotenv.config();

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    let token = argv[i];
    if (!token.startsWith('--')) continue;
    token = token.slice(2);
    if (token.includes('=')) {
      const [key, val] = token.split('=');
      out[key] = val;
    } else if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) {
      out[token] = argv[i + 1];
      i++;
    } else {
      out[token] = true;
    }
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const mongoUri = args.mongo || process.env.MONGODB_URI;
const dryRun = Boolean(args.dry);
const companyId = args.companyId || args.company;

if (!mongoUri) {
  console.error('❌ Error: MONGODB_URI no está definido.');
  process.exit(1);
}

async function run() {
  await connectDB(mongoUri);
  console.log('✅ Conectado');

  const filter = { vehicleId: { $ne: null } };
  if (companyId) filter.companyId = companyId;

  const count = await PriceEntry.countDocuments(filter);
  console.log(`📊 Precios con vehicleId: ${count}`);

  if (dryRun) {
    console.log('ℹ️ Modo dry-run: no se actualizará nada');
    await mongoose.connection.close();
    return;
  }

  const res = await PriceEntry.updateMany(filter, {
    $set: {
      vehicleId: null,
      brand: '',
      line: '',
      engine: '',
      year: null
    }
  });

  console.log(`✅ Precios actualizados: ${res.modifiedCount || 0}`);

  await mongoose.connection.close();
}

run().catch(async (err) => {
  console.error('❌ Error al generalizar precios:', err);
  if (mongoose.connection.readyState === 1) {
    await mongoose.connection.close();
  }
  process.exit(1);
});
