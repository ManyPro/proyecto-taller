// Configuración estricta para producción con backend real
(function() {
  // Detección más precisa de entorno
  const isNetlify = window.location.hostname.includes('netlify.app');
  const isRender = window.location.hostname.includes('render.com');
  const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  
  if (isNetlify || isRender) {
    // Producción real: usar backend en Render
    window.BACKEND_URL = "https://proyecto-taller-6o7o.onrender.com";
    window.IS_PRODUCTION = true;
    console.log('🌐 Modo PRODUCCIÓN REAL - Backend:', window.BACKEND_URL);
  } else if (isLocalhost) {
    // Desarrollo local: usar localhost pero requiere backend real
    window.BACKEND_URL = "http://localhost:4000";
    window.IS_PRODUCTION = false;
    console.log('🔧 Modo DESARROLLO - Backend:', window.BACKEND_URL);
  } else {
    // Fallback: asumir desarrollo
    window.BACKEND_URL = "http://localhost:4000";
    window.IS_PRODUCTION = false;
    console.log('❓ Modo DESCONOCIDO (asumiendo desarrollo) - Backend:', window.BACKEND_URL);
  }
  
  // Test de conectividad obligatorio
  fetch(window.BACKEND_URL + '/health')
    .then(response => {
      if (response.ok) {
        console.log('✅ Backend conectado y funcionando correctamente');
        window.BACKEND_CONNECTED = true;
      } else {
        console.error('❌ Backend responde con errores');
        window.BACKEND_CONNECTED = false;
      }
    })
    .catch(error => {
      console.error('❌ Backend no disponible - La aplicación NO funcionará sin backend');
      console.error('Error de conexión:', error.message);
      window.BACKEND_CONNECTED = false;
      
      // Mostrar error crítico si no hay backend
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', showBackendError);
      } else {
        showBackendError();
      }
    });
  
  function showBackendError() {
    const errorDiv = document.createElement('div');
    errorDiv.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      background: #dc3545;
      color: white;
      padding: 15px;
      text-align: center;
      z-index: 10000;
      font-weight: bold;
      box-shadow: 0 2px 10px rgba(0,0,0,0.3);
    `;
    errorDiv.innerHTML = `
      ⚠️ ERROR: No se puede conectar al servidor backend (${window.BACKEND_URL})<br>
      <small>La aplicación requiere conexión al servidor para funcionar correctamente</small>
    `;
    document.body.prepend(errorDiv);
  }
})();
