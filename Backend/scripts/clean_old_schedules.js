/**
 * Script para limpiar planillas antiguas con servicios incorrectos
 * 
 * Este script elimina planillas que contienen servicios con nombres problemáticos
 * como "EXCEPCIÓN" o "Sandero RS" que no deberían estar en las nuevas planillas.
 * 
 * Uso: node Backend/scripts/clean_old_schedules.js [companyId]
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Cargar variables de entorno
dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://giovannymanriquelol_db_user:XfOvU9NYHxoNgKAl@cluster0.gs3ajdl.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';

// Importar modelos
const VehicleServiceSchedule = (await import('../src/models/VehicleServiceSchedule.js')).default;

async function connectDB(uri) {
  try {
    await mongoose.connect(uri, { 
      dbName: process.env.MONGODB_DB || 'taller' 
    });
    console.log('✅ Conectado a MongoDB');
  } catch (err) {
    console.error('❌ Error conectando a MongoDB:', err.message);
    process.exit(1);
  }
}

async function cleanOldSchedules(companyId = null) {
  try {
    console.log('\n🧹 Iniciando limpieza de planillas antiguas...\n');

    // Patrones de servicios problemáticos a buscar
    const problematicPatterns = [
      /EXCEPCIÓN/i,
      /Sandero RS/i,
      /SANDERO RS/i,
      /excepción/i
    ];

    // Construir query
    const query = {};
    if (companyId) {
      query.companyId = String(companyId);
    }

    // Buscar todas las planillas
    const schedules = await VehicleServiceSchedule.find(query).lean();
    console.log(`📊 Encontradas ${schedules.length} planilla(s) para revisar\n`);

    let deleted = 0;
    let kept = 0;
    const idsToDelete = [];

    // Primera pasada: identificar planillas a eliminar
    for (const schedule of schedules) {
      // Verificar si tiene servicios problemáticos
      const hasProblematicServices = schedule.services?.some(service => {
        const serviceName = service.serviceName || '';
        return problematicPatterns.some(pattern => pattern.test(serviceName));
      });

      if (hasProblematicServices) {
        idsToDelete.push(schedule._id);
        deleted++;
      } else {
        kept++;
      }
    }
    
    // Segunda pasada: eliminar en lote (más eficiente)
    if (idsToDelete.length > 0) {
      console.log(`🗑️  Eliminando ${idsToDelete.length} planilla(s) con servicios problemáticos...`);
      const result = await VehicleServiceSchedule.deleteMany({ _id: { $in: idsToDelete } });
      console.log(`✅ ${result.deletedCount} planilla(s) eliminada(s)`);
    }

    console.log('\n📊 Resumen:');
    console.log(`   🗑️  Eliminadas: ${deleted}`);
    console.log(`   ✅ Conservadas: ${kept}`);
    console.log(`   📋 Total procesadas: ${schedules.length}\n`);

    if (deleted > 0) {
      console.log('⚠️  IMPORTANTE: Ejecuta el script generate_renault_schedules.js para regenerar las planillas limpias.\n');
    }

  } catch (error) {
    console.error('❌ Error general:', error);
    throw error;
  }
}

// Ejecutar script
async function main() {
  const companyId = process.argv[2] || null;
  
  try {
    await connectDB(MONGODB_URI);
    await cleanOldSchedules(companyId);
    console.log('✅ Script completado exitosamente');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error ejecutando script:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Desconectado de MongoDB');
  }
}

main();

