/**
 * Script para corregir plantillas de remisión que tienen el formato incorrecto:
 * - Remover condicionales {{#if sale.hasDiscount}} alrededor de DATOS DEL CLIENTE
 * - Asegurar que DESCUENTO esté siempre visible (sin condicional)
 */

import mongoose from 'mongoose';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

// Cargar variables de entorno
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

// Importar modelo
import Template from '../src/models/Template.js';

async function fixRemissionTemplates(companyId = null) {
  try {
    // Conectar a MongoDB
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/taller';
    await mongoose.connect(mongoUri);
    console.log('✅ Conectado a MongoDB');

    const filter = companyId 
      ? { companyId: new mongoose.Types.ObjectId(companyId), type: { $in: ['invoice', 'invoice-factura'] } }
      : { type: { $in: ['invoice', 'invoice-factura'] } };
    
    console.log('\n🔍 Buscando plantillas de remisión/factura...');
    const templates = await Template.find(filter).lean();
    console.log(`📊 Encontradas ${templates.length} plantillas`);
    
    let fixedCount = 0;
    
    for (const template of templates) {
      if (!template.contentHtml) continue;
      
      let html = template.contentHtml;
      let modified = false;
      
      // 1. Remover condicional {{#if sale.hasDiscount}} alrededor de DATOS DEL CLIENTE
      // Buscar patrones como: {{#if sale.hasDiscount}}<tbody>...DATOS DEL CLIENTE...{{/if}}
      const clientDataPattern = /(\{\{#if\s+sale\.hasDiscount\}\}\s*)(<tbody>[\s\S]*?DATOS DEL CLIENTE[\s\S]*?<\/tbody>)(\s*\{\{\/if\}\})/gi;
      if (clientDataPattern.test(html)) {
        html = html.replace(clientDataPattern, '$2');
        modified = true;
        console.log(`  ✅ Removido condicional de DATOS DEL CLIENTE en "${template.name}"`);
      }
      
      // 2. Remover condicional {{#if S.hasDiscount}} alrededor de DATOS DEL CLIENTE
      const clientDataPattern2 = /(\{\{#if\s+S\.hasDiscount\}\}\s*)(<tbody>[\s\S]*?DATOS DEL CLIENTE[\s\S]*?<\/tbody>)(\s*\{\{\/if\}\})/gi;
      if (clientDataPattern2.test(html)) {
        html = html.replace(clientDataPattern2, '$2');
        modified = true;
        console.log(`  ✅ Removido condicional S.hasDiscount de DATOS DEL CLIENTE en "${template.name}"`);
      }
      
      // 3. Asegurar que DESCUENTO no esté dentro de condicional en el tfoot
      // Buscar tfoot y verificar estructura
      const tfootMatch = html.match(/<tfoot>([\s\S]*?)<\/tfoot>/i);
      if (tfootMatch) {
        const tfootContent = tfootMatch[1];
        
        // Si DESCUENTO está dentro de {{#if S.hasDiscount}} o {{#if sale.hasDiscount}}, removerlo
        const discountInConditional = /(\{\{#if\s+(S\.hasDiscount|sale\.hasDiscount)\}\}\s*)(<tr[^>]*>[\s\S]*?DESCUENTO[\s\S]*?<\/tr>)(\s*\{\{\/if\}\})/gi;
        if (discountInConditional.test(tfootContent)) {
          const newTfootContent = tfootContent.replace(discountInConditional, '$3');
          html = html.replace(/<tfoot>([\s\S]*?)<\/tfoot>/i, `<tfoot>${newTfootContent}</tfoot>`);
          modified = true;
          console.log(`  ✅ Removido condicional de DESCUENTO en "${template.name}"`);
        }
      }
      
      if (modified) {
        await Template.updateOne(
          { _id: template._id },
          { $set: { contentHtml: html } }
        );
        fixedCount++;
      }
    }
    
    console.log(`\n✅ Corregidas ${fixedCount} plantillas`);
    
  } catch (error) {
    console.error('❌ Error durante la corrección:', error);
    throw error;
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Desconectado de MongoDB');
  }
}

// Ejecutar si se llama directamente
if (import.meta.url === `file://${process.argv[1]}`) {
  const companyId = process.argv[2] || null;
  fixRemissionTemplates(companyId)
    .then(() => {
      console.log('\n✨ Script completado');
      process.exit(0);
    })
    .catch(err => {
      console.error('\n💥 Error fatal:', err);
      process.exit(1);
    });
}

export { fixRemissionTemplates };
