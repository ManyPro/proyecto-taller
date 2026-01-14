import mongoose from 'mongoose';
import MaintenanceTemplate from '../models/MaintenanceTemplate.js';
import Vehicle from '../models/Vehicle.js';
import Company from '../models/Company.js';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import { logger } from '../lib/logger.js';
import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';
import { readFileSync, existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Obtener servicios de mantenimiento filtrados por vehículo
 * GET /api/v1/maintenance/templates?vehicleId=...&commonOnly=true
 * 
 * Si se especifica vehicleId, usa las planillas de VehicleServiceSchedule (del Excel)
 * Si no, usa las plantillas de MaintenanceTemplate (legacy)
 */
export const getMaintenanceTemplates = async (req, res) => {
  try {
    const { companyId } = req;
    const { vehicleId, commonOnly, system } = req.query;

    if (!companyId) {
      return res.status(400).json({ error: 'companyId requerido' });
    }

    let vehicle = null;
    let templates = [];

    // Si se especifica vehículo, usar planilla del vehículo (del Excel)
    if (vehicleId && mongoose.Types.ObjectId.isValid(vehicleId)) {
      vehicle = await Vehicle.findById(vehicleId).lean();
      
      if (vehicle) {
        const VehicleServiceSchedule = (await import('../models/VehicleServiceSchedule.js')).default;
        
        // Buscar planilla del vehículo
        const schedule = await VehicleServiceSchedule.findOne({
          companyId,
          vehicleId: new mongoose.Types.ObjectId(vehicleId)
        }).lean();
        
        if (schedule && schedule.services && schedule.services.length > 0) {
          // Convertir servicios de la planilla a formato de plantillas
          templates = schedule.services.map(service => {
            // Asegurar que mileageInterval sea un número (puede venir como string desde Excel)
            let mileageInterval = service.mileageInterval || 0;
            if (typeof mileageInterval === 'string') {
              // Remover puntos de separación de miles y convertir a número
              mileageInterval = Number(mileageInterval.replace(/\./g, '').replace(',', '.'));
            } else {
              mileageInterval = Number(mileageInterval);
            }
            
            let mileageIntervalMax = service.mileageIntervalMax || null;
            if (mileageIntervalMax !== null) {
              if (typeof mileageIntervalMax === 'string') {
                mileageIntervalMax = Number(mileageIntervalMax.replace(/\./g, '').replace(',', '.'));
              } else {
                mileageIntervalMax = Number(mileageIntervalMax);
              }
            }
            
            return {
              serviceId: service.serviceKey, // Usar serviceKey como serviceId
              serviceName: service.serviceName,
              system: service.system || 'General',
              mileageInterval: mileageInterval,
              mileageIntervalMax: mileageIntervalMax,
              monthsInterval: Number(service.monthsInterval || 0),
              notes: service.notes || '',
              isCommon: false, // Por defecto
              priority: 100, // Por defecto
              active: true
            };
          });
          
          // Ordenar por nombre
          templates.sort((a, b) => a.serviceName.localeCompare(b.serviceName));
          
          // Si se solicita solo comunes, filtrar (aunque no hay campo isCommon en las planillas del Excel)
          if (commonOnly === 'true') {
            // Los primeros servicios suelen ser los comunes (cambio de aceite, filtros, etc.)
            templates = templates.slice(0, Math.min(10, templates.length));
          }
          
          // Si se especifica sistema, filtrar
          if (system) {
            templates = templates.filter(t => 
              (t.system || '').toLowerCase() === String(system).trim().toLowerCase()
            );
          }
        } else {
          // Si no hay planilla, usar plantillas legacy como fallback
          logger.warn('[maintenance.templates] Planilla no encontrada para vehículo, usando plantillas legacy', {
            vehicleId,
            make: vehicle.make,
            line: vehicle.line
          });
        }
      }
    }
    
    // Si no hay templates (no se especificó vehicleId o no se encontró planilla), usar plantillas legacy
    if (templates.length === 0) {
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

      // Si hay vehículo, filtrar por vehículo
      if (vehicle) {
        const vehicleFilter = {
          $or: [
            { makes: { $in: [vehicle.make] } },
            { lines: { $in: [vehicle.line] } },
            { vehicleIds: new mongoose.Types.ObjectId(vehicleId) },
            { appliesTo: { $regex: /todos|all|general/i } },
            { makes: { $size: 0 } },
            { lines: { $size: 0 } }
          ]
        };
        
        filter.$and = [
          { ...filter },
          vehicleFilter
        ];
        delete filter.makes;
        delete filter.lines;
        delete filter.vehicleIds;
        delete filter.appliesTo;
      }

      // Obtener plantillas ordenadas por prioridad y nombre
      templates = await MaintenanceTemplate.find(filter)
        .sort({ priority: 1, serviceName: 1 })
        .lean();
    }

    // Agregar información de compatibilidad si hay vehículo
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
  // LOG INICIAL - SIEMPRE SE EJECUTA
  logger.info('[generateOilChangeSticker] 🚀 FUNCIÓN INICIADA', {
    companyId: req.companyId,
    body: req.body,
    method: req.method,
    url: req.url
  });
  
  try {
    const { companyId } = req;
    const { saleId, vehicleId, plate, mileage, oilType, nextServiceMileage, ...stickerData } = req.body;

    logger.info('[generateOilChangeSticker] 📥 Datos recibidos:', {
      companyId,
      saleId,
      vehicleId,
      plate,
      mileage,
      oilType,
      nextServiceMileage
    });

    if (!companyId) {
      logger.error('[generateOilChangeSticker] ❌ No hay companyId');
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

    // Obtener información de la compañía para detectar logo correcto
    const company = await Company.findById(companyId).lean();
    const companyName = (company?.name || '').toLowerCase().trim();
    const companyIdStr = String(companyId);
    
    // IDs de empresas para stickers (igual que frontend)
    const STICKER_COMPANY_IDS = {
      CASA_RENAULT: '68c871198d7595062498d7a1',
      SERVITECA_SHELBY: '68cb18f4202d108152a26e4c'
    };
    
    // Determinar qué logo usar (Renault o Shelby)
    let stickerLogoName = 'stickersrenault.png'; // Por defecto Renault
    if (STICKER_COMPANY_IDS.SERVITECA_SHELBY && companyIdStr === String(STICKER_COMPANY_IDS.SERVITECA_SHELBY)) {
      stickerLogoName = 'stickersshelby.png';
    } else if (companyName.includes('shelby')) {
      stickerLogoName = 'stickersshelby.png';
    }
    
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
    // Nombre del archivo: ACEITE - [PLACA]
    const filename = `ACEITE - ${plateStr}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    // Deshabilitar compresión para PDFs
    res.setHeader('Content-Encoding', 'identity');
    res.setHeader('Cache-Control', 'no-transform');

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
    const lineHeight = 0.4 * CM;
    const fontSize = 8.5; // 9 - 0.5
    const fontSizeSmall = 7.5; // 8 - 0.5
    const fontSizeKm = 7.5; // 8 - 0.5
    
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
    doc.fontSize(fontSize + 0.5) // 9pt para la placa (8.5 + 0.5)
       .font('Helvetica-Bold')
       .fillColor('#000000')
       .text(plateStr, leftColX, currentY, {
         width: leftColW,
         align: 'center'
       });
    currentY += lineHeight * 1.2;
    
    // Aceite utilizado (sin etiqueta, centrado) - ajustar fuente si es muy largo
    let oilFontSize = fontSize; // 8.5pt inicial
    const maxOilWidth = leftColW * 0.95; // 95% del ancho disponible
    doc.fontSize(oilFontSize);
    doc.font('Helvetica');
    const oilTextWidth = doc.widthOfString(oilTypeStr);
    
    // Si el texto es muy ancho, reducir fuente hasta que quepa en una línea
    if (oilTextWidth > maxOilWidth) {
      const ratio = maxOilWidth / oilTextWidth;
      oilFontSize = Math.max(6, Math.floor(fontSize * ratio)); // Mínimo 6pt
    }
    
    doc.fontSize(oilFontSize);
    doc.text(oilTypeStr, leftColX, currentY, {
      width: leftColW,
      align: 'center'
    });
    currentY += lineHeight * 1.3;
    
    // Actual KM: [valor] (centrado) - Fuente más grande
    doc.fontSize(fontSizeSmall) // 8pt para la etiqueta
       .font('Helvetica')
       .text('Actual KM:', leftColX, currentY, {
         width: leftColW,
         align: 'center'
       });
    currentY += lineHeight * 0.9;
    doc.fontSize(fontSizeKm) // 8pt para el valor
       .font('Helvetica-Bold')
       .text(mileageNum.toLocaleString('es-CO'), leftColX, currentY, {
         width: leftColW,
         align: 'center'
       });
    currentY += lineHeight * 1.2;
    
    // Proximo KM: [valor] (centrado) - Fuente más grande
    doc.fontSize(fontSizeSmall) // 8pt para la etiqueta
       .font('Helvetica')
       .text('Proximo KM:', leftColX, currentY, {
         width: leftColW,
         align: 'center'
       });
    currentY += lineHeight * 0.9;
    doc.fontSize(fontSizeKm) // 8pt para el valor
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
    
    // Calcular tamaño del QR primero (se usa para el logo también)
    const baseQrSize = Math.min(rightColW * 0.75, rightColH * 0.45);
    const qrSize = Math.min(baseQrSize * 1.5, rightColW, rightColH);
    
    // Logo del taller (arriba, centrado) - usar logo de sticker (Renault o Shelby)
    let logoHeight = 0;
    let logoW = 0;
    let logoH = 0;
    logger.info('[generateOilChangeSticker] 🖼️ Intentando cargar logo de sticker:', {
      stickerLogoName,
      companyId: companyIdStr,
      companyName
    });
    
    // Cargar logo de sticker (desde archivo local o URL remota)
    let logoBuffer = null;
    if (stickerLogoName) {
      try {
        // Intentar cargar desde archivo local primero
        const projectRoot = process.cwd();
        let actualRoot = projectRoot;
        if (projectRoot.endsWith('Backend') || projectRoot.includes('Backend')) {
          actualRoot = resolve(projectRoot, '..');
        }
        const workspacePath = process.env.WORKSPACE_PATH || actualRoot;
        
        const possibleLogoPaths = [
          resolve(workspacePath, 'Frontend', 'assets', 'img', stickerLogoName),
          resolve(actualRoot, 'Frontend', 'assets', 'img', stickerLogoName),
          resolve(projectRoot, 'Frontend', 'assets', 'img', stickerLogoName),
          resolve(__dirname, '..', '..', '..', 'Frontend', 'assets', 'img', stickerLogoName),
          resolve(__dirname, '..', '..', '..', '..', 'Frontend', 'assets', 'img', stickerLogoName),
        ].filter(Boolean);
        
        // Buscar logo en archivos locales
        for (const logoPath of possibleLogoPaths) {
          if (existsSync(logoPath)) {
            try {
              logoBuffer = readFileSync(logoPath);
              logger.info('[generateOilChangeSticker] ✅ Logo cargado desde archivo local:', logoPath);
              break;
            } catch (readErr) {
              logger.warn('[generateOilChangeSticker] ⚠️ Error leyendo logo local:', readErr.message);
            }
          }
        }
        
        // Si no se encontró localmente, intentar desde URL remota
        if (!logoBuffer) {
          let fetchFn = globalThis.fetch;
          if (!fetchFn) {
            try {
              const mod = await import('node-fetch');
              fetchFn = mod.default || mod;
            } catch {}
          }
          
          if (fetchFn) {
            const remoteUrl = `${baseUrl.replace(/\/+$/, '')}/assets/img/${stickerLogoName}`;
            logger.info('[generateOilChangeSticker] 📡 Intentando cargar logo desde URL:', remoteUrl);
            const logoResponse = await fetchFn(remoteUrl);
            
            if (logoResponse.ok) {
              logoBuffer = Buffer.from(await logoResponse.arrayBuffer());
              logger.info('[generateOilChangeSticker] ✅ Logo cargado desde URL remota');
            } else {
              logger.warn('[generateOilChangeSticker] ⚠️ Logo no se pudo cargar desde URL:', logoResponse.status);
            }
          }
        }
        
        // Si se cargó el logo, insertarlo en el PDF
        if (logoBuffer) {
          // Logo al ancho completo como el QR, manteniendo altura
          logoH = rightColH * 0.18; // Mantener altura
          logoW = qrSize; // Mismo ancho que el QR
          logoHeight = logoH;
          const logoX = rightColX + (rightColW - logoW) / 2; // Centrar horizontalmente
          
          logger.info('[generateOilChangeSticker] ✅ Logo listo para insertar:', {
            bufferSize: logoBuffer.length,
            logoW,
            logoH,
            logoX,
            logoY: rightCurrentY
          });
          
          // Insertar logo usando sintaxis de PDFKit (mismo tamaño que inventario)
          doc.image(logoBuffer, logoX, rightCurrentY, {
            fit: [logoW, logoH]
          });
          
          logger.info('[generateOilChangeSticker] ✅✅ Logo INSERTADO en PDF');
          
          rightCurrentY += logoHeight + verticalSpacing;
        } else {
          logger.warn('[generateOilChangeSticker] ⚠️ No se pudo cargar el logo de sticker');
        }
      } catch (err) {
        logger.error('[generateOilChangeSticker] ❌ Error cargando logo:', {
          error: err.message,
          stack: err.stack
        });
      }
    } else {
      logger.warn('[generateOilChangeSticker] ⚠️ No hay nombre de logo de sticker');
    }
    
    // Calcular posición del QR (qrSize ya fue calculado arriba)
    const qrY = rightColY + rightColH - qrSize - (MARGIN * 0.3);
    const qrX = rightColX + (rightColW - qrSize) / 2;
          exists: possiblePaths.map(p => {
            const np = String(p).replace(/\\/g, '/');
            return { path: np, exists: existsSync(np) };
          })
    // QR Code (abajo, centrado)
    try {
      logger.info('[generateOilChangeSticker] 📱 Generando QR Code...');
      
      // Convertir puntos a píxeles para QR (300 DPI)
      const DPI = 300;
      const PT_TO_PX = DPI / 72;
      const qrPx = Math.max(120, Math.round(qrSize * PT_TO_PX));
      
      const qrDataUrl = await QRCode.toDataURL(clientPageUrl, {
        margin: 1,
        width: qrPx
      });
      
      const qrBuffer = Buffer.from(qrDataUrl.split(',')[1], 'base64');
      
      logger.info('[generateOilChangeSticker] 📱 Insertando QR Code en PDF', {
        x: qrX,
        y: qrY,
        size: qrSize,
        bufferSize: qrBuffer.length
      });
      
      doc.image(qrBuffer, qrX, qrY, {
        fit: [qrSize, qrSize]
      });
      
      logger.info('[generateOilChangeSticker] ✅✅ QR Code INSERTADO exitosamente');
    } catch (err) {
      logger.error('[generateOilChangeSticker] ❌ Error generando QR:', {
        error: err.message,
        stack: err.stack
      });
    }

    // Finalizar PDF
    logger.info('[generateOilChangeSticker] 📄 Finalizando PDF...');
    doc.end();

    logger.info('[maintenance.generateOilChangeSticker] ✅✅✅ Sticker generado exitosamente', {
      companyId,
      saleId,
      plate,
      mileage,
      nextServiceMileage,
      oilType,
      renaultImageLoaded,
      logoLoaded: !!companyLogoUrl
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

