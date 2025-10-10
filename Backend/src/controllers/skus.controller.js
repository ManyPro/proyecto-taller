import SKU from '../models/SKU.js';

// Crear nuevo SKU
export const createSKU = async (req, res) => {
  try {
    const { code, category, description, brand, partNumber, location, notes } = req.body;
    const companyEmail = req.company.email;
    
    // Verificar que no exista ya este código
    const existingSKU = await SKU.findOne({ 
      companyEmail, 
      code: code.toUpperCase() 
    });
    
    if (existingSKU) {
      return res.status(400).json({ 
        error: 'El código SKU ya existe',
        suggestion: await SKU.getNextSKUCode(companyEmail, code.replace(/\d+$/, ''))
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
      companyEmail,
      createdBy: req.company.name || req.company.email
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
    const companyEmail = req.company.email;
    
    if (!prefix || prefix.length < 2) {
      return res.status(400).json({ 
        error: 'El prefijo debe tener al menos 2 caracteres' 
      });
    }
    
    const suggestion = await SKU.getNextSKUCode(companyEmail, prefix);
    
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
    const companyEmail = req.company.email;
    const { 
      category, 
      printStatus, 
      search, 
      page = 1, 
      limit = 50,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;
    
    // Construir filtros
    const filters = { companyEmail };
    
    if (category && category !== 'all') {
      filters.category = category;
    }
    
    if (printStatus && printStatus !== 'all') {
      filters.printStatus = printStatus;
    }
    
    if (search && search.trim()) {
      const searchRegex = new RegExp(search.trim(), 'i');
      filters.$or = [
        { code: searchRegex },
        { description: searchRegex },
        { brand: searchRegex },
        { partNumber: searchRegex },
        { notes: searchRegex }
      ];
    }
    
    // Calcular paginación
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Construir sort
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;
    
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
    const companyEmail = req.company.email;
    
    // Obtener estadísticas por categoría
    const stats = await SKU.getStatsByCategory(companyEmail);
    
    // Obtener SKUs agrupados por categoría
    const categories = {};
    
    for (const stat of stats) {
      const skus = await SKU.find({ 
        companyEmail, 
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
    const companyEmail = req.company.email;
    
    const sku = await SKU.findOne({ _id: id, companyEmail });
    
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
    const companyEmail = req.company.email;
    const updates = req.body;
    
    // No permitir cambio de código o companyEmail
    delete updates.code;
    delete updates.companyEmail;
    
    const sku = await SKU.findOneAndUpdate(
      { _id: id, companyEmail },
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
    const companyEmail = req.company.email;
    
    const sku = await SKU.findOneAndUpdate(
      { _id: id, companyEmail },
      { 
        printStatus: 'printed',
        printedAt: new Date()
      },
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
    const companyEmail = req.company.email;
    
    const sku = await SKU.findOneAndUpdate(
      { _id: id, companyEmail },
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
    const companyEmail = req.company.email;
    
    const sku = await SKU.findOneAndUpdate(
      { _id: id, companyEmail },
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
    const companyEmail = req.company.email;
    
    const sku = await SKU.findOneAndDelete({ _id: id, companyEmail });
    
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
    const companyEmail = req.company.email;
    
    const [totalStats, categoryStats] = await Promise.all([
      SKU.aggregate([
        { $match: { companyEmail } },
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
      SKU.getStatsByCategory(companyEmail)
    ]);
    
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