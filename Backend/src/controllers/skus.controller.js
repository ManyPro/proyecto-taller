import mongoose from 'mongoose';
import SKU from '../models/SKU.js';
import Item from '../models/Item.js';

// Helper: backfill missing SKUs from Items for a company
async function __backfillMissingSkus(companyId, createdBy){
  const items = await Item.find({ companyId }).select('sku name category').lean();
  if (!items.length) return 0;
  let created = 0;
  const allowed = ['MOTOR','TRANSMISION','FRENOS','SUSPENSION','ELECTRICO','CARROCERIA','INTERIOR','FILTROS','ACEITES','NEUMATICOS','OTROS'];
  for (const it of items) {
    const code = String(it.sku || '').toUpperCase().trim();
    if (!code) continue;
    const exists = await SKU.findOne({ companyId, code }).lean();
    if (exists) continue;
    const cat = String(it.category || '').toUpperCase();
    const category = allowed.includes(cat) ? cat : 'OTROS';
    try{
      await SKU.create({
        companyId,
        code,
        category,
        description: (it.name || code).toUpperCase(),
        notes: '',
        printStatus: 'pending',
        createdBy: createdBy || ''
      });
      created++;
    }catch(e){
      // Ignore duplicates in race conditions
      if(!/E11000/.test(e?.message||'')) console.error('backfill.create.error', e?.message);
    }
  }
  return created;
}

// Crear nuevo SKU
export const createSKU = async (req, res) => {
  try {
    const { code, category, description, brand, partNumber, location, notes } = req.body;
    const companyId = new mongoose.Types.ObjectId(req.companyId);
    
    // Verificar que no exista ya este código
    const existingSKU = await SKU.findOne({ 
      companyId, 
      code: code.toUpperCase() 
    });
    
    if (existingSKU) {
      return res.status(400).json({ 
        error: 'El código SKU ya existe',
        suggestion: await SKU.getNextSKUCode(companyId, code.replace(/\d+$/, ''))
      });
    }
    
    const newSKU = new SKU({
      code: code.toUpperCase(),
      category,
      description,
      brand,
      partNumber,
      location,
      notes: notes || '',
      companyId,
      createdBy: req.user?.id || ''
    });
    
    await newSKU.save();
    
    res.status(201).json({
      message: 'SKU creado exitosamente',
      sku: newSKU
    });
  } catch (error) {
    console.error('Error creando SKU:', error);
    res.status(500).json({ 
      error: 'Error interno del servidor',
      details: error.message 
    });
  }
};

// Obtener sugerencia de próximo SKU
export const getSKUSuggestion = async (req, res) => {
  try {
    const { prefix } = req.params;
    const companyId = new mongoose.Types.ObjectId(req.companyId);
    
    if (!prefix || prefix.length < 2) {
      return res.status(400).json({ 
        error: 'El prefijo debe tener al menos 2 caracteres' 
      });
    }
    
  const suggestion = await SKU.getNextSKUCode(companyId, prefix);
    
    res.json({ 
      prefix,
      suggestion,
      message: `Próximo código disponible: ${suggestion}`
    });
  } catch (error) {
    console.error('Error obteniendo sugerencia:', error);
    res.status(500).json({ 
      error: 'Error interno del servidor',
      details: error.message 
    });
  }
};

// Listar SKUs con filtros
export const listSKUs = async (req, res) => {
  try {
    const companyId = new mongoose.Types.ObjectId(req.companyId);
    const { 
      category, 
      printStatus, 
      search, 
      page = 1, 
      limit = 50,
      sortBy = 'printStatus,createdAt',
      sortOrder = 'asc,desc'
    } = req.query;
    
    // Construir filtros
    const filters = { companyId };
    
    if (category && category !== 'all') {
      filters.category = category;
    }
    
    if (printStatus && printStatus !== 'all') {
      filters.printStatus = printStatus;
    }
    
    if (search && search.trim()) {
      const normalizedSearch = search.trim().toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^\w\s]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
      
      if (normalizedSearch) {
        const words = normalizedSearch.split(' ').filter(w => w.length > 0);
        if (words.length > 0) {
          const regexPattern = words.map(word => `(?=.*${word})`).join('');
          const searchRegex = new RegExp(regexPattern, 'i');
          filters.$or = [
            { code: searchRegex },
            { description: searchRegex },
            { brand: searchRegex },
            { partNumber: searchRegex },
            { notes: searchRegex }
          ];
        }
      }
    }
    
    // Calcular paginación
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Construir sort
    const sort = {};
    const fields = String(sortBy||'').split(',').map(s=>s.trim()).filter(Boolean);
    const orders = String(sortOrder||'').split(',').map(s=>s.trim().toLowerCase());
    if (fields.length) {
      fields.forEach((f, idx) => { const ord = orders[idx] || orders[orders.length-1] || 'asc'; sort[f] = (ord === 'desc' ? -1 : 1); });
    } else {
      sort.printStatus = 1; sort.createdAt = -1; // default fallback
    }
    
    // Ejecutar consulta
    const [skus, total] = await Promise.all([
      SKU.find(filters)
        .sort(sort)
        .skip(skip)
        .limit(parseInt(limit)),
      SKU.countDocuments(filters)
    ]);
    
    res.json({
      skus,
      pagination: {
        current: parseInt(page),
        pages: Math.ceil(total / parseInt(limit)),
        total,
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Error listando SKUs:', error);
    res.status(500).json({ 
      error: 'Error interno del servidor',
      details: error.message 
    });
  }
};

// Obtener SKUs agrupados por categoría
export const getSKUsByCategory = async (req, res) => {
  try {
    const companyId = new mongoose.Types.ObjectId(req.companyId);
    // Ensure there is data: if zero SKUs but inventory exists, backfill once
    const totalSkus = await SKU.countDocuments({ companyId });
    if (totalSkus === 0) {
      const itemsCount = await Item.countDocuments({ companyId, sku: { $exists: true, $ne: '' } });
      if (itemsCount > 0) {
        await __backfillMissingSkus(companyId, req.user?.id);
      }
    }

    // Obtener estadísticas por categoría
    const stats = await SKU.getStatsByCategory(companyId);
    
    // Obtener SKUs agrupados por categoría
    const categories = {};
    
    for (const stat of stats) {
      const skus = await SKU.find({ 
        companyId, 
        category: stat._id 
      }).sort({ code: 1 });
      
      categories[stat._id] = {
        stats: stat,
        skus: skus
      };
    }
    
    res.json({ categories });
  } catch (error) {
    console.error('Error obteniendo SKUs por categoría:', error);
    res.status(500).json({ 
      error: 'Error interno del servidor',
      details: error.message 
    });
  }
};

// Obtener un SKU específico
export const getSKU = async (req, res) => {
  try {
    const { id } = req.params;
    const companyId = new mongoose.Types.ObjectId(req.companyId);
    
    const sku = await SKU.findOne({ _id: id, companyId });
    
    if (!sku) {
      return res.status(404).json({ error: 'SKU no encontrado' });
    }
    
    res.json({ sku });
  } catch (error) {
    console.error('Error obteniendo SKU:', error);
    res.status(500).json({ 
      error: 'Error interno del servidor',
      details: error.message 
    });
  }
};

// Actualizar SKU
export const updateSKU = async (req, res) => {
  try {
    const { id } = req.params;
    const companyId = new mongoose.Types.ObjectId(req.companyId);
    const updates = req.body;
    
    // No permitir cambio de código o companyEmail
    delete updates.code;
    delete updates.companyId;
    
    const sku = await SKU.findOneAndUpdate(
      { _id: id, companyId },
      updates,
      { new: true, runValidators: true }
    );
    
    if (!sku) {
      return res.status(404).json({ error: 'SKU no encontrado' });
    }
    
    res.json({
      message: 'SKU actualizado exitosamente',
      sku
    });
  } catch (error) {
    console.error('Error actualizando SKU:', error);
    res.status(500).json({ 
      error: 'Error interno del servidor',
      details: error.message 
    });
  }
};

// Marcar como impreso
export const markAsPrinted = async (req, res) => {
  try {
    const { id } = req.params;
    const companyId = new mongoose.Types.ObjectId(req.companyId);
    
    const sku = await SKU.findOneAndUpdate(
      { _id: id, companyId },
      { printStatus: 'printed', printedAt: new Date(), pendingStickers: 0 },
      { new: true }
    );
    
    if (!sku) {
      return res.status(404).json({ error: 'SKU no encontrado' });
    }
    
    res.json({
      message: 'SKU marcado como impreso',
      sku
    });
  } catch (error) {
    console.error('Error marcando como impreso:', error);
    res.status(500).json({ 
      error: 'Error interno del servidor',
      details: error.message 
    });
  }
};

// Marcar como aplicado
export const markAsApplied = async (req, res) => {
  try {
    const { id } = req.params;
    const companyId = new mongoose.Types.ObjectId(req.companyId);
    
    const sku = await SKU.findOneAndUpdate(
      { _id: id, companyId },
      { printStatus: 'applied' },
      { new: true }
    );
    
    if (!sku) {
      return res.status(404).json({ error: 'SKU no encontrado' });
    }
    
    res.json({
      message: 'SKU marcado como aplicado',
      sku
    });
  } catch (error) {
    console.error('Error marcando como aplicado:', error);
    res.status(500).json({ 
      error: 'Error interno del servidor',
      details: error.message 
    });
  }
};

// Actualizar notas
export const updateNotes = async (req, res) => {
  try {
    const { id } = req.params;
    const { notes } = req.body;
    const companyId = new mongoose.Types.ObjectId(req.companyId);
    
    const sku = await SKU.findOneAndUpdate(
      { _id: id, companyId },
      { notes: notes || '' },
      { new: true }
    );
    
    if (!sku) {
      return res.status(404).json({ error: 'SKU no encontrado' });
    }
    
    res.json({
      message: 'Notas actualizadas exitosamente',
      sku
    });
  } catch (error) {
    console.error('Error actualizando notas:', error);
    res.status(500).json({ 
      error: 'Error interno del servidor',
      details: error.message 
    });
  }
};

// Eliminar SKU
export const deleteSKU = async (req, res) => {
  try {
    const { id } = req.params;
    const companyId = new mongoose.Types.ObjectId(req.companyId);
    
    const sku = await SKU.findOneAndDelete({ _id: id, companyId });
    
    if (!sku) {
      return res.status(404).json({ error: 'SKU no encontrado' });
    }
    
    res.json({ message: 'SKU eliminado exitosamente' });
  } catch (error) {
    console.error('Error eliminando SKU:', error);
    res.status(500).json({ 
      error: 'Error interno del servidor',
      details: error.message 
    });
  }
};

// Obtener estadísticas generales
export const getStats = async (req, res) => {
  try {
    const companyId = new mongoose.Types.ObjectId(req.companyId);
    
    let [totalStats, categoryStats] = await Promise.all([
      SKU.aggregate([
        { $match: { companyId } },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            pending: {
              $sum: {
                $cond: [{ $eq: ['$printStatus', 'pending'] }, 1, 0]
              }
            },
            printed: {
              $sum: {
                $cond: [{ $eq: ['$printStatus', 'printed'] }, 1, 0]
              }
            },
            applied: {
              $sum: {
                $cond: [{ $eq: ['$printStatus', 'applied'] }, 1, 0]
              }
            }
          }
        }
      ]),
      SKU.getStatsByCategory(companyId)
    ]);

    // If zero SKUs but items exist, backfill once and recompute
    const totals = totalStats[0];
    if (!totals || (totals.total || 0) === 0) {
      const itemsCount = await Item.countDocuments({ companyId, sku: { $exists: true, $ne: '' } });
      if (itemsCount > 0) {
        const created = await __backfillMissingSkus(companyId, req.user?.id);
        if (created > 0) {
          [totalStats, categoryStats] = await Promise.all([
            SKU.aggregate([
              { $match: { companyId } },
              {
                $group: {
                  _id: null,
                  total: { $sum: 1 },
                  pending: {
                    $sum: {
                      $cond: [{ $eq: ['$printStatus', 'pending'] }, 1, 0]
                    }
                  },
                  printed: {
                    $sum: {
                      $cond: [{ $eq: ['$printStatus', 'printed'] }, 1, 0]
                    }
                  },
                  applied: {
                    $sum: {
                      $cond: [{ $eq: ['$printStatus', 'applied'] }, 1, 0]
                    }
                  }
                }
              }
            ]),
            SKU.getStatsByCategory(companyId)
          ]);
        }
      }
    }
    
    res.json({
      total: totalStats[0] || { total: 0, pending: 0, printed: 0, applied: 0 },
      byCategory: categoryStats
    });
  } catch (error) {
    console.error('Error obteniendo estadísticas:', error);
    res.status(500).json({ 
      error: 'Error interno del servidor',
      details: error.message 
    });
  }
};

// Obtener por código
export const getByCode = async (req, res) => {
  try {
    const { code } = req.params;
    const companyId = new mongoose.Types.ObjectId(req.companyId);
    const sku = await SKU.findOne({ companyId, code: String(code || '').toUpperCase() });
    if (!sku) return res.status(404).json({ error: 'SKU no encontrado' });
    res.json({ sku });
  } catch (error) {
    console.error('Error obteniendo SKU por código:', error);
    res.status(500).json({ error: 'Error interno del servidor', details: error.message });
  }
};

// Backfill: crear SKUs faltantes a partir de Items existentes
export const backfillFromItems = async (req, res) => {
  try {
    const companyId = new mongoose.Types.ObjectId(req.companyId);
    const created = await __backfillMissingSkus(companyId, req.user?.id);
    res.json({ created });
  } catch (error) {
    console.error('Error en backfill SKUs:', error);
    res.status(500).json({ error: 'Error interno del servidor', details: error.message });
  }
};

// Marcar como impresos en masa
export const bulkMarkAsPrinted = async (req, res) => {
  try {
    const companyId = new mongoose.Types.ObjectId(req.companyId);
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.filter(id => mongoose.Types.ObjectId.isValid(id)) : [];
    const q = req.query || {};
    let matched = 0, modified = 0;

    if (ids.length) {
  const r = await SKU.updateMany({ companyId, _id: { $in: ids } }, { $set: { printStatus: 'printed', printedAt: new Date(), pendingStickers: 0 } });
      matched = r.matchedCount || 0; modified = r.modifiedCount || 0;
    } else {
      // Por filtro (category/printStatus/search) para seleccionar "todos"
      const filters = { companyId };
      if (q.category && q.category !== 'all') filters.category = q.category;
      if (q.printStatus && q.printStatus !== 'all') filters.printStatus = q.printStatus;
      if (q.search && q.search.trim()) {
        const normalizedSearch = q.search.trim().toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[^\w\s]/g, '')
          .replace(/\s+/g, ' ')
          .trim();
        
        if (normalizedSearch) {
          const words = normalizedSearch.split(' ').filter(w => w.length > 0);
          if (words.length > 0) {
            const regexPattern = words.map(word => `(?=.*${word})`).join('');
            const rx = new RegExp(regexPattern, 'i');
            filters.$or = [{ code: rx }, { description: rx }, { brand: rx }, { partNumber: rx }, { notes: rx }];
          }
        }
      }
  const r = await SKU.updateMany(filters, { $set: { printStatus: 'printed', printedAt: new Date(), pendingStickers: 0 } });
      matched = r.matchedCount || 0; modified = r.modifiedCount || 0;
    }
    res.json({ matched, modified });
  } catch (error) {
    console.error('bulkMarkAsPrinted', error);
    res.status(500).json({ error: 'Error interno del servidor', details: error.message });
  }
};

// Marcar como aplicados en masa
export const bulkMarkAsApplied = async (req, res) => {
  try {
    const companyId = new mongoose.Types.ObjectId(req.companyId);
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.filter(id => mongoose.Types.ObjectId.isValid(id)) : [];
    const q = req.query || {};
    let matched = 0, modified = 0;

    if (ids.length) {
      const r = await SKU.updateMany({ companyId, _id: { $in: ids } }, { $set: { printStatus: 'applied' } });
      matched = r.matchedCount || 0; modified = r.modifiedCount || 0;
    } else {
      const filters = { companyId };
      if (q.category && q.category !== 'all') filters.category = q.category;
      if (q.printStatus && q.printStatus !== 'all') filters.printStatus = q.printStatus;
      if (q.search && q.search.trim()) {
        const normalizedSearch = q.search.trim().toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[^\w\s]/g, '')
          .replace(/\s+/g, ' ')
          .trim();
        
        if (normalizedSearch) {
          const words = normalizedSearch.split(' ').filter(w => w.length > 0);
          if (words.length > 0) {
            const regexPattern = words.map(word => `(?=.*${word})`).join('');
            const rx = new RegExp(regexPattern, 'i');
            filters.$or = [{ code: rx }, { description: rx }, { brand: rx }, { partNumber: rx }, { notes: rx }];
          }
        }
      }
      const r = await SKU.updateMany(filters, { $set: { printStatus: 'applied' } });
      matched = r.matchedCount || 0; modified = r.modifiedCount || 0;
    }
    res.json({ matched, modified });
  } catch (error) {
    console.error('bulkMarkAsApplied', error);
    res.status(500).json({ error: 'Error interno del servidor', details: error.message });
  }
};