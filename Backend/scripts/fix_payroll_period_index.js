#!/usr/bin/env node
/**
 * Script para eliminar el índice único de PayrollPeriod
 * Permite crear períodos con las mismas fechas si están cerrados
 * 
 * Uso:
 *   npm run fix:payroll:index
 *   o
 *   node scripts/fix_payroll_period_index.js --mongo "mongodb://..."
 */

import mongoose from 'mongoose';
import 'dotenv/config';
import { connectDB } from '../src/lib/db.js';

const COLLECTION_NAME = 'payrollperiods';
const INDEX_NAME = 'companyId_1_startDate_1_endDate_1';

// Parsear argumentos de línea de comandos
function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const value = argv[i + 1];
    if (value && !value.startsWith('--')) {
      args[key] = value;
      i++;
    } else {
      args[key] = true;
    }
  }
  return args;
}

async function main() {
  const cmdArgs = parseArgs(process.argv.slice(2));
  const uri = cmdArgs.mongo || process.env.MONGODB_URI;
  
  if (!uri) {
    console.error('❌ Error: MONGODB_URI no está definido');
    console.error('');
    console.error('Opciones:');
    console.error('  1. Define la variable de entorno MONGODB_URI');
    console.error('  2. Pásala como argumento: --mongo "mongodb://..."');
    console.error('');
    console.error('Ejemplo:');
    console.error('  npm run fix:payroll:index -- --mongo "mongodb://usuario:password@host:27017/db"');
    process.exit(1);
  }

  try {
    console.log('🔌 Conectando a MongoDB...');
    await connectDB(uri);
    
    const db = mongoose.connection.db;
    const collection = db.collection(COLLECTION_NAME);
    
    console.log('📋 Verificando índices existentes...');
    const indexes = await collection.indexes();
    console.log('Índices actuales:', JSON.stringify(indexes.map(idx => ({
      name: idx.name,
      key: idx.key,
      unique: idx.unique
    })), null, 2));
    
    // Buscar el índice único problemático
    const uniqueIndex = indexes.find(idx => 
      idx.unique === true && 
      idx.key && 
      idx.key.companyId === 1 && 
      idx.key.startDate === 1 && 
      idx.key.endDate === 1
    );
    
    if (!uniqueIndex) {
      console.log('✅ No se encontró el índice único problemático. Ya está eliminado o nunca existió.');
      await mongoose.connection.close();
      return;
    }
    
    console.log(`\n🗑️  Eliminando índice único: ${uniqueIndex.name}`);
    console.log(`   Claves: ${JSON.stringify(uniqueIndex.key)}`);
    
    try {
      await collection.dropIndex(uniqueIndex.name);
      console.log('✅ Índice único eliminado exitosamente');
    } catch (dropErr) {
      if (dropErr.code === 27 || dropErr.message?.includes('index not found')) {
        console.log('⚠️  El índice ya no existe (puede haber sido eliminado manualmente)');
      } else {
        throw dropErr;
      }
    }
    
    // Verificar que se eliminó
    const indexesAfter = await collection.indexes();
    const stillExists = indexesAfter.find(idx => idx.name === uniqueIndex.name);
    
    if (stillExists) {
      console.log('⚠️  Advertencia: El índice todavía existe después de intentar eliminarlo');
    } else {
      console.log('✅ Confirmado: El índice único ha sido eliminado');
    }
    
    // Crear el nuevo índice no único (para búsquedas eficientes)
    console.log('\n📊 Creando índice compuesto (sin unique)...');
    try {
      await collection.createIndex(
        { companyId: 1, startDate: 1, endDate: 1 },
        { unique: false, name: 'companyId_1_startDate_1_endDate_1' }
      );
      console.log('✅ Índice compuesto creado exitosamente');
    } catch (createErr) {
      if (createErr.code === 85 || createErr.message?.includes('already exists')) {
        console.log('ℹ️  El índice compuesto ya existe (esto está bien)');
      } else {
        throw createErr;
      }
    }
    
    console.log('\n✅ Migración completada exitosamente');
    console.log('   Ahora puedes crear períodos con las mismas fechas si están cerrados.');
    
  } catch (err) {
    console.error('❌ Error durante la migración:', err);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log('🔌 Conexión cerrada');
  }
}

main();

