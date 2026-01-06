/**
 * Script para corregir mileageInterval en planillas existentes
 * 
 * Este script corrige los valores de mileageInterval que fueron mal parseados
 * (ej: 10 en lugar de 10000, 15 en lugar de 15000)
 * 
 * Uso: node Backend/scripts/fix_mileage_intervals.js [companyId]
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';

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

/**
 * Función para corregir un valor de mileageInterval
 * Si el valor es menor a 100, probablemente debería ser miles (multiplicar por 1000)
 */
function fixMileageInterval(value) {
  if (value === null || value === undefined) return value;
  
  const num = Number(value);
  if (isNaN(num)) return value;
  
  // Si el valor es menor a 100, probablemente está mal parseado
  // Los intervalos típicos son: 5000, 10000, 15000, 20000, etc.
  if (num > 0 && num < 100) {
    const corrected = num * 1000;
    console.log(`   🔧 Corrigiendo: ${num} -> ${corrected}`);
    return corrected;
  }
  
  return num;
}

async function fixMileageIntervals(companyId = null) {
  try {
    console.log('\n🔧 Iniciando corrección de mileageInterval...\n');
    
    // Construir query
    const query = {};
    if (companyId) {
      query.companyId = String(companyId);
    }
    
    // Buscar todas las planillas
    const schedules = await VehicleServiceSchedule.find(query);
    console.log(`📊 Encontradas ${schedules.length} planilla(s) para revisar\n`);
    
    let totalFixed = 0;
    let totalSchedulesUpdated = 0;
    let totalServices = 0;
    
    // Procesar cada planilla
    for (const schedule of schedules) {
      let scheduleNeedsUpdate = false;
      let servicesFixed = 0;
      
      // Revisar cada servicio en la planilla
      if (schedule.services && Array.isArray(schedule.services)) {
        for (let i = 0; i < schedule.services.length; i++) {
          const service = schedule.services[i];
          totalServices++;
          
          // Corregir mileageInterval
          const originalInterval = service.mileageInterval;
          const fixedInterval = fixMileageInterval(originalInterval);
          
          if (fixedInterval !== originalInterval) {
            service.mileageInterval = fixedInterval;
            scheduleNeedsUpdate = true;
            servicesFixed++;
            totalFixed++;
          }
          
          // Corregir mileageIntervalMax si existe
          if (service.mileageIntervalMax !== null && service.mileageIntervalMax !== undefined) {
            const originalMax = service.mileageIntervalMax;
            const fixedMax = fixMileageInterval(originalMax);
            
            if (fixedMax !== originalMax) {
              service.mileageIntervalMax = fixedMax;
              scheduleNeedsUpdate = true;
              servicesFixed++;
              totalFixed++;
            }
          }
        }
      }
      
      // Guardar si hubo cambios
      if (scheduleNeedsUpdate) {
        await schedule.save();
        totalSchedulesUpdated++;
        console.log(`✅ Planilla ${schedule._id} actualizada: ${servicesFixed} servicio(s) corregido(s)`);
      }
    }
    
    console.log('\n📊 Resumen:');
    console.log(`   📋 Planillas revisadas: ${schedules.length}`);
    console.log(`   🔧 Planillas actualizadas: ${totalSchedulesUpdated}`);
    console.log(`   📝 Servicios revisados: ${totalServices}`);
    console.log(`   ✅ Valores corregidos: ${totalFixed}\n`);
    
    if (totalFixed > 0) {
      console.log('✅ Corrección completada exitosamente!\n');
    } else {
      console.log('ℹ️  No se encontraron valores que necesiten corrección.\n');
    }
    
  } catch (error) {
    console.error('❌ Error general:', error);
    throw error;
  }
}

// Ejecutar script
async function main() {
  try {
    const companyId = process.argv[2] || null;
    
    if (companyId) {
      console.log(`🎯 Procesando solo empresa: ${companyId}\n`);
    } else {
      console.log('🌍 Procesando todas las empresas\n');
    }
    
    await connectDB(MONGODB_URI);
    await fixMileageIntervals(companyId);
    
    console.log('✅ Script completado');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error fatal:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('👋 Desconectado de MongoDB');
  }
}

main();

