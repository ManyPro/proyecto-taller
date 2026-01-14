import mongoose from "mongoose";
import Supplier from "../models/Supplier.js";
import Investor from "../models/Investor.js";
import Purchase from "../models/Purchase.js";

// ===== SUPPLIERS =====

export const listSuppliers = async (req, res) => {
  try {
    const { active } = req.query;
    const filter = { companyId: req.companyId };
    if (active !== undefined) {
      filter.active = active === 'true';
    }
    
    const suppliers = await Supplier.find(filter)
      .sort({ name: 1 })
      .lean();
    
    res.json(suppliers);
  } catch (err) {
    res.status(500).json({ error: 'Error al listar proveedores', message: err.message });
  }
};

export const createSupplier = async (req, res) => {
  try {
    const { name, contactInfo, notes } = req.body || {};
    
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'El nombre del proveedor es requerido' });
    }
    
    const supplier = await Supplier.create({
      companyId: req.companyId,
      name: name.trim().toUpperCase(),
      contactInfo: contactInfo || {},
      notes: (notes || '').trim(),
      active: true
    });
    
    res.json(supplier);
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ error: 'Ya existe un proveedor con ese nombre' });
    }
    res.status(500).json({ error: 'Error al crear proveedor', message: err.message });
  }
};

export const updateSupplier = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, contactInfo, notes, active } = req.body || {};
    
    const supplier = await Supplier.findOne({ _id: id, companyId: req.companyId });
    if (!supplier) {
      return res.status(404).json({ error: 'Proveedor no encontrado' });
    }
    
    if (name !== undefined) supplier.name = name.trim().toUpperCase();
    if (contactInfo !== undefined) supplier.contactInfo = contactInfo;
    if (notes !== undefined) supplier.notes = notes.trim();
    if (active !== undefined) supplier.active = active;
    
    await supplier.save();
    res.json(supplier);
  } catch (err) {
    res.status(500).json({ error: 'Error al actualizar proveedor', message: err.message });
  }
};

export const deleteSupplier = async (req, res) => {
  try {
    const { id } = req.params;
    
    const supplier = await Supplier.findOne({ _id: id, companyId: req.companyId });
    if (!supplier) {
      return res.status(404).json({ error: 'Proveedor no encontrado' });
    }
    
    await Supplier.deleteOne({ _id: id, companyId: req.companyId });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Error al eliminar proveedor', message: err.message });
  }
};

// ===== INVESTORS =====

export const listInvestors = async (req, res) => {
  try {
    const { active } = req.query;
    const filter = { companyId: req.companyId };
    if (active !== undefined) {
      filter.active = active === 'true';
    }
    
    const investors = await Investor.find(filter)
      .sort({ name: 1 })
      .lean();
    
    res.json(investors);
  } catch (err) {
    res.status(500).json({ error: 'Error al listar inversores', message: err.message });
  }
};

export const createInvestor = async (req, res) => {
  try {
    const { name, contactInfo, notes } = req.body || {};
    
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'El nombre del inversor es requerido' });
    }
    
    const investor = await Investor.create({
      companyId: req.companyId,
      name: name.trim().toUpperCase(),
      contactInfo: contactInfo || {},
      notes: (notes || '').trim(),
      active: true
    });
    
    res.json(investor);
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ error: 'Ya existe un inversor con ese nombre' });
    }
    res.status(500).json({ error: 'Error al crear inversor', message: err.message });
  }
};

export const updateInvestor = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, contactInfo, notes, active } = req.body || {};
    
    const investor = await Investor.findOne({ _id: id, companyId: req.companyId });
    if (!investor) {
      return res.status(404).json({ error: 'Inversor no encontrado' });
    }
    
    if (name !== undefined) investor.name = name.trim().toUpperCase();
    if (contactInfo !== undefined) investor.contactInfo = contactInfo;
    if (notes !== undefined) investor.notes = notes.trim();
    if (active !== undefined) investor.active = active;
    
    await investor.save();
    res.json(investor);
  } catch (err) {
    res.status(500).json({ error: 'Error al actualizar inversor', message: err.message });
  }
};

export const deleteInvestor = async (req, res) => {
  try {
    const { id } = req.params;
    
    const investor = await Investor.findOne({ _id: id, companyId: req.companyId });
    if (!investor) {
      return res.status(404).json({ error: 'Inversor no encontrado' });
    }
    
    await Investor.deleteOne({ _id: id, companyId: req.companyId });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Error al eliminar inversor', message: err.message });
  }
};

// ===== PURCHASES =====

export const listPurchases = async (req, res) => {
  try {
    const { supplierId, investorId, startDate, endDate, limit = 50, skip = 0 } = req.query;
    
    const filter = { companyId: req.companyId };
    if (supplierId) filter.supplierId = supplierId;
    if (investorId) filter.investorId = investorId;
    if (startDate || endDate) {
      filter.purchaseDate = {};
      if (startDate) filter.purchaseDate.$gte = new Date(startDate);
      if (endDate) filter.purchaseDate.$lte = new Date(endDate);
    }
    
    const purchases = await Purchase.find(filter)
      .populate('supplierId', 'name')
      .populate('investorId', 'name')
      .sort({ purchaseDate: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(skip))
      .lean();
    
    const total = await Purchase.countDocuments(filter);
    
    res.json({ items: purchases, total, limit: parseInt(limit), skip: parseInt(skip) });
  } catch (err) {
    res.status(500).json({ error: 'Error al listar compras', message: err.message });
  }
};

export const createPurchase = async (req, res) => {
  try {
    const { supplierId, investorId, purchaseDate, items, notes } = req.body || {};
    
    // Validar items
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Debe incluir al menos un item' });
    }
    
    // Validar supplierId si se proporciona (puede ser "GENERAL" o null)
    let supplierObjId = null;
    if (supplierId && supplierId !== 'GENERAL' && mongoose.Types.ObjectId.isValid(supplierId)) {
      const supplier = await Supplier.findOne({ _id: supplierId, companyId: req.companyId });
      if (!supplier) {
        return res.status(404).json({ error: 'Proveedor no encontrado' });
      }
      supplierObjId = supplier._id;
    }
    
    // Validar investorId si se proporciona (puede ser "GENERAL" o null)
    let investorObjId = null;
    if (investorId && investorId !== 'GENERAL' && mongoose.Types.ObjectId.isValid(investorId)) {
      const investor = await Investor.findOne({ _id: investorId, companyId: req.companyId });
      if (!investor) {
        return res.status(404).json({ error: 'Inversor no encontrado' });
      }
      investorObjId = investor._id;
    }
    
    // Calcular total
    const totalAmount = items.reduce((sum, item) => {
      return sum + (item.qty || 0) * (item.unitPrice || 0);
    }, 0);
    
    const purchase = await Purchase.create({
      companyId: req.companyId,
      supplierId: supplierObjId,
      investorId: investorObjId,
      purchaseDate: purchaseDate ? new Date(purchaseDate) : new Date(),
      totalAmount,
      items,
      notes: (notes || '').trim()
    });
    
    const populated = await Purchase.findById(purchase._id)
      .populate('supplierId', 'name')
      .populate('investorId', 'name')
      .lean();
    
    res.json(populated);
  } catch (err) {
    res.status(500).json({ error: 'Error al crear compra', message: err.message });
  }
};

export const getPurchase = async (req, res) => {
  try {
    const { id } = req.params;
    
    const purchase = await Purchase.findOne({ _id: id, companyId: req.companyId })
      .populate('supplierId', 'name contactInfo')
      .populate('investorId', 'name contactInfo')
      .populate('items.itemId', 'sku name')
      .lean();
    
    if (!purchase) {
      return res.status(404).json({ error: 'Compra no encontrada' });
    }
    
    res.json(purchase);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener compra', message: err.message });
  }
};
