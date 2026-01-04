import mongoose from 'mongoose';
import MaintenanceTemplate from '../models/MaintenanceTemplate.js';
import Vehicle from '../models/Vehicle.js';
import PDFDocument from 'pdfkit';
import { logger } from '../lib/logger.js';

/**
 * Obtener servicios de mantenimiento filtrados por vehículo
 * GET /api/v1/maintenance/templates?vehicleId=...&commonOnly=true
 */
export const getMaintenanceTemplates = async (req, res) => {
  try {
    const { companyId } = req;
    const { vehicleId, commonOnly, system } = req.query;

    if (!companyId) {
      return res.status(400).json({ error: 'companyId requerido' });
    }

    // Construir filtro
    const filter = {
      companyId,
      active: true
    };

    // Si se solicita solo comunes
    if (commonOnly === 'true') {
      filter.isCommon = true;
    }

    // Si se especifica sistema
    if (system) {
      filter.system = String(system).trim();
    }

    // Si se especifica vehículo, intentar filtrar por vehículo
    let vehicle = null;
    if (vehicleId && mongoose.Types.ObjectId.isValid(vehicleId)) {
      vehicle = await Vehicle.findById(vehicleId).lean();
      
      if (vehicle) {
        // Filtrar por marca, línea, o vehículo específico
        const vehicleFilter = {
          $or: [
            { makes: { $in: [vehicle.make] } },
            { lines: { $in: [vehicle.line] } },
            { vehicleIds: new mongoose.Types.ObjectId(vehicleId) },
            { appliesTo: { $regex: /todos|all|general/i } },
            { makes: { $size: 0 } }, // Sin restricción de marca
            { lines: { $size: 0 } }  // Sin restricción de línea
          ]
        };
        
        // Combinar filtros
        filter.$and = [
          { ...filter },
          vehicleFilter
        ];
        delete filter.makes;
        delete filter.lines;
        delete filter.vehicleIds;
        delete filter.appliesTo;
      }
    }

    // Obtener plantillas ordenadas por prioridad y nombre
    const templates = await MaintenanceTemplate.find(filter)
      .sort({ priority: 1, serviceName: 1 })
      .lean();

    // Si hay vehículo, agregar información de compatibilidad
    const templatesWithVehicle = templates.map(template => ({
      ...template,
      compatible: vehicle ? (
        (!template.makes || template.makes.length === 0 || template.makes.includes(vehicle.make)) &&
        (!template.lines || template.lines.length === 0 || template.lines.includes(vehicle.line))
      ) : true
    }));

    res.json({
      templates: templatesWithVehicle,
      vehicle: vehicle ? {
        id: vehicle._id,
        make: vehicle.make,
        line: vehicle.line,
        displacement: vehicle.displacement
      } : null
    });
  } catch (error) {
    logger.error('[maintenance.templates] Error', { error: error.message, stack: error.stack });
    res.status(500).json({ error: 'Error al obtener plantillas de mantenimiento' });
  }
};

/**
 * Obtener un servicio específico por ID
 * GET /api/v1/maintenance/templates/:serviceId
 */
export const getMaintenanceTemplate = async (req, res) => {
  try {
    const { companyId } = req;
    const { serviceId } = req.params;

    if (!companyId) {
      return res.status(400).json({ error: 'companyId requerido' });
    }

    const template = await MaintenanceTemplate.findOne({
      companyId,
      serviceId: String(serviceId).trim().toUpperCase(),
      active: true
    }).lean();

    if (!template) {
      return res.status(404).json({ error: 'Plantilla no encontrada' });
    }

    res.json({ template });
  } catch (error) {
    logger.error('[maintenance.template] Error', { error: error.message, stack: error.stack });
    res.status(500).json({ error: 'Error al obtener plantilla' });
  }
};

/**
 * Generar PDF sticker para cambio de aceite
 * POST /api/v1/maintenance/generate-oil-change-sticker
 * body: { saleId, vehicleId, mileage, oilType, nextServiceMileage, ... }
 * 
 * NOTA: Esta función está preparada pero requiere datos específicos del sticker
 * que se proporcionarán después. Por ahora genera una estructura básica.
 */
export const generateOilChangeSticker = async (req, res) => {
  try {
    const { companyId } = req;
    const { saleId, vehicleId, mileage, oilType, nextServiceMileage, ...stickerData } = req.body;

    if (!companyId) {
      return res.status(400).json({ error: 'companyId requerido' });
    }

    // Validar datos requeridos
    if (!mileage || !nextServiceMileage) {
      return res.status(400).json({ error: 'Kilometraje actual y próximo servicio son requeridos' });
    }

    // Crear PDF
    const doc = new PDFDocument({ 
      size: [200, 150], // Tamaño de sticker pequeño (ajustar según necesidad)
      margins: { top: 10, bottom: 10, left: 10, right: 10 }
    });

    // Configurar headers para descarga
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="sticker-cambio-aceite-${Date.now()}.pdf"`);

    // Pipe PDF a response
    doc.pipe(res);

    // ===== DISEÑO DEL STICKER =====
    // TODO: Ajustar diseño según datos proporcionados por el usuario
    
    // Título
    doc.fontSize(14)
       .font('Helvetica-Bold')
       .text('CAMBIO DE ACEITE', 10, 10, { align: 'center' });

    // Línea separadora
    doc.moveTo(10, 30)
       .lineTo(190, 30)
       .stroke();

    // Información del vehículo (si está disponible)
    if (vehicleId) {
      try {
        const vehicle = await Vehicle.findById(vehicleId).lean();
        if (vehicle) {
          doc.fontSize(10)
             .font('Helvetica')
             .text(`${vehicle.make} ${vehicle.line}`, 10, 40, { align: 'center' });
        }
      } catch (err) {
        logger.warn('[generateOilChangeSticker] Error obteniendo vehículo', { error: err.message });
      }
    }

    // Kilometraje actual
    doc.fontSize(12)
       .font('Helvetica-Bold')
       .text(`KM Actual: ${Number(mileage).toLocaleString('es-CO')}`, 10, 60, { align: 'center' });

    // Tipo de aceite (si se proporciona)
    if (oilType) {
      doc.fontSize(10)
         .font('Helvetica')
         .text(`Aceite: ${oilType}`, 10, 80, { align: 'center' });
    }

    // Próximo servicio
    doc.fontSize(11)
       .font('Helvetica-Bold')
       .text(`Próximo: ${Number(nextServiceMileage).toLocaleString('es-CO')} km`, 10, 100, { align: 'center' });

    // Fecha
    const fecha = new Date().toLocaleDateString('es-CO', { 
      day: '2-digit', 
      month: '2-digit', 
      year: 'numeric' 
    });
    doc.fontSize(9)
       .font('Helvetica')
       .text(`Fecha: ${fecha}`, 10, 120, { align: 'center' });

    // ===== FIN DISEÑO =====

    // Finalizar PDF
    doc.end();

    logger.info('[maintenance.generateOilChangeSticker] Sticker generado', {
      companyId,
      saleId,
      mileage,
      nextServiceMileage
    });

  } catch (error) {
    logger.error('[maintenance.generateOilChangeSticker] Error', { 
      error: error.message, 
      stack: error.stack 
    });
    if (!res.headersSent) {
      res.status(500).json({ error: 'Error al generar sticker' });
    }
  }
};
