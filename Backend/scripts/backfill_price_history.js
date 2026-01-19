#!/usr/bin/env node
/**
 * Backfill de PriceHistory desde ventas cerradas.
 *
 * Uso:
 *  node scripts/backfill_price_history.js --mongo "mongodb://..." [--dry] [--limit 1000]
 *
 * Si no se especifica --mongo, usa MONGODB_URI.
 */

import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { connectDB } from '../src/db.js';
import Sale from '../src/models/Sale.js';
import PriceHistory from '../src/models/PriceHistory.js';
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
const limit = args.limit ? Number(args.limit) : null;

if (!mongoUri) {
  console.error('❌ Error: MONGODB_URI no está definido.');
  process.exit(1);
}

function isComboMain(item) {
  const sku = String(item?.sku || '').toUpperCase();
  return sku.startsWith('COMBO-') && item?.source === 'price' && item?.refId;
}

function isComboChild(item) {
  const sku = String(item?.sku || '').toUpperCase();
  return sku.startsWith('CP-');
}

async function buildComboProductsFromSaleItems(items, startIndex, priceEntryCache) {
  const out = [];
  for (let i = startIndex + 1; i < items.length; i++) {
    const it = items[i];
    if (isComboMain(it)) break;
    if (!isComboChild(it)) break;
    out.push({
      name: String(it?.name || '').trim(),
      qty: Number(it?.qty || 1) || 1,
      unitPrice: Number(it?.unitPrice || 0) || 0,
      itemId: (it?.source === 'inventory' && it?.refId) ? it.refId : null,
      isOpenSlot: false
    });
  }

  if (out.length) return out;

  const main = items[startIndex];
  const refId = main?.refId;
  if (!refId) return [];

  if (priceEntryCache.has(String(refId))) {
    return priceEntryCache.get(String(refId));
  }

  const pe = await PriceEntry.findById(refId).lean();
  const comboProducts = Array.isArray(pe?.comboProducts) ? pe.comboProducts : [];
  priceEntryCache.set(String(refId), comboProducts);
  return comboProducts;
}

async function upsertHistory({ companyId, priceId, vehicleId, lastPrice, lastComboProducts, lastUsedAt }) {
  const existing = await PriceHistory.findOne({ companyId, priceId, vehicleId }).lean();
  const shouldUpdate = !existing || !existing.lastUsedAt || (lastUsedAt && new Date(lastUsedAt) > new Date(existing.lastUsedAt));

  if (dryRun) return { updated: shouldUpdate, inc: true };

  const update = {
    $inc: { usedCount: 1 },
    $setOnInsert: { companyId, priceId, vehicleId }
  };

  if (shouldUpdate) {
    update.$set = {
      lastPrice: Number(lastPrice || 0),
      lastComboProducts: Array.isArray(lastComboProducts) ? lastComboProducts : [],
      lastUsedAt: lastUsedAt ? new Date(lastUsedAt) : new Date()
    };
  }

  await PriceHistory.findOneAndUpdate(
    { companyId, priceId, vehicleId },
    update,
    { upsert: true, new: true }
  );
  return { updated: shouldUpdate, inc: true };
}

async function run() {
  await connectDB(mongoUri);
  console.log('✅ Conectado');

  const query = {
    status: 'closed',
    'vehicle.vehicleId': { $ne: null }
  };

  const cursor = Sale.find(query).sort({ closedAt: 1 }).cursor();
  let processed = 0;
  let updated = 0;
  let total = 0;
  const priceEntryCache = new Map();

  for (let sale = await cursor.next(); sale != null; sale = await cursor.next()) {
    if (limit && processed >= limit) break;
    processed++;
    const saleDate = sale.closedAt || sale.updatedAt || sale.createdAt || new Date();
    const vehicleId = sale.vehicle?.vehicleId;
    if (!vehicleId) continue;

    const items = Array.isArray(sale.items) ? sale.items : [];

    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (!it?.refId || it.source !== 'price') continue;
      if (isComboChild(it)) continue;

      total++;
      const priceId = it.refId;
      const lastPrice = Number(it.unitPrice || 0);
      let lastComboProducts = [];

      if (isComboMain(it)) {
        lastComboProducts = await buildComboProductsFromSaleItems(items, i, priceEntryCache);
      }

      const res = await upsertHistory({
        companyId: sale.companyId,
        priceId,
        vehicleId,
        lastPrice,
        lastComboProducts,
        lastUsedAt: saleDate
      });
      if (res.updated) updated++;
    }
  }

  console.log(`✅ Procesadas ventas: ${processed}`);
  console.log(`✅ Items de precio evaluados: ${total}`);
  console.log(`✅ Registros actualizados: ${updated}`);
  if (dryRun) console.log('ℹ️ Modo dry-run activado (sin escribir)');

  await mongoose.connection.close();
}

run().catch(async (err) => {
  console.error('❌ Error en backfill:', err);
  if (mongoose.connection.readyState === 1) {
    await mongoose.connection.close();
  }
  process.exit(1);
});
