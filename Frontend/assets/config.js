// Configuración automática para desarrollo y producción
(function() {
  const isProduction = window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';
  const isNetlify = window.location.hostname.includes('netlify.app');
  
  if (isProduction || isNetlify) {
    // Producción: usar backend en Render
    window.BACKEND_URL = "https://proyecto-taller-6o7o.onrender.com";
    console.log('🌐 Modo PRODUCCIÓN - Backend:', window.BACKEND_URL);
  } else {
    // Desarrollo local: usar localhost si está disponible
    window.BACKEND_URL = "http://localhost:4000";
    console.log('🔧 Modo DESARROLLO - Backend:', window.BACKEND_URL);
  }
  
  // Test de conectividad al backend
  fetch(window.BACKEND_URL + '/health')
    .then(response => {
      if (response.ok) {
        console.log('✅ Backend conectado correctamente');
      } else {
        console.warn('⚠️ Backend responde pero con errores');
      }
    })
    .catch(error => {
      console.warn('❌ Backend no disponible, funcionando en modo offline');
      console.log('Error de conexión:', error.message);
    });
})();
