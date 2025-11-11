/**
 * Script para corregir la sintaxis de Handlebars en los templates guardados
 * Cambia {{#if (hasItems sale.items)}} por {{#each sale.items}} con {{else}}
 */

import mongoose from 'mongoose';
import Template from '../src/models/Template.js';
import dotenv from 'dotenv';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/taller';

async function fixTemplates() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Conectado a MongoDB');

    // Buscar todos los templates que usen la sintaxis antigua
    const templates = await Template.find({
      $or: [
        { contentHtml: { $regex: /{{#if.*hasItems.*sale\.items/ } },
        { contentHtml: { $regex: /{{#if.*hasItems.*quote\.items/ } }
      ]
    });

    console.log(`📋 Encontrados ${templates.length} templates para corregir`);

    let fixed = 0;
    for (const template of templates) {
      let updated = false;
      let newHtml = template.contentHtml;

      // Corregir sintaxis para sale.items (remisiones y órdenes de trabajo)
      // Patrón: {{#if (hasItems sale.items)}} ... {{#each sale.items}} ... {{/each}} ... {{else}} ... {{/if}}
      const saleItemsPattern = /{{#if\s*\(hasItems\s+sale\.items\)}}\s*{{#each\s+sale\.items}}([\s\S]*?){{\/each}}\s*{{else}}([\s\S]*?){{\/if}}/g;
      newHtml = newHtml.replace(saleItemsPattern, (match, itemsContent, elseContent) => {
        updated = true;
        return `{{#each sale.items}}${itemsContent}{{else}}${elseContent}{{/each}}`;
      });

      // Corregir sintaxis para quote.items (cotizaciones)
      const quoteItemsPattern = /{{#if\s*\(hasItems\s+quote\.items\)}}\s*{{#each\s+quote\.items}}([\s\S]*?){{\/each}}\s*{{else}}([\s\S]*?){{\/if}}/g;
      newHtml = newHtml.replace(quoteItemsPattern, (match, itemsContent, elseContent) => {
        updated = true;
        return `{{#each quote.items}}${itemsContent}{{else}}${elseContent}{{/each}}`;
      });

      if (updated) {
        template.contentHtml = newHtml;
        await template.save();
        fixed++;
        console.log(`✅ Corregido template: ${template.name} (${template.type})`);
      }
    }

    console.log(`\n✅ Proceso completado: ${fixed} templates corregidos de ${templates.length}`);
    
    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

fixTemplates();

