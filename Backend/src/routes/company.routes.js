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
  // Obtener técnicos directamente del documento Mongoose
  const rawTechnicians = req.companyDoc.technicians || [];
  
  // Normalizar: convertir strings antiguos a objetos
  const technicians = rawTechnicians.map(t => {
    // Si es un string (técnicos antiguos guardados como strings)
    if (typeof t === 'string') {
      const name = String(t).trim();
      if (name) {
        return { 
          name: name, 
          identification: '', 
          basicSalary: null, 
          workHoursPerMonth: null, 
          basicSalaryPerDay: null, 
          contractType: '' 
        };
      }
    }
    
    // Si es un objeto Mongoose o un objeto plano
    if (t && typeof t === 'object') {
      // Extraer nombre de forma segura
      let name = '';
      if (t.name !== undefined && t.name !== null) {
        if (typeof t.name === 'string') {
          name = String(t.name).trim();
        } else if (typeof t.name === 'object') {
          // Si name es un objeto (caracteres indexados de Mongoose), convertirlo a string
          try {
            // Si tiene propiedades numéricas, es un string indexado
            const nameKeys = Object.keys(t.name);
            if (nameKeys.length > 0 && nameKeys.every(k => /^\d+$/.test(k))) {
              name = Object.values(t.name).join('').trim();
            } else {
              // Intentar convertir de otra forma
              name = String(t.name).trim();
            }
          } catch (e) {
            name = String(t.name).trim();
          }
        } else {
          name = String(t.name).trim();
        }
      }
      
      // Si tiene nombre válido, devolver objeto normalizado
      if (name) {
        return {
          name: name,
          identification: String(t?.identification || '').trim(),
          basicSalary: t?.basicSalary !== undefined && t?.basicSalary !== null ? Number(t.basicSalary) : null,
          workHoursPerMonth: t?.workHoursPerMonth !== undefined && t?.workHoursPerMonth !== null ? Number(t.workHoursPerMonth) : null,
          basicSalaryPerDay: t?.basicSalaryPerDay !== undefined && t?.basicSalaryPerDay !== null ? Number(t.basicSalaryPerDay) : null,
          contractType: String(t?.contractType || '').trim()
        };
      }
      
      // Si no tiene name pero es un objeto, intentar convertirlo a string
      // (puede ser un objeto Mongoose que representa un string antiguo)
      try {
        // Intentar usar toString() si está disponible (objetos Mongoose)
        const nameStr = (t.toString && typeof t.toString === 'function') ? t.toString() : String(t);
        const trimmed = String(nameStr).trim();
        if (trimmed && trimmed !== '[object Object]' && trimmed !== '{}') {
          return { 
            name: trimmed, 
            identification: '', 
            basicSalary: null, 
            workHoursPerMonth: null, 
            basicSalaryPerDay: null, 
            contractType: '' 
          };
        }
      } catch (e) {
        // Si falla, continuar con el fallback
      }
    }
    
    // Fallback: técnico sin nombre válido
    return {
      name: 'Sin nombre',
      identification: '',
      basicSalary: null,
      workHoursPerMonth: null,
      basicSalaryPerDay: null,
      contractType: ''
    };
  });
  res.json({ technicians });
});

router.post('/technicians', async (req, res) => {
  const name = String(req.body?.name || '').trim().toUpperCase();
  const identification = String(req.body?.identification || '').trim();
  if (!name) return res.status(400).json({ error: 'nombre requerido' });
  
  // Normalizar technicians: convertir strings a objetos si es necesario
  const technicians = (req.companyDoc.technicians || []).map(t => {
    if (typeof t === 'string') {
      return { name: t.toUpperCase(), identification: '' };
    }
    return { name: String(t.name || '').toUpperCase(), identification: String(t.identification || '').trim() };
  });
  
  // Verificar si ya existe un técnico con ese nombre
  const existingIndex = technicians.findIndex(t => t.name === name);
  if (existingIndex >= 0) {
    // Actualizar identificación si se proporciona
    if (identification) {
      technicians[existingIndex].identification = identification;
      req.companyDoc.technicians = technicians;
      await req.companyDoc.save();
      return res.status(200).json({ technicians: req.companyDoc.technicians });
    }
    return res.status(409).json({ error: 'Ya existe un técnico con ese nombre' });
  }
  
  // Agregar nuevo técnico
  technicians.push({ name, identification });
  technicians.sort((a, b) => a.name.localeCompare(b.name));
  req.companyDoc.technicians = technicians;
  await req.companyDoc.save();
  res.status(201).json({ technicians: req.companyDoc.technicians });
});

router.put('/technicians/:oldName', async (req, res) => {
  try {
    // Convertir a formato plano para evitar problemas con documentos Mongoose
    const rawTechnicians = JSON.parse(JSON.stringify(req.companyDoc.technicians || []));
    
    const oldNameParam = String(req.params.oldName || '').trim();
    const newName = String(req.body?.name || '').trim().toUpperCase();
    const identification = String(req.body?.identification || '').trim();
    const basicSalary = req.body?.basicSalary !== undefined && req.body?.basicSalary !== null ? Number(req.body.basicSalary) : null;
    const workHoursPerMonth = req.body?.workHoursPerMonth !== undefined && req.body?.workHoursPerMonth !== null ? Number(req.body.workHoursPerMonth) : null;
    const basicSalaryPerDay = req.body?.basicSalaryPerDay !== undefined && req.body?.basicSalaryPerDay !== null ? Number(req.body.basicSalaryPerDay) : null;
    const contractType = String(req.body?.contractType || '').trim();
    
    if (!oldNameParam) return res.status(400).json({ error: 'nombre actual requerido' });
    if (!newName) return res.status(400).json({ error: 'nuevo nombre requerido' });
    
    // Normalizar technicians: convertir strings a objetos si es necesario
    const technicians = rawTechnicians.map(t => {
      if (typeof t === 'string') {
        return { 
          name: String(t).trim().toUpperCase(), 
          identification: '', 
          basicSalary: null, 
          workHoursPerMonth: null, 
          basicSalaryPerDay: null, 
          contractType: '' 
        };
      }
      if (t && typeof t === 'object' && !Array.isArray(t)) {
        return { 
          name: String(t.name || '').trim().toUpperCase() || 'SIN NOMBRE', 
          identification: String(t.identification || '').trim(),
          basicSalary: t.basicSalary !== undefined && t.basicSalary !== null ? Number(t.basicSalary) : null,
          workHoursPerMonth: t.workHoursPerMonth !== undefined && t.workHoursPerMonth !== null ? Number(t.workHoursPerMonth) : null,
          basicSalaryPerDay: t.basicSalaryPerDay !== undefined && t.basicSalaryPerDay !== null ? Number(t.basicSalaryPerDay) : null,
          contractType: String(t.contractType || '').trim()
        };
      }
      return {
        name: 'SIN NOMBRE',
        identification: '',
        basicSalary: null,
        workHoursPerMonth: null,
        basicSalaryPerDay: null,
        contractType: ''
      };
    });
    
    // Buscar el técnico por nombre (comparar sin importar mayúsculas/minúsculas)
    const oldNameUpper = oldNameParam.toUpperCase();
    const existingIndex = technicians.findIndex(t => t.name.toUpperCase() === oldNameUpper);
    if (existingIndex < 0) {
      return res.status(404).json({ error: 'Técnico no encontrado' });
    }
    
    // Si el nuevo nombre es diferente, verificar que no exista otro con ese nombre
    const currentName = technicians[existingIndex].name;
    if (newName !== currentName && technicians.some(t => t.name === newName)) {
      return res.status(409).json({ error: 'Ya existe un técnico con ese nombre' });
    }
    
    // Actualizar técnico
    technicians[existingIndex] = { 
      name: newName, 
      identification,
      basicSalary,
      workHoursPerMonth,
      basicSalaryPerDay,
      contractType
    };
    technicians.sort((a, b) => a.name.localeCompare(b.name));
    req.companyDoc.technicians = technicians;
    await req.companyDoc.save();
    
    // Si el nombre cambió, actualizar asignaciones
    if (newName !== oldName) {
      const { default: TechnicianAssignment } = await import('../models/TechnicianAssignment.js');
      await TechnicianAssignment.updateMany(
        { companyId: req.companyDoc._id, technicianName: oldName },
        { $set: { technicianName: newName } }
      );
    }
    
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
  let { laborPercents, whatsAppNumber } = req.body || {};
  if (laborPercents) {
    if (!Array.isArray(laborPercents)) return res.status(400).json({ error: 'laborPercents debe ser array' });
    laborPercents = laborPercents
      .map(n => Number(n))
      .filter(n => Number.isFinite(n) && n >= 0 && n <= 100)
      .map(n => Math.round(n));
    // quitar duplicados y ordenar
    laborPercents = Array.from(new Set(laborPercents)).sort((a,b)=>a-b);
    req.companyDoc.preferences ||= {};
    req.companyDoc.preferences.laborPercents = laborPercents;
  }
  if (typeof whatsAppNumber === 'string') {
    req.companyDoc.preferences ||= {};
    // store as-is; client should send E.164 or local
    req.companyDoc.preferences.whatsAppNumber = whatsAppNumber.trim();
  }
  await req.companyDoc.save();
  res.json({ preferences: req.companyDoc.preferences });
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


