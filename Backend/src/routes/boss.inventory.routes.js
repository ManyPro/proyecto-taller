import { Router } from 'express';
import mongoose from 'mongoose';
import Company from '../models/Company.js';
import Item from '../models/Item.js';
import { authBossReadonly } from '../middlewares/auth.js';
import { resolveEffectiveCompanyAccess } from '../lib/sharedDatabase.js';

const router = Router();

/**
 * Orden: 1) Sin stock (0) arriba, 2) Stock mayor que 0 y menor o igual al mínimo, 3) Por encima del mínimo.
 * Dentro de cada grupo se refina por urgencia y nombre.
 */
function sortBossInventoryItems(items = []) {
  function tier(item) {
    const s = Number(item?.stock ?? 0);
    const m = Number(item?.minStock ?? 0);
    if (s === 0) return 0;
    if (s > 0 && s <= m) return 1;
    return 2;
  }

  return [...items].sort((a, b) => {
    const ta = tier(a);
    const tb = tier(b);
    if (ta !== tb) return ta - tb;

    const sa = Number(a?.stock ?? 0);
    const sb = Number(b?.stock ?? 0);
    const ma = Number(a?.minStock ?? 0);
    const mb = Number(b?.minStock ?? 0);
    const ga = sa - ma;
    const gb = sb - mb;

    if (ta === 0) {
      if (ma !== mb) return mb - ma;
    } else if (ta === 1) {
      if (ga !== gb) return ga - gb;
    } else {
      if (ga !== gb) return gb - ga;
    }

    const nameCompare = String(a?.name || '').localeCompare(String(b?.name || ''));
    if (nameCompare !== 0) return nameCompare;
    return String(a?._id || '').localeCompare(String(b?._id || ''));
  });
}

router.use(authBossReadonly);
router.use(async (req, res, next) => {
  const company = await Company.findById(req.company?.id).lean();
  if (!company) return res.status(404).json({ error: 'Empresa no encontrada' });
  if (company?.bossPortal?.enabled !== true) {
    return res.status(403).json({ error: 'Portal del jefe deshabilitado' });
  }
  if (company?.features?.inventario === false) {
    return res.status(403).json({ error: 'Funcionalidad deshabilitada: inventario' });
  }
  const scope = await resolveEffectiveCompanyAccess(req.company.id);
  req.originalCompanyId = scope.originalCompanyId;
  req.companyId = scope.effectiveCompanyId;
  req.hasSharedDatabase = scope.hasSharedDatabase;
  next();
});

/**
 * Solo ítems con stock mínimo configurado (minStock > 0).
 */
router.get('/items', async (req, res) => {
  const { name = '', page = 1, limit = 50 } = req.query || {};
  const companyObjectId = new mongoose.Types.ObjectId(req.companyId);

  const q = {
    companyId: companyObjectId,
    minStock: { $gt: 0 }
  };

  const searchText = String(name || '').trim();
  if (searchText) {
    const escaped = searchText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    q.$or = [
      { name: new RegExp(escaped, 'i') },
      { internalName: new RegExp(escaped, 'i') },
      { sku: new RegExp(escaped, 'i') }
    ];
  }

  const rows = await Item.find(q)
    .select('sku name internalName stock minStock images publicImages')
    .lean();

  const sorted = sortBossInventoryItems(rows);
  const atRiskCount = sorted.filter(
    (item) => Number(item.stock || 0) <= Number(item.minStock || 0)
  ).length;

  const pg = Math.max(1, Number(page || 1));
  const lim = Math.max(1, Math.min(100, Number(limit || 50)));
  const total = sorted.length;
  const pages = Math.max(1, Math.ceil(total / lim));
  const safePage = Math.min(pg, pages);
  const start = (safePage - 1) * lim;
  const items = sorted.slice(start, start + lim);

  res.json({
    items,
    page: safePage,
    limit: lim,
    total,
    pages,
    atRiskCount
  });
});

export default router;
