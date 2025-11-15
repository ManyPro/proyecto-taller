import { Router } from 'express';
import mongoose from 'mongoose';
import Company from '../models/Company.js';
import { authAdmin, requireAdminRole } from '../middlewares/auth.js';

const router = Router();

// All routes require admin; developer can manage all companies, admin can only see its assigned companies in future.
router.use(authAdmin);

// List companies (developer only)
router.get('/companies', requireAdminRole('developer'), async (req, res) => {
  const list = await Company.find({}).select('name email active features featureOptions restrictions publicCatalogEnabled sharedDatabaseId sharedDatabaseConfig').lean();
  res.json({ items: list });
});

// Patch top-level features (developer or admin)
router.patch('/companies/:id/features', requireAdminRole('developer','admin'), async (req, res) => {
  const id = req.params.id;
  const body = req.body || {};
  const c = await Company.findById(id);
  if(!c) return res.status(404).json({ error: 'Empresa no encontrada' });
  
  // Initialize features if not exists
  if (!c.features) {
    c.features = {};
  }
  
  // Update features with provided values
  Object.entries(body).forEach(([k,v]) => { 
    c.features[k] = !!v; 
  });
  
  await c.save();
  res.json({ features: c.features });
});

// Patch fine-grained feature options (developer only)
router.patch('/companies/:id/feature-options', requireAdminRole('developer'), async (req, res) => {
  const id = req.params.id;
  const patch = req.body || {};
  const c = await Company.findById(id);
  if(!c) return res.status(404).json({ error: 'Empresa no encontrada' });
  c.featureOptions ||= {};
  // deep merge shallowly by module
  Object.entries(patch).forEach(([moduleName, moduleOpts]) => {
    if(typeof moduleOpts !== 'object' || Array.isArray(moduleOpts)) return;
    c.featureOptions[moduleName] ||= {};
    Object.entries(moduleOpts).forEach(([k,v]) => { c.featureOptions[moduleName][k] = !!v; });
  });
  await c.save();
  res.json({ featureOptions: c.featureOptions });
});

// Patch restrictions (developer or admin) - admin UI to hide balances, etc.
router.patch('/companies/:id/restrictions', requireAdminRole('developer','admin'), async (req, res) => {
  const id = req.params.id;
  const patch = req.body || {};
  const c = await Company.findById(id);
  if(!c) return res.status(404).json({ error: 'Empresa no encontrada' });
  c.restrictions ||= {};
  
  // Manejar arrays directamente (como hiddenTabs) y objetos anidados (como cashflow)
  Object.entries(patch).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      // Si es un array, guardarlo directamente
      c.restrictions[key] = value;
    } else if (typeof value === 'object' && value !== null) {
      // Si es un objeto, hacer merge profundo preservando propiedades existentes
      c.restrictions[key] = c.restrictions[key] || {};
      Object.entries(value).forEach(([k, v]) => {
        if (Array.isArray(v)) {
          c.restrictions[key][k] = v;
        } else if (typeof v === 'object' && v !== null) {
          // Si es un objeto anidado, hacer merge también
          c.restrictions[key][k] = { ...(c.restrictions[key][k] || {}), ...v };
        } else {
          c.restrictions[key][k] = !!v;
        }
      });
    } else {
      // Valores primitivos
      c.restrictions[key] = value;
    }
  });
  
  await c.save();
  res.json({ restrictions: c.restrictions });
});

// Patch sharedDatabaseConfig (developer or admin)
// Permite agregar/quitar empresas secundarias y configurar qué compartir
router.patch('/companies/:id/shared-database-config', requireAdminRole('developer','admin'), async (req, res) => {
  const id = req.params.id;
  const { sharedWith } = req.body || {};
  const c = await Company.findById(id);
  if(!c) return res.status(404).json({ error: 'Empresa no encontrada' });
  
  // Inicializar sharedDatabaseConfig si no existe
  if (!c.sharedDatabaseConfig) {
    c.sharedDatabaseConfig = { sharedWith: [], sharedFrom: { companyId: null } };
  }
  
  // Validar y actualizar sharedWith
  if (Array.isArray(sharedWith)) {
    // Validar cada entrada
    for (const item of sharedWith) {
      if (!item.companyId || !mongoose.Types.ObjectId.isValid(item.companyId)) {
        return res.status(400).json({ error: `companyId inválido: ${item.companyId}` });
      }
      // No permitir compartir consigo misma
      if (String(id) === String(item.companyId)) {
        return res.status(400).json({ error: 'No se puede compartir base de datos consigo misma' });
      }
      // Verificar que la empresa destino existe
      const targetCompany = await Company.findById(item.companyId);
      if (!targetCompany) {
        return res.status(404).json({ error: `Empresa destino no encontrada: ${item.companyId}` });
      }
      
      // Actualizar sharedFrom en la empresa secundaria usando updateOne para evitar validación de technicians
      await Company.updateOne(
        { _id: item.companyId },
        {
          $set: {
            'sharedDatabaseConfig.sharedFrom': {
              companyId: new mongoose.Types.ObjectId(id),
              shareCustomers: item.shareCustomers !== false,
              shareInventory: item.shareInventory !== false,
              shareCalendar: item.shareCalendar === true
            }
          },
          $setOnInsert: {
            'sharedDatabaseConfig.sharedWith': []
          }
        },
        { runValidators: false, upsert: false }
      );
    }
    
    // Actualizar sharedWith en la empresa principal
    c.sharedDatabaseConfig.sharedWith = sharedWith.map(item => ({
      companyId: new mongoose.Types.ObjectId(item.companyId),
      shareCustomers: item.shareCustomers !== false,
      shareInventory: item.shareInventory !== false,
      shareCalendar: item.shareCalendar === true
    }));
  } else if (sharedWith === null || sharedWith === undefined) {
    // Si se envía null, limpiar todas las empresas compartidas
    // Primero limpiar sharedFrom en las empresas secundarias usando updateOne
    for (const item of c.sharedDatabaseConfig.sharedWith || []) {
      await Company.updateOne(
        { _id: item.companyId },
        {
          $set: {
            'sharedDatabaseConfig.sharedFrom.companyId': null
          }
        },
        { runValidators: false }
      );
    }
    c.sharedDatabaseConfig.sharedWith = [];
  }
  
  // Guardar usando updateOne para evitar validación de technicians (solo estamos actualizando sharedDatabaseConfig)
  await Company.updateOne(
    { _id: id },
    {
      $set: {
        'sharedDatabaseConfig.sharedWith': c.sharedDatabaseConfig.sharedWith
      }
    },
    { runValidators: false }
  );
  
  // Recargar para devolver el estado actualizado
  const updated = await Company.findById(id).select('sharedDatabaseConfig').lean();
  res.json({ sharedDatabaseConfig: updated?.sharedDatabaseConfig || c.sharedDatabaseConfig });
});

// DEPRECATED: Mantener por compatibilidad
router.patch('/companies/:id/shared-database', requireAdminRole('developer'), async (req, res) => {
  const id = req.params.id;
  let { sharedDatabaseId } = req.body || {};
  const c = await Company.findById(id);
  if(!c) return res.status(404).json({ error: 'Empresa no encontrada' });
  
  // Normalizar: convertir string vacío a null
  if (sharedDatabaseId === '' || sharedDatabaseId === undefined) {
    sharedDatabaseId = null;
  }
  
  // Validar que sharedDatabaseId sea un ObjectId válido o null
  if (sharedDatabaseId !== null) {
    if (!mongoose.Types.ObjectId.isValid(sharedDatabaseId)) {
      return res.status(400).json({ error: 'sharedDatabaseId inválido' });
    }
    // Verificar que la empresa destino existe
    const targetCompany = await Company.findById(sharedDatabaseId);
    if (!targetCompany) {
      return res.status(404).json({ error: 'Empresa destino no encontrada' });
    }
    // No permitir compartir BD consigo misma
    if (String(id) === String(sharedDatabaseId)) {
      return res.status(400).json({ error: 'No se puede compartir base de datos consigo misma' });
    }
    c.sharedDatabaseId = sharedDatabaseId;
  } else {
    c.sharedDatabaseId = null;
  }
  
  await c.save();
  res.json({ sharedDatabaseId: c.sharedDatabaseId });
});

export default router;

