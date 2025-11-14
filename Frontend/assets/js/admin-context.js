// Script para detectar y mostrar contexto de admin en todas las páginas
(function() {
  'use strict';
  
  // Verificar si estamos en contexto de admin
  const isAdminContext = () => {
    try {
      return sessionStorage.getItem('admin:context') === 'true';
    } catch {
      return false;
    }
  };
  
  // Obtener datos de admin
  const getAdminData = () => {
    try {
      const email = sessionStorage.getItem('admin:email') || '';
      const company = sessionStorage.getItem('admin:company');
      return {
        email,
        company: company ? JSON.parse(company) : null
      };
    } catch {
      return { email: '', company: null };
    }
  };
  
  // Mostrar indicador de admin
  function showAdminIndicator() {
    if (!isAdminContext()) return;
    
    const adminData = getAdminData();
    if (!adminData.email) return;
    
    // Buscar el header existente
    const existingHeader = document.getElementById('appHeader');
    if (!existingHeader) return;
    
    // Verificar si ya existe el indicador
    if (document.getElementById('adminIndicatorBar')) return;
    
    // Crear barra de indicador de admin
    const adminBar = document.createElement('div');
    adminBar.id = 'adminIndicatorBar';
    adminBar.className = 'bg-slate-900 border-b border-slate-700/50 w-full';
    adminBar.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; z-index: 9999;';
    adminBar.innerHTML = `
      <div class="w-full px-4 sm:px-6 lg:px-8">
        <div class="flex items-center justify-between h-10">
          <div class="flex items-center gap-2">
            <span class="text-xs text-purple-400 font-semibold">⚙️ ADMIN:</span>
            <span class="text-xs text-slate-300">${adminData.email}</span>
          </div>
          <div class="flex items-center gap-2">
            <a href="admin.html" class="text-xs text-purple-400 hover:text-purple-300 transition-colors">Volver a Admin</a>
          </div>
        </div>
      </div>
    `;
    
    // Insertar antes del body o al inicio del header
    document.body.insertBefore(adminBar, document.body.firstChild);
    
    // Ajustar padding del body para compensar la barra fija
    document.body.style.paddingTop = '40px';
    
    // Ajustar el header existente si existe
    if (existingHeader) {
      existingHeader.style.marginTop = '40px';
    }
  }
  
  // Ejecutar cuando el DOM esté listo
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', showAdminIndicator);
  } else {
    showAdminIndicator();
  }
  
  // También ejecutar después de un pequeño delay para asegurar que el header esté cargado
  setTimeout(showAdminIndicator, 100);
})();

