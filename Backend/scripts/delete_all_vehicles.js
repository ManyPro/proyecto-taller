#!/usr/bin/env node
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { connectDB } from '../src/db.js';
import Vehicle from '../src/models/Vehicle.js';

dotenv.config();

/*
Script: delete_all_vehicles.js
Goal: Eliminar todos los vehículos de la base de datos

Usage:
  node scripts/delete_all_vehicles.js [--dry]
*/

const args = process.argv.slice(2);
const dryRun = args.includes('--dry');

async function main() {
  try {
    const uri = process.env.MONGODB_URI;
    if (!uri) {
      console.error('❌ Error: MONGODB_URI no está definido en las variables de entorno');
      console.error('   Asegúrate de tener un archivo .env con MONGODB_URI o ejecuta:');
      console.error('   MONGODB_URI="mongodb://..." node scripts/delete_all_vehicles.js');
      process.exit(1);
    }

    if (dryRun) {
      console.log('🔍 Modo DRY RUN - No se eliminarán vehículos');
    } else {
      await connectDB(uri);
      console.log('✅ Conectado a MongoDB');
    }

    // Contar vehículos existentes
    const count = await Vehicle.countDocuments({});
    console.log(`📊 Vehículos encontrados: ${count}`);

    if (count === 0) {
      console.log('✅ No hay vehículos para eliminar');
      if (!dryRun) {
        await mongoose.connection.close();
      }
      return;
    }

    if (dryRun) {
      console.log(`🔍 DRY RUN: Se eliminarían ${count} vehículos`);
    } else {
      // Eliminar todos los vehículos
      const result = await Vehicle.deleteMany({});
      console.log(`✅ Eliminados ${result.deletedCount} vehículos`);
      await mongoose.connection.close();
      console.log('✅ Proceso completado');
    }
  } catch (err) {
    console.error('❌ Error fatal:', err);
    process.exit(1);
  }
}

main();

