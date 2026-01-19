#!/usr/bin/env node
/**
 * Elimina TODA la lista de precios (PriceEntry) y su historial (PriceHistory).
 *
 * Uso:
 *  node scripts/purge_prices.js --mongo "mongodb://..." [--dry]
 *
 * Si no se especifica --mongo, usa MONGODB_URI.
 */

import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { connectDB } from '../src/db.js';
import PriceEntry from '../src/models/PriceEntry.js';
import PriceHistory from '../src/models/PriceHistory.js';

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

if (!mongoUri) {
  console.error('❌ Error: MONGODB_URI no está definido.');
  process.exit(1);
}

async function run() {
  await connectDB(mongoUri);
  console.log('✅ Conectado');

  const pricesCount = await PriceEntry.countDocuments({});
  const historyCount = await PriceHistory.countDocuments({});
  console.log(`📊 PriceEntry: ${pricesCount}`);
  console.log(`📊 PriceHistory: ${historyCount}`);

  if (dryRun) {
    console.log('ℹ️ Modo dry-run: no se eliminará nada');
    await mongoose.connection.close();
    return;
  }

  const delPrices = await PriceEntry.deleteMany({});
  const delHistory = await PriceHistory.deleteMany({});

  console.log(`🗑️ PriceEntry eliminados: ${delPrices.deletedCount || 0}`);
  console.log(`🗑️ PriceHistory eliminados: ${delHistory.deletedCount || 0}`);

  await mongoose.connection.close();
}

run().catch(async (err) => {
  console.error('❌ Error al purgar precios:', err);
  if (mongoose.connection.readyState === 1) {
    await mongoose.connection.close();
  }
  process.exit(1);
});
