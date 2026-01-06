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
          saleServices.push({
            name,
            sku: sku || '',
            qty: item.qty || 1,
            unitPrice: item.unitPrice || 0,
            total: item.total || 0
          });
        }
      });
      
      if (saleServices.length > 0) {
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

    // Si no existe planilla para este vehículo, crearla con plantillas de mantenimiento
    if (!schedule) {
      const MaintenanceTemplate = (await import('../models/MaintenanceTemplate.js')).default;
      
      // Obtener información del vehículo para filtrar plantillas
      const vehicleBrand = profile.vehicle?.brand?.toUpperCase() || '';
      const vehicleLine = profile.vehicle?.line?.toUpperCase() || '';
      
      // Buscar plantillas de mantenimiento aplicables
      const templateQuery = {
        companyId,
        active: { $ne: false },
        mileageInterval: { $gt: 0 }
      };
      
      // Filtrar por marca si está disponible
      if (vehicleBrand) {
        templateQuery.$or = [
          { makes: { $in: [vehicleBrand] } },
          { makes: { $size: 0 } },
          { makes: { $exists: false } }
        ];
      }
      
      // También filtrar por vehicleId si está disponible
      if (vehicleId) {
        templateQuery.$or = [
          ...(templateQuery.$or || []),
          { vehicleIds: new mongoose.Types.ObjectId(vehicleId) }
        ];
      }
      
      // Traer plantillas ordenadas por prioridad
      const templates = await MaintenanceTemplate.find(templateQuery)
        .sort({ isCommon: -1, priority: 1, serviceName: 1 })
        .limit(100)
        .lean();
      
      // Crear planilla base del vehículo
      schedule = await VehicleServiceSchedule.create({
        companyId,
        vehicleId: new mongoose.Types.ObjectId(vehicleId),
        services: templates.map(template => ({
          serviceName: template.serviceName,
          serviceKey: template.serviceId,
          system: template.system || '',
          mileageInterval: template.mileageInterval || 0,
          mileageIntervalMax: template.mileageIntervalMax || null,
          monthsInterval: template.monthsInterval || 0,
          notes: template.notes || ''
        }))
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

    // Si no existe planilla, crearla (esto no debería pasar si se ejecutó el script)
    if (!schedule) {
      const MaintenanceTemplate = (await import('../models/MaintenanceTemplate.js')).default;
      
      const vehicleBrand = profile.vehicle?.brand?.toUpperCase() || '';
      
      const templateQuery = {
        companyId,
        active: { $ne: false },
        mileageInterval: { $gt: 0 }
      };
      
      if (vehicleBrand) {
        templateQuery.$or = [
          { makes: { $in: [vehicleBrand] } },
          { makes: { $size: 0 } },
          { makes: { $exists: false } },
          { vehicleIds: new mongoose.Types.ObjectId(vehicleId) }
        ];
      }
      
      const templates = await MaintenanceTemplate.find(templateQuery)
        .sort({ isCommon: -1, priority: 1, serviceName: 1 })
        .limit(100)
        .lean();
      
      schedule = await VehicleServiceSchedule.create({
        companyId,
        vehicleId: new mongoose.Types.ObjectId(vehicleId),
        services: templates.map(template => ({
          serviceName: template.serviceName,
          serviceKey: template.serviceId,
          system: template.system || '',
          mileageInterval: template.mileageInterval || 0,
          mileageIntervalMax: template.mileageIntervalMax || null,
          monthsInterval: template.monthsInterval || 0,
          notes: template.notes || ''
        }))
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
      const scheduleService = schedule.services.find(s => 
        s.serviceKey === String(serviceId).trim().toUpperCase()
      );

      if (!scheduleService) {
        logger.warn('[updateVehicleServiceSchedule] Servicio no encontrado en planilla', { serviceId });
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

