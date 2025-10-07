import mongoose from 'mongoose';

export const asNumber = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

export const normalizeString = (value) => (typeof value === 'string' ? value.trim() : String(value ?? '').trim());

export const toUpper = (value) => normalizeString(value).toUpperCase();

export function computeSaleTotals(saleDoc) {
  if (!saleDoc) return { subtotal: 0, tax: 0, total: 0 };
  const items = Array.isArray(saleDoc.items) ? saleDoc.items : [];
  const subtotal = items.reduce((acc, item) => acc + asNumber(item.total), 0);
  saleDoc.subtotal = Math.round(subtotal);
  saleDoc.tax = asNumber(saleDoc.tax);
  if (!saleDoc.tax) saleDoc.tax = 0;
  saleDoc.total = Math.round(saleDoc.subtotal + saleDoc.tax);
  return { subtotal: saleDoc.subtotal, tax: saleDoc.tax, total: saleDoc.total };
}

export function toObjectId(id) {
  if (!id) return null;
  if (id instanceof mongoose.Types.ObjectId) return id;
  const value = normalizeString(id);
  return mongoose.Types.ObjectId.isValid(value) ? new mongoose.Types.ObjectId(value) : null;
}

export function sanitizePaymentMethods(rawMethods = [], expectedTotal = null) {
  const cleaned = rawMethods
    .map((entry) => ({
      method: toUpper(entry?.method || ''),
      amount: asNumber(entry?.amount),
      accountId: toObjectId(entry?.accountId)
    }))
    .filter((entry) => entry.method && entry.amount > 0);

  if (!cleaned.length) return [];

  const amountSum = cleaned.reduce((acc, entry) => acc + entry.amount, 0);
  if (expectedTotal != null) {
    const total = asNumber(expectedTotal);
    if (total > 0 && Math.abs(amountSum - total) > 0.5) {
      throw new Error('La suma de los montos de pago no coincide con el total de la venta');
    }
  }

  return cleaned.map((entry) => ({
    method: entry.method,
    amount: Math.round(entry.amount),
    accountId: entry.accountId || undefined
  }));
}
