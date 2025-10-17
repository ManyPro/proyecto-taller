// Configuración de frontend para detectar automáticamente el backend
(function() {
  // Config globales
  window.BACKEND_CONNECTED = false;
  window.IS_PRODUCTION = false;

  const host = window.location.hostname;
  const isLocalhost = host === 'localhost' || host === '127.0.0.1';
  const isNetlify = host.includes('netlify.app');
  const isRender = host.includes('render.com');

  // Estrategia:
  // - Producción con proxy/Nginx: dejar BACKEND_URL vacío para usar misma-origen ("/api/..."), sin CORS.
  // - Desarrollo local: usar http://localhost:4000 que mapea al backend del docker-compose.
  // - Hosts conocidos (netlify/render): puedes apuntar a tu dominio o IP del droplet si no usas proxy.

  // Permitir override temporal por query (?api=) o localStorage (backend_url)
  try {
    const usp = new URLSearchParams(window.location.search);
    const qApi = usp.get('api');
    if (qApi) localStorage.setItem('backend_url', qApi);
  } catch { }
  const stored = (() => { try { return localStorage.getItem('backend_url') || ''; } catch { return ''; } })();

  if (isLocalhost) {
    window.BACKEND_URL = 'http://localhost:4000'; // docker-compose expone backend en 4000
    window.IS_PRODUCTION = false;
    console.log('🔧 Modo DESARROLLO - Backend:', window.BACKEND_URL);
  } else if (isNetlify || isRender) {
    // Si sigues usando un hosting externo para el frontend, apunta temporalmente a tu servidor.
    // Reemplaza por tu dominio en DigitalOcean cuando lo tengas.
    window.BACKEND_URL = stored || '';
    window.IS_PRODUCTION = true;
    console.log('🌐 Modo PRODUCCIÓN -', window.BACKEND_URL ? `Backend override: ${window.BACKEND_URL}` : 'Mismo origen vía proxy Nginx');
  } else {
    // Producción en tu propio droplet con Nginx proxy -> mismo origen (dejar vacío)
    window.BACKEND_URL = stored || '';
    window.IS_PRODUCTION = true;
    console.log('🌐 Producción (mismo origen).');
  }

  const healthPath = '/api/v1/health';
  const base = window.BACKEND_URL || '';

  // Test de conectividad (no bloquea la app, solo informa)
  fetch(base + healthPath)
    .then(response => {
      if (response.ok) {
        console.log('✅ Backend conectado');
        window.BACKEND_CONNECTED = true;
      } else {
        console.warn('⚠️ Health check con estado no OK');
      }
    })
    .catch(error => {
      console.warn('⚠️ No se pudo verificar el backend aún:', error?.message || error);
    });
})();
