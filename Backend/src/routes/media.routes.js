import { Router } from 'express';
import { authCompany } from '../middlewares/auth.js';
import { uploadArray, isCloudinary } from '../lib/upload.js';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import jwt from 'jsonwebtoken';

const router = Router();

// POST /api/v1/media/upload
router.post('/upload', authCompany, (req, res, next) => {
  uploadArray(req, res, async (err) => {
    if (err) return next(err);

    const base = `${req.protocol}://${req.get('host')}`;
    const companyId = (req.company?.id || 'public').toString();

    const files = (req.files || []).map(f => {
      if (isCloudinary) {
        return {
          url: f.path,
          publicId: f.filename,
          mimetype: f.mimetype
        };
      }
      return {
        url: `${base}/uploads/${companyId}/${f.filename}`,
        publicId: f.filename,
        mimetype: f.mimetype
      };
    });

    return res.json({ files });
  });
});

// Nuevo endpoint: genera PDF con stickers (2 por item)
// Auth opcional: extrae company si se envía Bearer token válido
router.post('/stickers/pdf', async (req, res, next) => {
  try {
    // intentar extraer company desde Authorization (opcional)
    try {
      const h = (req.headers.authorization || '');
      const [scheme, token] = h.split(' ');
      if (scheme?.toLowerCase() === 'bearer' && token) {
        const payload = jwt.verify(token, process.env.JWT_SECRET);
        if (payload?.companyId) {
          req.company = { id: payload.companyId };
          if (payload.companyName) req.company.name = payload.companyName;
          if (payload.companyLogo) req.company.logo = payload.companyLogo;
        }
      }
    } catch (e) {
      // continuar sin company si token inválido
    }

    const items = Array.isArray(req.body?.items) ? req.body.items : [];

    // fallback dinámico a fetch (node >=18 tiene fetch global; si no, import node-fetch)
    let fetchFn = globalThis.fetch;
    async function ensureFetch() {
      if (fetchFn) return fetchFn;
      try {
        const mod = await import('node-fetch');
        fetchFn = mod.default || mod;
        return fetchFn;
      } catch (e) {
        return null;
      }
    }

    // helper para obtener buffer desde URL o data URI
    async function fetchImageBuffer(src) {
      if (!src) return null;
      if (src.startsWith('data:')) {
        const b64 = src.split(',')[1] || '';
        return Buffer.from(b64, 'base64');
      }
      const f = await ensureFetch();
      if (!f) return null;
      const r = await f(src);
      if (!r.ok) return null;
      const ab = await r.arrayBuffer();
      return Buffer.from(ab);
    }

    // medidas en puntos (1 cm = 28.3464567 pts)
    const CM = 28.3464567;
    const STICKER_W = 5 * CM; // 5 cm
    const STICKER_H = 3 * CM; // 3 cm
    const MARGIN = 0.25 * CM; // 0.25 cm

    const doc = new PDFDocument({ autoFirstPage: false, bufferPages: true });
    doc.info = { Title: 'Stickers', Author: (req.company?.name || 'proyecto-taller') };
    const buffers = [];
    doc.on('data', (b) => buffers.push(b));
    doc.on('error', (err) => next(err));

    // generar 2 stickers (páginas) por cada item
    for (const item of items) {
      const companyName = item.companyName || req.company?.name || "CASA RENAULT H&H";
      const defaultLogoUrl = `${req.protocol}://${req.get('host')}/uploads/public/logo-renault.jpg`;
      const companyLogoSrc = item.companyLogo || req.company?.logo || defaultLogoUrl;
      const sku = (item.sku || item.name || '').toString();

      // cargar logo si existe
      const logoBuffer = companyLogoSrc ? await fetchImageBuffer(companyLogoSrc) : null;

      // ---- STICKER A: logo centrado + nombre empresa debajo ----
      doc.addPage({ size: [STICKER_W, STICKER_H], margin: 0 });
      doc.save();
      doc.rect(0, 0, STICKER_W, STICKER_H).fill('#FFFFFF');

      const cx = MARGIN;
      const cy = MARGIN;
      const cw = STICKER_W - 2 * MARGIN;
      const ch = STICKER_H - 2 * MARGIN;

      if (logoBuffer) {
        try {
          const maxLogoH = ch * 0.6;
          const maxLogoW = cw * 0.8;
          const fitW = Math.min(maxLogoW, maxLogoH);
          const logoX = cx + (cw - fitW) / 2;
          const logoY = cy + (ch * 0.08);
          doc.image(logoBuffer, logoX, logoY, { fit: [fitW, maxLogoH], align: 'center', valign: 'center' });
        } catch (e) {
          // continuar
        }
      }

      doc.fillColor('#000').font('Helvetica-Bold');
      let nameFont = Math.floor(ch * 0.14);
      if (nameFont < 6) nameFont = 6;
      if (nameFont > 12) nameFont = 12;
      doc.fontSize(nameFont);
      const nameY = cy + (ch * 0.68);
      doc.text(companyName, cx, nameY, { width: cw, align: 'center', ellipsis: true });
      doc.restore();

      // ---- STICKER B (MODIFICADO): cuadro gris SKU (izq) + QR (der) sin que el QR invada margen ----
      doc.addPage({ size: [STICKER_W, STICKER_H], margin: 0 });
      doc.save();
      doc.rect(0, 0, STICKER_W, STICKER_H).fill('#FFFFFF');

      const vx = MARGIN;
      const vy = MARGIN;
      const vw = STICKER_W - 2 * MARGIN;
      const vh = STICKER_H - 2 * MARGIN;

      // Ancho de columna del QR (porcentaje del espacio restante)
      const qrColW = vw * 0.42;
      const gap = 6; // separación entre columnas en puntos
      const skuColW = vw - qrColW - gap;
      const skuColX = vx;
      const qrColX = vx + skuColW + gap;

      // Generar QR buffer (limitarlo a su columna)
      let qrBuf = null;
      try {
        const maxQrPts = Math.min(qrColW, vh);
        const DPI = 300;
        const PT_TO_PX = DPI / 72;
        const qrPx = Math.max(120, Math.round(maxQrPts * PT_TO_PX));
        const qrDataUrl = await QRCode.toDataURL(String(sku || ''), {
          margin: 0,       // quiet zone mínima; el padding lo controlamos acá
          width: qrPx
        });
        qrBuf = Buffer.from(qrDataUrl.split(',')[1], 'base64');
      } catch (e) {
        qrBuf = null;
      }

      // Tamaños independientes SKU / QR
      const skuSquareSize = Math.min(skuColW, vh);
      const qrSquareSize  = Math.min(qrColW, vh);

      // Padding interno opcional para aire visual
      const INTERNAL_PADDING = 2; // puntos (~0.07 cm)
      const skuInnerSize = Math.max(0, skuSquareSize - INTERNAL_PADDING * 2);
      const qrInnerSize  = Math.max(0, qrSquareSize - INTERNAL_PADDING * 2);

      // Posición del cuadrado gris SKU
      const skuSquareX = skuColX + (skuColW - skuSquareSize) / 2;
      const skuSquareY = vy + (vh - skuSquareSize) / 2;

      // Fondo gris
      doc.save();
      doc.fillColor('#c0b7b7ff');
      if (typeof doc.roundedRect === 'function') {
        doc.roundedRect(skuSquareX, skuSquareY, skuSquareSize, skuSquareSize, 6).fill();
      } else {
        doc.rect(skuSquareX, skuSquareY, skuSquareSize, skuSquareSize).fill();
      }
      doc.restore();

      // Texto SKU
      doc.fillColor('#000').font('Helvetica-Bold');
      let skuFont = Math.floor(skuInnerSize * 0.18);
      if (skuFont < 8) skuFont = 8;
      if (skuFont > 20) skuFont = 20;
      doc.fontSize(skuFont);
      doc.text(String(sku || ''), skuSquareX + INTERNAL_PADDING,
        skuSquareY + (skuSquareSize - skuFont) / 2,
        {
          width: skuInnerSize,
          align: 'center',
          ellipsis: true
        }
      );

      // Dibujo del QR en su propia columna usando qrSquareSize
      if (qrBuf) {
        try {
          const qrX = qrColX + (qrColW - qrSquareSize) / 2 + INTERNAL_PADDING;
          const qrY = vy + (vh - qrSquareSize) / 2 + INTERNAL_PADDING;
          doc.image(qrBuf, qrX, qrY, {
            fit: [qrInnerSize, qrInnerSize],
            align: 'center',
            valign: 'center'
          });
        } catch (e) {
          doc.fontSize(8).text('QR ERR', qrColX + qrColW / 2, vy + vh / 2, { align: 'center' });
        }
      } else {
        doc.fontSize(8).text('QR', qrColX + qrColW / 2, vy + vh / 2, { align: 'center' });
      }

      doc.restore();
      // ---- FIN STICKER B MODIFICADO ----
    }

    // preparar respuesta una vez termine el stream del PDF
    doc.on('end', () => {
      const pdf = Buffer.concat(buffers);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename="stickers.pdf"');
      res.setHeader('Content-Length', String(pdf.length));
      return res.send(pdf);
    });

    doc.end();
  } catch (err) {
    return next(err);
  }
});

export default router;