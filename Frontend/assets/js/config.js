// Frontend/assets/js/config.js
// Config universal del FRONTEND para elegir el backend sin CORS ni mixed content
(function(){
  const host = (typeof window !== 'undefined' ? window.location.hostname : '');
  const isLocal = host === 'localhost' || host === '127.0.0.1';

  let stored = '';
  try {
    const usp = new URLSearchParams(window.location.search);
    const qApi = usp.get('api');
    if (qApi) {
      const normalized = qApi.trim();
      if (window.location.protocol === 'https:' && normalized.startsWith('http:')) {
        console.warn('Ignoring backend_url override with http:// on https origin');
        localStorage.removeItem('backend_url');
      } else {
        localStorage.setItem('backend_url', normalized);
      }
    }
    stored = localStorage.getItem('backend_url') || '';
    if (stored && window.location.protocol === 'https:' && stored.startsWith('http:')) {
      console.warn('Removing stored backend_url http:// override to avoid mixed content');
      localStorage.removeItem('backend_url');
      stored = '';
    }
  } catch {}

  let backend = '';
  if (isLocal) backend = 'http://localhost:4000';
  if (stored) backend = stored;

  // Configuración automática por entorno
  if (!stored) {
    // Localhost desarrollo
    if (isLocal) {
      backend = 'http://localhost:4001'; // Puerto de desarrollo
    }
    // Netlify (mantener compatibilidad)
    else if (host.includes('.netlify.app')) {
      backend = ''; // Usa proxy /api/*
    }
    // Otros dominios (producción)
    else {
      backend = ''; // Usa mismo origen
    }
  }

  window.BACKEND_URL = backend;
  window.API_BASE = backend;

  window.CLOUDINARY_CLOUD_NAME = window.CLOUDINARY_CLOUD_NAME || "dzj1yqcdf";
  window.CLOUDINARY_UPLOAD_PRESET = window.CLOUDINARY_UPLOAD_PRESET || "inventory_unsigned";
  
  
  window.PLATE_RECOGNIZER_API_KEY = window.PLATE_RECOGNIZER_API_KEY || 'cd13b6b2c23e9dc10d7f0d33869c6dde31a1aeaa';
  window.USE_PLATE_RECOGNIZER = window.USE_PLATE_RECOGNIZER !== undefined ? window.USE_PLATE_RECOGNIZER : true;
})();
