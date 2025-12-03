import mongoose from 'mongoose';
import { connectDB } from '../src/db.js';
import Sale from '../src/models/Sale.js';
import Company from '../src/models/Company.js';

const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://giovannymanriquelol_db_user:XfOvU9NYHxoNgKAl@cluster0.gs3ajdl.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';

/**
 * Función para calcular totales de una venta
 * CRÍTICO: No sumar items que son parte de un combo (SKU empieza con "CP-")
 * Estos items ya están incluidos en el precio del combo
 */
function computeTotals(sale) {
  const subtotal = (sale.items || []).reduce((a, it) => {
    const sku = String(it.sku || '').toUpperCase();
    const total = Number(it.total) || 0;
    
    // Si el SKU empieza con "CP-", es un item anidado de un combo - NO sumarlo
    // El precio del combo ya incluye estos items
    if (sku.startsWith('CP-')) {
      return a; // No sumar items anidados de combos
    }
    
    // Sumar todos los demás items (combos, servicios, productos independientes)
    return a + total;
  }, 0);
  
  sale.subtotal = Math.round(subtotal);
  sale.tax = 0; // ajustar si aplicas IVA
  sale.total = Math.round(sale.subtotal + sale.tax);
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
    });
    
    console.log(`✅ Encontradas ${sales.length} ventas\n`);
    
    if (sales.length === 0) {
      console.log('ℹ️  No hay ventas para procesar');
      process.exit(0);
    }
    
    const dryRun = process.env.DRY_RUN !== 'false';
    
    if (dryRun) {
      console.log('🔍 MODO DRY RUN - No se realizarán cambios\n');
    } else {
      console.log('⚠️  MODO EJECUCIÓN - Se recalcularán totales en la base de datos\n');
    }
    
    let totalUpdated = 0;
    let totalChanged = 0;
    
    console.log('🔄 Recalculando totales de todas las ventas...\n');
    
    for (const sale of sales) {
      const beforeTotal = sale.total || 0;
      const beforeSubtotal = sale.subtotal || 0;
      
      // Recalcular totales
      computeTotals(sale);
      
      const afterTotal = sale.total || 0;
      const afterSubtotal = sale.subtotal || 0;
      
      if (beforeTotal !== afterTotal || beforeSubtotal !== afterSubtotal) {
        totalChanged++;
        console.log(`✅ Venta #${sale.number || 'N/A'} (${sale._id}):`);
        console.log(`   - Subtotal antes: $${beforeSubtotal.toLocaleString()}`);
        console.log(`   - Subtotal después: $${afterSubtotal.toLocaleString()}`);
        console.log(`   - Total antes: $${beforeTotal.toLocaleString()}`);
        console.log(`   - Total después: $${afterTotal.toLocaleString()}`);
        
        if (!dryRun) {
          await sale.save();
          console.log(`   ✅ Guardado en BD`);
        } else {
          console.log(`   🔍 (DRY RUN - no guardado)`);
        }
        console.log('');
      }
      
      totalUpdated++;
    }
    
    console.log('\n📊 Resumen final:');
    console.log(`   - Ventas procesadas: ${totalUpdated}`);
    console.log(`   - Ventas con totales corregidos: ${totalChanged}`);
    
    if (dryRun) {
      console.log('\n⚠️  Este fue un DRY RUN. Para aplicar los cambios, ejecuta:');
      console.log('   DRY_RUN=false node Backend/scripts/recalculate_totals.js');
    } else {
      console.log('\n✅ Recalculación completada');
    }
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

// Ejecutar
main();

