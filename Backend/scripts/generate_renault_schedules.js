/**
 * Script para generar planillas de mantenimiento para todos los vehículos RENAULT
 * 
 * Este script:
 * 1. Busca todos los perfiles de clientes con vehículos RENAULT
 * 2. Para cada perfil, crea o actualiza una planilla de servicios basada en las plantillas de mantenimiento
 * 3. Filtra las plantillas según el vehículo específico (marca, línea, etc.)
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
dotenv.config({ path: join(__dirname, '../.env') });

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/taller';

// Importar modelos
const CustomerProfile = (await import('../src/models/CustomerProfile.js')).default;
const VehicleServiceSchedule = (await import('../src/models/VehicleServiceSchedule.js')).default;
const MaintenanceTemplate = (await import('../src/models/MaintenanceTemplate.js')).default;

async function connectDB(uri) {
  try {
    await mongoose.connect(uri);
    console.log('✅ Conectado a MongoDB');
  } catch (err) {
    console.error('❌ Error conectando a MongoDB:', err.message);
    process.exit(1);
  }
}

async function generateSchedulesForRenaultVehicles(companyId = null) {
  try {
    console.log('\n🚀 Iniciando generación de planillas para vehículos RENAULT...\n');

    // Construir query para perfiles con vehículos RENAULT
    const profileQuery = {
      'vehicle.brand': { $regex: /^RENAULT$/i }
    };
    
    if (companyId) {
      profileQuery.companyId = String(companyId);
      console.log(`📋 Filtrando por companyId: ${companyId}`);
    } else {
      console.log('📋 Procesando todas las empresas');
    }

    // Buscar todos los perfiles con vehículos RENAULT
    const profiles = await CustomerProfile.find(profileQuery).lean();
    console.log(`📊 Encontrados ${profiles.length} perfiles con vehículos RENAULT\n`);

    if (profiles.length === 0) {
      console.log('⚠️  No se encontraron perfiles con vehículos RENAULT');
      return;
    }

    let created = 0;
    let updated = 0;
    let skipped = 0;
    let errors = 0;

    // Procesar cada perfil
    for (let i = 0; i < profiles.length; i++) {
      const profile = profiles[i];
      const plate = profile.vehicle?.plate || profile.plate;
      
      if (!plate) {
        console.log(`⚠️  Perfil ${i + 1}/${profiles.length}: Sin placa, saltando...`);
        skipped++;
        continue;
      }

      const plateUpper = String(plate).trim().toUpperCase();
      const profileCompanyId = profile.companyId;

      try {
        // Buscar o crear planilla
        let schedule = await VehicleServiceSchedule.findOne({
          companyId: profileCompanyId,
          plate: plateUpper
        });

        if (!schedule) {
          schedule = new VehicleServiceSchedule({
            companyId: profileCompanyId,
            plate: plateUpper,
            customerProfileId: profile._id,
            currentMileage: profile.vehicle?.mileage || null,
            services: []
          });
          created++;
        } else {
          updated++;
        }

        // Obtener información del vehículo para filtrar plantillas
        const vehicleBrand = profile.vehicle?.brand?.toUpperCase() || 'RENAULT';
        const vehicleLine = profile.vehicle?.line?.toUpperCase() || '';
        const vehicleId = profile.vehicle?.vehicleId;

        // Buscar plantillas de mantenimiento aplicables
        const templateQuery = {
          companyId: profileCompanyId,
          active: { $ne: false },
          mileageInterval: { $gt: 0 } // Solo servicios con intervalo de kilometraje
        };

        // Filtrar por marca y línea si están disponibles
        if (vehicleBrand) {
          templateQuery.$or = [
            { makes: { $in: [vehicleBrand] } },
            { makes: { $size: 0 } }, // Sin marca específica = genérico
            { makes: { $exists: false } } // Sin campo makes = genérico
          ];
        }

        // Si hay vehicleId, también filtrar por vehículo específico
        if (vehicleId && mongoose.Types.ObjectId.isValid(vehicleId)) {
          templateQuery.$or = [
            ...(templateQuery.$or || []),
            { vehicleIds: vehicleId }
          ];
        }

        // Traer plantillas ordenadas por prioridad
        const templates = await MaintenanceTemplate.find(templateQuery)
          .sort({ isCommon: -1, priority: 1, serviceName: 1 })
          .limit(100) // Limitar a 100 servicios
          .lean();

        if (templates.length === 0) {
          console.log(`⚠️  Perfil ${i + 1}/${profiles.length} (${plateUpper}): No se encontraron plantillas aplicables`);
          skipped++;
          continue;
        }

        // Si la planilla está vacía o necesita actualización, inicializar servicios
        const existingServiceKeys = new Set(
          schedule.services.map(s => s.serviceKey).filter(Boolean)
        );

        // Agregar servicios que no existen
        for (const template of templates) {
          if (!existingServiceKeys.has(template.serviceId)) {
            schedule.services.push({
              serviceName: template.serviceName,
              serviceKey: template.serviceId,
              system: template.system || '',
              mileageInterval: template.mileageInterval || 0,
              mileageIntervalMax: template.mileageIntervalMax || null, // Rango máximo si existe
              monthsInterval: template.monthsInterval || 0,
              lastPerformedMileage: null,
              lastPerformedDate: null,
              nextDueMileage: null,
              nextDueDate: null,
              status: 'pending',
              notes: template.notes || ''
            });
          }
        }

        // Actualizar kilometraje si es mayor
        const currentMileage = profile.vehicle?.mileage || null;
        if (currentMileage && (schedule.currentMileage === null || currentMileage > schedule.currentMileage)) {
          schedule.currentMileage = currentMileage;
          schedule.mileageUpdatedAt = new Date();
        }

        // Recalcular estados basados en el kilometraje actual
        if (schedule.currentMileage !== null && schedule.currentMileage > 0) {
          schedule.updateMileage(schedule.currentMileage);
        }

        await schedule.save();

        console.log(`✅ Perfil ${i + 1}/${profiles.length} (${plateUpper}): ${schedule.services.length} servicios en planilla`);

      } catch (error) {
        console.error(`❌ Error procesando perfil ${i + 1}/${profiles.length} (${plateUpper}):`, error.message);
        errors++;
      }
    }

    console.log('\n📊 Resumen:');
    console.log(`   ✅ Creadas: ${created}`);
    console.log(`   🔄 Actualizadas: ${updated}`);
    console.log(`   ⏭️  Saltadas: ${skipped}`);
    console.log(`   ❌ Errores: ${errors}`);
    console.log(`   📋 Total procesados: ${profiles.length}\n`);

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

