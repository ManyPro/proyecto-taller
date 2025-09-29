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
			const companyName = item.companyName || req.company?.name || '';
			const companyLogoSrc = item.companyLogo || req.company?.logo || null;
			const sku = item.sku || item.name || '';

			// Preparar buffer de logo (si hay)
			const logoBuffer = companyLogoSrc ? await fetchImageBuffer(companyLogoSrc) : null;

			// STICKER 1: genérico (logo + nombre empresa)
			doc.addPage({ size: [STICKER_W, STICKER_H], margin: 0 });
			doc.save();
			// fondo blanco
			doc.rect(0, 0, STICKER_W, STICKER_H).fill('#FFFFFF');
			doc.fillColor('#000');

			const contentX = MARGIN;
			const contentY = MARGIN;
			const contentW = STICKER_W - 2 * MARGIN;
			const contentH = STICKER_H - 2 * MARGIN;

			// Si hay logo, mostrar centrado y escalar para que ocupe ~60% de altura del área de contenido
			if (logoBuffer) {
				const maxLogoH = contentH * 0.6;
				const maxLogoW = contentW;
				try {
					doc.image(logoBuffer, contentX + (contentW - maxLogoW) / 2, contentY, {
						fit: [maxLogoW, maxLogoH],
						align: 'center',
						valign: 'center'
					});
				} catch (e) {
					// continuar si falla la imagen
				}
			}

			// Nombre de la empresa centrado debajo del logo (o centrado vertical si no hay logo)
			doc.fillColor('#000').fontSize(8);
			const nameY = contentY + contentH - 10;
			doc.text(companyName, contentX, nameY, {
				width: contentW,
				align: 'center',
				ellipsis: true
			});
			doc.restore();

			// STICKER 2: SKU + QR
			doc.addPage({ size: [STICKER_W, STICKER_H], margin: 0 });
			doc.save();
			doc.rect(0, 0, STICKER_W, STICKER_H).fill('#FFFFFF');
			doc.fillColor('#000');

			// dividir área en dos columnas: izquierda texto, derecha QR
			const pad = 2;
			const leftW = (contentW * 0.55) - pad;
			const rightW = (contentW * 0.45) - pad;
			const leftX = contentX;
			const rightX = contentX + contentW - rightW;

			// SKU texto (centrado verticalmente)
			doc.fontSize(8).text(String(sku), leftX, contentY, {
				width: leftW,
				align: 'left'
			});

			// Calcular tamaño máximo del QR en puntos y generar QR en pixeles suficientes (300 dpi)
			const maxQrSizePts = Math.min(rightW, contentH);
			const DPI = 300;
			const PT_TO_PX = DPI / 72;
			let qrBuffer = null;
			try {
				const qrPixelWidth = Math.max(100, Math.round(maxQrSizePts * PT_TO_PX));
				const qrDataUrl = await QRCode.toDataURL(String(sku), { margin: 0, width: qrPixelWidth });
				qrBuffer = Buffer.from(qrDataUrl.split(',')[1], 'base64');
			} catch (e) {
				qrBuffer = null;
			}

			// QR al lado derecho (si se generó)
			if (qrBuffer) {
				const maxQrSize = Math.min(rightW, contentH);
				try {
					doc.image(qrBuffer, rightX + (rightW - maxQrSize) / 2, contentY + (contentH - maxQrSize) / 2, {
						fit: [maxQrSize, maxQrSize],
						align: 'center',
						valign: 'center'
					});
				} catch (e) {
					// ignore
				}
			} else {
				// si no hay QR, mostrar SKU centrado en toda el área
				doc.fontSize(9).text(String(sku), contentX, contentY + (contentH / 2) - 6, {
					width: contentW,
					align: 'center'
				});
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
