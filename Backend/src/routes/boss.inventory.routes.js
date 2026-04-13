import { Router } from 'express';
import mongoose from 'mongoose';
import Company from '../models/Company.js';
import Item from '../models/Item.js';
import Supplier from '../models/Supplier.js';
import Purchase from '../models/Purchase.js';
import StockEntry from '../models/StockEntry.js';
import { authBossReadonly } from '../middlewares/auth.js';
import { resolveEffectiveCompanyAccess } from '../lib/sharedDatabase.js';

const router = Router();

function normalizeAllowedSupplierIds(value) {
  return Array.isArray(value)
    ? Array.from(new Set(value.map((item) => String(item || '').trim()).filter(Boolean)))
    : [];
}

async function getItemIdsBySupplier(companyId, supplierId) {
  const companyObjectId = new mongoose.Types.ObjectId(companyId);

  if (supplierId === 'GENERAL') {
    const purchaseIdsGeneral = await Purchase.distinct('_id', {
      companyId: companyObjectId,
      $or: [{ supplierId: null }, { supplierId: { $exists: false } }]
    });

    const stockEntryItemIds = await StockEntry.distinct('itemId', {
      companyId: companyObjectId,
      $or: [
        { supplierId: null },
        { supplierId: { $exists: false } },
        ...(purchaseIdsGeneral.length ? [{ purchaseId: { $in: purchaseIdsGeneral } }] : [])
      ]
    });

    const directItemIds = await Item.distinct('_id', {
      companyId: companyObjectId,
      $or: [{ supplierId: null }, { supplierId: { $exists: false } }]
    });

    return Array.from(new Set([...stockEntryItemIds, ...directItemIds].map((id) => String(id))));
  }

  if (!mongoose.Types.ObjectId.isValid(supplierId)) {
    return [];
  }

  const supplierObjectId = new mongoose.Types.ObjectId(supplierId);
  const purchaseIdsBySupplier = await Purchase.distinct('_id', {
    companyId: companyObjectId,
    supplierId: supplierObjectId
  });

  const stockEntryItemIds = await StockEntry.distinct('itemId', {
    companyId: companyObjectId,
    $or: [
      { supplierId: supplierObjectId },
      ...(purchaseIdsBySupplier.length ? [{ purchaseId: { $in: purchaseIdsBySupplier } }] : [])
    ]
  });

  const directItemIds = await Item.distinct('_id', {
    companyId: companyObjectId,
    supplierId: supplierObjectId
  });

  return Array.from(new Set([...stockEntryItemIds, ...directItemIds].map((id) => String(id))));
}

function sortBossInventoryItems(items = []) {
  return [...items].sort((a, b) => {
    const aMin = Number(a?.minStock || 0);
    const bMin = Number(b?.minStock || 0);
    const aHasMin = aMin > 0;
    const bHasMin = bMin > 0;
    if (aHasMin !== bHasMin) return aHasMin ? -1 : 1;

    if (aHasMin && bHasMin) {
      const aGap = Number(a?.stock || 0) - aMin;
      const bGap = Number(b?.stock || 0) - bMin;
      if (aGap !== bGap) return aGap - bGap;
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
  req.companyId = String(req.company.id);
  const scope = await resolveEffectiveCompanyAccess(req.company.id);
  req.originalCompanyId = scope.originalCompanyId;
  req.companyId = scope.effectiveCompanyId;
  req.hasSharedDatabase = scope.hasSharedDatabase;
  req.bossPortal = {
    allowedSupplierIds: normalizeAllowedSupplierIds(company?.bossPortal?.allowedSupplierIds)
  };
  next();
});

router.get('/suppliers', async (req, res) => {
  const allowedSupplierIds = req.bossPortal?.allowedSupplierIds || [];
  const includeGeneral = allowedSupplierIds.includes('GENERAL');
  const supplierObjectIds = allowedSupplierIds.filter((id) => id !== 'GENERAL' && mongoose.Types.ObjectId.isValid(id));

  const suppliers = supplierObjectIds.length
    ? await Supplier.find({
        companyId: req.companyId,
        _id: { $in: supplierObjectIds },
        active: true
      }).sort({ name: 1 }).lean()
    : [];

  const items = [];
  if (includeGeneral) {
    items.push({ _id: 'GENERAL', name: 'GENERAL', active: true });
  }
  suppliers.forEach((supplier) => items.push(supplier));
  res.json({ items });
});

router.get('/items', async (req, res) => {
  const allowedSupplierIds = req.bossPortal?.allowedSupplierIds || [];
  const { supplierId = '', name = '', page = 1, limit = 50 } = req.query || {};
  const requestedSupplierId = String(supplierId || '').trim();

  if (!allowedSupplierIds.length) {
    return res.json({ items: [], page: 1, limit: Number(limit) || 50, total: 0, pages: 1 });
  }

  if (requestedSupplierId && !allowedSupplierIds.includes(requestedSupplierId)) {
    return res.status(403).json({ error: 'Proveedor no permitido para el portal del jefe' });
  }

  const supplierScope = requestedSupplierId ? [requestedSupplierId] : allowedSupplierIds;
  const allItemIds = new Set();
  for (const allowedId of supplierScope) {
    const ids = await getItemIdsBySupplier(req.companyId, allowedId);
    ids.forEach((id) => allItemIds.add(String(id)));
  }

  if (!allItemIds.size) {
    return res.json({ items: [], page: 1, limit: Number(limit) || 50, total: 0, pages: 1 });
  }

  const q = {
    companyId: new mongoose.Types.ObjectId(req.companyId),
    _id: { $in: Array.from(allItemIds).map((id) => new mongoose.Types.ObjectId(id)) }
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
    .select('sku name stock minStock brand')
    .lean();

  const sorted = sortBossInventoryItems(rows);
  const pg = Math.max(1, Number(page || 1));
  const lim = Math.max(1, Math.min(100, Number(limit || 50)));
  const total = sorted.length;
  const pages = Math.max(1, Math.ceil(total / lim));
  const safePage = Math.min(pg, pages);
  const start = (safePage - 1) * lim;
  const items = sorted.slice(start, start + lim);

  res.json({ items, page: safePage, limit: lim, total, pages });
});

export default router;
