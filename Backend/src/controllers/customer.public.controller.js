import mongoose from 'mongoose';
import CustomerProfile from '../models/CustomerProfile.js';
import Sale from '../models/Sale.js';
import VehicleServiceSchedule from '../models/VehicleServiceSchedule.js';
import Company from '../models/Company.js';
import { logger } from '../lib/logger.js';

/**
 * Listar talleres/empresas disponibles (público)
 * GET /api/v1/public/customer/companies?search=...
 */
export const listCompanies = async (req, res) => {
  try {
    const { search = '' } = req.query;
    const searchTerm = String(search).trim().toLowerCase();
    
    // Construir query
    const query = { active: true };
    
    if (searchTerm) {
      query.$or = [
        { name: { $regex: searchTerm, $options: 'i' } },
        { email: { $regex: searchTerm, $options: 'i' } }
      ];
    }
    
    // Obtener empresas activas (solo nombre, email, id)
    const companies = await Company.find(query)
      .select('_id name email')
      .sort({ name: 1 })
      .limit(100)
      .lean();
    
    res.json({
      companies: companies.map(c => ({
        id: c._id.toString(),
        name: c.name || '',
        email: c.email || ''
      }))
    });
  } catch (error) {
    logger.error('[customer.public.listCompanies] Error', { error: error.message, stack: error.stack });
    res.status(500).json({ error: 'Error al obtener lista de talleres' });
  }
};

/**
 * Autenticación de cliente por placa y primeros 6 dígitos del teléfono
 * POST /api/v1/public/customer/auth
 * body: { plate, phonePassword }
 */
export const authenticateCustomer = async (req, res) => {
  try {
    const { companyId } = req.params;
    const { plate, phonePassword } = req.body;

    if (!plate || !phonePassword) {
      return res.status(400).json({ error: 'Placa y contraseña son requeridos' });
    }

    if (!mongoose.Types.ObjectId.isValid(companyId)) {
      return res.status(400).json({ error: 'companyId inválido' });
    }

    const plateUpper = String(plate).trim().toUpperCase();
    const phonePasswordStr = String(phonePassword).trim();

    // Buscar perfil del cliente por placa
    const profile = await CustomerProfile.findOne({
      companyId,
      plate: plateUpper
    });

    if (!profile) {
      return res.status(401).json({ error: 'Vehículo no encontrado' });
    }

    // Verificar contraseña (primeros 6 dígitos del teléfono)
    const customerPhone = String(profile.customer?.phone || '').trim();
    if (!customerPhone || customerPhone.length < 6) {
      return res.status(401).json({ error: 'Teléfono no registrado o inválido' });
    }

    const phoneFirst6 = customerPhone.substring(0, 6);
    if (phoneFirst6 !== phonePasswordStr) {
      return res.status(401).json({ error: 'Contraseña incorrecta' });
    }

    // Retornar información básica del cliente (sin datos sensibles)
    res.json({
      success: true,
      customer: {
        name: profile.customer?.name || '',
        plate: profile.plate,
        tier: profile.tier || 'General', // Incluir tier del cliente
        vehicle: {
          brand: profile.vehicle?.brand || '',
          line: profile.vehicle?.line || '',
          engine: profile.vehicle?.engine || '',
          year: profile.vehicle?.year || null,
          mileage: profile.vehicle?.mileage || null
        }
      }
    });
  } catch (error) {
    logger.error('[customer.public.auth] Error', { error: error.message, stack: error.stack });
    res.status(500).json({ error: 'Error al autenticar cliente' });
  }
};

/**
 * Obtener historial de servicios realizados al vehículo
 * GET /api/v1/public/customer/:companyId/services?plate=ABC123
 * header: X-Phone-Password: primeros 6 dígitos del teléfono
 */
export const getVehicleServices = async (req, res) => {
  try {
    const { companyId } = req.params;
    const { plate } = req.query;
    const phonePassword = req.headers['x-phone-password'];

    if (!plate || !phonePassword) {
      return res.status(400).json({ error: 'Placa y contraseña son requeridos' });
    }

    if (!mongoose.Types.ObjectId.isValid(companyId)) {
      return res.status(400).json({ error: 'companyId inválido' });
    }

    const plateUpper = String(plate).trim().toUpperCase();
    const phonePasswordStr = String(phonePassword).trim();

    // Verificar autenticación
    const profile = await CustomerProfile.findOne({
      companyId,
      plate: plateUpper
    });

    if (!profile) {
      return res.status(404).json({ error: 'Vehículo no encontrado' });
    }

    const customerPhone = String(profile.customer?.phone || '').trim();
    if (!customerPhone || customerPhone.length < 6) {
      return res.status(401).json({ error: 'Teléfono no registrado' });
    }

    const phoneFirst6 = customerPhone.substring(0, 6);
    if (phoneFirst6 !== phonePasswordStr) {
      return res.status(401).json({ error: 'Contraseña incorrecta' });
    }

    // Buscar todas las ventas cerradas para este vehículo
    const sales = await Sale.find({
      companyId: new mongoose.Types.ObjectId(companyId),
      'vehicle.plate': plateUpper,
      status: 'closed'
    })
      .sort({ closedAt: -1 })
      .lean();

    // Obtener historial de servicios del cliente para mapear serviceKeys a nombres
    const MaintenanceTemplate = (await import('../models/MaintenanceTemplate.js')).default;
    const VehicleServiceSchedule = (await import('../models/VehicleServiceSchedule.js')).default;
    const serviceHistory = profile.serviceHistory || [];
    const serviceKeyToName = new Map();
    
    // Recopilar todos los serviceKeys/SKUs que necesitamos mapear
    const allServiceKeys = new Set();
    
    // Agregar serviceKeys del historial del cliente
    serviceHistory.forEach(h => {
      if (h.serviceKey) allServiceKeys.add(String(h.serviceKey).toUpperCase());
    });
    
    // Agregar SKUs de todas las ventas
    sales.forEach(sale => {
      sale.items.forEach(item => {
        const sku = String(item.sku || '').toUpperCase();
        const name = String(item.name || '').toUpperCase();
        
        // Si el SKU parece un serviceKey (REN-*, SRV-*, etc.)
        if (sku && (sku.startsWith('REN-') || sku.startsWith('SRV-'))) {
          allServiceKeys.add(sku);
        }
        
        // Si el nombre parece un serviceKey
        if (name && (name.startsWith('REN-') || name.startsWith('SRV-'))) {
          allServiceKeys.add(name);
        }
      });
    });
    
    // Mapear serviceKeys a nombres desde MaintenanceTemplate
    if (allServiceKeys.size > 0) {
      const serviceKeysArray = Array.from(allServiceKeys);
      const templates = await MaintenanceTemplate.find({
        companyId,
        serviceId: { $in: serviceKeysArray },
        active: { $ne: false }
      }).select('serviceId serviceName').lean();
      
      templates.forEach(t => {
        const key = String(t.serviceId).toUpperCase();
        serviceKeyToName.set(key, t.serviceName);
      });
    }
    
    // También buscar en VehicleServiceSchedule si hay vehicleId
    if (profile.vehicle?.vehicleId && mongoose.Types.ObjectId.isValid(profile.vehicle.vehicleId)) {
      const schedule = await VehicleServiceSchedule.findOne({
        companyId,
        vehicleId: new mongoose.Types.ObjectId(profile.vehicle.vehicleId)
      }).lean();
      
      if (schedule && schedule.services) {
        schedule.services.forEach(service => {
          if (service.serviceKey) {
            const key = String(service.serviceKey).toUpperCase();
            // Solo agregar si no existe ya en el mapa (priorizar MaintenanceTemplate)
            if (!serviceKeyToName.has(key) && service.serviceName) {
              serviceKeyToName.set(key, service.serviceName);
            }
          }
        });
      }
    }
    
    // Función helper para obtener nombre legible de un servicio
    const getServiceDisplayName = (name, sku) => {
      const nameUpper = String(name || '').toUpperCase().trim();
      const skuUpper = String(sku || '').toUpperCase().trim();
      
      // Si el nombre ya es legible (no parece un SKU), usarlo
      if (name && !nameUpper.startsWith('REN-') && !nameUpper.startsWith('SRV-') && name.length > 5) {
        return name;
      }
      
      // Intentar buscar por SKU primero
      if (skuUpper && serviceKeyToName.has(skuUpper)) {
        return serviceKeyToName.get(skuUpper);
      }
      
      // Intentar buscar por nombre si parece un serviceKey
      if (nameUpper && (nameUpper.startsWith('REN-') || nameUpper.startsWith('SRV-'))) {
        if (serviceKeyToName.has(nameUpper)) {
          return serviceKeyToName.get(nameUpper);
        }
      }
      
      // Si no se encuentra, intentar limpiar el nombre (remover REN- y convertir a título legible)
      if (nameUpper.startsWith('REN-')) {
        let cleaned = nameUpper.replace(/^REN-/, '');
        
        // Convertir palabras comunes a formato legible
        cleaned = cleaned
          .replace(/CAMBIODEACEITE/g, 'Cambio de aceite')
          .replace(/CAMBIODEFILTRO/g, 'Cambio de filtro')
          .replace(/FILTRODEAIRE/g, 'Filtro de aire')
          .replace(/FILTRODEACEITE/g, 'Filtro de aceite')
          .replace(/FILTRODEMOTOR/g, 'Filtro de motor')
          .replace(/MOTOR/g, 'motor')
          .replace(/([A-Z])([A-Z]+)/g, (match, p1, p2) => {
            // Si hay mayúsculas consecutivas, separarlas
            return p1 + ' ' + p2.toLowerCase();
          })
          .replace(/([a-z])([A-Z])/g, '$1 $2'); // Separar camelCase
        
        // Capitalizar primera letra y el resto en minúsculas
        cleaned = cleaned
          .split(' ')
          .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
          .join(' ');
        
        return cleaned || name;
      }
      
      // Último recurso: devolver el nombre original
      return name || sku || 'Servicio';
    };
    
    // Procesar servicios de cada venta
    const servicesHistory = [];
    
    sales.forEach(sale => {
      const saleServices = [];
      
      // Extraer servicios de los items
      sale.items.forEach(item => {
        const source = item.source || '';
        const sku = String(item.sku || '').toUpperCase();
        const name = item.name || '';
        
        // Identificar servicios
        let isService = false;
        
        if (source === 'service') {
          isService = true;
        } else if (source === 'price' && sku.startsWith('SRV-')) {
          isService = true;
        } else if (name && (name.toLowerCase().includes('servicio') || 
                           name.toLowerCase().includes('mantenimiento') ||
                           name.toLowerCase().includes('reparación'))) {
          // Heurística: si el nombre sugiere servicio
          isService = true;
        }
        
        if (isService && name) {
          // Obtener nombre legible del servicio
          const displayName = getServiceDisplayName(name, sku);
          
          saleServices.push({
            name: displayName,
            sku: sku || '',
            qty: item.qty || 1,
            unitPrice: item.unitPrice || 0,
            total: item.total || 0
          });
        }
      });
      
      // Agregar servicios de mantenimiento del historial del cliente que corresponden a esta venta
      const saleId = sale._id.toString();
      const saleIdObj = sale._id;
      
      serviceHistory.forEach(historyItem => {
        // Comparar tanto como string como ObjectId
        const historySaleId = historyItem.saleId;
        let matchesSale = false;
        
        if (historySaleId) {
          // Intentar diferentes formas de comparación
          if (typeof historySaleId === 'string') {
            matchesSale = historySaleId === saleId;
          } else if (historySaleId.toString) {
            matchesSale = historySaleId.toString() === saleId;
          } else if (historySaleId._id) {
            matchesSale = historySaleId._id.toString() === saleId;
          } else if (mongoose.Types.ObjectId.isValid(historySaleId)) {
            matchesSale = new mongoose.Types.ObjectId(historySaleId).toString() === saleId;
          }
        }
        
        if (matchesSale) {
          const serviceKeyUpper = String(historyItem.serviceKey || '').toUpperCase();
          const serviceName = serviceKeyToName.get(serviceKeyUpper) || historyItem.serviceKey;
          // Verificar que no esté ya en saleServices (evitar duplicados)
          const alreadyIncluded = saleServices.some(s => 
            s.name.toLowerCase() === serviceName.toLowerCase() ||
            s.sku === serviceKeyUpper ||
            (s.isMaintenanceService && s.sku === serviceKeyUpper)
          );
          
          if (!alreadyIncluded) {
            saleServices.push({
              name: serviceName,
              sku: serviceKeyUpper,
              qty: 1,
              unitPrice: 0,
              total: 0,
              isMaintenanceService: true,
              mileage: historyItem.lastPerformedMileage,
              date: historyItem.lastPerformedDate
            });
          }
        }
      });
      
      // Incluir la venta si tiene servicios, servicios de mantenimiento asociados, O si tiene items (aunque no sean servicios explícitos)
      // Esto asegura que todas las ventas cerradas aparezcan en el historial
      if (saleServices.length > 0 || sale.items.length > 0) {
        // Si no hay servicios explícitos pero hay items, incluir la venta con los items como servicios
        if (saleServices.length === 0 && sale.items.length > 0) {
          sale.items.forEach(item => {
            if (item.name) {
              // Obtener nombre legible del servicio
              const displayName = getServiceDisplayName(item.name, item.sku);
              
              saleServices.push({
                name: displayName,
                sku: item.sku || '',
                qty: item.qty || 1,
                unitPrice: item.unitPrice || 0,
                total: item.total || 0
              });
            }
          });
        }
        
        servicesHistory.push({
          saleNumber: sale.number || null,
          date: sale.closedAt || sale.createdAt,
          mileage: sale.vehicle?.mileage || null,
          services: saleServices,
          total: sale.total || 0,
          technician: sale.technician || sale.closingTechnician || ''
        });
      }
    });

    res.json({
      vehicle: {
        plate: profile.plate,
        brand: profile.vehicle?.brand || '',
        line: profile.vehicle?.line || '',
        engine: profile.vehicle?.engine || '',
        year: profile.vehicle?.year || null,
        currentMileage: profile.vehicle?.mileage || null
      },
      servicesHistory
    });
  } catch (error) {
    logger.error('[customer.public.services] Error', { error: error.message, stack: error.stack });
    res.status(500).json({ error: 'Error al obtener servicios' });
  }
};

/**
 * Obtener planilla de servicios por kilometraje
 * GET /api/v1/public/customer/:companyId/schedule?plate=ABC123
 * header: X-Phone-Password: primeros 6 dígitos del teléfono
 */
export const getVehicleServiceSchedule = async (req, res) => {
  try {
    const { companyId } = req.params;
    const { plate } = req.query;
    const phonePassword = req.headers['x-phone-password'];

    if (!plate || !phonePassword) {
      return res.status(400).json({ error: 'Placa y contraseña son requeridos' });
    }

    if (!mongoose.Types.ObjectId.isValid(companyId)) {
      return res.status(400).json({ error: 'companyId inválido' });
    }

    const plateUpper = String(plate).trim().toUpperCase();
    const phonePasswordStr = String(phonePassword).trim();

    // Verificar autenticación
    const profile = await CustomerProfile.findOne({
      companyId,
      plate: plateUpper
    });

    if (!profile) {
      return res.status(404).json({ error: 'Vehículo no encontrado' });
    }

    const customerPhone = String(profile.customer?.phone || '').trim();
    if (!customerPhone || customerPhone.length < 6) {
      return res.status(401).json({ error: 'Teléfono no registrado' });
    }

    const phoneFirst6 = customerPhone.substring(0, 6);
    if (phoneFirst6 !== phonePasswordStr) {
      return res.status(401).json({ error: 'Contraseña incorrecta' });
    }

    // Obtener vehicleId del perfil
    const vehicleId = profile.vehicle?.vehicleId;
    if (!vehicleId || !mongoose.Types.ObjectId.isValid(vehicleId)) {
      return res.status(400).json({ error: 'El vehículo no está correctamente vinculado. Contacte al taller.' });
    }

    // Buscar planilla del vehículo (compartida por todos los clientes con el mismo vehículo)
    let schedule = await VehicleServiceSchedule.findOne({
      companyId,
      vehicleId: new mongoose.Types.ObjectId(vehicleId)
    });

    // Si no existe planilla para este vehículo, NO crear una nueva dinámicamente
    // La planilla debe ser generada por el script generate_renault_schedules.js
    // para asegurar que solo se incluyan las plantillas correctas para cada vehículo
    if (!schedule) {
      logger.warn('[getVehicleServiceSchedule] Planilla no encontrada para vehículo', {
        companyId,
        vehicleId,
        plate: plateUpper
      });
      return res.json({
        vehicle: {
          plate: profile.plate,
          brand: profile.vehicle?.brand || '',
          line: profile.vehicle?.line || '',
          engine: profile.vehicle?.engine || '',
          year: profile.vehicle?.year || null
        },
        schedule: {
          currentMileage: profile.vehicle?.mileage || null,
          mileageUpdatedAt: profile.updatedAt,
          services: [],
          notes: 'Planilla no configurada. Contacte al taller para configurar los servicios de mantenimiento.'
        }
      });
    }

    // Obtener kilometraje actual del cliente
    const currentMileage = profile.vehicle?.mileage || null;
    
    // Obtener historial de servicios del cliente
    const serviceHistory = (profile.serviceHistory || []).map(h => ({
      serviceKey: h.serviceKey,
      lastPerformedMileage: h.lastPerformedMileage,
      lastPerformedDate: h.lastPerformedDate
    }));

    // Calcular servicios con datos del cliente
    const servicesWithCustomerData = schedule.calculateServicesForCustomer(currentMileage, serviceHistory);

    res.json({
      vehicle: {
        plate: profile.plate,
        brand: profile.vehicle?.brand || '',
        line: profile.vehicle?.line || '',
        engine: profile.vehicle?.engine || '',
        year: profile.vehicle?.year || null
      },
      schedule: {
        currentMileage: currentMileage,
        mileageUpdatedAt: profile.updatedAt, // Usar fecha de actualización del perfil
        services: servicesWithCustomerData.map((s, index) => ({
          id: schedule.services[index]?._id || s._id || index.toString(),
          serviceName: s.serviceName,
          serviceKey: s.serviceKey,
          system: s.system || '',
          mileageInterval: s.mileageInterval,
          mileageIntervalMax: s.mileageIntervalMax || null,
          monthsInterval: s.monthsInterval || 0,
          lastPerformedMileage: s.lastPerformedMileage,
          lastPerformedDate: s.lastPerformedDate,
          nextDueMileage: s.nextDueMileage,
          nextDueDate: s.nextDueDate,
          status: s.status,
          notes: s.notes || ''
        })),
        notes: schedule.notes
      }
    });
  } catch (error) {
    logger.error('[customer.public.schedule] Error', { error: error.message, stack: error.stack });
    res.status(500).json({ error: 'Error al obtener planilla de servicios' });
  }
};

/**
 * Actualizar planilla de servicios desde el cliente
 * PUT /api/v1/public/customer/:companyId/schedule?plate=ABC123
 * body: { mileage, services: [{ serviceId, action: 'completed'|'skipped', mileage }] }
 * header: X-Phone-Password: primeros 6 dígitos del teléfono
 */
export const updateVehicleServiceSchedule = async (req, res) => {
  try {
    const { companyId } = req.params;
    const { mileage, services = [] } = req.body;
    const { plate } = req.query;
    const phonePassword = req.headers['x-phone-password'];

    if (!plate || !phonePassword) {
      return res.status(400).json({ error: 'Placa y contraseña son requeridos' });
    }

    if (!mongoose.Types.ObjectId.isValid(companyId)) {
      return res.status(400).json({ error: 'companyId inválido' });
    }

    const plateUpper = String(plate).trim().toUpperCase();
    const phonePasswordStr = String(phonePassword).trim();

    // Verificar autenticación
    const profile = await CustomerProfile.findOne({
      companyId,
      plate: plateUpper
    });

    if (!profile) {
      return res.status(404).json({ error: 'Vehículo no encontrado' });
    }

    const customerPhone = String(profile.customer?.phone || '').trim();
    if (!customerPhone || customerPhone.length < 6) {
      return res.status(401).json({ error: 'Teléfono no registrado' });
    }

    const phoneFirst6 = customerPhone.substring(0, 6);
    if (phoneFirst6 !== phonePasswordStr) {
      return res.status(401).json({ error: 'Contraseña incorrecta' });
    }

    // Obtener vehicleId del perfil
    const vehicleId = profile.vehicle?.vehicleId;
    if (!vehicleId || !mongoose.Types.ObjectId.isValid(vehicleId)) {
      return res.status(400).json({ error: 'El vehículo no está correctamente vinculado. Contacte al taller.' });
    }

    // Buscar planilla del vehículo (compartida por todos los clientes)
    let schedule = await VehicleServiceSchedule.findOne({
      companyId,
      vehicleId: new mongoose.Types.ObjectId(vehicleId)
    });

    // Si no existe planilla, NO crear una nueva dinámicamente
    // La planilla debe ser generada por el script generate_renault_schedules.js
    if (!schedule) {
      logger.warn('[updateVehicleServiceSchedule] Planilla no encontrada para vehículo', {
        companyId,
        vehicleId,
        plate: plateUpper
      });
      return res.status(404).json({ 
        error: 'Planilla de servicios no configurada. Contacte al taller para configurar los servicios de mantenimiento.' 
      });
    }

    // Actualizar kilometraje del cliente si se proporciona
    const newMileage = mileage !== null && mileage !== undefined ? Number(mileage) : profile.vehicle?.mileage || null;
    const updateData = {};
    
    if (newMileage !== null && newMileage >= 0) {
      updateData['vehicle.mileage'] = newMileage;
    }

    // Obtener historial actual del cliente
    const currentHistory = profile.serviceHistory || [];
    const historyMap = new Map();
    currentHistory.forEach(h => {
      if (h.serviceKey) {
        historyMap.set(h.serviceKey, h);
      }
    });

    // Procesar actualizaciones de servicios
    for (const serviceUpdate of services) {
      const { serviceId, action, mileage: serviceMileage } = serviceUpdate;
      
      if (!serviceId) continue;

      // Buscar el servicio en la planilla base
      // El serviceId puede venir como serviceId o serviceKey, normalizar
      const serviceIdUpper = String(serviceId).trim().toUpperCase();
      const scheduleService = schedule.services.find(s => 
        s.serviceKey === serviceIdUpper || 
        String(s.serviceKey || '').toUpperCase() === serviceIdUpper
      );

      if (!scheduleService) {
        logger.warn('[updateVehicleServiceSchedule] Servicio no encontrado en planilla', { 
          serviceId,
          serviceIdUpper,
          availableServiceKeys: schedule.services.map(s => s.serviceKey).slice(0, 5)
        });
        continue;
      }

      if (action === 'completed') {
        const serviceMileageNum = serviceMileage ? Number(serviceMileage) : newMileage;
        if (serviceMileageNum && serviceMileageNum > 0) {
          const existingHistory = historyMap.get(scheduleService.serviceKey);
          
          // Solo actualizar si el kilometraje es mayor (servicio más reciente)
          if (!existingHistory || serviceMileageNum >= existingHistory.lastPerformedMileage) {
            historyMap.set(scheduleService.serviceKey, {
              serviceKey: scheduleService.serviceKey,
              lastPerformedMileage: serviceMileageNum,
              lastPerformedDate: new Date(),
              saleId: null // No hay venta asociada en actualización manual
            });
          }
        }
      }
      // Para 'skipped' no hacemos nada, solo se recalcula al consultar
    }

    // Actualizar perfil con historial y kilometraje
    updateData.serviceHistory = Array.from(historyMap.values());
    
    await CustomerProfile.updateOne(
      { _id: profile._id },
      { $set: updateData }
    );

    // Recalcular servicios con datos del cliente para la respuesta
    const finalMileage = newMileage || profile.vehicle?.mileage || null;
    const serviceHistory = Array.from(historyMap.values());
    const servicesWithCustomerData = schedule.calculateServicesForCustomer(finalMileage, serviceHistory);

    res.json({
      success: true,
      schedule: {
        currentMileage: finalMileage,
        mileageUpdatedAt: new Date(),
        services: servicesWithCustomerData.map((s, index) => ({
          id: schedule.services[index]?._id || s._id || index.toString(),
          serviceName: s.serviceName,
          serviceKey: s.serviceKey,
          system: s.system || '',
          mileageInterval: s.mileageInterval,
          mileageIntervalMax: s.mileageIntervalMax || null,
          monthsInterval: s.monthsInterval || 0,
          lastPerformedMileage: s.lastPerformedMileage,
          lastPerformedDate: s.lastPerformedDate,
          nextDueMileage: s.nextDueMileage,
          nextDueDate: s.nextDueDate,
          status: s.status,
          notes: s.notes || ''
        }))
      }
    });
  } catch (error) {
    logger.error('[customer.public.updateSchedule] Error', { error: error.message, stack: error.stack });
    res.status(500).json({ error: 'Error al actualizar planilla de servicios' });
  }
};

