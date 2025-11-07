#!/usr/bin/env node
/**
 * Script para eliminar el índice único de PayrollPeriod
 * Permite crear períodos con las mismas fechas si están cerrados
 */

import mongoose from 'mongoose';
import { connectDB } from '../src/lib/db.js';

const COLLECTION_NAME = 'payrollperiods';
const INDEX_NAME = 'companyId_1_startDate_1_endDate_1';

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('❌ Error: MONGODB_URI no está definido');
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

