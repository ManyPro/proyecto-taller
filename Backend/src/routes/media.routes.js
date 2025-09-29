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
			// valores básicos
			const companyName = "CASA RENAULT H&H";
			const defaultLogoUrl = `${req.protocol}://${req.get('host')}/uploads/public/logo-renault.jpg`;
			const companyLogoSrc = item.companyLogo || req.company?.logo || defaultLogoUrl;
			const sku = (item.sku || item.name || '').toString();

			// buffers de media
			const logoBuffer = companyLogoSrc ? await fetchImageBuffer(companyLogoSrc) : null;

			// STICKER 1: logo (cuadrado) izquierda, texto compañía centrado, precio (cuadrado) derecha
			doc.addPage({ size: [STICKER_W, STICKER_H], margin: 0 });
			doc.save();
			doc.rect(0, 0, STICKER_W, STICKER_H).fill('#FFFFFF');

			const contentX = MARGIN;
			const contentY = MARGIN;
			const contentW = STICKER_W - 2 * MARGIN;
			const contentH = STICKER_H - 2 * MARGIN;

			// tamaño de los cuadrados (logo / price) iguales y centrados verticalmente
			const squareSize = Math.min(contentH * 0.8, contentW * 0.32);
			const leftSquareX = contentX;
			const rightSquareX = contentX + contentW - squareSize;
			const squareY = contentY + (contentH - squareSize) / 2;

			// dibujar logo en cuadrado izquierdo
			if (logoBuffer) {
				try {
					doc.image(logoBuffer, leftSquareX, squareY, { fit: [squareSize, squareSize], align: 'center', valign: 'center' });
				} catch (e) {}
			} else {
				// placeholder borde si no hay logo
				doc.rect(leftSquareX, squareY, squareSize, squareSize).lineWidth(0.5).stroke('#CCCCCC');
			}

			// dibujar precio en cuadrado derecho (fondo blanco con borde, price centrado)
			const price = (item.salePrice != null ? Number(item.salePrice) : (item.entryPrice != null ? Number(item.entryPrice) : 0));
			doc.roundedRect(rightSquareX, squareY, squareSize, squareSize, 4).lineWidth(0.5).stroke('#CCCCCC');
			doc.fillColor('#000').font('Helvetica-Bold');
			// sizing dinámico del precio
			let pFont = Math.floor(squareSize * 0.22);
			if (pFont < 8) pFont = 8;
			if (pFont > 18) pFont = 18;
			doc.fontSize(pFont);
			const priceText = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(price || 0);
			// centrar precio dentro del cuadrado
			const priceTextWidth = doc.widthOfString(priceText);
			const priceTextX = rightSquareX + (squareSize - priceTextWidth) / 2;
			const priceTextY = squareY + (squareSize - pFont) / 2;
			doc.text(priceText, priceTextX, priceTextY);

			// Nombre de la empresa en el espacio central (entre cuadrados)
			const centerX = leftSquareX + squareSize + 6;
			const centerW = contentW - 2 * squareSize - 12;
			doc.fillColor('#000').font('Helvetica-Bold');
			let nameFont = Math.floor(Math.min(12, contentH * 0.28));
			if (nameFont < 6) nameFont = 6;
			doc.fontSize(nameFont);
			const nameY = contentY + (contentH - nameFont) / 2;
			doc.text(companyName, centerX, nameY, { width: centerW, align: 'center', ellipsis: true });

			doc.restore();

			// STICKER 2: SKU horizontal sobre fondo cuadrado gris (misma medida que QR) a la izquierda, QR a la derecha
			doc.addPage({ size: [STICKER_W, STICKER_H], margin: 0 });
			doc.save();
			doc.rect(0, 0, STICKER_W, STICKER_H).fill('#FFFFFF');

			const vContentX = MARGIN;
			const vContentY = MARGIN;
			const vContentW = STICKER_W - 2 * MARGIN;
			const vContentH = STICKER_H - 2 * MARGIN;

			// columnas: left area for SKU+bg square, right area for QR
			const qrColW = Math.min(vContentW * 0.4, vContentW * 0.45);
			const skuColW = vContentW - qrColW - 6;
			const skuColX = vContentX;
			const qrColX = vContentX + skuColW + 6;

			// preparar QR (alta resolución)
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

			// square size for background = same as QR display size
			const squareSize2 = Math.min(skuColW, vContentH);
			const squareX = skuColX + (skuColW - squareSize2) / 2;
			const squareY2 = vContentY + (vContentH - squareSize2) / 2;

			// draw rounded gray background for SKU
			doc.save();
			doc.fillColor('#f2f2f2');
			if (typeof doc.roundedRect === 'function') {
				// draw rounded rect
				doc.roundedRect(squareX, squareY2, squareSize2, squareSize2, 6).fill();
			} else {
				doc.rect(squareX, squareY2, squareSize2, squareSize2).fill();
			}
			doc.restore();

			// draw SKU centered horizontally on that square
			doc.fillColor('#000').font('Helvetica-Bold');
			let skuFont = Math.floor(squareSize2 * 0.18);
			if (skuFont < 8) skuFont = 8;
			if (skuFont > 20) skuFont = 20;
			doc.fontSize(skuFont);
			const skuTextWidth = doc.widthOfString(sku);
			const skuTextX = squareX + (squareSize2 - skuTextWidth) / 2;
			const skuTextY = squareY2 + (squareSize2 - skuFont) / 2;
			doc.text(String(sku || ''), skuTextX, skuTextY, { align: 'left' });

			// dibujar QR a la derecha, centrado verticalmente y con tamaño igual al squareSize2
			if (qrBuf) {
				try {
					const qrX = qrColX + (qrColW - squareSize2) / 2;
					const qrY = vContentY + (vContentH - squareSize2) / 2;
					doc.image(qrBuf, qrX, qrY, { fit: [squareSize2, squareSize2] });
				} catch (e) {}
			} else {
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
