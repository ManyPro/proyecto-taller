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

    // Buscar o crear planilla de servicios
    let schedule = await VehicleServiceSchedule.findOne({
      companyId,
      plate: plateUpper
    });

    if (!schedule) {
      // Crear planilla vacía si no existe
      schedule = await VehicleServiceSchedule.create({
        companyId,
        plate: plateUpper,
        customerProfileId: profile._id,
        currentMileage: profile.vehicle?.mileage || null,
        services: []
      });
    } else {
      // Actualizar kilometraje si el perfil tiene uno más reciente
      const profileMileage = profile.vehicle?.mileage;
      if (profileMileage && (schedule.currentMileage === null || profileMileage > schedule.currentMileage)) {
        schedule.updateMileage(profileMileage);
        await schedule.save();
      }
    }

    res.json({
      vehicle: {
        plate: profile.plate,
        brand: profile.vehicle?.brand || '',
        line: profile.vehicle?.line || '',
        engine: profile.vehicle?.engine || '',
        year: profile.vehicle?.year || null
      },
      schedule: {
        currentMileage: schedule.currentMileage,
        mileageUpdatedAt: schedule.mileageUpdatedAt,
        services: schedule.services.map(s => ({
          id: s._id,
          serviceName: s.serviceName,
          serviceKey: s.serviceKey,
          mileageInterval: s.mileageInterval,
          lastPerformedMileage: s.lastPerformedMileage,
          lastPerformedDate: s.lastPerformedDate,
          nextDueMileage: s.nextDueMileage,
          status: s.status
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

    // Buscar planilla
    let schedule = await VehicleServiceSchedule.findOne({
      companyId,
      plate: plateUpper
    });

    if (!schedule) {
      schedule = await VehicleServiceSchedule.create({
        companyId,
        plate: plateUpper,
        customerProfileId: profile._id,
        currentMileage: mileage || profile.vehicle?.mileage || null,
        services: []
      });
    }

    // Actualizar kilometraje si se proporciona
    if (mileage !== null && mileage !== undefined) {
      const newMileage = Number(mileage);
      if (newMileage >= 0 && (schedule.currentMileage === null || newMileage > schedule.currentMileage)) {
        schedule.updateMileage(newMileage);
      }
    }

    // Procesar actualizaciones de servicios
    for (const serviceUpdate of services) {
      const { serviceId, action, mileage: serviceMileage } = serviceUpdate;
      
      if (!serviceId) continue;

      const service = schedule.services.id(serviceId);
      if (!service) {
        logger.warn('[updateVehicleServiceSchedule] Servicio no encontrado', { serviceId });
        continue;
      }

      if (action === 'completed') {
        const serviceMileageNum = serviceMileage ? Number(serviceMileage) : schedule.currentMileage;
        if (serviceMileageNum && serviceMileageNum > 0) {
          service.lastPerformedMileage = serviceMileageNum;
          service.lastPerformedDate = new Date();
          service.nextDueMileage = serviceMileageNum + service.mileageInterval;
          service.status = 'completed';
          
          // Si el kilometraje del servicio es mayor al actual, actualizar
          if (schedule.currentMileage === null || serviceMileageNum > schedule.currentMileage) {
            schedule.currentMileage = serviceMileageNum;
            schedule.mileageUpdatedAt = new Date();
          }
        }
      } else if (action === 'skipped') {
        // Marcar como saltado: recalcular próximo servicio basado en el kilometraje actual
        if (schedule.currentMileage) {
          // Si ya tiene un último servicio realizado, calcular desde ahí
          if (service.lastPerformedMileage) {
            service.nextDueMileage = service.lastPerformedMileage + service.mileageInterval;
          } else {
            // Si nunca se ha realizado, calcular desde el kilometraje actual
            service.nextDueMileage = schedule.currentMileage + service.mileageInterval;
          }
          // Mantener el estado según el kilometraje (se recalculará abajo con updateMileage)
        }
      }
    }

    // Recalcular estados de todos los servicios
    if (schedule.currentMileage !== null) {
      schedule.updateMileage(schedule.currentMileage);
    }

    await schedule.save();

    res.json({
      success: true,
      schedule: {
        currentMileage: schedule.currentMileage,
        mileageUpdatedAt: schedule.mileageUpdatedAt,
        services: schedule.services.map(s => ({
          id: s._id,
          serviceName: s.serviceName,
          serviceKey: s.serviceKey,
          mileageInterval: s.mileageInterval,
          lastPerformedMileage: s.lastPerformedMileage,
          lastPerformedDate: s.lastPerformedDate,
          nextDueMileage: s.nextDueMileage,
          status: s.status
        }))
      }
    });
  } catch (error) {
    logger.error('[customer.public.updateSchedule] Error', { error: error.message, stack: error.stack });
    res.status(500).json({ error: 'Error al actualizar planilla de servicios' });
  }
};

