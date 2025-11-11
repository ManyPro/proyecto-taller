/**
 * Script para corregir los templates que tienen tablas sin las variables de Handlebars
 * en el <tbody>. Este script agrega las variables {{#each}} y {{#unless}} faltantes.
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Template from '../src/models/Template.js';

dotenv.config();

const correctTbodyForRemission = (html) => {
  if (!html) return html;
  
  // Buscar tbody que tiene las filas pero no tiene {{#each
  if (html.includes('remission-table') || html.includes('items-table')) {
    const tbodyMatch = html.match(/<tbody>([\s\S]*?)<\/tbody>/gi);
    if (tbodyMatch) {
      tbodyMatch.forEach((match) => {
        // Si el tbody tiene las variables de item pero NO tiene {{#each
        if (match.includes('{{name}}') && !match.includes('{{#each sale.items}}')) {
          // Crear el nuevo tbody con las variables correctas
          const newTbody = `<tbody>
          {{#each sale.items}}
          <tr>
            <td>{{#if sku}}[{{sku}}] {{/if}}{{name}}</td>
            <td class="t-center">{{qty}}</td>
            <td class="t-right">{{money unitPrice}}</td>
            <td class="t-right">{{money total}}</td>
          </tr>
          {{/each}}
          {{#unless sale.items}}
          <tr>
            <td colspan="4" style="text-align: center; color: #666;">Sin ítems</td>
          </tr>
          {{/unless}}
        </tbody>`;
          
          // Reemplazar el tbody antiguo con el nuevo
          html = html.replace(match, newTbody);
        }
      });
    }
  }
  
  return html;
};

const correctTbodyForQuote = (html) => {
  if (!html) return html;
  
  if (html.includes('quote-table')) {
    const tbodyMatch = html.match(/<tbody>([\s\S]*?)<\/tbody>/gi);
    if (tbodyMatch) {
      tbodyMatch.forEach((match) => {
        if (match.includes('{{description}}') && !match.includes('{{#each quote.items}}')) {
          const newTbody = `<tbody>
          {{#each quote.items}}
          <tr>
            <td>{{#if sku}}[{{sku}}] {{/if}}{{description}}</td>
            <td class="t-center">{{qty}}</td>
            <td class="t-right">{{money unitPrice}}</td>
            <td class="t-right">{{money subtotal}}</td>
          </tr>
          {{/each}}
          {{#unless quote.items}}
          <tr>
            <td colspan="4" style="text-align: center; color: #666;">Sin ítems</td>
          </tr>
          {{/unless}}
        </tbody>`;
          
          html = html.replace(match, newTbody);
        }
      });
    }
  }
  
  return html;
};

const correctTbodyForWorkOrder = (html) => {
  if (!html) return html;
  
  if (html.includes('workorder-table')) {
    const tbodyMatch = html.match(/<tbody>([\s\S]*?)<\/tbody>/gi);
    if (tbodyMatch) {
      tbodyMatch.forEach((match) => {
        if (match.includes('{{name}}') && !match.includes('{{#each sale.items}}')) {
          const newTbody = `<tbody>
          {{#each sale.items}}
          <tr>
            <td>{{#if sku}}[{{sku}}] {{/if}}{{name}}</td>
            <td class="t-center">{{qty}}</td>
          </tr>
          {{/each}}
          {{#unless sale.items}}
          <tr>
            <td colspan="2" style="text-align: center; color: #666;">Sin ítems</td>
          </tr>
          {{/unless}}
        </tbody>`;
          
          html = html.replace(match, newTbody);
        }
      });
    }
  }
  
  return html;
};

async function fixTemplates() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Conectado a MongoDB');
    
    // Obtener todos los templates
    const templates = await Template.find({});
    console.log(`📋 Encontrados ${templates.length} templates`);
    
    let fixedCount = 0;
    
    for (const template of templates) {
      let needsFix = false;
      let fixedHtml = template.contentHtml || '';
      
      // Verificar y corregir según el tipo
      if (template.type === 'invoice') {
        const tbodyMatch = fixedHtml.match(/<tbody>([\s\S]*?)<\/tbody>/gi);
        if (tbodyMatch) {
          tbodyMatch.forEach((match) => {
            if (match.includes('{{name}}') && !match.includes('{{#each sale.items}}')) {
              needsFix = true;
            }
          });
        }
        if (needsFix) {
          fixedHtml = correctTbodyForRemission(fixedHtml);
        }
      } else if (template.type === 'quote') {
        const tbodyMatch = fixedHtml.match(/<tbody>([\s\S]*?)<\/tbody>/gi);
        if (tbodyMatch) {
          tbodyMatch.forEach((match) => {
            if (match.includes('{{description}}') && !match.includes('{{#each quote.items}}')) {
              needsFix = true;
            }
          });
        }
        if (needsFix) {
          fixedHtml = correctTbodyForQuote(fixedHtml);
        }
      } else if (template.type === 'workOrder') {
        const tbodyMatch = fixedHtml.match(/<tbody>([\s\S]*?)<\/tbody>/gi);
        if (tbodyMatch) {
          tbodyMatch.forEach((match) => {
            if (match.includes('{{name}}') && !match.includes('{{#each sale.items}}')) {
              needsFix = true;
            }
          });
        }
        if (needsFix) {
          fixedHtml = correctTbodyForWorkOrder(fixedHtml);
        }
      }
      
      if (needsFix) {
        template.contentHtml = fixedHtml;
        await template.save();
        fixedCount++;
        console.log(`✅ Corregido template: ${template.name} (${template.type})`);
      }
    }
    
    console.log(`\n✅ Proceso completado. ${fixedCount} templates corregidos de ${templates.length} totales.`);
    
    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

fixTemplates();

