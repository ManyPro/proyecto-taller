/**
 * Script para limpiar técnicos corruptos de la base de datos
 * Elimina técnicos con nombres vacíos, null, o "Sin nombre"
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Cargar variables de entorno
dotenv.config({ path: join(__dirname, '../.env') });

// Importar modelo
const CompanySchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  technicians: {
    type: [{
      name: { type: String, required: true, trim: true },
      identification: { type: String, default: '', trim: true },
      basicSalary: { type: Number, default: null },
      workHoursPerMonth: { type: Number, default: null },
      basicSalaryPerDay: { type: Number, default: null },
      contractType: { type: String, default: '', trim: true }
    }],
    default: []
  }
}, { timestamps: true });

const Company = mongoose.model('Company', CompanySchema);

async function cleanCorruptTechnicians() {
  try {
    console.log('🔌 Conectando a MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/taller');
    console.log('✅ Conectado a MongoDB\n');

    // Buscar todas las compañías
    const companies = await Company.find({});
    console.log(`📊 Encontradas ${companies.length} compañías\n`);

    let totalCleaned = 0;
    let totalCompaniesAffected = 0;

    for (const company of companies) {
      if (!company.technicians || company.technicians.length === 0) {
        continue;
      }

      const originalCount = company.technicians.length;
      const corruptTechnicians = [];
      const validTechnicians = [];

      // Identificar técnicos corruptos
      for (const tech of company.technicians) {
        let techName = '';
        
        // Extraer nombre de forma segura
        if (typeof tech === 'string') {
          techName = tech.trim();
        } else if (tech && typeof tech === 'object') {
          // Si tiene propiedad name
          if (tech.name !== undefined && tech.name !== null) {
            if (typeof tech.name === 'string') {
              techName = tech.name.trim();
            } else if (typeof tech.name === 'object') {
              // String indexado (corrupto)
              try {
                const nameKeys = Object.keys(tech.name);
                if (nameKeys.length > 0 && nameKeys.every(k => /^\d+$/.test(k))) {
                  techName = Object.values(tech.name).join('').trim();
                } else {
                  techName = String(tech.name).trim();
                }
              } catch (e) {
                techName = '';
              }
            } else {
              techName = String(tech.name).trim();
            }
          } else {
            // Si no tiene name pero tiene claves numéricas, es un string antiguo corrupto
            const keys = Object.keys(tech);
            if (keys.length > 0 && keys.every(k => /^\d+$/.test(k))) {
              try {
                techName = Object.values(tech).join('').trim();
              } catch (e) {
                techName = '';
              }
            }
          }
        }

        // Considerar corrupto si:
        // - Nombre vacío
        // - Nombre es "Sin nombre" o "SIN NOMBRE"
        // - Nombre es solo espacios
        const normalizedName = techName.toUpperCase().trim();
        const isCorrupt = !techName || 
                         normalizedName === 'SIN NOMBRE' || 
                         normalizedName === '' ||
                         techName.length === 0;

        if (isCorrupt) {
          corruptTechnicians.push({
            original: tech,
            extractedName: techName || '(vacío)'
          });
        } else {
          // Normalizar técnico válido
          validTechnicians.push({
            name: techName,
            identification: (tech && typeof tech === 'object' && tech.identification) ? String(tech.identification).trim() : '',
            basicSalary: (tech && typeof tech === 'object' && tech.basicSalary !== undefined && tech.basicSalary !== null) ? Number(tech.basicSalary) : null,
            workHoursPerMonth: (tech && typeof tech === 'object' && tech.workHoursPerMonth !== undefined && tech.workHoursPerMonth !== null) ? Number(tech.workHoursPerMonth) : null,
            basicSalaryPerDay: (tech && typeof tech === 'object' && tech.basicSalaryPerDay !== undefined && tech.basicSalaryPerDay !== null) ? Number(tech.basicSalaryPerDay) : null,
            contractType: (tech && typeof tech === 'object' && tech.contractType) ? String(tech.contractType).trim() : ''
          });
        }
      }

      if (corruptTechnicians.length > 0) {
        console.log(`\n🏢 Compañía: ${company.name} (${company._id})`);
        console.log(`   Técnicos totales: ${originalCount}`);
        console.log(`   Técnicos corruptos encontrados: ${corruptTechnicians.length}`);
        console.log(`   Técnicos válidos: ${validTechnicians.length}`);
        
        corruptTechnicians.forEach((corrupt, idx) => {
          console.log(`   ❌ Corrupto ${idx + 1}: "${corrupt.extractedName}"`);
        });

        // Actualizar compañía con solo técnicos válidos
        company.technicians = validTechnicians;
        await company.save();

        console.log(`   ✅ Limpiado: ${corruptTechnicians.length} técnicos corruptos eliminados`);
        totalCleaned += corruptTechnicians.length;
        totalCompaniesAffected++;
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('📊 RESUMEN:');
    console.log(`   Compañías afectadas: ${totalCompaniesAffected}`);
    console.log(`   Técnicos corruptos eliminados: ${totalCleaned}`);
    console.log('='.repeat(60));

    // También limpiar asignaciones huérfanas
    console.log('\n🧹 Limpiando asignaciones de técnicos eliminados...');
    const { default: TechnicianAssignment } = await import('../src/models/TechnicianAssignment.js');
    
    // Buscar asignaciones con nombres vacíos o "Sin nombre"
    const orphanAssignments = await TechnicianAssignment.find({
      $or: [
        { technicianName: { $in: ['', 'SIN NOMBRE', 'Sin nombre'] } },
        { technicianName: { $exists: false } },
        { technicianName: null }
      ]
    });

    if (orphanAssignments.length > 0) {
      console.log(`   Encontradas ${orphanAssignments.length} asignaciones huérfanas`);
      const deleteResult = await TechnicianAssignment.deleteMany({
        $or: [
          { technicianName: { $in: ['', 'SIN NOMBRE', 'Sin nombre'] } },
          { technicianName: { $exists: false } },
          { technicianName: null }
        ]
      });
      console.log(`   ✅ Eliminadas ${deleteResult.deletedCount} asignaciones huérfanas`);
    } else {
      console.log('   ✅ No se encontraron asignaciones huérfanas');
    }

    console.log('\n✅ Limpieza completada exitosamente');

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Desconectado de MongoDB');
  }
}

// Ejecutar
cleanCorruptTechnicians();

