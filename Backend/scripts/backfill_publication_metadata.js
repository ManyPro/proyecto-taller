#!/usr/bin/env node
/**
 * Backfill script for publication metadata on existing Items.
 *
 * What it does:
 * - Finds all Items with published=true and publishedAt missing -> sets publishedAt to createdAt (fallback) or now.
 * - Ensures publishedBy is set (keeps existing, else null).
 * - Optionally sets publicPrice to salePrice when publicPrice is undefined.
 * - Prints a summary report (counts & sample changes) and exit code 0.
 *
 * Safe to run multiple times (idempotent):
 * - Will not overwrite publishedAt if already present.
 * - Will not overwrite publishedBy if already present.
 * - Will not change publicPrice if already defined (even if 0).
 *
 * Usage (PowerShell):
 *   node ./Backend/scripts/backfill_publication_metadata.js MONGODB_URI="mongodb://localhost:27017" COMPANY_ID="<companyId>"
 *
 * Environment / Args:
 * - MONGODB_URI: connection string (required)
 * - COMPANY_ID: restrict to one company (optional). If omitted, processes all companies.
 */
import mongoose from 'mongoose';
import Item from '../src/models/Item.js';
import { connectDB } from '../src/db.js';

async function main(){
  // Parse env/args
  const argMap = {};
  for(const raw of process.argv.slice(2)){
    const m = raw.match(/^(\w+)=(.*)$/);
    if(m) argMap[m[1]] = m[2];
  }
  const MONGODB_URI = process.env.MONGODB_URI || argMap.MONGODB_URI;
  if(!MONGODB_URI){
    console.error('Missing MONGODB_URI. Provide as env or arg MONGODB_URI=...');
    process.exit(1);
  }
  const COMPANY_ID = process.env.COMPANY_ID || argMap.COMPANY_ID || null;

  await connectDB(MONGODB_URI);

  const q = { published: true };
  if(COMPANY_ID){
    if(!mongoose.Types.ObjectId.isValid(COMPANY_ID)){
      console.error('Invalid COMPANY_ID provided');
      process.exit(2);
    }
    q.companyId = new mongoose.Types.ObjectId(COMPANY_ID);
  }

  const items = await Item.find(q).lean();
  let updatedCount = 0;
  const details = [];

  for(const it of items){
    const needsPublishedAt = it.published && !it.publishedAt;
    const needsPublicPrice = it.published && it.publicPrice === undefined; // undefined only

    if(!needsPublishedAt && !needsPublicPrice) continue;

    const update = {};
    if(needsPublishedAt){
      update.publishedAt = it.createdAt ? new Date(it.createdAt) : new Date();
    }
    if(needsPublicPrice){
      update.publicPrice = Number.isFinite(it.salePrice) ? it.salePrice : undefined;
    }
    // Do NOT override publishedBy if exists. If missing, leave null.

    if(Object.keys(update).length){
      await Item.updateOne({ _id: it._id }, { $set: update });
      updatedCount++;
      if(details.length < 20){
        details.push({ _id: it._id.toString(), sku: it.sku, ...update });
      }
    }
  }

  console.log('Backfill publication metadata completed');
  console.log('Query filter:', q);
  console.log('Total published items scanned:', items.length);
  console.log('Items updated:', updatedCount);
  if(details.length){
    console.log('Sample updates (max 20):');
    for(const d of details){
      console.log(d);
    }
  } else {
    console.log('No items required changes.');
  }

  await mongoose.disconnect();
}

main().catch(err=>{
  console.error('Backfill script error:', err);
  process.exit(99);
});
