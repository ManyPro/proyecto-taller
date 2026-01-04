import mongoose from 'mongoose';
import MaintenanceTemplate from '../models/MaintenanceTemplate.js';
import Vehicle from '../models/Vehicle.js';
import Company from '../models/Company.js';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import { logger } from '../lib/logger.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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

    // Dividir en dos columnas: izquierda (texto centrado) y derecha (logo + imagen Renault + QR)
    const leftColW = vw * 0.52; // 52% para texto
    const rightColW = vw * 0.48; // 48% para logo, imagen y QR
    const gap = 0.2 * CM; // Separación entre columnas
    
    const leftColX = vx;
    const rightColX = vx + leftColW + gap;

    // ===== COLUMNA IZQUIERDA: DATOS (CENTRADOS) =====
    // Calcular altura total del contenido de texto para centrarlo verticalmente
    const lineHeight = 0.3 * CM;
    const fontSize = 7;
    const fontSizeSmall = 6;
    const fontSizeKm = 6;
    
    // Calcular altura total del contenido de texto
    const textContentHeight = 
      (lineHeight * 1.1) + // Placa
      (lineHeight * 1.2) + // Aceite
      (lineHeight * 0.8) + (lineHeight * 0.8) + // Actual KM label + valor
      (lineHeight * 0.8) + (lineHeight * 0.8); // Proximo KM label + valor
    
    // Centrar verticalmente el contenido de texto
    let currentY = vy + (vh - textContentHeight) / 2;
    
    // Fuente sobria (Helvetica)
    doc.font('Helvetica');
    
    // Placa (sin etiqueta, centrada)
    doc.fontSize(fontSize)
       .font('Helvetica-Bold')
       .fillColor('#000000')
       .text(plateStr, leftColX, currentY, {
         width: leftColW,
         align: 'center'
       });
    currentY += lineHeight * 1.1;
    
    // Aceite utilizado (sin etiqueta, centrado)
    doc.fontSize(fontSizeSmall)
       .font('Helvetica')
       .text(oilTypeStr, leftColX, currentY, {
         width: leftColW,
         align: 'center'
       });
    currentY += lineHeight * 1.2;
    
    // Actual KM: [valor] (centrado)
    doc.fontSize(fontSizeSmall)
       .font('Helvetica')
       .text('Actual KM:', leftColX, currentY, {
         width: leftColW,
         align: 'center'
       });
    currentY += lineHeight * 0.8;
    doc.fontSize(fontSizeKm)
       .font('Helvetica-Bold')
       .text(mileageNum.toLocaleString('es-CO'), leftColX, currentY, {
         width: leftColW,
         align: 'center'
       });
    currentY += lineHeight * 1.1;
    
    // Proximo KM: [valor] (centrado)
    doc.fontSize(fontSizeSmall)
       .font('Helvetica')
       .text('Proximo KM:', leftColX, currentY, {
         width: leftColW,
         align: 'center'
       });
    currentY += lineHeight * 0.8;
    doc.fontSize(fontSizeKm)
       .font('Helvetica-Bold')
       .text(nextServiceMileageNum.toLocaleString('es-CO'), leftColX, currentY, {
         width: leftColW,
         align: 'center'
       });

    // ===== COLUMNA DERECHA: LOGO, IMAGEN RENAULT Y QR =====
    const rightColY = vy;
    const rightColH = vh;
    
    // Espaciado vertical entre elementos
    const verticalSpacing = 0.15 * CM;
    let rightCurrentY = rightColY;
    
    // Logo del taller (arriba, centrado)
    let logoHeight = 0;
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
            logoHeight = Math.min(rightColW * 0.5, rightColH * 0.25); // Tamaño del logo
            const logoX = rightColX + (rightColW - logoHeight) / 2; // Centrar horizontalmente
            
            doc.image(logoBuffer, logoX, rightCurrentY, {
              width: logoHeight,
              height: logoHeight,
              fit: [logoHeight, logoHeight]
            });
            
            rightCurrentY += logoHeight + verticalSpacing;
          }
        }
      } catch (err) {
        logger.warn('[generateOilChangeSticker] Error cargando logo:', err.message);
      }
    }
    
    // Imagen de Renault (encima del QR, centrada)
    try {
      // Construir ruta relativa desde Backend/src/controllers/ hasta Frontend/assets/img/
      // __dirname = Backend/src/controllers/
      // Necesitamos subir 3 niveles: controllers -> src -> Backend -> raíz
      // Luego bajar a Frontend/assets/img/
      let renaultImagePath = join(__dirname, '../../../Frontend/assets/img/stickersrenault.png');
      
      // Si no existe, intentar ruta alternativa desde process.cwd()
      if (!existsSync(renaultImagePath)) {
        renaultImagePath = join(process.cwd(), 'Frontend/assets/img/stickersrenault.png');
      }
      
      // Si aún no existe, intentar ruta absoluta desde la raíz del proyecto
      if (!existsSync(renaultImagePath)) {
        // Desde Backend/src/controllers/ subir 3 niveles
        const projectRoot = join(__dirname, '../../..');
        renaultImagePath = join(projectRoot, 'Frontend/assets/img/stickersrenault.png');
      }
      
      if (existsSync(renaultImagePath)) {
        const renaultImageBuffer = readFileSync(renaultImagePath);
        
        // Calcular posición: encima del QR
        // Primero calcular dónde estará el QR (abajo) - usar el mismo cálculo que más abajo
        const qrSize = Math.min(rightColW * 0.75, rightColH * 0.45);
        const qrY = rightColY + rightColH - qrSize - (MARGIN * 0.3);
        
        // Tamaño de la imagen Renault (proporcional, visible pero no muy grande)
        const renaultImageWidth = Math.min(rightColW * 0.65, qrSize * 0.85);
        const renaultImageHeight = renaultImageWidth * 0.35; // Proporción más ancha que alta
        const renaultImageX = rightColX + (rightColW - renaultImageWidth) / 2; // Centrar horizontalmente
        const renaultImageY = qrY - renaultImageHeight - (verticalSpacing * 1.5); // Posicionar encima del QR con más espacio
        
        doc.image(renaultImageBuffer, renaultImageX, renaultImageY, {
          width: renaultImageWidth,
          height: renaultImageHeight,
          fit: [renaultImageWidth, renaultImageHeight]
        });
        
        logger.info('[generateOilChangeSticker] Imagen Renault posicionada:', {
          x: renaultImageX,
          y: renaultImageY,
          width: renaultImageWidth,
          height: renaultImageHeight,
          qrY: qrY,
          qrSize: qrSize
        });
        
        logger.info('[generateOilChangeSticker] Imagen Renault cargada desde:', renaultImagePath);
      } else {
        logger.warn('[generateOilChangeSticker] Imagen Renault no encontrada. Rutas intentadas:', {
          path1: join(__dirname, '../../../Frontend/assets/img/stickersrenault.png'),
          path2: join(process.cwd(), 'Frontend/assets/img/stickersrenault.png'),
          path3: join(join(__dirname, '../../..'), 'Frontend/assets/img/stickersrenault.png')
        });
      }
    } catch (err) {
      logger.error('[generateOilChangeSticker] Error cargando imagen Renault:', err.message, err.stack);
    }
    
    // QR Code (abajo, centrado)
    try {
      // Calcular espacio disponible para el QR
      const availableHeight = rightColH - rightCurrentY;
      const qrSize = Math.min(rightColW * 0.75, availableHeight * 0.9); // Tamaño del QR
      const qrY = rightColY + rightColH - qrSize - (MARGIN * 0.3); // Alineado abajo con pequeño margen
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

