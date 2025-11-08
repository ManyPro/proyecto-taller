#!/usr/bin/env node
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { connectDB } from '../src/db.js';
import Sale from '../src/models/Sale.js';
import CustomerProfile from '../src/models/CustomerProfile.js';

dotenv.config();

/*
Script para limpiar datos legacy antes de importar nuevos datos
*/

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    let token = argv[i];
    if (!token.startsWith('--')) continue;
    token = token.slice(2);
    if (token.includes('=')) {
      const [k, v] = token.split(/=(.*)/);
      out[k] = v;
    } else {
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) { out[token] = next; i++; }
      else out[token] = true;
    }
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const dryRun = !!args.dry;
const force = !!args.force;

async function main() {
  const uri = args.mongo || process.env.MONGODB_URI;
  if (!uri) {
    console.error('❌ Error: Falta --mongo o MONGODB_URI');
    process.exit(1);
  }

  if (!dryRun && !force) {
    console.error('❌ Error: Se requiere --force para ejecutar la limpieza (o --dry para preview)');
    process.exit(1);
  }

  console.log(dryRun ? '🔍 Modo DRY RUN - No se eliminarán datos' : '⚠️  MODO REAL - Se eliminarán datos');
  console.log('Conectando a MongoDB...');
  
  await connectDB(uri);
  console.log('✅ Conectado a MongoDB\n');

  // 1. Limpiar ventas legacy
  console.log('📋 Limpiando ventas legacy...');
  const salesQuery = {
    $or: [
      { legacyOrId: { $exists: true, $ne: '' } },
      { notes: { $regex: /LEGACY or_id=/ } }
    ]
  };
  
  const salesCount = await Sale.countDocuments(salesQuery);
  console.log(`  Encontradas ${salesCount} ventas legacy`);
  
  if (!dryRun && salesCount > 0) {
    const result = await Sale.deleteMany(salesQuery);
    console.log(`  ✅ Eliminadas ${result.deletedCount} ventas legacy`);
  }

  // 2. Limpiar perfiles de clientes legacy (con placas sintéticas)
  console.log('\n📋 Limpiando perfiles de clientes legacy...');
  const profilesQuery = {
    $or: [
      { plate: { $regex: /^CATALOGO-/ } },
      { plate: { $regex: /^CLIENT-/ } },
      { 'vehicle.plate': { $regex: /^CATALOGO-/ } },
      { 'vehicle.plate': { $regex: /^CLIENT-/ } }
    ]
  };
  
  const profilesCount = await CustomerProfile.countDocuments(profilesQuery);
  console.log(`  Encontrados ${profilesCount} perfiles legacy`);
  
  if (!dryRun && profilesCount > 0) {
    const result = await CustomerProfile.deleteMany(profilesQuery);
    console.log(`  ✅ Eliminados ${result.deletedCount} perfiles legacy`);
  }

  console.log('\n✅ Limpieza completada');
  
  if (dryRun) {
    console.log('\n💡 Para ejecutar la limpieza real, usa: --force');
  }
}

main()
  .then(() => {
    mongoose.connection.close().catch(() => {});
  })
  .catch(err => {
    console.error('❌ Error:', err);
    process.exit(1);
  });

