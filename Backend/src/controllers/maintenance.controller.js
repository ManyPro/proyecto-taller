import mongoose from 'mongoose';
import MaintenanceTemplate from '../models/MaintenanceTemplate.js';
import Vehicle from '../models/Vehicle.js';
import Company from '../models/Company.js';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
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
 * body: { saleId, vehicleId, plate, mileage, oilType, nextServiceMileage, ... }
 * 
 * Dimensiones: 5cm x 3cm (igual que stickers de inventario)
 * Layout:
 * - Izquierda: Placa, Aceite, Actual KM: [valor], Proximo KM: [valor]
 * - Derecha: Logo del taller y QR que lleva a página de clientes
 */
export const generateOilChangeSticker = async (req, res) => {
  try {
    const { companyId } = req;
    const { saleId, vehicleId, plate, mileage, oilType, nextServiceMileage, ...stickerData } = req.body;

    if (!companyId) {
      return res.status(400).json({ error: 'companyId requerido' });
    }

    // Validar datos requeridos
    const plateStr = String(plate || '').trim().toUpperCase();
    const mileageNum = Number(mileage);
    const nextServiceMileageNum = Number(nextServiceMileage);
    const oilTypeStr = String(oilType || '').trim();
    
    if (!plateStr || plateStr === '') {
      return res.status(400).json({ error: 'Placa es requerida' });
    }
    
    if (!mileageNum || mileageNum <= 0 || !Number.isFinite(mileageNum)) {
      return res.status(400).json({ error: 'Kilometraje actual es requerido y debe ser un número válido' });
    }
    
    if (!nextServiceMileageNum || nextServiceMileageNum <= 0 || !Number.isFinite(nextServiceMileageNum)) {
      return res.status(400).json({ error: 'Kilometraje del próximo servicio es requerido y debe ser un número válido' });
    }
    
    if (!oilTypeStr || oilTypeStr === '') {
      return res.status(400).json({ error: 'Tipo de aceite es requerido' });
    }

    // Obtener información de la compañía para el logo
    const company = await Company.findById(companyId).lean();
    const companyLogoUrl = company?.logoUrl || '';
    
    // URL base para el QR (página de clientes)
    const baseUrl = process.env.FRONTEND_URL || process.env.PUBLIC_URL || 'https://proyecto-taller.netlify.app';
    const clientPageUrl = `${baseUrl}/cliente.html?companyId=${companyId}`;
    
    // Medidas en puntos (1 cm = 28.3464567 pts)
    const CM = 28.3464567;
    const STICKER_W = 5 * CM; // 5 cm
    const STICKER_H = 3 * CM; // 3 cm
    const MARGIN = 0.25 * CM; // 0.25 cm
    
    // Crear PDF sin márgenes
    const doc = new PDFDocument({ 
      size: [STICKER_W, STICKER_H],
      margins: { top: 0, bottom: 0, left: 0, right: 0 }
    });

    // Configurar headers para descarga
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="sticker-cambio-aceite-${Date.now()}.pdf"`);

    // Pipe PDF a response
    doc.pipe(res);

    // Fondo blanco
    doc.rect(0, 0, STICKER_W, STICKER_H).fill('#FFFFFF');

    // Área de trabajo (con márgenes)
    const vx = MARGIN;
    const vy = MARGIN;
    const vw = STICKER_W - 2 * MARGIN;
    const vh = STICKER_H - 2 * MARGIN;

    // Dividir en dos columnas: izquierda (texto) y derecha (logo + QR)
    const leftColW = vw * 0.55; // 55% para texto
    const rightColW = vw * 0.45; // 45% para logo y QR
    const gap = 0.15 * CM; // Separación entre columnas
    
    const leftColX = vx;
    const rightColX = vx + leftColW + gap;

    // ===== COLUMNA IZQUIERDA: DATOS =====
    let currentY = vy;
    const lineHeight = 0.3 * CM;
    const fontSize = 7;
    const fontSizeSmall = 6;
    const fontSizeKm = 6; // Fuente más pequeña para números de 6-7 cifras
    
    // Fuente sobria (Helvetica)
    doc.font('Helvetica');
    
    // Placa (sin etiqueta)
    doc.fontSize(fontSize)
       .font('Helvetica-Bold')
       .fillColor('#000000')
       .text(plateStr, leftColX, currentY, {
         width: leftColW,
         align: 'left'
       });
    currentY += lineHeight * 1.1;
    
    // Aceite utilizado (sin etiqueta)
    doc.fontSize(fontSizeSmall)
       .font('Helvetica')
       .text(oilTypeStr, leftColX, currentY, {
         width: leftColW,
         align: 'left'
       });
    currentY += lineHeight * 1.2;
    
    // Actual KM: [valor]
    doc.fontSize(fontSizeSmall)
       .font('Helvetica')
       .text('Actual KM:', leftColX, currentY, {
         width: leftColW,
         align: 'left'
       });
    currentY += lineHeight * 0.8;
    doc.fontSize(fontSizeKm)
       .font('Helvetica-Bold')
       .text(mileageNum.toLocaleString('es-CO'), leftColX, currentY, {
         width: leftColW,
         align: 'left'
       });
    currentY += lineHeight * 1.1;
    
    // Proximo KM: [valor]
    doc.fontSize(fontSizeSmall)
       .font('Helvetica')
       .text('Proximo KM:', leftColX, currentY, {
         width: leftColW,
         align: 'left'
       });
    currentY += lineHeight * 0.8;
    doc.fontSize(fontSizeKm)
       .font('Helvetica-Bold')
       .text(nextServiceMileageNum.toLocaleString('es-CO'), leftColX, currentY, {
         width: leftColW,
         align: 'left'
       });

    // ===== COLUMNA DERECHA: LOGO Y QR =====
    const rightColY = vy;
    const rightColH = vh;
    
    // Logo del taller (arriba, centrado)
    if (companyLogoUrl) {
      try {
        // Helper para obtener buffer desde URL
        let fetchFn = globalThis.fetch;
        if (!fetchFn) {
          try {
            const mod = await import('node-fetch');
            fetchFn = mod.default || mod;
          } catch {}
        }
        
        if (fetchFn) {
          const logoResponse = await fetchFn(companyLogoUrl);
          if (logoResponse.ok) {
            const logoBuffer = Buffer.from(await logoResponse.arrayBuffer());
            const logoSize = Math.min(rightColW * 0.7, rightColH * 0.35); // Tamaño del logo
            const logoX = rightColX + (rightColW - logoSize) / 2; // Centrar horizontalmente
            const logoY = rightColY;
            
            doc.image(logoBuffer, logoX, logoY, {
              width: logoSize,
              height: logoSize,
              fit: [logoSize, logoSize]
            });
          }
        }
      } catch (err) {
        logger.warn('[generateOilChangeSticker] Error cargando logo:', err.message);
      }
    }
    
    // QR Code (abajo, centrado)
    try {
      const qrSize = Math.min(rightColW * 0.85, rightColH * 0.5); // Tamaño del QR
      const qrY = rightColY + rightColH - qrSize; // Alineado abajo
      const qrX = rightColX + (rightColW - qrSize) / 2; // Centrado horizontalmente
      
      // Convertir puntos a píxeles para QR (300 DPI)
      const DPI = 300;
      const PT_TO_PX = DPI / 72;
      const qrPx = Math.max(120, Math.round(qrSize * PT_TO_PX));
      
      const qrDataUrl = await QRCode.toDataURL(clientPageUrl, {
        margin: 1,
        width: qrPx
      });
      
      const qrBuffer = Buffer.from(qrDataUrl.split(',')[1], 'base64');
      doc.image(qrBuffer, qrX, qrY, {
        width: qrSize,
        height: qrSize,
        fit: [qrSize, qrSize]
      });
    } catch (err) {
      logger.warn('[generateOilChangeSticker] Error generando QR:', err.message);
    }

    // Finalizar PDF
    doc.end();

    logger.info('[maintenance.generateOilChangeSticker] Sticker generado', {
      companyId,
      saleId,
      plate,
      mileage,
      nextServiceMileage,
      oilType
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

