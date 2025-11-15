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
  
  // Limpiar indicador de admin si no hay contexto
  function cleanupAdminIndicator() {
    if (!isAdminContext()) {
      const adminBar = document.getElementById('adminIndicatorBar');
      if (adminBar) {
        adminBar.remove();
        document.body.style.paddingTop = '';
        const header = document.getElementById('appHeader');
        if (header) {
          header.style.marginTop = '';
        }
      }
    }
  }
  
  // Mostrar indicador de admin
  function showAdminIndicator() {
    // Primero limpiar si no hay contexto
    cleanupAdminIndicator();
    
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
  
  // Escuchar cambios en sessionStorage para limpiar cuando se elimine el contexto
  window.addEventListener('storage', (e) => {
    if (e.key === 'admin:context' && !e.newValue) {
      cleanupAdminIndicator();
    }
  });
  
  // También verificar periódicamente (por si el storage cambia en la misma ventana)
  setInterval(() => {
    if (!isAdminContext()) {
      cleanupAdminIndicator();
    }
  }, 1000);
  
  // Agregar botón ADMIN en la navegación si hay contexto de admin
  function addAdminButtonToNavigation() {
    if (!isAdminContext()) {
      // Remover botón si no hay contexto
      document.querySelectorAll('[data-tab="admin"]').forEach(btn => {
        if (btn.dataset.adminAdded === 'true') {
          btn.remove();
        }
      });
      return;
    }
    
    // Buscar navegación desktop
    const desktopNav = document.querySelector('nav.flex.items-center.gap-1');
    if (desktopNav && !desktopNav.querySelector('[data-tab="admin"][data-admin-added="true"]')) {
      const adminBtn = document.createElement('button');
      adminBtn.setAttribute('data-tab', 'admin');
      adminBtn.setAttribute('data-href', 'admin.html');
      adminBtn.setAttribute('data-admin-added', 'true');
      adminBtn.className = 'nav-tab px-4 py-3 text-sm font-bold text-white bg-purple-600 hover:bg-purple-700 rounded-t-lg transition-all duration-200 whitespace-nowrap border-2 border-purple-400 shadow-lg';
      adminBtn.textContent = '⚙️ ADMIN';
      adminBtn.onclick = (e) => {
        e.preventDefault();
        window.location.href = 'admin.html';
      };
      desktopNav.appendChild(adminBtn);
    }
    
    // Buscar navegación móvil
    const mobileMenu = document.getElementById('mobileMenu');
    if (mobileMenu && !mobileMenu.querySelector('[data-tab="admin"][data-admin-added="true"]')) {
      const adminBtnMobile = document.createElement('button');
      adminBtnMobile.setAttribute('data-tab', 'admin');
      adminBtnMobile.setAttribute('data-href', 'admin.html');
      adminBtnMobile.setAttribute('data-admin-added', 'true');
      adminBtnMobile.className = 'mobile-nav-tab w-full text-left px-4 py-3 text-sm font-bold text-white bg-purple-600 hover:bg-purple-700 rounded-lg transition-all duration-200 border-2 border-purple-400';
      adminBtnMobile.textContent = '⚙️ ADMIN';
      adminBtnMobile.onclick = (e) => {
        e.preventDefault();
        window.location.href = 'admin.html';
      };
      mobileMenu.appendChild(adminBtnMobile);
    }
  }
  
  // Ejecutar cuando el DOM esté listo
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      showAdminIndicator();
      setTimeout(addAdminButtonToNavigation, 200);
    });
  } else {
    showAdminIndicator();
    setTimeout(addAdminButtonToNavigation, 200);
  }
  
  // También ejecutar después de un delay adicional para asegurar que la navegación esté cargada
  setTimeout(addAdminButtonToNavigation, 500);
  
  // Verificar periódicamente para agregar/remover el botón
  setInterval(() => {
    addAdminButtonToNavigation();
  }, 2000);
})();

