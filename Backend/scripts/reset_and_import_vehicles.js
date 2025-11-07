#!/usr/bin/env node
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { connectDB } from '../src/db.js';
import Vehicle from '../src/models/Vehicle.js';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { fileURLToPath } from 'url';

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Cargar .env desde el directorio raíz del proyecto (2 niveles arriba desde Backend/scripts)
const rootDir = path.resolve(__dirname, '../..');
dotenv.config({ path: path.join(rootDir, '.env') });

/*
Script: reset_and_import_vehicles.js
Goal: Eliminar todos los vehículos y luego importar desde un archivo CSV

Usage:
  node scripts/reset_and_import_vehicles.js --file "data/vehiculos_colombia_2025 (2).csv" [--mongodb-uri "mongodb://..."]
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
const filePath = args.file || 'data/vehiculos_colombia_2025 (2).csv';
const mongodbUri = args['mongodb-uri'] || process.env.MONGODB_URI || 'mongodb://localhost:27017/taller';

async function deleteAllVehicles() {
  try {
    console.log('🗑️  Eliminando todos los vehículos existentes...');
    const count = await Vehicle.countDocuments({});
    console.log(`📊 Vehículos encontrados: ${count}`);
    
    if (count === 0) {
      console.log('✅ No hay vehículos para eliminar');
      return;
    }
    
    const result = await Vehicle.deleteMany({});
    console.log(`✅ Eliminados ${result.deletedCount} vehículos`);
  } catch (err) {
    console.error('❌ Error al eliminar vehículos:', err);
    throw err;
  }
}

async function importVehicles() {
  try {
    console.log(`\n📥 Importando vehículos desde: ${filePath}`);
    const importScript = 'scripts/import_vehicles_from_excel.js';
    const command = `node ${importScript} --file "${filePath}" --skip-duplicates`;
    
    console.log(`Ejecutando: ${command}`);
    const { stdout, stderr } = await execAsync(command, {
      env: { ...process.env, MONGODB_URI: mongodbUri },
      cwd: process.cwd()
    });
    
    if (stdout) console.log(stdout);
    if (stderr) console.error(stderr);
  } catch (err) {
    console.error('❌ Error al importar vehículos:', err);
    throw err;
  }
}

async function main() {
  try {
    console.log('🚀 Iniciando proceso de reset e importación de vehículos\n');
    console.log(`📁 Archivo: ${filePath}`);
    console.log(`🔗 MongoDB URI: ${mongodbUri.replace(/\/\/.*@/, '//***@')}\n`);
    
    // Conectar a MongoDB
    await connectDB(mongodbUri);
    console.log('✅ Conectado a MongoDB\n');
    
    // Eliminar todos los vehículos
    await deleteAllVehicles();
    
    // Cerrar conexión antes de ejecutar el script de importación
    await mongoose.connection.close();
    console.log('\n📝 Conexión cerrada, iniciando importación...\n');
    
    // Importar vehículos
    await importVehicles();
    
    console.log('\n✅ Proceso completado exitosamente');
  } catch (err) {
    console.error('\n❌ Error fatal:', err);
    try {
      await mongoose.connection.close();
    } catch {}
    process.exit(1);
  }
}

main();

