import Vehicle from '../models/Vehicle.js';

// Helper para limpiar strings
function cleanStr(v) {
  return String(v ?? '').trim().toUpperCase();
}

// ============ list ============
export const listVehicles = async (req, res) => {
  try {
    const { make, line, displacement, modelYear, active, search } = req.query || {};
    const q = {};
    
    // Filtro por activos (por defecto solo activos)
    if (active !== 'false' && active !== 'all') {
      q.active = true;
    }
    
    if (make) q.make = cleanStr(make);
    if (line) q.line = cleanStr(line);
    if (displacement) q.displacement = cleanStr(displacement);
    if (modelYear) q.modelYear = String(modelYear).trim();
    
    // Búsqueda general (busca en make, line, displacement)
    if (search) {
      const searchClean = cleanStr(search);
      q.$or = [
        { make: { $regex: searchClean, $options: 'i' } },
        { line: { $regex: searchClean, $options: 'i' } },
        { displacement: { $regex: searchClean, $options: 'i' } }
      ];
    }
    
    const items = await Vehicle.find(q)
      .sort({ make: 1, line: 1, displacement: 1, modelYear: 1 })
      .lean();
    
    res.json({ items });
  } catch (err) {
    res.status(500).json({ error: 'Error al listar vehículos', message: err.message });
  }
};

// ============ get (single) ============
export const getVehicle = async (req, res) => {
  try {
    const { id } = req.params;
    const item = await Vehicle.findById(id).lean();
    if (!item) {
      return res.status(404).json({ error: 'Vehículo no encontrado' });
    }
    res.json(item);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener vehículo', message: err.message });
  }
};

// ============ create ============
export const createVehicle = async (req, res) => {
  try {
    const { make, line, displacement, modelYear, active } = req.body || {};
    
    if (!make || !line || !displacement) {
      return res.status(400).json({ error: 'make, line y displacement son requeridos' });
    }
    
    const doc = {
      make: cleanStr(make),
      line: cleanStr(line),
      displacement: cleanStr(displacement),
      modelYear: modelYear ? String(modelYear).trim() : null,
      active: active !== undefined ? Boolean(active) : true
    };
    
    // Validar formato de modelYear
    if (doc.modelYear && !/^\d{4}$/.test(doc.modelYear) && !/^\d{4}-\d{4}$/.test(doc.modelYear)) {
      return res.status(400).json({ error: 'modelYear debe ser un año (YYYY) o un rango (YYYY-YYYY)' });
    }
    
    try {
      const created = await Vehicle.create(doc);
      res.status(201).json(created.toObject());
    } catch (e) {
      // Si ya existe por índice único
      if (e?.code === 11000) {
        return res.status(409).json({ 
          error: 'Ya existe un vehículo con estas características',
          message: `El vehículo ${doc.make} ${doc.line} ${doc.displacement}${doc.modelYear ? ` (${doc.modelYear})` : ''} ya existe`
        });
      }
      throw e;
    }
  } catch (err) {
    res.status(500).json({ error: 'Error al crear vehículo', message: err.message });
  }
};

// ============ update ============
export const updateVehicle = async (req, res) => {
  try {
    const { id } = req.params;
    const { make, line, displacement, modelYear, active } = req.body || {};
    
    const item = await Vehicle.findById(id);
    if (!item) {
      return res.status(404).json({ error: 'Vehículo no encontrado' });
    }
    
    if (make !== undefined) item.make = cleanStr(make);
    if (line !== undefined) item.line = cleanStr(line);
    if (displacement !== undefined) item.displacement = cleanStr(displacement);
    if (modelYear !== undefined) {
      const modelYearStr = modelYear ? String(modelYear).trim() : null;
      if (modelYearStr && !/^\d{4}$/.test(modelYearStr) && !/^\d{4}-\d{4}$/.test(modelYearStr)) {
        return res.status(400).json({ error: 'modelYear debe ser un año (YYYY) o un rango (YYYY-YYYY)' });
      }
      item.modelYear = modelYearStr;
    }
    if (active !== undefined) item.active = Boolean(active);
    
    try {
      await item.save();
      res.json(item.toObject());
    } catch (e) {
      if (e?.code === 11000) {
        return res.status(409).json({ 
          error: 'Ya existe un vehículo con estas características',
          message: 'No se puede actualizar porque ya existe otro vehículo con estos datos'
        });
      }
      throw e;
    }
  } catch (err) {
    res.status(500).json({ error: 'Error al actualizar vehículo', message: err.message });
  }
};

// ============ delete ============
export const deleteVehicle = async (req, res) => {
  try {
    const { id } = req.params;
    const { hard } = req.query || {}; // Si hard=true, eliminar permanentemente
    
    if (hard === 'true') {
      const del = await Vehicle.deleteOne({ _id: id });
      return res.json({ deleted: del?.deletedCount || 0 });
    }
    
    // Soft delete por defecto
    const item = await Vehicle.findById(id);
    if (!item) {
      return res.status(404).json({ error: 'Vehículo no encontrado' });
    }
    
    item.active = false;
    await item.save();
    res.json({ deleted: 1, message: 'Vehículo desactivado' });
  } catch (err) {
    res.status(500).json({ error: 'Error al eliminar vehículo', message: err.message });
  }
};

// ============ search (para autocompletar) ============
export const searchVehicles = async (req, res) => {
  try {
    const { q, make, limit = 50 } = req.query || {};
    const query = { active: true };
    
    if (make) {
      query.make = cleanStr(make);
    }
    
    if (q) {
      const searchClean = cleanStr(q);
      // Dividir la búsqueda en palabras individuales
      const searchWords = searchClean.split(/\s+/).filter(w => w.length > 0);
      
      if (searchWords.length > 0) {
        // Construir condiciones más flexibles
        const orConditions = [];
        
        // Para cada palabra, buscar en cualquier campo
        searchWords.forEach(word => {
          orConditions.push(
            { make: { $regex: word, $options: 'i' } },
            { line: { $regex: word, $options: 'i' } },
            { displacement: { $regex: word, $options: 'i' } }
          );
        });
        
        // Si hay múltiples palabras, también buscar la combinación completa
        if (searchWords.length > 1) {
          const fullSearch = searchWords.join('.*');
          orConditions.push(
            { make: { $regex: fullSearch, $options: 'i' } },
            { line: { $regex: fullSearch, $options: 'i' } },
            { displacement: { $regex: fullSearch, $options: 'i' } }
          );
        }
        
        // Buscar en la combinación de campos (make + line + displacement)
        // Usar $expr para concatenar campos y buscar en el resultado
        const combinedSearch = searchWords.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*');
        orConditions.push({
          $expr: {
            $regexMatch: {
              input: { $concat: ['$make', ' ', '$line', ' ', '$displacement'] },
              regex: combinedSearch,
              options: 'i'
            }
          }
        });
        
        query.$or = orConditions;
      }
    }
    
    const items = await Vehicle.find(query)
      .sort({ make: 1, line: 1, displacement: 1 })
      .limit(Number(limit))
      .lean();
    
    // Si hay búsqueda, ordenar por relevancia (coincidencias exactas primero)
    if (q && items.length > 0) {
      const searchClean = cleanStr(q);
      const searchWords = searchClean.split(/\s+/).filter(w => w.length > 0);
      
      items.sort((a, b) => {
        const aFull = `${a.make} ${a.line} ${a.displacement}`.toUpperCase();
        const bFull = `${b.make} ${b.line} ${b.displacement}`.toUpperCase();
        
        // Priorizar coincidencias exactas o que empiezan con la búsqueda
        const aStarts = aFull.startsWith(searchClean);
        const bStarts = bFull.startsWith(searchClean);
        if (aStarts && !bStarts) return -1;
        if (!aStarts && bStarts) return 1;
        
        // Priorizar coincidencias en make
        const aMakeMatch = a.make.includes(searchWords[0] || '');
        const bMakeMatch = b.make.includes(searchWords[0] || '');
        if (aMakeMatch && !bMakeMatch) return -1;
        if (!aMakeMatch && bMakeMatch) return 1;
        
        return 0;
      });
    }
    
    res.json({ items });
  } catch (err) {
    res.status(500).json({ error: 'Error en búsqueda', message: err.message });
  }
};

// ============ get makes (marcas únicas) ============
export const getMakes = async (req, res) => {
  try {
    const makes = await Vehicle.distinct('make', { active: true }).sort();
    res.json({ makes });
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener marcas', message: err.message });
  }
};

// ============ get lines by make ============
export const getLinesByMake = async (req, res) => {
  try {
    const { make } = req.params;
    if (!make) {
      return res.status(400).json({ error: 'make es requerido' });
    }
    
    const lines = await Vehicle.distinct('line', { 
      make: cleanStr(make), 
      active: true 
    }).sort();
    
    res.json({ lines });
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener líneas', message: err.message });
  }
};

// ============ validate year ============
export const validateYear = async (req, res) => {
  try {
    const { vehicleId, year } = req.query || {};
    if (!vehicleId || !year) {
      return res.status(400).json({ error: 'vehicleId y year son requeridos' });
    }
    
    const vehicle = await Vehicle.findById(vehicleId);
    if (!vehicle) {
      return res.status(404).json({ error: 'Vehículo no encontrado' });
    }
    
    const yearNum = Number(year);
    const isValid = vehicle.isYearInRange(yearNum);
    const range = vehicle.getYearRange();
    
    res.json({ 
      valid: isValid,
      vehicle: {
        make: vehicle.make,
        line: vehicle.line,
        displacement: vehicle.displacement,
        modelYear: vehicle.modelYear
      },
      range,
      message: isValid 
        ? 'Año válido' 
        : `El año ${year} está fuera del rango permitido para este vehículo${range ? ` (${range.start}-${range.end})` : ''}`
    });
  } catch (err) {
    res.status(500).json({ error: 'Error al validar año', message: err.message });
  }
};

