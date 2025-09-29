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
          url: f.path,          // https://res.cloudinary.com/...
          publicId: f.filename, // public_id
          mimetype: f.mimetype
        };
      }
      // Local: servir desde /uploads/<companyId>/<filename>
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
// Auth opcional: si llega un Bearer token válido con companyId, lo adjuntamos; si no, continuamos como "public"
router.post('/stickers/pdf', async (req, res, next) => {
	// Expect body: { items: [ { sku, name, companyName?, companyLogo? }, ... ] }
	try {
		// intentar extraer company desde Authorization (opcional)
		try {
			const h = (req.headers.authorization || '');
			const [scheme, token] = h.split(' ');
			if (scheme?.toLowerCase() === 'bearer' && token) {
				const payload = jwt.verify(token, process.env.JWT_SECRET);
				if (payload?.companyId) {
					req.company = { id: payload.companyId };
					// opcional: si el token incluye nombres o logo, añadirlos
					if (payload.companyName) req.company.name = payload.companyName;
					if (payload.companyLogo) req.company.logo = payload.companyLogo;
				}
			}
		} catch (e) {
			// no hay token válido -> continuar sin company (se usa 'public' más abajo)
		}
		const items = Array.isArray(req.body?.items) ? req.body.items : [];

		// fallback dinámico a fetch (node >=18 tiene fetch global; si no, intentamos node-fetch)
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
		// Añadir metadatos básicos para el PDF
		doc.info = { Title: 'Stickers', Author: (req.company?.name || 'proyecto-taller') };
		const buffers = [];
		doc.on('data', (b) => buffers.push(b));
		doc.on('error', (err) => next(err));

		// crear página por cada sticker (2 por item)
		for (const item of items) {
			// Forzar nombre de la empresa por ahora y determinar logo por defecto si no viene
			const companyName = "CASA RENAULT H&H";
			const defaultLogoUrl = `${req.protocol}://${req.get('host')}/uploads/public/logo-renault.jpg`;
			const companyLogoSrc = item.companyLogo || req.company?.logo || defaultLogoUrl;
			const sku = item.sku || item.name || '';

			// Preparar buffer de logo (si hay)
			const logoBuffer = companyLogoSrc ? await fetchImageBuffer(companyLogoSrc) : null;

			// STICKER 1: logo a la izquierda + texto a la derecha (centrado verticalmente)
			doc.addPage({ size: [STICKER_W, STICKER_H], margin: 0 });
			doc.save();
			doc.rect(0, 0, STICKER_W, STICKER_H).fill('#FFFFFF');

			const contentX = MARGIN;
			const contentY = MARGIN;
			const contentW = STICKER_W - 2 * MARGIN;
			const contentH = STICKER_H - 2 * MARGIN;

			// Áreas: logo 35% ancho, texto el resto
			const logoAreaW = Math.min(contentW * 0.35, contentW * 0.45);
			const gapBetween = 4; // puntos
			const textAreaX = contentX + logoAreaW + gapBetween;
			const textAreaW = contentW - logoAreaW - gapBetween;

			// Dibujar logo escalado y centrado verticalmente en su área
			if (logoBuffer) {
				try {
					const maxLogoW = logoAreaW;
					const maxLogoH = contentH * 0.9;
					const logoX = contentX;
					const logoY = contentY + (contentH - maxLogoH) / 2;
					doc.image(logoBuffer, logoX, logoY, { fit: [maxLogoW, maxLogoH] });
				} catch (e) {}
			}

			// Texto de la empresa a la derecha, centrado verticalmente
			doc.fillColor('#000').font('Helvetica-Bold');
			let fontSize = Math.floor(Math.min(12, contentH * 0.5));
			if (fontSize < 6) fontSize = 6;
			doc.fontSize(fontSize);
			const textY = contentY + (contentH / 2) - (fontSize / 2);
			doc.text(companyName, textAreaX, textY, { width: textAreaW, align: 'center', ellipsis: true });
			doc.restore();

			// STICKER 2: SKU vertical a la izquierda + QR a la derecha
			doc.addPage({ size: [STICKER_W, STICKER_H], margin: 0 });
			doc.save();
			doc.rect(0, 0, STICKER_W, STICKER_H).fill('#FFFFFF');

			const vContentX = MARGIN;
			const vContentY = MARGIN;
			const vContentW = STICKER_W - 2 * MARGIN;
			const vContentH = STICKER_H - 2 * MARGIN;

			// Columnas: left 60% para SKU, right 40% para QR
			const qrColW = Math.min(vContentW * 0.4, vContentW * 0.45);
			const skuColW = vContentW - qrColW - 4;
			const skuColX = vContentX;
			const qrColX = vContentX + skuColW + 4;

			// Preparar QR en alta resolución (300 dpi) y luego insertarlo escalado
			let qrBuf = null;
			try {
				const maxQrPts = Math.min(qrColW, vContentH);
				const DPI = 300;
				const PT_TO_PX = DPI / 72;
				const qrPx = Math.max(120, Math.round(maxQrPts * PT_TO_PX));
				const qrDataUrl = await QRCode.toDataURL(String(sku || ''), { margin: 0, width: qrPx });
				qrBuf = Buffer.from(qrDataUrl.split(',')[1], 'base64');
			} catch (e) {
				qrBuf = null;
			}

			// Dibujar SKU vertical en la columna izquierda (cada carácter en nueva línea)
			const s = String(sku || '').toUpperCase();
			const chars = s.split('');
			const charCount = Math.max(1, chars.length);
			const lineHeightRatio = 1.05;
			// calcular font que quepa verticalmente y también que no sea más ancho que skuColW
			let vFont = Math.floor(vContentH / (charCount * lineHeightRatio));
			vFont = Math.max(6, Math.min(40, vFont));
			// asegurar que la fuente también cabe en ancho (aprox vFont * 0.6)
			const approxCharWidth = vFont * 0.6;
			if (approxCharWidth > skuColW) {
				vFont = Math.floor(skuColW / 0.6);
			}
			vFont = Math.max(6, Math.min(40, vFont));
			doc.font('Helvetica-Bold').fontSize(vFont);
			const totalTextHeight = vFont * charCount * lineHeightRatio;
			const startY = vContentY + Math.max(0, (vContentH - totalTextHeight) / 2);
			const verticalText = chars.join('\n');
			doc.fillColor('#000');
			doc.text(verticalText, skuColX, startY, {
				width: skuColW,
				align: 'center',
				lineGap: Math.round(vFont * (lineHeightRatio - 1))
			});

			// Dibujar QR en la columna derecha (centrado)
			if (qrBuf) {
				try {
					const maxQrSize = Math.min(qrColW, vContentH);
					const qrX = qrColX + (qrColW - maxQrSize) / 2;
					const qrY = vContentY + (vContentH - maxQrSize) / 2;
					doc.image(qrBuf, qrX, qrY, { fit: [maxQrSize, maxQrSize] });
				} catch (e) {}
			} else {
				// fallback texto QR si no se generó
				doc.fontSize(8).text('QR', qrColX + qrColW / 2, vContentY + vContentH / 2, { align: 'center' });
			}

			doc.restore();
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
