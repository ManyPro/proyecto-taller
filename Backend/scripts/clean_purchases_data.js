/**
 * Script para limpiar datos de compras:
 * 1. Eliminar StockEntries que referencian compras eliminadas
 * 2. Limpiar items en compras que fueron eliminados
 * 3. Sincronizar stock total con las entradas válidas
 */

import mongoose from 'mongoose';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

// Cargar variables de entorno
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

// Importar modelos
import StockEntry from '../src/models/StockEntry.js';
import Purchase from '../src/models/Purchase.js';
import Item from '../src/models/Item.js';
import InvestmentItem from '../src/models/InvestmentItem.js';

async function cleanPurchasesData(companyId = null) {
  try {
    // Conectar a MongoDB
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/taller';
    await mongoose.connect(mongoUri);
    console.log('✅ Conectado a MongoDB');

    const filter = companyId ? { companyId: new mongoose.Types.ObjectId(companyId) } : {};
    
    // 1. Encontrar StockEntries que referencian compras eliminadas
    console.log('\n🔍 Buscando StockEntries con compras eliminadas...');
    const allStockEntries = await StockEntry.find({
      ...filter,
      purchaseId: { $ne: null }
    }).lean();
    
    const validPurchaseIds = new Set();
    const purchases = await Purchase.find(filter).select('_id').lean();
    purchases.forEach(p => validPurchaseIds.add(String(p._id)));
    
    const orphanStockEntries = allStockEntries.filter(se => {
      const purchaseIdStr = String(se.purchaseId);
      return !validPurchaseIds.has(purchaseIdStr);
    });
    
    console.log(`📊 Encontrados ${orphanStockEntries.length} StockEntries con compras eliminadas`);
    
    if (orphanStockEntries.length > 0) {
      // Convertir purchaseId a null para estas entradas (marcarlas como GENERAL)
      const orphanIds = orphanStockEntries.map(se => se._id);
      const updateResult = await StockEntry.updateMany(
        { _id: { $in: orphanIds } },
        { $set: { purchaseId: null } }
      );
      console.log(`✅ Actualizados ${updateResult.modifiedCount} StockEntries (marcados como GENERAL)`);
    }
    
    // 2. Limpiar items en compras que fueron eliminados
    console.log('\n🔍 Limpiando items eliminados de compras...');
    const allPurchases = await Purchase.find(filter).lean();
    let cleanedPurchases = 0;
    let totalItemsRemoved = 0;
    
    for (const purchase of allPurchases) {
      if (!purchase.items || purchase.items.length === 0) continue;
      
      const validItems = [];
      const itemIds = purchase.items
        .map(item => item.itemId)
        .filter(id => id && mongoose.Types.ObjectId.isValid(id));
      
      if (itemIds.length === 0) continue;
      
      const existingItems = await Item.find({
        _id: { $in: itemIds },
        companyId: purchase.companyId
      }).select('_id').lean();
      
      const existingItemIds = new Set(existingItems.map(i => String(i._id)));
      
      for (const item of purchase.items) {
        const itemIdStr = item.itemId ? String(item.itemId) : null;
        if (itemIdStr && existingItemIds.has(itemIdStr)) {
          validItems.push(item);
        } else {
          totalItemsRemoved++;
        }
      }
      
      if (validItems.length !== purchase.items.length) {
        await Purchase.updateOne(
          { _id: purchase._id },
          { $set: { items: validItems } }
        );
        cleanedPurchases++;
      }
    }
    
    console.log(`✅ Limpiadas ${cleanedPurchases} compras, removidos ${totalItemsRemoved} items eliminados`);
    
    // 3. Sincronizar stock total con las entradas válidas
    console.log('\n🔍 Sincronizando stock total con entradas válidas...');
    const allItems = await Item.find(filter).lean();
    let itemsUpdated = 0;
    
    for (const item of allItems) {
      // Obtener todas las entradas válidas (sin compras eliminadas)
      const validStockEntries = await StockEntry.find({
        companyId: item.companyId,
        itemId: item._id,
        qty: { $gt: 0 }
      })
      .populate({
        path: 'purchaseId',
        select: '_id',
        match: { companyId: item.companyId }
      })
      .lean();
      
      // Filtrar entradas con compras eliminadas
      const trulyValidEntries = validStockEntries.filter(se => {
        if (se.purchaseId === null && se.purchaseId !== undefined) {
          return false; // Compra eliminada
        }
        return true;
      });
      
      const calculatedStock = trulyValidEntries.reduce((sum, se) => sum + (se.qty || 0), 0);
      
      if (calculatedStock !== (item.stock || 0)) {
        await Item.updateOne(
          { _id: item._id },
          { $set: { stock: calculatedStock } }
        );
        itemsUpdated++;
        console.log(`  📦 ${item.sku || item.name}: ${item.stock || 0} → ${calculatedStock}`);
      }
    }
    
    console.log(`✅ Actualizado stock en ${itemsUpdated} items`);
    
    // 4. Limpiar InvestmentItems huérfanos
    console.log('\n🔍 Limpiando InvestmentItems huérfanos...');
    const allInvestmentItems = await InvestmentItem.find(filter).lean();
    const validPurchaseIdsSet = new Set(purchases.map(p => String(p._id)));
    const validItemIds = new Set(allItems.map(i => String(i._id)));
    
    let orphanInvestmentItems = 0;
    for (const invItem of allInvestmentItems) {
      let shouldDelete = false;
      
      // Verificar si la compra existe
      if (invItem.purchaseId && !validPurchaseIdsSet.has(String(invItem.purchaseId))) {
        shouldDelete = true;
      }
      
      // Verificar si el item existe
      if (invItem.itemId && !validItemIds.has(String(invItem.itemId))) {
        shouldDelete = true;
      }
      
      if (shouldDelete) {
        await InvestmentItem.deleteOne({ _id: invItem._id });
        orphanInvestmentItems++;
      }
    }
    
    console.log(`✅ Eliminados ${orphanInvestmentItems} InvestmentItems huérfanos`);
    
    console.log('\n✅ Limpieza completada exitosamente!');
    
  } catch (error) {
    console.error('❌ Error durante la limpieza:', error);
    throw error;
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Desconectado de MongoDB');
  }
}

// Ejecutar si se llama directamente
if (import.meta.url === `file://${process.argv[1]}`) {
  const companyId = process.argv[2] || null;
  cleanPurchasesData(companyId)
    .then(() => {
      console.log('\n✨ Script completado');
      process.exit(0);
    })
    .catch(err => {
      console.error('\n💥 Error fatal:', err);
      process.exit(1);
    });
}

export { cleanPurchasesData };
