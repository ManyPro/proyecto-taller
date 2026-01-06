/**
 * Script para generar planillas de mantenimiento para todos los vehículos RENAULT
 * 
 * Este script:
 * 1. Busca todos los vehículos RENAULT únicos en la base de datos
 * 2. Para cada vehículo, crea o actualiza una planilla base de servicios
 * 3. Filtra las plantillas según el vehículo específico (marca, línea, etc.)
 * 
 * NOTA: La planilla es compartida por todos los clientes con el mismo vehículo.
 * Los datos específicos del cliente (KM, historial) se calculan al consultar.
 * 
 * Uso: node Backend/scripts/generate_renault_schedules.js [companyId]
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Cargar variables de entorno
dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://giovannymanriquelol_db_user:XfOvU9NYHxoNgKAl@cluster0.gs3ajdl.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';

// Importar modelos
const Vehicle = (await import('../src/models/Vehicle.js')).default;
const VehicleServiceSchedule = (await import('../src/models/VehicleServiceSchedule.js')).default;
const MaintenanceTemplate = (await import('../src/models/MaintenanceTemplate.js')).default;

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

async function generateSchedulesForRenaultVehicles(companyId = null) {
  try {
    console.log('\n🚀 Iniciando generación de planillas para vehículos RENAULT...\n');

    // Buscar todos los vehículos RENAULT únicos
    const vehicleQuery = {
      make: 'RENAULT',
      active: true
    };
    
    const vehicles = await Vehicle.find(vehicleQuery)
      .sort({ make: 1, line: 1, displacement: 1, modelYear: 1 })
      .lean();
    
    console.log(`📊 Encontrados ${vehicles.length} vehículos RENAULT únicos\n`);

    if (vehicles.length === 0) {
      console.log('⚠️  No se encontraron vehículos RENAULT');
      return;
    }

    let created = 0;
    let updated = 0;
    let skipped = 0;
    let errors = 0;

    // Obtener todos los companyIds únicos de las plantillas de mantenimiento
    const allCompanyIds = await MaintenanceTemplate.distinct('companyId');
    const companyIdsToProcess = companyId ? [String(companyId)] : allCompanyIds;
    
    console.log(`📋 Procesando ${companyIdsToProcess.length} empresa(s)\n`);

    // Procesar cada vehículo para cada empresa
    for (let vIdx = 0; vIdx < vehicles.length; vIdx++) {
      const vehicle = vehicles[vIdx];
      const vehicleId = vehicle._id;
      
      for (let cIdx = 0; cIdx < companyIdsToProcess.length; cIdx++) {
        const companyIdStr = companyIdsToProcess[cIdx];
        
        try {
          // Buscar o crear planilla para este vehículo y empresa
          let schedule = await VehicleServiceSchedule.findOne({
            companyId: companyIdStr,
            vehicleId: vehicleId
          });

          if (!schedule) {
            schedule = new VehicleServiceSchedule({
              companyId: companyIdStr,
              vehicleId: vehicleId,
              services: []
            });
            created++;
          } else {
            updated++;
          }

          // Buscar plantillas de mantenimiento aplicables
          const templateQuery = {
            companyId: companyIdStr,
            active: { $ne: false },
            mileageInterval: { $gt: 0 }
          };

          // Filtrar por marca y línea
          // Priorizar plantillas específicas para la línea del vehículo
          templateQuery.$or = [
            // Plantillas específicas para este vehículo
            { vehicleIds: vehicleId },
            // Plantillas para la línea específica
            { lines: { $in: [vehicle.line] } },
            // Plantillas para la marca
            { makes: { $in: [vehicle.make] } },
            // Plantillas generales (sin restricción)
            { makes: { $size: 0 } },
            { makes: { $exists: false } }
          ];
          
          // Si el vehículo tiene línea, también filtrar por línea
          if (vehicle.line) {
            templateQuery.$or.push({ lines: { $in: [vehicle.line.toUpperCase()] } });
          }

          // Traer plantillas ordenadas por prioridad
          const templates = await MaintenanceTemplate.find(templateQuery)
            .sort({ isCommon: -1, priority: 1, serviceName: 1 })
            .limit(100)
            .lean();

          if (templates.length === 0) {
            console.log(`⚠️  Vehículo ${vIdx + 1}/${vehicles.length} (${vehicle.make} ${vehicle.line} ${vehicle.displacement}): No se encontraron plantillas para empresa ${companyIdStr}`);
            skipped++;
            continue;
          }

          // Obtener serviceKeys existentes
          const existingServiceKeys = new Set(
            schedule.services.map(s => s.serviceKey).filter(Boolean)
          );

          // Agregar servicios que no existen
          let addedServices = 0;
          for (const template of templates) {
            if (!existingServiceKeys.has(template.serviceId)) {
              schedule.services.push({
                serviceName: template.serviceName,
                serviceKey: template.serviceId,
                system: template.system || '',
                mileageInterval: template.mileageInterval || 0,
                mileageIntervalMax: template.mileageIntervalMax || null,
                monthsInterval: template.monthsInterval || 0,
                notes: template.notes || ''
              });
              addedServices++;
            }
          }

          await schedule.save();

          const vehicleDesc = `${vehicle.make} ${vehicle.line} ${vehicle.displacement}${vehicle.modelYear ? ` (${vehicle.modelYear})` : ''}`;
          console.log(`✅ Vehículo ${vIdx + 1}/${vehicles.length} - Empresa ${cIdx + 1}/${companyIdsToProcess.length} (${vehicleDesc}): ${schedule.services.length} servicios${addedServices > 0 ? ` (+${addedServices} nuevos)` : ''}`);

        } catch (error) {
          console.error(`❌ Error procesando vehículo ${vIdx + 1}/${vehicles.length} para empresa ${companyIdStr}:`, error.message);
          errors++;
        }
      }
    }

    console.log('\n📊 Resumen:');
    console.log(`   ✅ Creadas: ${created}`);
    console.log(`   🔄 Actualizadas: ${updated}`);
    console.log(`   ⏭️  Saltadas: ${skipped}`);
    console.log(`   ❌ Errores: ${errors}`);
    console.log(`   📋 Total vehículos: ${vehicles.length}`);
    console.log(`   🏢 Total empresas: ${companyIdsToProcess.length}`);
    console.log(`   📋 Total planillas procesadas: ${vehicles.length * companyIdsToProcess.length}\n`);

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
    await generateSchedulesForRenaultVehicles(companyId);
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

