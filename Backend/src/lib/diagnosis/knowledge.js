import DiagnosisDocument from '../../models/DiagnosisDocument.js';
import DiagnosisCase from '../../models/DiagnosisCase.js';
import { sanitizeText } from './sanitize.js';

function yearMatch(doc, year) {
  if (!year) return true;
  const y = Number(year);
  if (!Number.isFinite(y)) return true;
  const from = doc.yearFrom == null ? -Infinity : Number(doc.yearFrom);
  const to = doc.yearTo == null ? Infinity : Number(doc.yearTo);
  return y >= from && y <= to;
}

function scoreDocument(doc, vehicle = {}) {
  let score = 1;
  const engine = String(vehicle.engineCode || '').toLowerCase();
  const model = String(vehicle.model || '').toLowerCase();
  const ecu = String(vehicle.ecuId || vehicle.ecu || '').toLowerCase();
  if (engine && String(doc.engineCode || '').toLowerCase() === engine) score += 5;
  if (model && String(doc.model || '').toLowerCase().includes(model)) score += 3;
  if (yearMatch(doc, vehicle.year)) score += 2;
  if (ecu && String(doc.ecu || '').toLowerCase() === ecu) score += 2;
  if (doc.kind === 'ficha') score += 1;
  return score;
}

export function excerptText(text, max = 1800) {
  return sanitizeText(text, max);
}

export async function retrieveDocuments({ companyId, vehicle, limit = 6 }) {
  const q = {
    companyId,
    active: true,
    reviewed: true
  };
  const docs = await DiagnosisDocument.find(q).sort({ updatedAt: -1 }).limit(80).lean();
  const ranked = docs
    .filter((d) => yearMatch(d, vehicle?.year))
    .map((d) => ({ ...d, score: scoreDocument(d, vehicle) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((d) => ({
      id: String(d._id),
      title: d.title,
      source: d.source,
      versionOrDate: d.versionOrDate || '',
      application: d.application || '',
      section: d.section || '',
      engineCode: d.engineCode || '',
      model: d.model || '',
      ecu: d.ecu || '',
      kind: d.kind,
      excerpt: excerptText(d.body)
    }));
  return ranked;
}

export async function retrieveReviewedAntecedents({ companyId, vehicle, excludeCaseId, enabled, limit = 3 }) {
  if (!enabled) return [];
  const q = {
    companyId,
    status: 'cerrado',
    reviewedByWorkshop: true
  };
  if (excludeCaseId) q._id = { $ne: excludeCaseId };
  if (vehicle?.engineCode && vehicle.engineCode !== 'UNKNOWN' && vehicle.engineCode !== 'OTHER') {
    q['vehicle.engineCode'] = vehicle.engineCode;
  }
  const items = await DiagnosisCase.find(q)
    .select('title vehicle.engineCode symptom.main repair.applied repair.notes')
    .sort({ updatedAt: -1 })
    .limit(limit)
    .lean();
  return items.map((c) => ({
    title: c.title,
    engineCode: c.vehicle?.engineCode || '',
    symptom: c.symptom?.main || '',
    repair: c.repair?.applied || c.repair?.notes || ''
  }));
}

export function knowledgeStatusFromDocs(docs) {
  return docs?.length ? 'disponible' : 'pendiente';
}
