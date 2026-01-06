/**
 * Script para importar planillas de mantenimiento desde Excel
 * 
 * Este script:
 * 1. Lee el archivo Excel con las planillas de mantenimiento
 * 2. Elimina todas las planillas viejas
 * 3. Importa las planillas del Excel (una por vehículo)
 * 4. Genera las nuevas planillas basadas en el Excel
 * 
 * Estructura esperada del Excel:
 * - Una hoja por vehículo (ej: "OROCH 2.0")
 * - Columnas: Servicio, Intervalo_km (o similar)
 * 
 * Uso: node Backend/scripts/import_maintenance_from_excel.js [companyId]
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import xlsx from 'xlsx';
import { readFileSync, existsSync } from 'fs';

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

/**
 * Normalizar nombre de vehículo para buscar coincidencias
 */
function normalizeVehicleName(name) {
  if (!name) return '';
  return String(name)
    .trim()
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .replace(/[^A-Z0-9\s]/g, '');
}

/**
 * Extraer información del nombre de la hoja del Excel
 * Ejemplos: "OROCH_2.0" -> { line: "OROCH", displacement: "2.0" }
 *          "CLIO_1.2" -> { line: "CLIO", displacement: "1.2" }
 *          "DUSTER_1.3TURBO" -> { line: "DUSTER", displacement: "1.3 TURBO" }
 */
function parseSheetName(sheetName) {
  const normalized = String(sheetName).trim().toUpperCase();
  
  // Ignorar hojas que no son de vehículos
  if (normalized.includes('WEB') || normalized.includes('SIMPLE')) {
    return null;
  }
  
  // Separar por guión bajo o espacio
  const parts = normalized.split(/[_\s]+/);
  
  if (parts.length < 2) return null;
  
  let line = parts[0];
  let displacement = parts.slice(1).join(' ');
  
  // Manejar casos especiales
  if (line === '4') {
    line = '4';
  } else if (line.includes('MEGANE') && parts.length > 2) {
    // "MEGANE I_1.4" -> line: "MEGANE I", displacement: "1.4"
    line = parts.slice(0, -1).join(' ');
    displacement = parts[parts.length - 1];
  }
  
  // Normalizar displacement
  displacement = displacement
    .replace(/TURBO/gi, 'TURBO')
    .replace(/HÍBRIDO/gi, 'HÍBRIDO')
    .replace(/RS/gi, 'RS')
    .replace(/SCE/gi, 'SCE')
    .replace(/16V/gi, '16V');
  
  return { line, displacement };
}

/**
 * Normalizar displacement para comparación
 */
function normalizeDisplacement(disp) {
  if (!disp) return '';
  return String(disp)
    .toUpperCase()
    .replace(/\s+/g, '')
    .replace(/\./g, '')
    .replace(/TURBO/gi, 'TURBO')
    .replace(/HÍBRIDO/gi, 'HIBRIDO')
    .replace(/RS/gi, 'RS')
    .replace(/SCE/gi, 'SCE')
    .replace(/16V/gi, '16V');
}

/**
 * Comparar displacements (flexible)
 */
function compareDisplacements(disp1, disp2) {
  const norm1 = normalizeDisplacement(disp1);
  const norm2 = normalizeDisplacement(disp2);
  
  if (norm1 === norm2) return true;
  if (norm1.includes(norm2) || norm2.includes(norm1)) return true;
  
  // Casos especiales
  if (norm1.includes('13TURBO') && norm2.includes('13') && norm2.includes('TURBO')) return true;
  if (norm2.includes('13TURBO') && norm1.includes('13') && norm1.includes('TURBO')) return true;
  
  if (norm1.includes('16RS') && norm2.includes('16') && norm2.includes('RS')) return true;
  if (norm2.includes('16RS') && norm1.includes('16') && norm1.includes('RS')) return true;
  
  if (norm1.includes('1616V') && norm2.includes('16') && norm2.includes('16V')) return true;
  if (norm2.includes('1616V') && norm1.includes('16') && norm1.includes('16V')) return true;
  
  if (norm1.includes('16SCE') && norm2.includes('16') && norm2.includes('SCE')) return true;
  if (norm2.includes('16SCE') && norm1.includes('16') && norm1.includes('SCE')) return true;
  
  if (norm1.includes('20RS') && norm2.includes('20') && norm2.includes('RS')) return true;
  if (norm2.includes('20RS') && norm1.includes('20') && norm1.includes('RS')) return true;
  
  if (norm1.includes('20TURBO') && norm2.includes('20') && norm2.includes('TURBO')) return true;
  if (norm2.includes('20TURBO') && norm1.includes('20') && norm1.includes('TURBO')) return true;
  
  return false;
}

/**
 * Buscar vehículo por nombre de hoja del Excel
 */
function findVehicleBySheetName(sheetName, vehicles) {
  const parsed = parseSheetName(sheetName);
  if (!parsed) return null;
  
  const { line, displacement } = parsed;
  
  // Buscar vehículo que coincida
  for (const vehicle of vehicles) {
    const vehicleLine = normalizeVehicleName(vehicle.line || '');
    const vehicleDisplacement = vehicle.displacement || '';
    
    // Comparar línea (debe coincidir exactamente o ser muy similar)
    const lineMatches = vehicleLine === line || 
                       vehicleLine.includes(line) || 
                       line.includes(vehicleLine);
    
    if (!lineMatches) continue;
    
    // Comparar displacement (flexible)
    const dispMatches = compareDisplacements(displacement, vehicleDisplacement);
    
    if (dispMatches) {
      return vehicle;
    }
  }
  
  return null;
}

/**
 * Leer Excel y extraer planillas
 */
function readMaintenanceExcel(excelPath) {
  if (!existsSync(excelPath)) {
    throw new Error(`Archivo Excel no encontrado: ${excelPath}`);
  }
  
  console.log(`📖 Leyendo Excel: ${excelPath}`);
  const workbook = xlsx.readFile(excelPath);
  const sheets = {};
  
  // Procesar cada hoja
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const rows = xlsx.utils.sheet_to_json(sheet, { defval: '' });
    
    if (rows.length === 0) continue;
    
    // Detectar columnas (pueden variar)
    const firstRow = rows[0];
    const columns = Object.keys(firstRow);
    
    // Buscar columna de servicio
    const serviceCol = columns.find(col => 
      col.toLowerCase().includes('servicio') || 
      col.toLowerCase().includes('service')
    ) || columns[0];
    
    // Buscar columna de intervalo
    const intervalCol = columns.find(col => 
      col.toLowerCase().includes('intervalo') || 
      col.toLowerCase().includes('interval') ||
      col.toLowerCase().includes('km')
    ) || columns[1];
    
    const services = [];
    
    for (const row of rows) {
      const serviceName = String(row[serviceCol] || '').trim();
      const intervalStr = String(row[intervalCol] || '').trim();
      
      if (!serviceName || serviceName.toLowerCase() === 'servicio') continue;
      
      // Parsear intervalo (puede ser "10000", "10000-15000", "10000 km", etc.)
      let mileageInterval = null;
      let mileageIntervalMax = null;
      
      if (intervalStr) {
        // Remover "km" y espacios
        let cleanInterval = intervalStr.replace(/km/gi, '').replace(/\s+/g, '').trim();
        
        // Función helper para convertir string a número, manejando formato de miles
        const parseMileage = (str) => {
          if (!str) return null;
          // Remover puntos de separación de miles (formato: 10.000 -> 10000)
          // y reemplazar comas decimales por puntos si existen
          const cleaned = str.replace(/\./g, '').replace(',', '.');
          const num = Number(cleaned);
          return isNaN(num) ? null : Math.round(num);
        };
        
        // Verificar si es un rango (ej: "10000-15000" o "10.000-15.000")
        if (cleanInterval.includes('-')) {
          const parts = cleanInterval.split('-');
          mileageInterval = parseMileage(parts[0]);
          mileageIntervalMax = parseMileage(parts[1]);
        } else {
          mileageInterval = parseMileage(cleanInterval);
        }
      }
      
      if (serviceName && mileageInterval) {
        services.push({
          serviceName,
          mileageInterval,
          mileageIntervalMax
        });
      }
    }
    
    if (services.length > 0) {
      sheets[sheetName] = services;
      console.log(`   📋 Hoja "${sheetName}": ${services.length} servicios`);
    }
  }
  
  return sheets;
}

/**
 * Eliminar todas las planillas viejas
 */
async function deleteAllSchedules(companyId = null) {
  const query = companyId ? { companyId } : {};
  const result = await VehicleServiceSchedule.deleteMany(query);
  console.log(`🗑️  Eliminadas ${result.deletedCount} planillas viejas`);
  return result.deletedCount;
}

/**
 * Generar planillas desde Excel
 */
async function generateSchedulesFromExcel(excelPath, companyId = null) {
  try {
    console.log('\n🚀 Iniciando importación de planillas desde Excel...\n');
    
    // Leer Excel
    const sheets = readMaintenanceExcel(excelPath);
    
    if (Object.keys(sheets).length === 0) {
      console.log('⚠️  No se encontraron planillas en el Excel');
      return;
    }
    
    // Obtener todos los vehículos RENAULT
    const vehicles = await Vehicle.find({
      make: 'RENAULT',
      active: true
    }).lean();
    
    console.log(`📊 Encontrados ${vehicles.length} vehículos RENAULT\n`);
    
    // Obtener companyIds
    const allCompanyIds = await MaintenanceTemplate.distinct('companyId');
    const companyIdsToProcess = companyId ? [String(companyId)] : allCompanyIds;
    
    console.log(`📋 Procesando ${companyIdsToProcess.length} empresa(s)\n`);
    
    let created = 0;
    let updated = 0;
    let skipped = 0;
    let errors = 0;
    
    // Procesar cada hoja del Excel
    for (const [sheetName, services] of Object.entries(sheets)) {
      // Ignorar hoja WEB_SIMPLE
      if (sheetName.toUpperCase().includes('WEB') || sheetName.toUpperCase().includes('SIMPLE')) {
        console.log(`⏭️  Saltando hoja "${sheetName}" (no es de vehículo)`);
        continue;
      }
      
      // Buscar vehículo correspondiente
      const vehicle = findVehicleBySheetName(sheetName, vehicles);
      
      if (!vehicle) {
        console.log(`⚠️  No se encontró vehículo para hoja "${sheetName}"`);
        // Mostrar vehículos disponibles para debugging
        const similarVehicles = vehicles.filter(v => 
          normalizeVehicleName(v.line || '').includes(sheetName.split('_')[0].toUpperCase()) ||
          sheetName.split('_')[0].toUpperCase().includes(normalizeVehicleName(v.line || ''))
        ).slice(0, 3);
        if (similarVehicles.length > 0) {
          console.log(`   Vehículos similares encontrados: ${similarVehicles.map(v => `${v.make} ${v.line} ${v.displacement}`).join(', ')}`);
        }
        skipped++;
        continue;
      }
      
      console.log(`📋 Procesando "${sheetName}" -> ${vehicle.make} ${vehicle.line} ${vehicle.displacement}`);
      
      // Procesar para cada empresa
      for (const companyIdStr of companyIdsToProcess) {
        try {
          // Buscar o crear planilla
          let schedule = await VehicleServiceSchedule.findOne({
            companyId: companyIdStr,
            vehicleId: vehicle._id
          });
          
          if (!schedule) {
            schedule = new VehicleServiceSchedule({
              companyId: companyIdStr,
              vehicleId: vehicle._id,
              services: []
            });
            created++;
          } else {
            updated++;
          }
          
          // Limpiar servicios existentes y agregar nuevos del Excel
          schedule.services = [];
          
          for (const service of services) {
            // Generar serviceKey único basado en el nombre
            const serviceKey = `REN-${String(service.serviceName)
              .toUpperCase()
              .replace(/[^A-Z0-9]/g, '')
              .substring(0, 20)}`;
            
            schedule.services.push({
              serviceName: service.serviceName,
              serviceKey: serviceKey,
              system: 'General', // Por defecto
              mileageInterval: service.mileageInterval || 0,
              mileageIntervalMax: service.mileageIntervalMax || null,
              monthsInterval: 0, // No especificado en Excel simple
              notes: ''
            });
          }
          
          await schedule.save();
          
          console.log(`   ✅ ${schedule.services.length} servicios agregados`);
          
        } catch (error) {
          console.error(`   ❌ Error procesando "${sheetName}" para empresa ${companyIdStr}:`, error.message);
          errors++;
        }
      }
    }
    
    console.log('\n📊 Resumen:');
    console.log(`   ✅ Creadas: ${created}`);
    console.log(`   🔄 Actualizadas: ${updated}`);
    console.log(`   ⏭️  Saltadas: ${skipped}`);
    console.log(`   ❌ Errores: ${errors}`);
    console.log(`   📋 Total hojas procesadas: ${Object.keys(sheets).length}\n`);
    
  } catch (error) {
    console.error('❌ Error general:', error);
    throw error;
  }
}

// Ejecutar script
async function main() {
  const companyId = process.argv[2] || null;
  
  // Ruta del Excel
  const excelPath = join(__dirname, '../../Frontend/assets/plan_mantenimiento_renault_para_web.xlsx');
  
  try {
    await connectDB(MONGODB_URI);
    
    // Eliminar planillas viejas
    console.log('\n🗑️  Eliminando planillas viejas...\n');
    await deleteAllSchedules(companyId);
    
    // Importar desde Excel
    await generateSchedulesFromExcel(excelPath, companyId);
    
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

