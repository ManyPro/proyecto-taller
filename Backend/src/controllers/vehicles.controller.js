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
      query.$or = [
        { make: { $regex: searchClean, $options: 'i' } },
        { line: { $regex: searchClean, $options: 'i' } },
        { displacement: { $regex: searchClean, $options: 'i' } }
      ];
    }
    
    const items = await Vehicle.find(query)
      .sort({ make: 1, line: 1, displacement: 1 })
      .limit(Number(limit))
      .lean();
    
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

