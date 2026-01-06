import mongoose from 'mongoose';
import CustomerProfile from '../models/CustomerProfile.js';
import VehicleServiceSchedule from '../models/VehicleServiceSchedule.js';
import { logger } from '../lib/logger.js';

/**
 * Buscar cliente por placa (uso corporativo)
 * GET /api/v1/customers/:companyId/search?plate=ABC123
 */
export const searchCustomerByPlate = async (req, res) => {
  try {
    const { companyId } = req;
    const { plate } = req.query;

    if (!companyId) {
      return res.status(400).json({ error: 'companyId requerido' });
    }

    if (!plate) {
      return res.status(400).json({ error: 'Placa es requerida' });
    }

    const plateUpper = String(plate).trim().toUpperCase();

    // Buscar perfil del cliente
    const profile = await CustomerProfile.findOne({
      companyId,
      plate: plateUpper
    }).lean();

    if (!profile) {
      return res.status(404).json({ error: 'Cliente no encontrado' });
    }

    res.json({
      customer: {
        plate: profile.plate,
        tier: profile.tier || 'General',
        customer: {
          name: profile.customer?.name || '',
          phone: profile.customer?.phone || '',
          email: profile.customer?.email || '',
          idNumber: profile.customer?.idNumber || ''
        },
        vehicle: {
          brand: profile.vehicle?.brand || '',
          line: profile.vehicle?.line || '',
          engine: profile.vehicle?.engine || '',
          year: profile.vehicle?.year || null,
          mileage: profile.vehicle?.mileage || null,
          vehicleId: profile.vehicle?.vehicleId || null
        }
      }
    });
  } catch (error) {
    logger.error('[customer.searchByPlate] Error', { error: error.message, stack: error.stack });
    res.status(500).json({ error: 'Error al buscar cliente' });
  }
};

/**
 * Obtener tier de un cliente
 * GET /api/v1/customers/:companyId/:plate/tier
 */
export const getCustomerTier = async (req, res) => {
  try {
    const { companyId } = req;
    const { plate } = req.params;

    if (!companyId) {
      return res.status(400).json({ error: 'companyId requerido' });
    }

    if (!plate) {
      return res.status(400).json({ error: 'Placa es requerida' });
    }

    const plateUpper = String(plate).trim().toUpperCase();

    const profile = await CustomerProfile.findOne({
      companyId,
      plate: plateUpper
    }).select('plate tier').lean();

    if (!profile) {
      return res.status(404).json({ error: 'Cliente no encontrado' });
    }

    res.json({
      plate: profile.plate,
      tier: profile.tier || 'General'
    });
  } catch (error) {
    logger.error('[customer.getTier] Error', { error: error.message, stack: error.stack });
    res.status(500).json({ error: 'Error al obtener tier del cliente' });
  }
};

/**
 * Actualizar tier de un cliente
 * PUT /api/v1/customers/:companyId/:plate/tier
 * body: { tier: 'General' | 'GOLD' }
 */
export const updateCustomerTier = async (req, res) => {
  try {
    const { companyId } = req;
    const { plate } = req.params;
    const { tier } = req.body;

    if (!companyId) {
      return res.status(400).json({ error: 'companyId requerido' });
    }

    if (!plate) {
      return res.status(400).json({ error: 'Placa es requerida' });
    }

    if (!tier || !['General', 'GOLD'].includes(tier)) {
      return res.status(400).json({ error: 'Tier debe ser "General" o "GOLD"' });
    }

    const plateUpper = String(plate).trim().toUpperCase();

    const profile = await CustomerProfile.findOneAndUpdate(
      { companyId, plate: plateUpper },
      { tier },
      { new: true, runValidators: true }
    ).select('plate tier').lean();

    if (!profile) {
      return res.status(404).json({ error: 'Cliente no encontrado' });
    }

    logger.info('[customer.updateTier] Tier actualizado', {
      companyId,
      plate: plateUpper,
      tier
    });

    res.json({
      success: true,
      plate: profile.plate,
      tier: profile.tier
    });
  } catch (error) {
    logger.error('[customer.updateTier] Error', { error: error.message, stack: error.stack });
    res.status(500).json({ error: 'Error al actualizar tier del cliente' });
  }
};

/**
 * Obtener planilla de servicios por placa (uso corporativo, sin autenticación de cliente)
 * GET /api/v1/customers/:companyId/:plate/schedule
 */
export const getCustomerSchedule = async (req, res) => {
  try {
    const { companyId } = req;
    const { plate } = req.params;

    if (!companyId) {
      return res.status(400).json({ error: 'companyId requerido' });
    }

    if (!plate) {
      return res.status(400).json({ error: 'Placa es requerida' });
    }

    const plateUpper = String(plate).trim().toUpperCase();

    // Buscar perfil del cliente
    const profile = await CustomerProfile.findOne({
      companyId,
      plate: plateUpper
    }).lean();

    if (!profile) {
      return res.status(404).json({ error: 'Cliente no encontrado' });
    }

    // Obtener vehicleId del perfil
    const vehicleId = profile.vehicle?.vehicleId;
    if (!vehicleId || !mongoose.Types.ObjectId.isValid(vehicleId)) {
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
          notes: 'Planilla no configurada. Contacte al administrador para configurar los servicios de mantenimiento.'
        }
      });
    }

    // Buscar planilla del vehículo
    const schedule = await VehicleServiceSchedule.findOne({
      companyId,
      vehicleId: new mongoose.Types.ObjectId(vehicleId)
    });

    if (!schedule) {
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
          notes: 'Planilla no configurada. Contacte al administrador para configurar los servicios de mantenimiento.'
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
        year: profile.vehicle?.year || null,
        tier: profile.tier || 'General'
      },
      schedule: {
        currentMileage: currentMileage,
        mileageUpdatedAt: profile.updatedAt,
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
    logger.error('[customer.getSchedule] Error', { error: error.message, stack: error.stack });
    res.status(500).json({ error: 'Error al obtener planilla de servicios' });
  }
};

/**
 * Listar todos los clientes con sus tiers (para administración)
 * GET /api/v1/customers/:companyId/list?search=...
 */
export const listCustomers = async (req, res) => {
  try {
    const { companyId } = req;
    const { search = '', limit = 50, page = 1 } = req.query;

    if (!companyId) {
      return res.status(400).json({ error: 'companyId requerido' });
    }

    const searchTerm = String(search).trim();
    const limitNum = Math.min(Number(limit) || 50, 500); // Aumentado el límite máximo a 500
    const pageNum = Math.max(Number(page) || 1, 1);
    const skip = (pageNum - 1) * limitNum;

    // Construir query
    const query = { companyId };
    
    if (searchTerm) {
      query.$or = [
        { plate: { $regex: searchTerm, $options: 'i' } },
        { 'customer.name': { $regex: searchTerm, $options: 'i' } },
        { 'customer.phone': { $regex: searchTerm, $options: 'i' } },
        { 'customer.idNumber': { $regex: searchTerm, $options: 'i' } }
      ];
    }

    // Obtener clientes
    const [customers, total] = await Promise.all([
      CustomerProfile.find(query)
        .select('plate tier customer.name customer.phone vehicle.brand vehicle.line vehicle.engine vehicle.year vehicle.mileage')
        .sort({ plate: 1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      CustomerProfile.countDocuments(query)
    ]);

    res.json({
      customers: customers.map(c => ({
        plate: c.plate,
        tier: c.tier || 'General',
        customer: {
          name: c.customer?.name || '',
          phone: c.customer?.phone || ''
        },
        vehicle: {
          brand: c.vehicle?.brand || '',
          line: c.vehicle?.line || '',
          engine: c.vehicle?.engine || '',
          year: c.vehicle?.year || null,
          mileage: c.vehicle?.mileage || null
        }
      })),
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        pages: Math.ceil(total / limitNum)
      }
    });
  } catch (error) {
    logger.error('[customer.list] Error', { error: error.message, stack: error.stack });
    res.status(500).json({ error: 'Error al listar clientes' });
  }
};

