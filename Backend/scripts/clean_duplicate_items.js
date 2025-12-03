import mongoose from 'mongoose';
import { connectDB } from '../src/db.js';
import Sale from '../src/models/Sale.js';
import Company from '../src/models/Company.js';

const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://giovannymanriquelol_db_user:XfOvU9NYHxoNgKAl@cluster0.gs3ajdl.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';

/**
 * Función para calcular totales de una venta
 */
function computeTotals(sale) {
  const subtotal = (sale.items || []).reduce((a, it) => a + (Number(it.total) || 0), 0);
  sale.subtotal = Math.round(subtotal);
  sale.tax = 0; // ajustar si aplicas IVA
  sale.total = Math.round(sale.subtotal + sale.tax);
}

/**
 * Normaliza SKU removiendo prefijo CP-
 */
function normalizeSku(sku) {
  if (!sku) return '';
  return String(sku).toUpperCase().replace(/^CP-/, '');
}

/**
 * Encuentra items duplicados en una venta
 * Retorna un array de grupos de items duplicados
 */
function findDuplicateItems(items) {
  const duplicates = [];
  const seen = new Map(); // refId -> array de índices
  
  items.forEach((item, index) => {
    if (!item.refId) return; // Solo procesar items con refId
    
    const refIdStr = String(item.refId);
    const normalizedSku = normalizeSku(item.sku);
    
    // Buscar si ya existe un item con el mismo refId
    if (seen.has(refIdStr)) {
      const existingIndices = seen.get(refIdStr);
      existingIndices.push(index);
    } else {
      // También buscar por SKU normalizado si no hay refId pero hay SKU
      let found = false;
      for (const [existingRefId, indices] of seen.entries()) {
        const existingItem = items[indices[0]];
        const existingNormalizedSku = normalizeSku(existingItem.sku);
        
        // Si ambos tienen SKU normalizado igual y mismo refId, son duplicados
        if (normalizedSku && existingNormalizedSku && 
            normalizedSku === existingNormalizedSku &&
            String(existingItem.refId) === refIdStr) {
          indices.push(index);
          found = true;
          break;
        }
      }
      
      if (!found) {
        seen.set(refIdStr, [index]);
      }
    }
  });
  
  // Retornar solo los grupos que tienen más de un item (duplicados)
  for (const [refId, indices] of seen.entries()) {
    if (indices.length > 1) {
      duplicates.push({
        refId,
        indices,
        items: indices.map(idx => items[idx])
      });
    }
  }
  
  return duplicates;
}

/**
 * Limpia items duplicados de una venta
 * Mantiene el item con precio correcto (mayor que 0) o el primero si todos tienen precio 0
 */
function cleanDuplicateItems(sale) {
  if (!sale.items || sale.items.length === 0) {
    return { cleaned: false, removed: 0 };
  }
  
  const duplicates = findDuplicateItems(sale.items);
  
  if (duplicates.length === 0) {
    return { cleaned: false, removed: 0 };
  }
  
  // Crear un Set de índices a eliminar
  const indicesToRemove = new Set();
  let totalRemoved = 0;
  
  duplicates.forEach(dup => {
    const { indices, items } = dup;
    
    // Encontrar el mejor item a mantener
    // Prioridad: 1) precio > 0, 2) SKU con prefijo CP- (si es parte de combo), 3) el primero
    let bestIndex = indices[0];
    let bestItem = items[0];
    
    for (let i = 1; i < items.length; i++) {
      const item = items[i];
      const currentBestPrice = Number(bestItem.unitPrice) || 0;
      const itemPrice = Number(item.unitPrice) || 0;
      
      // Si este item tiene precio y el mejor no, usar este
      if (itemPrice > 0 && currentBestPrice === 0) {
        bestIndex = indices[i];
        bestItem = item;
      }
      // Si ambos tienen precio, usar el que tiene SKU con CP- (parte de combo)
      else if (itemPrice > 0 && currentBestPrice > 0) {
        const itemSku = String(item.sku || '').toUpperCase();
        const bestSku = String(bestItem.sku || '').toUpperCase();
        
        if (itemSku.startsWith('CP-') && !bestSku.startsWith('CP-')) {
          bestIndex = indices[i];
          bestItem = item;
        }
      }
      // Si el mejor tiene precio 0 y este también, mantener el que tiene CP-
      else if (currentBestPrice === 0 && itemPrice === 0) {
        const itemSku = String(item.sku || '').toUpperCase();
        const bestSku = String(bestItem.sku || '').toUpperCase();
        
        if (itemSku.startsWith('CP-') && !bestSku.startsWith('CP-')) {
          bestIndex = indices[i];
          bestItem = item;
        }
      }
    }
    
    // Marcar todos los demás índices para eliminar
    indices.forEach(idx => {
      if (idx !== bestIndex) {
        indicesToRemove.add(idx);
        totalRemoved++;
      }
    });
    
    // Si el mejor item tiene precio 0, intentar actualizarlo con el precio de otro
    if (Number(bestItem.unitPrice) === 0) {
      const itemWithPrice = items.find(it => Number(it.unitPrice) > 0);
      if (itemWithPrice) {
        bestItem.unitPrice = itemWithPrice.unitPrice;
        bestItem.total = Math.round((bestItem.qty || 1) * bestItem.unitPrice);
      }
    }
    
    // Asegurar que el SKU tenga prefijo CP- si es parte de un combo
    const comboItem = sale.items.find(it => 
      it.source === 'price' && 
      it.sku && 
      String(it.sku).toUpperCase().startsWith('COMBO-')
    );
    if (comboItem && bestItem.sku && !String(bestItem.sku).toUpperCase().startsWith('CP-')) {
      bestItem.sku = `CP-${bestItem.sku}`;
    }
  });
  
  // Eliminar items duplicados (en orden descendente para no afectar índices)
  const sortedIndices = Array.from(indicesToRemove).sort((a, b) => b - a);
  sortedIndices.forEach(idx => {
    sale.items.splice(idx, 1);
  });
  
  // Recalcular totales
  computeTotals(sale);
  
  return { cleaned: true, removed: totalRemoved };
}

/**
 * Función principal
 */
async function main() {
  try {
    console.log('🔌 Conectando a MongoDB...');
    await connectDB(MONGO_URI);
    console.log('✅ Conectado a MongoDB\n');
    
    // Buscar empresa "CASA RENAULT"
    console.log('🔍 Buscando empresa "CASA RENAULT"...');
    const company = await Company.findOne({ 
      name: { $regex: /casa\s*renault/i } 
    });
    
    if (!company) {
      console.error('❌ No se encontró la empresa "CASA RENAULT"');
      process.exit(1);
    }
    
    console.log(`✅ Empresa encontrada: ${company.name} (ID: ${company._id})\n`);
    
    // Buscar todas las ventas de esta empresa (incluyendo compartidas)
    const companyIds = [String(company._id)];
    
    // Si la empresa comparte BD, incluir empresas relacionadas
    if (company.sharedDatabaseConfig?.sharedWith?.length > 0) {
      company.sharedDatabaseConfig.sharedWith.forEach(sw => {
        companyIds.push(String(sw.companyId));
      });
    } else if (company.sharedDatabaseConfig?.sharedFrom?.companyId) {
      companyIds.push(String(company.sharedDatabaseConfig.sharedFrom.companyId));
    }
    
    console.log(`🔍 Buscando ventas de la empresa (${companyIds.length} companyId(s))...`);
    const sales = await Sale.find({
      companyId: { $in: companyIds }
    }).lean();
    
    console.log(`✅ Encontradas ${sales.length} ventas\n`);
    
    if (sales.length === 0) {
      console.log('ℹ️  No hay ventas para procesar');
      process.exit(0);
    }
    
    // Procesar cada venta
    let totalCleaned = 0;
    let totalRemoved = 0;
    const salesWithDuplicates = [];
    
    console.log('🔍 Analizando ventas en busca de items duplicados...\n');
    
    for (const sale of sales) {
      const duplicates = findDuplicateItems(sale.items || []);
      
      if (duplicates.length > 0) {
        salesWithDuplicates.push({
          saleId: sale._id,
          saleNumber: sale.number,
          saleName: sale.name,
          duplicates: duplicates.length,
          totalItems: sale.items.length
        });
      }
    }
    
    console.log(`📊 Resumen de análisis:`);
    console.log(`   - Ventas con duplicados: ${salesWithDuplicates.length}`);
    console.log(`   - Total de ventas: ${sales.length}\n`);
    
    if (salesWithDuplicates.length === 0) {
      console.log('✅ No se encontraron items duplicados');
      process.exit(0);
    }
    
    // Mostrar detalles
    console.log('📋 Ventas con duplicados:');
    salesWithDuplicates.forEach(({ saleId, saleNumber, saleName, duplicates, totalItems }) => {
      console.log(`   - Venta #${saleNumber || 'N/A'}: ${saleName || saleId} (${duplicates} grupos de duplicados, ${totalItems} items total)`);
    });
    console.log('');
    
    // Preguntar confirmación
    console.log('⚠️  ¿Deseas proceder con la limpieza? (S/N)');
    console.log('   (Para ejecutar automáticamente, usa: DRY_RUN=false node Backend/scripts/clean_duplicate_items.js)');
    
    const dryRun = process.env.DRY_RUN !== 'false';
    
    if (dryRun) {
      console.log('\n🔍 MODO DRY RUN - No se realizarán cambios\n');
    } else {
      console.log('\n⚠️  MODO EJECUCIÓN - Se realizarán cambios en la base de datos\n');
    }
    
    // Procesar ventas con duplicados
    for (const saleInfo of salesWithDuplicates) {
      const sale = await Sale.findById(saleInfo.saleId);
      
      if (!sale) {
        console.log(`⚠️  Venta ${saleInfo.saleId} no encontrada, saltando...`);
        continue;
      }
      
      const beforeItems = sale.items.length;
      const beforeTotal = sale.total;
      
      const result = cleanDuplicateItems(sale);
      
      if (result.cleaned) {
        totalCleaned++;
        totalRemoved += result.removed;
        
        console.log(`✅ Venta #${sale.number || 'N/A'} (${sale._id}):`);
        console.log(`   - Items antes: ${beforeItems}`);
        console.log(`   - Items después: ${sale.items.length}`);
        console.log(`   - Items eliminados: ${result.removed}`);
        console.log(`   - Total antes: $${beforeTotal?.toLocaleString() || 0}`);
        console.log(`   - Total después: $${sale.total?.toLocaleString() || 0}`);
        
        if (!dryRun) {
          await sale.save();
          console.log(`   ✅ Guardado en BD`);
        } else {
          console.log(`   🔍 (DRY RUN - no guardado)`);
        }
        console.log('');
      }
    }
    
    console.log('\n📊 Resumen final:');
    console.log(`   - Ventas limpiadas: ${totalCleaned}`);
    console.log(`   - Items duplicados eliminados: ${totalRemoved}`);
    
    if (dryRun) {
      console.log('\n⚠️  Este fue un DRY RUN. Para aplicar los cambios, ejecuta:');
      console.log('   DRY_RUN=false node Backend/scripts/clean_duplicate_items.js');
    } else {
      console.log('\n✅ Limpieza completada');
    }
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

// Ejecutar
main();

