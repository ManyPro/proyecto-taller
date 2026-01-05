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
    
    // Aceite utilizado (sin etiqueta, centrado)
    doc.fontSize(fontSize) // 8.5pt para el aceite
       .font('Helvetica')
       .text(oilTypeStr, leftColX, currentY, {
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
    
    // Logo del taller (arriba, centrado)
    let logoHeight = 0;
    logger.info('[generateOilChangeSticker] 🖼️ Intentando cargar logo de compañía:', {
      companyLogoUrl: companyLogoUrl || 'NO HAY URL',
      hasUrl: !!companyLogoUrl
    });
    
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
          logger.info('[generateOilChangeSticker] 📡 Haciendo fetch del logo...');
          const logoResponse = await fetchFn(companyLogoUrl);
          logger.info('[generateOilChangeSticker] 📡 Respuesta del logo:', {
            ok: logoResponse.ok,
            status: logoResponse.status,
            statusText: logoResponse.statusText
          });
          
          if (logoResponse.ok) {
            const logoBuffer = Buffer.from(await logoResponse.arrayBuffer());
            // Aumentar 50% el tamaño del logo, respetando límites
            const logoBase = Math.min(rightColW * 0.5, rightColH * 0.25);
            logoHeight = Math.min(logoBase * 1.5, rightColH * 0.4, rightColW);
            const logoX = rightColX + (rightColW - logoHeight) / 2; // Centrar horizontalmente
            
            logger.info('[generateOilChangeSticker] ✅ Logo cargado, insertando en PDF:', {
              bufferSize: logoBuffer.length,
              logoHeight,
              logoX,
              logoY: rightCurrentY
            });
            
            // Insertar logo usando sintaxis de PDFKit
            doc.image(logoBuffer, logoX, rightCurrentY, {
              fit: [logoHeight, logoHeight]
            });
            
            logger.info('[generateOilChangeSticker] ✅✅ Logo INSERTADO en PDF');
            
            rightCurrentY += logoHeight + verticalSpacing;
          } else {
            logger.warn('[generateOilChangeSticker] ⚠️ Logo no se pudo cargar, respuesta no OK:', logoResponse.status);
          }
        } else {
          logger.warn('[generateOilChangeSticker] ⚠️ No hay función fetch disponible');
        }
      } catch (err) {
        logger.error('[generateOilChangeSticker] ❌ Error cargando logo:', {
          error: err.message,
          stack: err.stack
        });
      }
    } else {
      logger.warn('[generateOilChangeSticker] ⚠️ No hay URL de logo de compañía');
    }
    
    // Calcular posición del QR primero (se usa para posicionar la imagen Renault)
    // Aumentar el tamaño del QR en 50% con límites para no salir del área
    const baseQrSize = Math.min(rightColW * 0.75, rightColH * 0.45);
    const qrSize = Math.min(baseQrSize * 1.5, rightColW, rightColH);
    const qrY = rightColY + rightColH - qrSize - (MARGIN * 0.3);
    const qrX = rightColX + (rightColW - qrSize) / 2;
    
    // Imagen de Renault (encima del QR, centrada) - INSERTAR ANTES DEL QR
    let renaultImageLoaded = false;
    let renaultImageBuffer = null;
    let renaultImagePath = null;
    
    try {
      // Log inicial para debugging
      logger.info('[generateOilChangeSticker] 🔍 Buscando imagen Renault...', {
        cwd: process.cwd(),
        __dirname: __dirname
      });
      
      // Intentar múltiples rutas posibles - USAR RUTAS ABSOLUTAS
      const projectRoot = process.cwd();
      
      // Determinar la raíz del proyecto (subir un nivel si estamos en Backend/)
      let actualRoot = projectRoot;
      if (projectRoot.endsWith('Backend') || projectRoot.includes('Backend')) {
        actualRoot = resolve(projectRoot, '..');
      }
      
      // Obtener la ruta del workspace desde process.env o usar la ruta actual
      const workspacePath = process.env.WORKSPACE_PATH || actualRoot;

      // Permitir ruta directa configurable por entorno (ej. Netlify)
      const envRenaultPath = process.env.RENAULT_IMAGE_PATH;
      
      // Construir rutas posibles usando resolve para obtener rutas absolutas
      const possiblePaths = [
        // Ruta más probable: desde la raíz del workspace
        envRenaultPath ? resolve(envRenaultPath) : null, // Ruta explícita por entorno
        resolve(workspacePath, 'Frontend', 'assets', 'img', 'stickersrenault.png'),
        resolve(actualRoot, 'Frontend', 'assets', 'img', 'stickersrenault.png'), // Desde raíz del proyecto
        resolve(projectRoot, 'Frontend', 'assets', 'img', 'stickersrenault.png'), // Desde donde esté el proceso
        resolve(__dirname, '..', '..', '..', 'Frontend', 'assets', 'img', 'stickersrenault.png'), // Desde controllers
        resolve(__dirname, '..', '..', '..', '..', 'Frontend', 'assets', 'img', 'stickersrenault.png'), // Alternativa
        resolve(projectRoot, '..', 'Frontend', 'assets', 'img', 'stickersrenault.png'), // Alternativa relativa
        // Ruta absoluta local (equipo del usuario)
        process.platform === 'win32' ? resolve('C:\\Users\\ManyManito\\Documents\\GitHub\\proyecto-taller', 'Frontend', 'assets', 'img', 'stickersrenault.png') : null,
        // Ruta absoluta genérica en C:\proyecto-taller (por compatibilidad previa)
        process.platform === 'win32' ? resolve('C:\\proyecto-taller', 'Frontend', 'assets', 'img', 'stickersrenault.png') : null,
      ].filter(Boolean); // Filtrar nulls
      
      // Log todas las rutas que se intentarán
      logger.info('[generateOilChangeSticker] 📂 Rutas a verificar:', {
        projectRoot,
        actualRoot,
        workspacePath,
        __dirname,
        paths: possiblePaths.map(p => {
          const np = String(p).replace(/\\/g, '/');
          const exists = existsSync(np);
          return { path: np, exists };
        })
      });
      
      // Buscar la primera ruta que exista localmente
      for (const pathToCheck of possiblePaths) {
        const normalizedPath = String(pathToCheck).replace(/\\/g, '/');
        logger.info('[generateOilChangeSticker] 🔎 Verificando ruta:', normalizedPath);
        
        if (!existsSync(pathToCheck)) {
          logger.warn('[generateOilChangeSticker] ⚠️ Ruta NO existe:', normalizedPath);
          continue;
        }
        
        try {
          const buf = readFileSync(pathToCheck);
          if (buf && buf.length > 0) {
            renaultImageBuffer = buf;
            renaultImagePath = pathToCheck;
            logger.info('[generateOilChangeSticker] ✅✅✅ Imagen Renault ENCONTRADA y LEÍDA:', {
              path: normalizedPath,
              size: renaultImageBuffer.length,
              exists: true
            });
            break;
          } else {
            logger.warn('[generateOilChangeSticker] ⚠️ Buffer vacío para:', normalizedPath);
          }
        } catch (readErr) {
          logger.error('[generateOilChangeSticker] ❌ Error leyendo imagen desde:', {
            path: normalizedPath,
            error: readErr.message,
            stack: readErr.stack
          });
        }
      }

      // Si no se encontró localmente, intentar descargar desde el frontend (URL pública)
      if (!renaultImageBuffer) {
        try {
          let fetchFn = globalThis.fetch;
          if (!fetchFn) {
            try {
              const mod = await import('node-fetch');
              fetchFn = mod.default || mod;
            } catch (err) {
              logger.warn('[generateOilChangeSticker] No se pudo cargar node-fetch:', err?.message);
            }
          }

          const remoteUrl = `${baseUrl.replace(/\/+$/, '')}/assets/img/stickersrenault.png`;
          if (fetchFn) {
            logger.info('[generateOilChangeSticker] 🌐 Buscando imagen Renault en URL pública:', remoteUrl);
            const resp = await fetchFn(remoteUrl);
            if (resp.ok) {
              const arrBuf = await resp.arrayBuffer();
              const buf = Buffer.from(arrBuf);
              if (buf.length > 0) {
                renaultImageBuffer = buf;
                renaultImagePath = remoteUrl;
                logger.info('[generateOilChangeSticker] ✅✅✅ Imagen Renault descargada desde URL pública', {
                  url: remoteUrl,
                  size: buf.length
                });
              } else {
                logger.warn('[generateOilChangeSticker] ⚠️ Buffer vacío al descargar imagen Renault desde URL pública');
              }
            } else {
              logger.warn('[generateOilChangeSticker] ⚠️ No se pudo descargar imagen Renault desde URL pública', {
                url: remoteUrl,
                status: resp.status,
                statusText: resp.statusText
              });
            }
          }
        } catch (remoteErr) {
          logger.error('[generateOilChangeSticker] ❌ Error descargando imagen Renault desde URL pública:', {
            error: remoteErr?.message,
            stack: remoteErr?.stack
          });
        }
      }
      
      if (renaultImageBuffer && renaultImageBuffer.length > 0) {
        // Tamaño de la imagen Renault (proporcional, visible y bien dimensionada)
        // Aumentar 50% respecto al cálculo base, sin salirse del área
        const renaultBaseWidth = Math.min(rightColW * 0.95, qrSize * 1.1);
        const renaultImageWidth = Math.min(renaultBaseWidth * 1.5, rightColW); // +50% con límite de columna
        const renaultImageHeight = renaultImageWidth * 0.5; // Proporción más ancha que alta
        const renaultImageX = rightColX + (rightColW - renaultImageWidth) / 2; // Centrar horizontalmente
        
        // Calcular posición Y: debe estar arriba del QR con espacio adecuado
        // El QR está en qrY, así que la imagen debe estar antes de qrY
        const spaceBetweenImageAndQR = verticalSpacing * 2; // Espacio entre imagen y QR
        const renaultImageY = qrY - renaultImageHeight - spaceBetweenImageAndQR;
        
        // Asegurar que la imagen no se salga del área disponible (pero permitir que esté cerca del logo)
        const minY = rightColY + (logoHeight > 0 ? logoHeight + verticalSpacing * 2 : verticalSpacing);
        const finalY = Math.max(minY, renaultImageY);
        
        // CRÍTICO: Insertar la imagen en el PDF ANTES del QR
        logger.info('[generateOilChangeSticker] 🖼️ Insertando imagen Renault en PDF', {
          x: renaultImageX,
          y: finalY,
          width: renaultImageWidth,
          height: renaultImageHeight,
          bufferSize: renaultImageBuffer.length,
          path: renaultImagePath,
          rightColX,
          rightColY,
          rightColW,
          rightColH,
          qrY,
          qrSize,
          logoHeight,
          spaceBetweenImageAndQR
        });
        
        // Insertar imagen usando sintaxis de PDFKit - FORZAR INSERCIÓN
        try {
          // Verificar que las coordenadas sean válidas
          if (renaultImageX >= 0 && finalY >= 0 && renaultImageWidth > 0 && renaultImageHeight > 0) {
            // Usar fit para mantener proporciones
            doc.image(renaultImageBuffer, renaultImageX, finalY, {
              fit: [renaultImageWidth, renaultImageHeight],
              align: 'center'
            });
            renaultImageLoaded = true;
            logger.info('[generateOilChangeSticker] ✅✅✅ Imagen Renault INSERTADA exitosamente en PDF', {
              x: renaultImageX,
              y: finalY,
              width: renaultImageWidth,
              height: renaultImageHeight
            });
          } else {
            logger.error('[generateOilChangeSticker] ❌ Coordenadas inválidas para imagen:', {
              x: renaultImageX,
              y: finalY,
              width: renaultImageWidth,
              height: renaultImageHeight
            });
          }
        } catch (insertError) {
          logger.error('[generateOilChangeSticker] ❌ Error al insertar imagen en PDF:', {
            error: insertError.message,
            stack: insertError.stack,
            x: renaultImageX,
            y: finalY,
            width: renaultImageWidth,
            height: renaultImageHeight
          });
        }
      } else {
        logger.error('[generateOilChangeSticker] ❌ Imagen Renault NO ENCONTRADA o buffer vacío. Rutas intentadas:', {
          paths: possiblePaths.map(p => String(p).replace(/\\/g, '/')),
          cwd: process.cwd(),
          __dirname: __dirname,
          exists: possiblePaths.map(p => {
            const np = String(p).replace(/\\/g, '/');
            return { path: np, exists: existsSync(np) };
          })
        });
      }
    } catch (err) {
      logger.error('[generateOilChangeSticker] ❌ Error cargando imagen Renault:', {
        error: err.message,
        stack: err.stack
      });
    }
    
    // Si la imagen no se cargó, registrar advertencia
    if (!renaultImageLoaded) {
      logger.warn('[generateOilChangeSticker] ⚠️ ADVERTENCIA: Imagen Renault no se pudo cargar o insertar');
    }
    
    // QR Code (abajo, centrado) - INSERTAR DESPUÉS DE LA IMAGEN RENAULT
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

