import mongoose from 'mongoose';

function clean(v) {
  return String(v || '').trim();
}

function validObjectIdOrNull(v) {
  const s = clean(v);
  if (!s || s.toUpperCase() === 'GENERAL') return null;
  return mongoose.Types.ObjectId.isValid(s) ? s : null;
}

/**
 * Parse QR payload generado por inventario.
 *
 * Soporta:
 * - IT:<companyId>:<itemId>:<sku>:<supplierId>:<investorId>[:<entryId>][:P<purchaseId>]
 * - IT:<companyId>:<itemId>:<sku>
 * - IT:<itemId>
 */
export function parseInventoryQrPayload(payload) {
  const s = clean(payload);
  if (!s.toUpperCase().startsWith('IT:')) return null;

  const parts = s.split(':').map(p => clean(p)).filter(Boolean);

  let itemId = null;
  let sku = null;
  let supplierId = null;
  let investorId = null;
  let entryId = null;
  let purchaseId = null;

  if (parts.length >= 4) {
    // IT:<companyId>:<itemId>:<sku>:...
    itemId = parts[2] || null;
    sku = parts[3] || null;
    supplierId = parts[4] || null;
    investorId = parts[5] || null;
    entryId = parts[6] || null;

    const pPart = parts.find(p => /^P[a-f0-9]{24}$/i.test(p));
    purchaseId = pPart ? pPart.slice(1) : null;
    if (entryId && /^P[a-f0-9]{24}$/i.test(entryId)) entryId = null;
  } else if (parts.length === 2) {
    // IT:<itemId>
    itemId = parts[1] || null;
  } else if (parts.length >= 3) {
    itemId = parts[2] || parts[1] || null;
  }

  return {
    itemId: validObjectIdOrNull(itemId),
    sku: sku ? sku.toUpperCase() : null,
    supplierId: validObjectIdOrNull(supplierId),
    investorId: validObjectIdOrNull(investorId),
    entryId: validObjectIdOrNull(entryId),
    purchaseId: validObjectIdOrNull(purchaseId)
  };
}

