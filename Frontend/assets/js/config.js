// Frontend/assets/js/config.js
// Config universal del FRONTEND para elegir el backend sin CORS ni mixed content
(function(){
	const host = (typeof window !== 'undefined' ? window.location.hostname : '');
	const isLocal = host === 'localhost' || host === '127.0.0.1';

	// Permitir override rápido: ?api=http://IP:PUERTO  (se guarda en localStorage)
	try {
		const usp = new URLSearchParams(window.location.search);
		const qApi = usp.get('api');
		if (qApi) localStorage.setItem('backend_url', qApi);
	} catch {}
	const stored = (()=>{ try { return localStorage.getItem('backend_url') || ''; } catch { return ''; } })();

	// Estrategia:
	// - En local: usar http://localhost:4000 (docker-compose)
	// - En producción (Netlify o droplet): usar mismo origen (dejar vacío) para que /api funcione vía proxy.
	//   Si necesitas apuntar directo temporalmente, usa el override almacenado en 'backend_url'.
	let backend = '';
	if (isLocal) backend = 'http://localhost:4000';
	if (stored) backend = stored;  // override manual siempre gana

	window.BACKEND_URL = backend;   // Preferido por api.js
	window.API_BASE = backend;      // Retro-compatibilidad

	// Cloudinary (si se usa en el front)
	window.CLOUDINARY_CLOUD_NAME = window.CLOUDINARY_CLOUD_NAME || "dzj1yqcdf";
	window.CLOUDINARY_UPLOAD_PRESET = window.CLOUDINARY_UPLOAD_PRESET || "inventory_unsigned";
})();

