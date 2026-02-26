import mongoose from 'mongoose';

function validObjectIdString(v) {
  const s = v == null ? '' : String(v).trim();
  return s && mongoose.Types.ObjectId.isValid(s) ? s : null;
}

/**
 * Decide el orden de StockEntries a descontar para un SaleItem.
 *
 * Reglas:
 * - Si viene `meta.entryId` válido: se debe descontar primero de esa entrada (si existe en la lista).
 * - Si viene `meta.investorId` y/o `meta.supplierId`: priorizar coincidencias exactas (sin perder FIFO dentro del grupo).
 * - Si NO viene meta de QR: NO reordenar (FIFO puro) para no asignar stock a un inversor incorrecto.
 */
export function orderStockEntriesForSaleItem(stockEntries, meta) {
  const entries = Array.isArray(stockEntries) ? stockEntries.slice() : [];

  const qrEntryId = validObjectIdString(meta?.entryId);
  const qrInvestorId = validObjectIdString(meta?.investorId);
  const qrSupplierId = validObjectIdString(meta?.supplierId);

  const hasQrHints = !!(qrEntryId || qrInvestorId || qrSupplierId);
  if (!entries.length || !hasQrHints) {
    return { preferred: null, ordered: entries };
  }

  const preferred = qrEntryId ? entries.find(e => String(e?._id) === qrEntryId) : null;

  // Si hay hints por inversor/proveedor, ordenar por score + FIFO.
  let ordered = entries;
  if (qrInvestorId || qrSupplierId) {
    const score = (e) => {
      let s = 0;
      if (qrInvestorId && e?.investorId && String(e.investorId) === qrInvestorId) s += 2;
      if (qrSupplierId && e?.supplierId && String(e.supplierId) === qrSupplierId) s += 1;
      return s;
    };

    ordered = entries
      .map((e, idx) => ({ e, idx, s: score(e) }))
      .sort((a, b) => {
        // Primero score descendente
        if (b.s !== a.s) return b.s - a.s;
        // Luego FIFO por entryDate
        const ad = a.e?.entryDate ? new Date(a.e.entryDate).getTime() : 0;
        const bd = b.e?.entryDate ? new Date(b.e.entryDate).getTime() : 0;
        if (ad !== bd) return ad - bd;
        // Estabilidad final
        return a.idx - b.idx;
      })
      .map(x => x.e);
  }

  return { preferred, ordered };
}

