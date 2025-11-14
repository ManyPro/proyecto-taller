import { Router } from 'express';
import Company from '../models/Company.js';
import TechnicianConfig from '../models/TechnicianConfig.js';
import { authCompany } from '../middlewares/auth.js';

const router = Router();

// Middleware para cargar empresa
router.use(authCompany);
router.use(async (req, res, next) => {
  const company = await Company.findById(req.company.id);
  if (!company) return res.status(404).json({ error: 'Empresa no encontrada' });
  req.companyDoc = company;
  next();
});

// ========== Technicians CRUD ==========
router.get('/technicians', (req, res) => {
  // Convertir a JSON y parsear para obtener objetos planos (evita problemas con documentos Mongoose)
  const rawTechnicians = JSON.parse(JSON.stringify(req.companyDoc.technicians || []));
  
  // Función auxiliar para extraer nombre como string
  const extractName = (obj) => {
    if (!obj) return 'Sin nombre';
    
    // Si es string, devolverlo directamente
    if (typeof obj === 'string') {
      return obj.trim() || 'Sin nombre';
    }
    
    // Si es objeto con propiedad name
    if (obj && typeof obj === 'object') {
      // Si tiene propiedad name
      if (obj.name !== undefined && obj.name !== null) {
        // Si name es string
        if (typeof obj.name === 'string') {
          return obj.name.trim() || 'Sin nombre';
        }
        // Si name es objeto (caracteres indexados), convertirlo
        if (typeof obj.name === 'object') {
          try {
            const nameKeys = Object.keys(obj.name);
            if (nameKeys.length > 0) {
              // Si tiene claves numéricas, es un string indexado
              if (nameKeys.every(k => /^\d+$/.test(k))) {
                return Object.values(obj.name).join('').trim() || 'Sin nombre';
              }
            }
            return String(obj.name).trim() || 'Sin nombre';
          } catch (e) {
            return 'Sin nombre';
          }
        }
        return String(obj.name).trim() || 'Sin nombre';
      }
      
      // Si no tiene name pero tiene claves numéricas, es un string antiguo
      const keys = Object.keys(obj);
      if (keys.length > 0 && keys.every(k => /^\d+$/.test(k))) {
        try {
          return Object.values(obj).join('').trim() || 'Sin nombre';
        } catch (e) {
          return 'Sin nombre';
        }
      }
    }
    
    return 'Sin nombre';
  };
  
  // Normalizar: convertir strings antiguos a objetos con nombre SIEMPRE como string
  const technicians = rawTechnicians.map(t => {
    const name = extractName(t);
    
    // Extraer otros campos
    let identification = '';
    let basicSalary = null;
    let workHoursPerMonth = null;
    let basicSalaryPerDay = null;
    let contractType = '';
    
    if (t && typeof t === 'object') {
      identification = String(t.identification || '').trim();
      basicSalary = (t.basicSalary !== undefined && t.basicSalary !== null) ? Number(t.basicSalary) : null;
      workHoursPerMonth = (t.workHoursPerMonth !== undefined && t.workHoursPerMonth !== null) ? Number(t.workHoursPerMonth) : null;
      basicSalaryPerDay = (t.basicSalaryPerDay !== undefined && t.basicSalaryPerDay !== null) ? Number(t.basicSalaryPerDay) : null;
      contractType = String(t.contractType || '').trim();
    }
    
    // Retornar objeto normalizado con nombre SIEMPRE como string
    return {
      name: String(name), // Asegurar que sea string
      identification: identification,
      basicSalary: basicSalary,
      workHoursPerMonth: workHoursPerMonth,
      basicSalaryPerDay: basicSalaryPerDay,
      contractType: contractType
    };
  });
  
  res.json({ technicians });
});

router.post('/technicians', async (req, res) => {
  const name = String(req.body?.name || '').trim().toUpperCase();
  const identification = String(req.body?.identification || '').trim();
  const basicSalary = (req.body?.basicSalary !== null && req.body?.basicSalary !== undefined && req.body?.basicSalary !== '') ? Number(req.body.basicSalary) : null;
  const workHoursPerMonth = (req.body?.workHoursPerMonth !== null && req.body?.workHoursPerMonth !== undefined && req.body?.workHoursPerMonth !== '') ? Number(req.body.workHoursPerMonth) : null;
  const basicSalaryPerDay = (req.body?.basicSalaryPerDay !== null && req.body?.basicSalaryPerDay !== undefined && req.body?.basicSalaryPerDay !== '') ? Number(req.body.basicSalaryPerDay) : null;
  const contractType = String(req.body?.contractType || '').trim();
  
  if (!name) return res.status(400).json({ error: 'nombre requerido' });
  
  const technicians = JSON.parse(JSON.stringify(req.companyDoc.technicians || []));
  
  // Verificar si ya existe
  const existingIndex = technicians.findIndex(t => {
    const tName = typeof t === 'string' ? t.toUpperCase() : String(t?.name || '').toUpperCase();
    return tName === name;
  });
  
  if (existingIndex >= 0) {
    return res.status(409).json({ error: 'Ya existe un técnico con ese nombre' });
  }
  
  // Agregar nuevo técnico
  technicians.push({ 
    name, 
    identification, 
    basicSalary, 
    workHoursPerMonth, 
    basicSalaryPerDay, 
    contractType 
  });
  technicians.sort((a, b) => {
    const aName = typeof a === 'string' ? a : String(a?.name || '');
    const bName = typeof b === 'string' ? b : String(b?.name || '');
    return aName.localeCompare(bName);
  });
  
  req.companyDoc.technicians = technicians;
  await req.companyDoc.save();
  res.status(201).json({ technicians: req.companyDoc.technicians });
});

router.put('/technicians/:name', async (req, res) => {
  try {
    const name = String(req.params.name || '').trim().toUpperCase();
    const newName = String(req.body?.name || '').trim().toUpperCase();
    const identification = String(req.body?.identification || '').trim();
    const basicSalary = (req.body?.basicSalary !== null && req.body?.basicSalary !== undefined && req.body?.basicSalary !== '') ? Number(req.body.basicSalary) : null;
    const workHoursPerMonth = (req.body?.workHoursPerMonth !== null && req.body?.workHoursPerMonth !== undefined && req.body?.workHoursPerMonth !== '') ? Number(req.body.workHoursPerMonth) : null;
    const basicSalaryPerDay = (req.body?.basicSalaryPerDay !== null && req.body?.basicSalaryPerDay !== undefined && req.body?.basicSalaryPerDay !== '') ? Number(req.body.basicSalaryPerDay) : null;
    const contractType = String(req.body?.contractType || '').trim();
    
    if (!name) return res.status(400).json({ error: 'nombre requerido' });
    if (!newName) return res.status(400).json({ error: 'nuevo nombre requerido' });
    
    const technicians = JSON.parse(JSON.stringify(req.companyDoc.technicians || []));
    
    // Buscar técnico
    const existingIndex = technicians.findIndex(t => {
      const tName = typeof t === 'string' ? t.toUpperCase() : String(t?.name || '').toUpperCase();
      return tName === name;
    });
    
    if (existingIndex < 0) {
      return res.status(404).json({ error: 'Técnico no encontrado' });
    }
    
    // Si el nombre cambió, verificar que no exista otro
    if (newName !== name) {
      const nameExists = technicians.some(t => {
        const tName = typeof t === 'string' ? t.toUpperCase() : String(t?.name || '').toUpperCase();
        return tName === newName;
      });
      if (nameExists) {
        return res.status(409).json({ error: 'Ya existe un técnico con ese nombre' });
      }
    }
    
    // Actualizar
    technicians[existingIndex] = { 
      name: newName, 
      identification,
      basicSalary,
      workHoursPerMonth,
      basicSalaryPerDay,
      contractType
    };
    
    // Si el nombre cambió, actualizar referencias
    if (newName !== name) {
      const TechnicianAssignment = (await import('../models/TechnicianAssignment.js')).default;
      await TechnicianAssignment.updateMany(
        { companyId: req.companyDoc._id, technicianName: name },
        { $set: { technicianName: newName } }
      );
    }
    
    technicians.sort((a, b) => {
      const aName = typeof a === 'string' ? a : String(a?.name || '');
      const bName = typeof b === 'string' ? b : String(b?.name || '');
      return aName.localeCompare(bName);
    });
    
    req.companyDoc.technicians = technicians;
    await req.companyDoc.save();
    
    res.json({ technicians: req.companyDoc.technicians });
  } catch (err) {
    res.status(500).json({ error: 'Error al actualizar técnico', message: err.message });
  }
});

router.delete('/technicians/:name', async (req, res) => {
  try {
    const name = String(req.params.name || '').trim().toUpperCase();
    if (!name) return res.status(400).json({ error: 'nombre requerido' });
    
    // Normalizar technicians: convertir strings a objetos si es necesario
    const technicians = (req.companyDoc.technicians || []).map(t => {
      if (typeof t === 'string') {
        return { name: t.toUpperCase(), identification: '' };
      }
      return { name: String(t.name || '').toUpperCase(), identification: String(t.identification || '').trim() };
    });
    
    // Verificar que el técnico existe
    if (!technicians.some(t => t.name === name)) {
      return res.status(404).json({ error: 'Técnico no encontrado' });
    }
    
    // Eliminar técnico de la lista
    req.companyDoc.technicians = technicians.filter(t => t.name !== name);
    await req.companyDoc.save();
    
    // Eliminar todas las asignaciones de este técnico
    const { default: TechnicianAssignment } = await import('../models/TechnicianAssignment.js');
    await TechnicianAssignment.deleteMany({ 
      companyId: req.companyDoc._id, 
      technicianName: name 
    });
    
    res.json({ technicians: req.companyDoc.technicians });
  } catch (err) {
    res.status(500).json({ error: 'Error al eliminar técnico', message: err.message });
  }
});

// ========== Preferences ==========
router.get('/preferences', (req, res) => {
  res.json({ preferences: req.companyDoc.preferences || { laborPercents: [] } });
});

router.put('/preferences', async (req, res) => {
  try {
    const body = req.body || {};
    let { laborPercents, whatsAppNumber, postServiceMessage, calendar } = body;
    
    // Inicializar preferences si no existe
    req.companyDoc.preferences ||= {};
    
    // Manejar laborPercents
    if (laborPercents !== undefined) {
      if (!Array.isArray(laborPercents)) return res.status(400).json({ error: 'laborPercents debe ser array' });
      laborPercents = laborPercents
        .map(n => Number(n))
        .filter(n => Number.isFinite(n) && n >= 0 && n <= 100)
        .map(n => Math.round(n));
      // quitar duplicados y ordenar
      laborPercents = Array.from(new Set(laborPercents)).sort((a,b)=>a-b);
      req.companyDoc.preferences.laborPercents = laborPercents;
    }
    
    // Manejar whatsAppNumber
    if (typeof whatsAppNumber === 'string') {
      // store as-is; client should send E.164 or local
      req.companyDoc.preferences.whatsAppNumber = whatsAppNumber.trim();
    }
    
    // Manejar postServiceMessage
    if (postServiceMessage !== undefined && typeof postServiceMessage === 'object' && !Array.isArray(postServiceMessage)) {
      req.companyDoc.preferences.postServiceMessage ||= {};
      if (typeof postServiceMessage.ratingLink === 'string') {
        req.companyDoc.preferences.postServiceMessage.ratingLink = postServiceMessage.ratingLink.trim();
      }
      if (typeof postServiceMessage.ratingQrImageUrl === 'string') {
        req.companyDoc.preferences.postServiceMessage.ratingQrImageUrl = postServiceMessage.ratingQrImageUrl.trim();
      }
    }
    
    // Manejar calendar
    if (calendar !== undefined && typeof calendar === 'object' && !Array.isArray(calendar)) {
      req.companyDoc.preferences.calendar ||= {};
      if (typeof calendar.address === 'string') {
        req.companyDoc.preferences.calendar.address = calendar.address.trim();
      }
      if (typeof calendar.mapsLink === 'string') {
        req.companyDoc.preferences.calendar.mapsLink = calendar.mapsLink.trim();
      }
    }
    
    // Guardar solo el campo preferences usando updateOne para evitar validar otros campos
    await Company.updateOne(
      { _id: req.companyDoc._id },
      { $set: { preferences: req.companyDoc.preferences } }
    );
    
    // Recargar el documento desde la base de datos para devolver los datos actualizados
    const updatedCompany = await Company.findById(req.companyDoc._id);
    
    res.json({ preferences: updatedCompany.preferences || {} });
  } catch (err) {
    console.error('Error updating preferences:', err);
    res.status(500).json({ error: 'Error al actualizar preferencias', message: err.message });
  }
});

// ========== Features (flags por empresa) ==========
// GET actual
router.get('/features', (req, res) => {
  const features = req.companyDoc.features || {};
  const featureOptions = req.companyDoc.featureOptions || {};
  const restrictions = req.companyDoc.restrictions || {};
  res.json({ features, featureOptions, restrictions });
});

// PATCH merge parcial de flags
router.patch('/features', async (req, res) => {
  const patch = req.body || {};
  if (typeof patch !== 'object' || Array.isArray(patch)) {
    return res.status(400).json({ error: 'payload invÃ¡lido' });
  }
  req.companyDoc.features ||= {};
  Object.keys(patch).forEach(k => {
    const v = !!patch[k];
    req.companyDoc.features[k] = v;
  });
  await req.companyDoc.save();
  res.json({ features: req.companyDoc.features });
});

// GET /company/feature-options
router.get('/feature-options', (req, res) => {
  res.json({ featureOptions: req.companyDoc.featureOptions || {} });
});

// PATCH /company/feature-options
router.patch('/feature-options', async (req, res) => {
  const patch = req.body || {};
  req.companyDoc.featureOptions ||= {};
  Object.entries(patch).forEach(([moduleName, moduleOpts]) => {
    if(typeof moduleOpts !== 'object' || Array.isArray(moduleOpts)) return;
    req.companyDoc.featureOptions[moduleName] ||= {};
    Object.entries(moduleOpts).forEach(([k,v]) => { req.companyDoc.featureOptions[moduleName][k] = !!v; });
  });
  await req.companyDoc.save();
  res.json({ featureOptions: req.companyDoc.featureOptions });
});

// GET /company/restrictions
router.get('/restrictions', (req, res) => {
  res.json({ restrictions: req.companyDoc.restrictions || {} });
});

// PATCH /company/restrictions (empresa puede ver pero no deberÃ­a poder cambiar; mantener para futuros casos)
router.patch('/restrictions', async (req, res) => {
  const patch = req.body || {};
  req.companyDoc.restrictions ||= {};
  Object.entries(patch).forEach(([area, cfg]) => {
    if(typeof cfg !== 'object' || Array.isArray(cfg)) return;
    req.companyDoc.restrictions[area] ||= {};
    Object.entries(cfg).forEach(([k,v]) => { req.companyDoc.restrictions[area][k] = !!v; });
  });
  await req.companyDoc.save();
  res.json({ restrictions: req.companyDoc.restrictions });
});

// ========== Toggle CatÃ¡logo PÃºblico ==========
// Permite activar/desactivar el catÃ¡logo pÃºblico segmentado para la empresa autenticada.
// PATCH /api/v1/company/public-catalog { "enabled": true|false }
router.patch('/public-catalog', async (req, res) => {
  const { enabled } = req.body || {};
  if (typeof enabled !== 'boolean') return res.status(400).json({ error: 'enabled (boolean) requerido' });
  if (!req.companyDoc.active) return res.status(400).json({ error: 'Empresa inactiva, no se puede cambiar el catÃ¡logo' });
  req.companyDoc.publicCatalogEnabled = enabled;
  await req.companyDoc.save();
  res.json({ publicCatalogEnabled: req.companyDoc.publicCatalogEnabled });
});

export default router;

// ===== Technician config (labor kinds + technician rates) =====
// GET /api/v1/company/tech-config
router.get('/tech-config', async (req, res) => {
  let cfg = await TechnicianConfig.findOne({ companyId: req.companyDoc._id });
  if (!cfg) {
    // bootstrap from Company preferences if present
    const legacyKinds = req.companyDoc?.preferences?.laborKinds || ['MOTOR','SUSPENSION','FRENOS'];
    const kinds = Array.isArray(legacyKinds) && legacyKinds.length > 0 && typeof legacyKinds[0] === 'string'
      ? legacyKinds.map(k => ({ name: String(k).toUpperCase(), defaultPercent: 0 }))
      : legacyKinds;
    cfg = await TechnicianConfig.create({ companyId: req.companyDoc._id, laborKinds: kinds, technicians: [] });
  } else {
    // Migrar laborKinds antiguos (strings) a objetos
    if (cfg.laborKinds && cfg.laborKinds.length > 0 && typeof cfg.laborKinds[0] === 'string') {
      cfg.laborKinds = cfg.laborKinds.map(k => ({ name: String(k).toUpperCase(), defaultPercent: 0 }));
      await cfg.save();
    }
  }
  res.json({ config: cfg.toObject() });
});

// PUT /api/v1/company/tech-config
router.put('/tech-config', async (req, res) => {
  const body = req.body || {};
  const kinds = Array.isArray(body.laborKinds) ? body.laborKinds : undefined;
  const techs = Array.isArray(body.technicians) ? body.technicians : undefined;
  let cfg = await TechnicianConfig.findOne({ companyId: req.companyDoc._id });
  if (!cfg) cfg = new TechnicianConfig({ companyId: req.companyDoc._id });
  if (kinds) {
    const cleaned = [];
    for (const k of kinds) {
      if (typeof k === 'string') {
        // Migración: convertir string a objeto
        cleaned.push({ name: String(k).trim().toUpperCase(), defaultPercent: 0 });
      } else if (k && k.name) {
        const name = String(k.name || '').trim().toUpperCase();
        if (!name) continue;
        const defaultPercent = Number(k.defaultPercent || 0);
        if (!Number.isFinite(defaultPercent) || defaultPercent < 0 || defaultPercent > 100) continue;
        cleaned.push({ name, defaultPercent });
      }
    }
    // Eliminar duplicados por nombre
    const unique = [];
    const seen = new Set();
    for (const k of cleaned) {
      if (!seen.has(k.name)) {
        seen.add(k.name);
        unique.push(k);
      }
    }
    cfg.laborKinds = unique;
  }
  if (techs) {
    const cleaned = [];
    for (const t of techs) {
      const name = String(t?.name||'').trim().toUpperCase(); if (!name) continue;
      const active = !!t?.active;
      const colorRaw = String(t?.color||'').trim();
      const color = /^#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/.test(colorRaw) ? colorRaw.toUpperCase() : '#2563EB';
      const rates = Array.isArray(t?.rates) ? t.rates.map(r=>({ kind: String(r?.kind||'').trim().toUpperCase(), percent: Number(r?.percent||0) })) : [];
      const valRates = rates.filter(r=> r.kind && Number.isFinite(r.percent) && r.percent>=0 && r.percent<=100);
      cleaned.push({ name, active, color, rates: valRates });
    }
    cfg.technicians = cleaned;
  }
  await cfg.save();
  res.json({ config: cfg.toObject() });
});


