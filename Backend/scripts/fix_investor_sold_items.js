/**
 * Script: Diagnóstico y reparación de items vendidos no cobrados al inversor (ej. Sandra).
 *
 * Problema: Ventas 913 y 917 (y otros) pueden haber usado StockEntries del inversor
 * pero no se crearon o actualizaron InvestmentItems con status 'sold', por lo que
 * no aparecen en "Items Vendidos" / "Cobrar Items".
 *
 * Uso:
 *   MONGODB_URI="mongodb+srv://..." node Backend/scripts/fix_investor_sold_items.js
 *   MONGODB_URI="..." node Backend/scripts/fix_investor_sold_items.js --fix
 *   MONGODB_URI="..." node Backend/scripts/fix_investor_sold_items.js --investor "Sandra" --sales 913,917 --fix
 *
 * Opciones:
 *   --investor "Nombre"  Inversor por nombre (default: Sandra)
 *   --sales 913,917     Números de venta a revisar (default: 913,917)
 *   --fix               Aplicar reparación: crear InvestmentItems 'sold' faltantes
 *   --companyId id      Filtrar por empresa (opcional; si no se pasa, se usa Casa Renault)
 *   --sku CALTA14      Diagnóstico/arreglo por SKU (ej. cuando "Del Inversor" > Stock Total)
 *
 * Prevención (ya aplicada en el backend): al cerrar una venta, si se descuenta stock
 * de un StockEntry con inversor y no existían (suficientes) InvestmentItems, se crean
 * automáticamente como 'sold' para que aparezcan por cobrar. Se recomienda escanear
 * el QR del item/inversor al vender stock de un inversor.
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI;
const DB_NAME = process.env.MONGODB_DB || 'taller';

function parseArgs() {
  const args = process.argv.slice(2);
  let investorName = 'Sandra';
  let saleNumbers = [913, 917];
  let fix = false;
  let companyId = null;
  let sku = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--investor' && args[i + 1]) {
      investorName = args[++i];
    } else if (args[i] === '--sales' && args[i + 1]) {
      saleNumbers = args[++i].split(',').map(s => parseInt(s.trim(), 10)).filter(Boolean);
    } else if (args[i] === '--fix') {
      fix = true;
    } else if (args[i] === '--companyId' && args[i + 1]) {
      companyId = args[++i].trim();
    } else if (args[i] === '--sku' && args[i + 1]) {
      sku = args[++i].trim().toUpperCase();
    }
  }
  return { investorName, saleNumbers, fix, companyId, sku };
}

async function main() {
  if (!MONGODB_URI) {
    console.error('❌ Definir MONGODB_URI (o MONGO_URI) en el entorno.');
    process.exit(1);
  }

  const { investorName, saleNumbers, fix, companyId: argCompanyId, sku: skuArg } = parseArgs();

  await mongoose.connect(MONGODB_URI, { dbName: DB_NAME });
  console.log('✅ Conectado a MongoDB\n');

  const Company = (await import('../src/models/Company.js')).default;
  const Investor = (await import('../src/models/Investor.js')).default;
  const Sale = (await import('../src/models/Sale.js')).default;
  const StockEntry = (await import('../src/models/StockEntry.js')).default;
  const InvestmentItem = (await import('../src/models/InvestmentItem.js')).default;
  const Item = (await import('../src/models/Item.js')).default;
  const Purchase = (await import('../src/models/Purchase.js')).default;
  const StockMove = (await import('../src/models/StockMove.js')).default;

  let companyId = argCompanyId;
  if (!companyId) {
    const company = await Company.findOne({ name: { $regex: /casa\s*renault/i } }).lean();
    if (!company) {
      const first = await Company.findOne({}).lean();
      if (first) {
        companyId = String(first._id);
        console.log(`⚠️ No se encontró "Casa Renault"; usando primera empresa: ${first.name || companyId} (${companyId})\n`);
      } else {
        console.error('❌ No hay ninguna empresa en la BD.');
        await mongoose.disconnect();
        process.exit(1);
      }
    } else {
      companyId = String(company._id);
      console.log(`🏢 Empresa: ${company.name} (${companyId})\n`);
    }
  }

  const investor = await Investor.findOne({
    companyId: new mongoose.Types.ObjectId(companyId),
    active: true,
    name: { $regex: new RegExp(investorName.replace(/\s+/g, '\\s+'), 'i') }
  }).lean();
  if (!investor) {
    const all = await Investor.find({ companyId: new mongoose.Types.ObjectId(companyId), active: true }).select('name _id').lean();
    console.error(`❌ No se encontró inversor con nombre similar a "${investorName}".`);
    if (all.length) console.error('   Inversores en esta empresa:', all.map(i => `"${i.name}" (${i._id})`).join(', '));
    await mongoose.disconnect();
    process.exit(1);
  }
  const investorIdStr = String(investor._id);
  console.log(`💰 Inversor: ${investor.name} (${investorIdStr})\n`);

  const sales = await Sale.find({
    companyId: companyId,
    number: { $in: saleNumbers },
    status: 'closed'
  }).lean();
  if (sales.length === 0) {
    console.log(`⚠️ No se encontraron ventas cerradas con número ${saleNumbers.join(', ')}.`);
  } else {
    console.log(`📋 Ventas encontradas: ${sales.map(s => `#${s.number}`).join(', ')}\n`);
  }

  const inconsistencies = [];
  const entryIdsBySale = new Map();

  for (const sale of sales) {
    const saleIdStr = String(sale._id);
    const entriesUsed = [];
    for (const it of sale.items || []) {
      if (it.source !== 'inventory') continue;
      const meta = it.meta || {};
      const list = meta.entriesUsed || (meta.entryId ? [{ entryId: meta.entryId, qty: it.qty || 1 }] : []);
      for (const u of list) {
        const eid = u.entryId ? String(u.entryId) : null;
        if (eid) entriesUsed.push({ entryId: eid, qty: u.qty || it.qty || 1, sku: it.sku, name: it.name });
      }
    }
    entryIdsBySale.set(saleIdStr, entriesUsed);

    const entryIds = [...new Set(entriesUsed.map(e => e.entryId))];
    if (entryIds.length === 0) continue;

    const entries = await StockEntry.find({
      _id: { $in: entryIds.map(id => new mongoose.Types.ObjectId(id)) },
      companyId: companyId
    }).lean();

    for (const ent of entries) {
      const eidStr = String(ent._id);
      if (String(ent.investorId) !== investorIdStr) continue;
      const qtyUsed = entriesUsed.filter(e => e.entryId === eidStr).reduce((sum, e) => sum + (e.qty || 0), 0);
      if (qtyUsed <= 0) continue;

      const soldInv = await InvestmentItem.find({
        companyId: companyId,
        stockEntryId: ent._id,
        status: 'sold',
        saleId: sale._id
      }).lean();
      const soldQty = soldInv.reduce((s, i) => s + (i.qty || 0), 0);
      if (soldQty >= qtyUsed) continue;

      inconsistencies.push({
        saleNumber: sale.number,
        saleId: saleIdStr,
        stockEntryId: eidStr,
        itemId: String(ent.itemId),
        qtyUsed,
        soldQty,
        missing: qtyUsed - soldQty,
        entryPrice: ent.entryPrice,
        purchaseId: ent.purchaseId ? String(ent.purchaseId) : null,
        sku: entriesUsed.find(e => e.entryId === eidStr)?.sku,
        name: entriesUsed.find(e => e.entryId === eidStr)?.name
      });
    }
  }

  console.log('--- Diagnóstico: items del inversor usados en ventas sin InvestmentItem sold ---\n');
  if (inconsistencies.length === 0) {
    console.log('✅ No se detectaron inconsistencias en las ventas indicadas (todo tiene InvestmentItem sold).');
  } else {
    for (const inc of inconsistencies) {
      console.log(`Venta #${inc.saleNumber} (saleId: ${inc.saleId}):`);
      console.log(`  StockEntry ${inc.stockEntryId} | item ${inc.sku || inc.name || inc.itemId} | usado: ${inc.qtyUsed} | ya sold: ${inc.soldQty} | faltante: ${inc.missing}`);
      console.log(`  entryPrice: ${inc.entryPrice ?? 'N/A'} | purchaseId: ${inc.purchaseId ?? 'N/A'}\n`);
    }
  }

  const itemBySku = await Item.findOne({ companyId: companyId, sku: skuArg ? new RegExp('^' + skuArg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i') : /CALTA|CABLES DE ALTA/i }).lean();
  const skuItemId = itemBySku ? String(itemBySku._id) : null;
  if (skuItemId) {
    const skuLabel = skuArg || 'CABLES DE ALTA';
    console.log(`--- Revisión por SKU: ${itemBySku.sku} (${itemBySku.name || 'N/A'}) ---\n`);
    const invAll = await InvestmentItem.find({
      companyId: companyId,
      investorId: new mongoose.Types.ObjectId(investorIdStr),
      itemId: new mongoose.Types.ObjectId(skuItemId)
    }).lean();
    const sumAvailable = invAll.filter(i => i.status === 'available').reduce((s, i) => s + (i.qty || 0), 0);
    const sumSold = invAll.filter(i => i.status === 'sold').reduce((s, i) => s + (i.qty || 0), 0);
    const sumPaid = invAll.filter(i => i.status === 'paid').reduce((s, i) => s + (i.qty || 0), 0);
    const itemStock = itemBySku.stock ?? 0;
    console.log(`  Item.stock (Stock Total): ${itemStock}`);
    console.log(`  Del Inversor - available: ${sumAvailable}, sold: ${sumSold}, paid: ${sumPaid}`);
    const gap = sumAvailable - itemStock;
    if (gap > 0) {
      console.log(`  ⚠️ Discrepancia: ${gap} unidad(es) figuran "available" pero ya no están en stock (vendidas sin marcar sold).`);
      if (fix) {
        const outMoves = await StockMove.find({
          companyId: companyId,
          itemId: new mongoose.Types.ObjectId(skuItemId),
          reason: 'OUT',
          'meta.saleId': { $exists: true, $ne: null }
        }).sort({ createdAt: -1 }).limit(10).lean();
        const saleIdFromMove = outMoves[0]?.meta?.saleId ? String(outMoves[0].meta.saleId) : null;
        const invAvailableList = await InvestmentItem.find({
          companyId: companyId,
          investorId: new mongoose.Types.ObjectId(investorIdStr),
          itemId: new mongoose.Types.ObjectId(skuItemId),
          status: 'available',
          qty: { $gt: 0 }
        }).sort({ createdAt: 1 }).lean();
        let toMark = gap;
        const saleForLink = saleIdFromMove ? await Sale.findOne({ _id: saleIdFromMove, companyId: companyId }).select('_id number').lean() : null;
        const saleIdToUse = saleForLink ? String(saleForLink._id) : null;
        if (saleIdToUse) {
          for (const inv of invAvailableList) {
            if (toMark <= 0) break;
            const q = Math.min(toMark, inv.qty || 0);
            if (q <= 0) continue;
            if (q >= (inv.qty || 0)) {
              inv.status = 'sold';
              inv.saleId = new mongoose.Types.ObjectId(saleIdToUse);
              inv.soldAt = new Date();
              await InvestmentItem.updateOne({ _id: inv._id }, { $set: { status: 'sold', saleId: inv.saleId, soldAt: inv.soldAt } });
            } else {
              await InvestmentItem.updateOne({ _id: inv._id }, { $inc: { qty: -q } });
              await InvestmentItem.create({
                companyId: new mongoose.Types.ObjectId(companyId),
                investorId: inv.investorId,
                purchaseId: inv.purchaseId || null,
                itemId: inv.itemId,
                stockEntryId: inv.stockEntryId,
                purchasePrice: inv.purchasePrice || 0,
                qty: q,
                status: 'sold',
                saleId: new mongoose.Types.ObjectId(saleIdToUse),
                soldAt: new Date()
              });
            }
            toMark -= q;
            console.log(`  ✅ Marcado ${q} ud(s) como vendido → venta #${saleForLink?.number || saleIdToUse}`);
          }
          if (toMark > 0) console.log(`  ⚠️ Faltan ${toMark} ud(s) por asignar a una venta (no había saleId en StockMoves recientes).`);
        } else {
          console.log(`  ⚠️ No se encontró venta en movimientos OUT recientes; ejecuta con --sales <números> para vincular manualmente.`);
        }
      }
    } else {
      console.log(`  ✅ Coincide: available (${sumAvailable}) <= stock (${itemStock}).`);
    }
    const entriesCables = await StockEntry.find({
      companyId: companyId,
      itemId: new mongoose.Types.ObjectId(skuItemId),
      investorId: new mongoose.Types.ObjectId(investorIdStr)
    }).lean();
    if (entriesCables.length) {
      console.log(`  StockEntries del inversor: ${entriesCables.length}`);
      for (const se of entriesCables) {
        const av = (await InvestmentItem.find({ companyId: companyId, stockEntryId: se._id, status: 'available' }).lean()).reduce((s, i) => s + (i.qty || 0), 0);
        const so = (await InvestmentItem.find({ companyId: companyId, stockEntryId: se._id, status: 'sold' }).lean()).reduce((s, i) => s + (i.qty || 0), 0);
        console.log(`    ${se._id}: qty=${se.qty}, inv available=${av}, sold=${so}`);
      }
    }
    console.log('');
  }

  const otherInvestors = await Investor.find({
    companyId: companyId,
    active: true,
    _id: { $ne: investor._id }
  }).select('_id name').lean();
  console.log('\n--- Otros inversores (revisar con --investor "Nombre" si aplica) ---');
  console.log(otherInvestors.map(i => `  ${i.name} (${i._id})`).join('\n') || '  (ninguno)');

  if (fix && inconsistencies.length > 0) {
    console.log('\n--- Aplicando reparación (crear InvestmentItems sold faltantes) ---\n');
    for (const inc of inconsistencies) {
      const ent = await StockEntry.findOne({
        _id: inc.stockEntryId,
        companyId: companyId
      }).lean();
      if (!ent) {
        console.log(`  ⚠️ StockEntry ${inc.stockEntryId} no encontrado, se omite.`);
        continue;
      }
      let purchaseId = ent.purchaseId ? String(ent.purchaseId) : null;
      if (purchaseId) {
        const purchase = await Purchase.findOne({ _id: purchaseId, companyId }).select('investorId').lean();
        if (!purchase || String(purchase.investorId) !== investorIdStr) {
          purchaseId = null;
        }
      }
      const purchasePrice = ent.entryPrice ?? 0;
      await InvestmentItem.create({
        companyId: new mongoose.Types.ObjectId(companyId),
        investorId: new mongoose.Types.ObjectId(investorIdStr),
        purchaseId: purchaseId ? new mongoose.Types.ObjectId(purchaseId) : null,
        itemId: new mongoose.Types.ObjectId(inc.itemId),
        stockEntryId: new mongoose.Types.ObjectId(inc.stockEntryId),
        purchasePrice,
        qty: inc.missing,
        status: 'sold',
        saleId: new mongoose.Types.ObjectId(inc.saleId),
        soldAt: new Date()
      });
      console.log(`  ✅ Creado InvestmentItem sold: venta #${inc.saleNumber}, qty ${inc.missing}, item ${inc.sku || inc.itemId}`);
    }
    console.log('\n✅ Reparación aplicada.');
  } else if (fix && inconsistencies.length === 0) {
    console.log('\n✅ Nada que reparar en ventas indicadas.');
  }

  await mongoose.disconnect();
  console.log('\n✅ Desconectado.');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
