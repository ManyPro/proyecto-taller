import CustomerProfile from '../models/CustomerProfile.js';
import CustomerProfileHistory from '../models/CustomerProfileHistory.js';
import Quote from '../models/Quote.js';
import Sale from '../models/Sale.js';
import { upsertProfileFromSource } from './profile.helper.js';

export async function rebuildProfiles(req, res) {
  const companyId = req.companyId || req.company?.id;
  if (!companyId) return res.status(400).json({ error: 'Falta companyId' });
  const { mode = 'append', overwrite = 'false', limit } = req.query || {};
  const doOverwrite = String(overwrite).toLowerCase() === 'true';

  const q = { companyId };
  const quotes = await Quote.find(q).limit(limit ? parseInt(limit, 10) : 50000);
  const sales = await Sale.find(q).limit(limit ? parseInt(limit, 10) : 50000);

  if (mode === 'replace') {
    await CustomerProfile.deleteMany({ companyId });
  }

  let processed = 0, created = 0, updated = 0;
  for (const doc of [...quotes, ...sales]) {
    const result = await upsertProfileFromSource(companyId, { customer: doc.customer, vehicle: doc.vehicle }, {
      source: 'rebuild',
      overwriteCustomer: doOverwrite,
      overwriteVehicle: doOverwrite,
      overwriteMileage: doOverwrite,
      overwriteYear: doOverwrite
    });
    processed++;
    if (result?.action === 'created') created++; else if (result?.action === 'updated') updated++;
  }

  res.json({ processed, created, updated });
}

export async function listProfileHistory(req, res) {
  const companyId = req.companyId || req.company?.id;
  if (!companyId) return res.status(400).json({ error: 'Falta companyId' });
  const { plate, page = 1, pageSize = 25 } = req.query || {};
  const q = { companyId };
  if (plate) q.plate = String(plate).toUpperCase();
  const pg = Math.max(1, parseInt(page, 10) || 1);
  const lim = Math.min(200, Math.max(1, parseInt(pageSize, 10) || 25));
  const [items, total] = await Promise.all([
    CustomerProfileHistory.find(q).sort({ createdAt: -1 }).skip((pg-1)*lim).limit(lim),
    CustomerProfileHistory.countDocuments(q)
  ]);
  res.json({ items, total, page: pg, pageSize: lim });
}
