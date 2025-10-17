#!/usr/bin/env node
import 'dotenv/config';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import AdminUser from '../src/models/AdminUser.js';

const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO || '';
if(!MONGODB_URI){
  console.error('[seed_admin] Missing MONGODB_URI');
  process.exit(1);
}

const args = process.argv.slice(2);
function arg(name, def=''){
  const pref = name+'=';
  const found = args.find(a=>a.startsWith(pref));
  return found ? found.slice(pref.length) : def;
}

const email = arg('email');
const password = arg('password');
const role = arg('role','developer');
if(!email || !password || !['developer','admin'].includes(role)){
  console.log('Usage: node scripts/seed_admin.js email=dev@acme.com password=Secret123 role=developer|admin');
  process.exit(1);
}

async function run(){
  await mongoose.connect(MONGODB_URI, { dbName: process.env.MONGODB_DB || 'taller' });
  const existing = await AdminUser.findOne({ email: email.toLowerCase() });
  if(existing){
    console.log('[seed_admin] user exists, updating password/role');
    existing.passwordHash = await bcrypt.hash(password, 10);
    existing.role = role;
    existing.active = true;
    await existing.save();
    console.log('[seed_admin] updated:', existing.email, existing.role);
  } else {
    const doc = await AdminUser.create({ email: email.toLowerCase(), passwordHash: await bcrypt.hash(password, 10), role, companies: [], active: true });
    console.log('[seed_admin] created:', doc.email, doc.role);
  }
  await mongoose.disconnect();
}

run().catch(e=>{ console.error('[seed_admin] error', e); process.exit(1); });
