import mongoose from "mongoose";
import Supplier from "../models/Supplier.js";
import Investor from "../models/Investor.js";
import Purchase from "../models/Purchase.js";
import Item from "../models/Item.js";
import StockEntry from "../models/StockEntry.js";
import InvestmentItem from "../models/InvestmentItem.js";
import StockMove from "../models/StockMove.js";

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
    
    const session = await mongoose.startSession();
    session.startTransaction();
    
    try {
      const purchase = await Purchase.create([{
        companyId: req.companyId,
        supplierId: supplierObjId,
        investorId: investorObjId,
        purchaseDate: purchaseDate ? new Date(purchaseDate) : new Date(),
        totalAmount,
        items,
        notes: (notes || '').trim()
      }], { session });
      
      const purchaseDoc = purchase[0];
      
      // Actualizar stock para cada item de la compra
      for (const purchaseItem of items) {
        const { itemId, qty, unitPrice } = purchaseItem;
        
        if (!mongoose.Types.ObjectId.isValid(itemId)) {
          throw new Error(`ID de item inválido: ${itemId}`);
        }
        
        // Verificar que el item existe
        const item = await Item.findOne({ _id: itemId, companyId: req.companyId }).session(session);
        if (!item) {
          throw new Error(`Item no encontrado: ${itemId}`);
        }
        
        // Buscar o crear StockEntry
        const searchFilter = {
          companyId: req.companyId,
          itemId: item._id,
          supplierId: supplierObjId,
          investorId: investorObjId,
          vehicleIntakeId: null
        };
        
        let stockEntry = await StockEntry.findOne(searchFilter).session(session);
        
        if (stockEntry) {
          // Actualizar cantidad existente
          stockEntry.qty += qty;
          if (unitPrice !== null && stockEntry.entryPrice === null) {
            stockEntry.entryPrice = unitPrice;
          }
          // Vincular purchaseId si no está vinculado
          if (!stockEntry.purchaseId) {
            stockEntry.purchaseId = purchaseDoc._id;
          }
          await stockEntry.save({ session });
        } else {
          // Crear nuevo StockEntry
          const newEntries = await StockEntry.create([{
            companyId: req.companyId,
            itemId: item._id,
            vehicleIntakeId: null,
            supplierId: supplierObjId,
            investorId: investorObjId,
            purchaseId: purchaseDoc._id,
            qty: qty,
            entryPrice: unitPrice,
            entryDate: purchaseDate ? new Date(purchaseDate) : new Date(),
            meta: {
              note: notes || '',
              supplier: '',
              purchaseOrder: ''
            }
          }], { session });
          stockEntry = newEntries[0];
        }
        
        // Incrementar stock del item
        await Item.findOneAndUpdate(
          { _id: itemId, companyId: req.companyId },
          { $inc: { stock: qty } },
          { session }
        );
        
        // Registrar movimiento de stock
        await StockMove.create([{
          companyId: req.companyId,
          itemId: item._id,
          qty,
          reason: 'IN',
          meta: {
            note: `Compra ${purchaseDoc._id}`,
            purchaseId: purchaseDoc._id,
            supplierId: supplierObjId,
            investorId: investorObjId
          }
        }], { session });
        
        // Crear InvestmentItem si hay inversor
        if (investorObjId && stockEntry) {
          await InvestmentItem.create([{
            companyId: req.companyId,
            investorId: investorObjId,
            purchaseId: purchaseDoc._id,
            itemId: item._id,
            stockEntryId: stockEntry._id,
            purchasePrice: unitPrice,
            qty: qty,
            status: 'available'
          }], { session });
        }
      }
      
      await session.commitTransaction();
      
      const populated = await Purchase.findById(purchaseDoc._id)
        .populate('supplierId', 'name')
        .populate('investorId', 'name')
        .lean();
      
      res.json(populated);
    } catch (err) {
      await session.abortTransaction();
      throw err;
    } finally {
      session.endSession();
    }
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

// ===== ELIMINAR ITEMS DE UNA COMPRA =====
export const deletePurchaseItems = async (req, res) => {
  try {
    const { id } = req.params;
    const { itemIds } = req.body || {}; // Array de índices o IDs de items a eliminar
    
    if (!Array.isArray(itemIds) || itemIds.length === 0) {
      return res.status(400).json({ error: 'Debe proporcionar un array de itemIds a eliminar' });
    }
    
    const purchase = await Purchase.findOne({ _id: id, companyId: req.companyId });
    if (!purchase) {
      return res.status(404).json({ error: 'Compra no encontrada' });
    }
    
    const session = await mongoose.startSession();
    session.startTransaction();
    
    try {
      const itemsToDelete = [];
      const itemsToKeep = [];
      
      // Separar items a eliminar y a mantener
      purchase.items.forEach((item, index) => {
        if (itemIds.includes(String(item._id)) || itemIds.includes(index)) {
          itemsToDelete.push(item);
        } else {
          itemsToKeep.push(item);
        }
      });
      
      if (itemsToDelete.length === 0) {
        await session.abortTransaction();
        return res.status(400).json({ error: 'No se encontraron items para eliminar' });
      }
      
      // Procesar cada item a eliminar
      for (const purchaseItem of itemsToDelete) {
        const { itemId, qty, unitPrice } = purchaseItem;
        
        if (!mongoose.Types.ObjectId.isValid(itemId)) {
          continue;
        }
        
        // Buscar StockEntry relacionado con esta compra
        const stockEntry = await StockEntry.findOne({
          companyId: req.companyId,
          itemId: itemId,
          purchaseId: purchase._id
        }).session(session);
        
        if (stockEntry) {
          // Reducir cantidad en StockEntry
          stockEntry.qty = Math.max(0, stockEntry.qty - qty);
          await stockEntry.save({ session });
          
          // Si el StockEntry queda en 0, eliminarlo
          if (stockEntry.qty <= 0) {
            await StockEntry.deleteOne({ _id: stockEntry._id }).session(session);
          }
          
          // Eliminar InvestmentItems relacionados con este StockEntry
          if (purchase.investorId && stockEntry.investorId) {
            await InvestmentItem.deleteMany({
              companyId: req.companyId,
              stockEntryId: stockEntry._id,
              status: 'available'
            }).session(session);
          }
        }
        
        // Reducir stock del item
        await Item.findOneAndUpdate(
          { _id: itemId, companyId: req.companyId },
          { $inc: { stock: -qty } },
          { session }
        );
        
        // Registrar movimiento de stock (OUT)
        const StockMove = (await import("../models/StockMove.js")).default;
        await StockMove.create([{
          companyId: req.companyId,
          itemId: itemId,
          qty: -qty,
          reason: 'OUT',
          meta: {
            note: `Eliminación de item de compra ${purchase._id}`,
            purchaseId: purchase._id
          }
        }], { session });
      }
      
      // Actualizar compra: remover items y recalcular total
      purchase.items = itemsToKeep;
      purchase.totalAmount = itemsToKeep.reduce((sum, item) => {
        return sum + (item.qty || 0) * (item.unitPrice || 0);
      }, 0);
      
      await purchase.save({ session });
      
      await session.commitTransaction();
      
      const populated = await Purchase.findById(purchase._id)
        .populate('supplierId', 'name')
        .populate('investorId', 'name')
        .lean();
      
      res.json({ ok: true, purchase: populated, deletedCount: itemsToDelete.length });
    } catch (err) {
      await session.abortTransaction();
      throw err;
    } finally {
      session.endSession();
    }
  } catch (err) {
    res.status(500).json({ error: 'Error al eliminar items de compra', message: err.message });
  }
};