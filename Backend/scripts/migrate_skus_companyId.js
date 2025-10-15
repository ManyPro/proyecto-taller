import 'dotenv/config';
import mongoose from 'mongoose';
import Company from '../src/models/Company.js';
import SKU from '../src/models/SKU.js';

// One-off migration: copy legacy SKU.companyEmail -> companyId
// - Requires MONGODB_URI in env
// - Maps by Company.email
// - Preserves existing companyId values

async function run(){
  const uri = process.env.MONGODB_URI;
  const dbName = process.env.MONGODB_DB || 'taller';
  if(!uri){
    console.error('Missing MONGODB_URI');
    process.exit(1);
  }
  await mongoose.connect(uri, { dbName });
  console.log('[mongo] connected');

  // Detect legacy field presence quickly
  const sample = await SKU.findOne({ companyId: { $exists: false } }).lean();
  if(!sample){
    console.log('No legacy SKUs without companyId found. Nothing to migrate.');
    await mongoose.disconnect();
    return;
  }

  const cursor = SKU.find({ $or: [ { companyId: { $exists: false } }, { companyId: null } ] }).cursor();
  let processed = 0, updated = 0, missing = 0;
  for await (const doc of cursor){
    processed++;
    const email = (doc.companyEmail || '').toLowerCase().trim();
    if(!email){ missing++; continue; }
    const company = await Company.findOne({ email }).select('_id').lean();
    if(!company){ missing++; continue; }
    try{
      await SKU.updateOne({ _id: doc._id }, { 
        $set: { companyId: company._id }, 
        $unset: { companyEmail: '' }
      });
      updated++;
    }catch(e){
      // if duplicate key on compound index, skip (there may be a newer doc already)
      if(/E11000/.test(e.message||'')){
        console.warn('Duplicate detected, removing legacy doc:', String(doc._id));
        await SKU.deleteOne({ _id: doc._id });
      }else{
        console.error('Update error', doc._id, e.message);
      }
    }
  }

  console.log(JSON.stringify({ processed, updated, missing }, null, 2));
  await mongoose.disconnect();
}

run().catch(e=>{ console.error(e); process.exit(1); });
