// Script para importar plantillas de mantenimiento desde Excel
import xlsx from 'xlsx';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import MaintenanceTemplate from '../src/models/MaintenanceTemplate.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const excelPath = path.join(__dirname, '../../Frontend/assets/plan_mantenimiento_renault_para_web.xlsx');

// Servicios comunes (siempre mostrar primero)
const COMMON_SERVICES = [
  'Cambio de aceite motor',
  'Cambio filtro de aceite',
  'Cambio filtro de aire motor',
  'Revisión multipunto'
];

async function importTemplates(companyId, dryRun = false) {
  console.log('\n📖 Importando plantillas de mantenimiento...');
  console.log('🏢 Company ID:', companyId);
  console.log('🔍 Modo:', dryRun ? 'DRY RUN (simulación)' : 'REAL (guardando en BD)');
  console.log('📂 Archivo:', excelPath);

  if (!fs.existsSync(excelPath)) {
    throw new Error(`Archivo no encontrado: ${excelPath}`);
  }

  const workbook = xlsx.readFile(excelPath);
  const tasksSheet = workbook.Sheets['TAREAS'];
  
  if (!tasksSheet) {
    throw new Error('Hoja "TAREAS" no encontrada en el Excel');
  }

  const rows = xlsx.utils.sheet_to_json(tasksSheet, { defval: '' });
  console.log(`\n📊 Total de filas en TAREAS: ${rows.length}`);

  let imported = 0;
  let updated = 0;
  let skipped = 0;
  const errors = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    
    try {
      const serviceId = String(row['ID'] || '').trim().toUpperCase();
      const serviceName = String(row['Servicio'] || '').trim();
      const system = String(row['Sistema'] || '').trim();
      const serviceType = String(row['Tipo'] || '').trim().toUpperCase();
      
      // Validar campos requeridos
      if (!serviceId || !serviceName || !system || !serviceType) {
        skipped++;
        console.log(`⏭️  Fila ${i + 2}: Campos requeridos faltantes, saltando...`);
        continue;
      }

      // Parsear intervalos
      const mileageInterval = row['Intervalo_km'] ? 
        parseInt(String(row['Intervalo_km']).trim(), 10) : null;
      const monthsInterval = row['Intervalo_meses'] ? 
        parseInt(String(row['Intervalo_meses']).trim(), 10) : null;

      // Validar que al menos uno de los intervalos esté presente
      if (!mileageInterval && !monthsInterval) {
        skipped++;
        console.log(`⏭️  Fila ${i + 2}: Sin intervalos válidos, saltando...`);
        continue;
      }

      // Determinar si es servicio común
      const isCommon = COMMON_SERVICES.some(common => 
        serviceName.toLowerCase().includes(common.toLowerCase()) ||
        common.toLowerCase().includes(serviceName.toLowerCase())
      );

      // Prioridad: cambio de aceite siempre primero
      let priority = 100;
      if (serviceName.toLowerCase().includes('cambio de aceite motor')) {
        priority = 1;
      } else if (isCommon) {
        priority = 10;
      }

      const templateData = {
        companyId,
        serviceId,
        system,
        serviceName,
        serviceType,
        mileageInterval: Number.isFinite(mileageInterval) ? mileageInterval : null,
        monthsInterval: Number.isFinite(monthsInterval) ? monthsInterval : null,
        condition: String(row['Condición'] || '').trim(),
        appliesTo: String(row['Aplica a'] || '').trim(),
        notes: String(row['Notas para web'] || '').trim(),
        source: String(row['Fuente (referencia)'] || '').trim(),
        isCommon,
        priority,
        active: true
      };

      if (dryRun) {
        console.log(`\n📝 Fila ${i + 2} (DRY RUN):`);
        console.log(`   ID: ${serviceId}`);
        console.log(`   Servicio: ${serviceName}`);
        console.log(`   Sistema: ${system}`);
        console.log(`   Intervalo: ${mileageInterval || 'N/A'} km / ${monthsInterval || 'N/A'} meses`);
        console.log(`   Común: ${isCommon ? 'Sí' : 'No'}`);
        console.log(`   Prioridad: ${priority}`);
        imported++;
      } else {
        const existing = await MaintenanceTemplate.findOne({
          companyId,
          serviceId
        });

        if (existing) {
          // Actualizar existente
          Object.assign(existing, templateData);
          await existing.save();
          updated++;
          console.log(`✅ Actualizado: ${serviceId} - ${serviceName}`);
        } else {
          // Crear nuevo
          await MaintenanceTemplate.create(templateData);
          imported++;
          console.log(`➕ Creado: ${serviceId} - ${serviceName}`);
        }
      }
    } catch (error) {
      errors.push({ row: i + 2, error: error.message });
      console.error(`❌ Error en fila ${i + 2}:`, error.message);
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('📊 RESUMEN');
  console.log('='.repeat(60));
  console.log(`✅ Importados: ${imported}`);
  console.log(`🔄 Actualizados: ${updated}`);
  console.log(`⏭️  Saltados: ${skipped}`);
  if (errors.length > 0) {
    console.log(`❌ Errores: ${errors.length}`);
    errors.forEach(e => {
      console.log(`   Fila ${e.row}: ${e.error}`);
    });
  }
  console.log('='.repeat(60));

  return { imported, updated, skipped, errors };
}

async function main() {
  const args = process.argv.slice(2);
  const companyId = args.find(arg => arg.startsWith('--companyId='))?.split('=')[1];
  const dryRun = args.includes('--dry-run');

  if (!companyId) {
    console.error('❌ Error: Debes proporcionar --companyId=<ID>');
    console.error('   Ejemplo: node scripts/import_maintenance_templates.js --companyId=507f1f77bcf86cd799439011 --dry-run');
    process.exit(1);
  }

  if (!mongoose.Types.ObjectId.isValid(companyId)) {
    console.error('❌ Error: companyId inválido');
    process.exit(1);
  }

  const MONGODB_URI = process.env.MONGODB_URI;
  if (!MONGODB_URI) {
    console.error('❌ Error: MONGODB_URI no configurado en .env');
    process.exit(1);
  }

  try {
    await mongoose.connect(MONGODB_URI, { 
      dbName: process.env.MONGODB_DB || 'taller' 
    });
    console.log('✅ Conectado a MongoDB');

    await importTemplates(companyId, dryRun);

    await mongoose.disconnect();
    console.log('\n✅ Proceso completado');
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main();

