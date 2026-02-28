/**
 * Redistribuye InvestmentItems "sold" de un item/inversor: en lugar de tener
 * todas las unidades en una sola venta, asigna 1 unidad a cada venta indicada.
 *
 * Uso: MONGODB_URI="..." node scripts/redistribute_investor_sold_by_sales.js --investor MANY --sku REFAC01 --sales 938,937,936,921
 *
 * Requiere que existan InvestmentItems sold para ese inversor+item y que
 * las ventas existan. Modifica/crea registros para que cada venta tenga 1 unidad.
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI;
const DB_NAME = process.env.MONGODB_DB || 'taller';

async function main() {
  const args = process.argv.slice(2);
  let investorName = 'MANY';
  let sku = 'REFAC01';
  let saleNumbers = [938, 937, 936, 921];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--investor' && args[i + 1]) investorName = args[++i];
    else if (args[i] === '--sku' && args[i + 1]) sku = args[++i].trim().toUpperCase();
    else if (args[i] === '--sales' && args[i + 1]) saleNumbers = args[++i].split(',').map(s => parseInt(s.trim(), 10)).filter(Boolean);
  }

  if (!MONGODB_URI) {
    console.error('Definir MONGODB_URI');
    process.exit(1);
  }

  await mongoose.connect(MONGODB_URI, { dbName: DB_NAME });
  const Company = (await import('../src/models/Company.js')).default;
  const Investor = (await import('../src/models/Investor.js')).default;
  const Sale = (await import('../src/models/Sale.js')).default;
  const Item = (await import('../src/models/Item.js')).default;
  const InvestmentItem = (await import('../src/models/InvestmentItem.js')).default;

  const company = await Company.findOne({ name: { $regex: /casa\s*renault/i } }).lean();
  const companyId = company ? String(company._id) : (await Company.findOne({}).lean())?._id?.toString();
  if (!companyId) {
    console.error('No hay empresa');
    await mongoose.disconnect();
    process.exit(1);
  }

  const investor = await Investor.findOne({
    companyId: new mongoose.Types.ObjectId(companyId),
    active: true,
    name: { $regex: new RegExp(investorName.replace(/\s+/g, '\\s+'), 'i') }
  }).lean();
  if (!investor) {
    console.error('Inversor no encontrado:', investorName);
    await mongoose.disconnect();
    process.exit(1);
  }
  const investorIdStr = String(investor._id);

  const item = await Item.findOne({ companyId: companyId, sku }).lean();
  if (!item) {
    console.error('Item no encontrado:', sku);
    await mongoose.disconnect();
    process.exit(1);
  }
  const itemIdStr = String(item._id);

  const sales = await Sale.find({
    companyId: companyId,
    number: { $in: saleNumbers },
    status: 'closed'
  }).lean();
  if (sales.length !== saleNumbers.length) {
    console.warn('No todas las ventas encontradas. Encontradas:', sales.map(s => s.number));
  }
  const saleIds = sales.map(s => String(s._id));

  const soldItems = await InvestmentItem.find({
    companyId: companyId,
    investorId: new mongoose.Types.ObjectId(investorIdStr),
    itemId: new mongoose.Types.ObjectId(itemIdStr),
    status: 'sold'
  }).lean();

  const totalSold = soldItems.reduce((s, i) => s + (i.qty || 0), 0);
  const targetPerSale = 1;
  const nSales = saleIds.length;

  console.log('Inversor:', investorName, '| Item:', sku, '| Total sold actual:', totalSold, '| Ventas:', nSales, '| Objetivo: 1 por venta');

  if (totalSold < nSales) {
    console.warn('Hay menos unidades sold que ventas; solo se pueden asignar 1 a las primeras', totalSold, 'ventas.');
  }

  const toAssign = Math.min(nSales, totalSold);
  if (toAssign === 0) {
    console.log('Nada que redistribuir.');
    await mongoose.disconnect();
    return;
  }

  const saleIdOrder = saleIds.slice(0, toAssign);
  let remainingToTake = toAssign;
  const sourceItems = [...soldItems].sort((a, b) => String(a.saleId).localeCompare(String(b.saleId)));

  for (let idx = 0; idx < saleIdOrder.length && remainingToTake > 0; idx++) {
    const targetSaleId = saleIdOrder[idx];
    const sale = sales.find(s => String(s._id) === targetSaleId);
    const need = 1;

    let taken = 0;
    for (const source of sourceItems) {
      if (taken >= need || remainingToTake <= 0) break;
      const have = source.qty || 0;
      if (have <= 0) continue;
      const q = Math.min(need - taken, have, remainingToTake);
      if (q <= 0) continue;

      if (String(source.saleId) === targetSaleId && have === q) {
        taken += q;
        remainingToTake -= q;
        continue;
      }
      if (have === q) {
        await InvestmentItem.updateOne(
          { _id: source._id },
          { $set: { saleId: new mongoose.Types.ObjectId(targetSaleId), soldAt: new Date() } }
        );
        source.qty = 0;
      } else {
        await InvestmentItem.updateOne({ _id: source._id }, { $inc: { qty: -q } });
        await InvestmentItem.create({
          companyId: source.companyId,
          investorId: source.investorId,
          purchaseId: source.purchaseId || null,
          itemId: source.itemId,
          stockEntryId: source.stockEntryId,
          purchasePrice: source.purchasePrice || 0,
          qty: q,
          status: 'sold',
          saleId: new mongoose.Types.ObjectId(targetSaleId),
          soldAt: new Date()
        });
        source.qty = (source.qty || 0) - q;
      }
      taken += q;
      remainingToTake -= q;
    }
    if (taken > 0) console.log('  Venta #' + (sale?.number || targetSaleId) + ':', taken, 'ud');
  }

  console.log('Listo. 1 unidad por venta en', saleIdOrder.length, 'ventas.');
  await mongoose.disconnect();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
