/**
 * Script para eliminar TODAS las plantillas existentes
 * Uso: node Backend/scripts/delete_all_templates.js
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Cargar variables de entorno
dotenv.config({ path: join(__dirname, '../.env') });

// Importar modelo de Template
const TemplateSchema = new mongoose.Schema({
  companyId: { type: String, required: true, index: true },
  type: { type: String, required: true },
  name: { type: String, required: true },
  contentHtml: { type: String, default: '' },
  contentCss: { type: String, default: '' },
  active: { type: Boolean, default: false },
  version: { type: Number, default: 1 },
  updatedAt: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now }
}, { collection: 'templates' });

const Template = mongoose.model('Template', TemplateSchema);

async function deleteAllTemplates() {
  try {
    const uri = process.env.MONGODB_URI || process.env.MONGO;
    if (!uri) {
      console.error('❌ MONGODB_URI no configurado');
      process.exit(1);
    }

    console.log('🔌 Conectando a MongoDB...');
    await mongoose.connect(uri, { dbName: process.env.MONGODB_DB || 'taller' });
    console.log('✅ Conectado a MongoDB');

    // Contar plantillas antes de eliminar
    const countBefore = await Template.countDocuments({});
    console.log(`📊 Plantillas encontradas: ${countBefore}`);

    if (countBefore === 0) {
      console.log('✅ No hay plantillas para eliminar');
      await mongoose.disconnect();
      return;
    }

    // Eliminar TODAS las plantillas
    const result = await Template.deleteMany({});
    console.log(`🗑️  Eliminadas ${result.deletedCount} plantillas`);

    // Verificar que se eliminaron todas
    const countAfter = await Template.countDocuments({});
    console.log(`📊 Plantillas restantes: ${countAfter}`);

    if (countAfter === 0) {
      console.log('✅ Todas las plantillas fueron eliminadas exitosamente');
    } else {
      console.warn(`⚠️  Aún quedan ${countAfter} plantillas`);
    }

    await mongoose.disconnect();
    console.log('✅ Desconectado de MongoDB');
    process.exit(0);

  } catch (error) {
    console.error('❌ Error:', error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

// Ejecutar
deleteAllTemplates();

