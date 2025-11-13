#!/usr/bin/env node
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { connectDB } from '../src/db.js';
import Sale from '../src/models/Sale.js';
import CustomerProfile from '../src/models/CustomerProfile.js';
import UnassignedVehicle from '../src/models/UnassignedVehicle.js';

dotenv.config();

/*
Script para limpiar datos legacy antes de reimportar.
Elimina ventas y clientes marcados como legacy para evitar duplicados.

Uso:
  node scripts/clean_legacy_imports.js --mongo "mongodb://..." [--force] [--dry] [--companyIds "id1,id2"]
  
Flags:
  --mongo       URI de MongoDB (requerido)
  --force       Ejecutar limpieza real (sin esto solo muestra preview)
  --dry         Preview sin eliminar (por defecto)
  --companyIds  IDs de empresas separados por coma (opcional, si no se especifica limpia todas)
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
const mongoUri = args.mongo || process.env.MONGODB_URI;
const force = !!args.force;
const dryRun = !force || !!args.dry;
const companyIds = args.companyIds ? args.companyIds.split(',').map(id => id.trim()) : null;

if (!mongoUri) {
  console.error('❌ Error: Falta --mongo o MONGODB_URI');
  process.exit(1);
}

async function main() {
  console.log('🧹 Limpieza de datos legacy antes de reimportar');
  console.log('='.repeat(60));
  console.log(`Modo: ${dryRun ? '🔍 PREVIEW (no elimina)' : '🗑️  ELIMINACIÓN REAL'}`);
  if (companyIds) {
    console.log(`Empresas: ${companyIds.join(', ')}`);
  } else {
    console.log(`Empresas: TODAS`);
  }
  console.log('='.repeat(60));
  
  await connectDB(mongoUri);
  console.log('✅ Conectado a MongoDB\n');
  
  // Construir query de empresas
  const companyQuery = companyIds ? { companyId: { $in: companyIds } } : {};
  
  // 1. Contar y eliminar ventas legacy
  console.log('📊 Analizando ventas legacy...');
  const salesQuery = {
    ...companyQuery,
    $or: [
      { legacyOrId: { $exists: true, $ne: '' } },
      { notes: { $regex: /LEGACY or_id=/ } }
    ]
  };
  
  const legacySales = await Sale.find(salesQuery);
  const salesCount = legacySales.length;
  console.log(`   Encontradas ${salesCount} ventas legacy`);
  
  if (!dryRun && salesCount > 0) {
    const result = await Sale.deleteMany(salesQuery);
    console.log(`   ✅ Eliminadas ${result.deletedCount} ventas legacy`);
  }
  
  // 2. Contar y eliminar UnassignedVehicles legacy
  console.log('\n📊 Analizando vehículos no asignados legacy...');
  const unassignedQuery = {
    ...companyQuery,
    source: 'import'
  };
  
  const legacyUnassigned = await UnassignedVehicle.find(unassignedQuery);
  const unassignedCount = legacyUnassigned.length;
  console.log(`   Encontrados ${unassignedCount} vehículos no asignados legacy`);
  
  if (!dryRun && unassignedCount > 0) {
    const result = await UnassignedVehicle.deleteMany(unassignedQuery);
    console.log(`   ✅ Eliminados ${result.deletedCount} vehículos no asignados legacy`);
  }
  
  // 3. Opcional: Eliminar CustomerProfiles con placas sintéticas legacy
  console.log('\n📊 Analizando perfiles de clientes legacy...');
  const profilesQuery = {
    ...companyQuery,
    $or: [
      { plate: { $regex: /^CATALOGO-/ } },
      { plate: { $regex: /^CLIENT-/ } },
      { 'vehicle.plate': { $regex: /^CATALOGO-/ } },
      { 'vehicle.plate': { $regex: /^CLIENT-/ } }
    ]
  };
  
  const legacyProfiles = await CustomerProfile.find(profilesQuery);
  const profilesCount = legacyProfiles.length;
  console.log(`   Encontrados ${profilesCount} perfiles con placas sintéticas legacy`);
  
  if (!dryRun && profilesCount > 0) {
    const result = await CustomerProfile.deleteMany(profilesQuery);
    console.log(`   ✅ Eliminados ${result.deletedCount} perfiles legacy`);
  }
  
  // Resumen
  console.log('\n' + '='.repeat(60));
  if (dryRun) {
    console.log('📊 RESUMEN DE LIMPIEZA (PREVIEW)');
    console.log('='.repeat(60));
    console.log(`⚠️  Esto es solo un preview. Nada se eliminó.`);
    console.log(`📦 Ventas legacy que se eliminarían: ${salesCount}`);
    console.log(`🚗 Vehículos no asignados que se eliminarían: ${unassignedCount}`);
    console.log(`👤 Perfiles que se eliminarían: ${profilesCount}`);
    console.log(`\n💡 Para ejecutar la limpieza real, usa: --force`);
  } else {
    console.log('✅ LIMPIEZA COMPLETADA');
    console.log('='.repeat(60));
    console.log(`📦 Ventas legacy eliminadas: ${salesCount}`);
    console.log(`🚗 Vehículos no asignados eliminados: ${unassignedCount}`);
    console.log(`👤 Perfiles eliminados: ${profilesCount}`);
  }
  console.log('='.repeat(60));
  
  await mongoose.connection.close();
}

main().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});

