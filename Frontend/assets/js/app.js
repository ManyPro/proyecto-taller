/* assets/js/app.js
   Orquestador de la UI: login, tabs y boot de módulos (notas, inventario, cotizaciones, precios, ventas)
*/

import { initNotes } from "./notes.js";
import { initInventory } from "./inventory.js";
import { initQuotes } from "./quotes.js";
import { API } from "./api.esm.js";
import { initPrices } from "./prices.js";
import { initSales } from "./sales.js";
import { initCashFlow } from "./cashflow.js";
import { loadFeatureOptionsAndRestrictions, getFeatureOptions, gateElement } from "./feature-gating.js";

export { loadFeatureOptionsAndRestrictions, getFeatureOptions, gateElement } from "./feature-gating.js";

// ========== THEME (oscuro / claro) ==========
const THEME_KEY = 'app:theme';
function applyTheme(theme){
  const body = document.body;
  if(!body) return;
  if(theme === 'light') body.classList.add('theme-light'); else body.classList.remove('theme-light');
  try{ localStorage.setItem(THEME_KEY, theme); }catch{}
  // Actualizar todos los botones de tema (desktop, mobile, portal, login, admin)
  const themeButtons = document.querySelectorAll('#themeToggle, #themeTogglePortal, #themeToggleLogin, #themeToggleAdmin');
  themeButtons.forEach(btn => {
    btn.textContent = theme === 'light' ? '🌙' : '🌞';
    btn.title = theme === 'light' ? 'Cambiar a oscuro' : 'Cambiar a claro';
  });
  // Swap logo by theme
  const logo = document.getElementById('brandLogo');
  if(logo){
    // theme-light => usa darklogo (logo negro). Tema oscuro => usa lightlogo.
    const src = theme === 'light' ? 'assets/darklogo.png' : 'assets/lightlogo.png';
    if(logo.getAttribute('src') !== src) logo.setAttribute('src', src);
  }
}
// Hacer applyTheme disponible globalmente para las páginas de login
if (typeof window !== 'undefined') {
  window.applyTheme = applyTheme;
}
function detectInitialTheme(){
  try{
    const stored = localStorage.getItem(THEME_KEY);
    if(stored === 'light' || stored === 'dark') return stored;
  }catch{}
  // Preferencia del sistema
  try{
    const prefersLight = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches;
    return prefersLight ? 'light' : 'dark';
  }catch{}
  return 'dark';
}
// Detectar y mostrar contexto de admin
(function() {
  function showAdminIndicator() {
    try {
      const isAdmin = sessionStorage.getItem('admin:context') === 'true';
      if (!isAdmin) {
        // Si no hay contexto, limpiar cualquier barra existente
        const allAdminBars = document.querySelectorAll('#adminIndicatorBar');
        allAdminBars.forEach(bar => {
          try {
            bar.remove();
          } catch(e) {
            try {
              if (bar.parentNode) {
                bar.parentNode.removeChild(bar);
              }
            } catch {}
          }
        });
        return;
      }
      
      const adminEmail = sessionStorage.getItem('admin:email') || '';
      if (!adminEmail) return;
      
      // Eliminar cualquier barra existente antes de crear una nueva (evitar duplicados)
      const existingBars = document.querySelectorAll('#adminIndicatorBar');
      existingBars.forEach(bar => {
        try {
          bar.remove();
        } catch(e) {
          try {
            if (bar.parentNode) {
              bar.parentNode.removeChild(bar);
            }
          } catch {}
        }
      });
      
      // Verificar si ya existe el indicador después de limpiar
      if (document.getElementById('adminIndicatorBar')) return;
      
      // Crear barra de indicador de admin (más compacta y discreta)
      const adminBar = document.createElement('div');
      adminBar.id = 'adminIndicatorBar';
      adminBar.className = 'bg-slate-900/80 backdrop-blur-sm border-b border-purple-500/20 w-full';
      adminBar.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; z-index: 9999;';
      adminBar.innerHTML = `
        <div class="w-full px-3 sm:px-4">
          <div class="flex items-center justify-between h-6">
            <div class="flex items-center gap-1.5">
              <span class="text-[10px] text-purple-400/80 font-medium">⚙️ ADMIN:</span>
              <span class="text-[10px] text-slate-400/80 truncate max-w-[200px]">${adminEmail}</span>
            </div>
            <div class="flex items-center gap-2">
              <a href="admin.html" class="text-[10px] text-purple-400/80 hover:text-purple-300 transition-colors px-1.5 py-0.5 rounded hover:bg-purple-900/20">Volver</a>
            </div>
          </div>
        </div>
      `;
      
      // Insertar al inicio del body
      document.body.insertBefore(adminBar, document.body.firstChild);
      
      // Ajustar padding del body (más pequeño)
      const currentPadding = parseInt(getComputedStyle(document.body).paddingTop) || 0;
      document.body.style.paddingTop = (currentPadding + 24) + 'px';
      
      // Ajustar header existente si existe
      const header = document.getElementById('appHeader');
      if (header) {
        const currentMargin = parseInt(getComputedStyle(header).marginTop) || 0;
        header.style.marginTop = (currentMargin + 24) + 'px';
      }
    } catch(e) {
      console.warn('Error mostrando indicador admin:', e);
    }
  }
  
  // Ejecutar inmediatamente y después de DOMContentLoaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', showAdminIndicator);
  } else {
    showAdminIndicator();
  }
  setTimeout(showAdminIndicator, 100);
})();

document.addEventListener('DOMContentLoaded', ()=>{
  initializeDOMElements();
  initializeEventListeners();
  initializeLogoutListener();
  initializeAuth();
  applyTheme(detectInitialTheme());
  
  // Usar event delegation para manejar clicks en todos los botones de tema (desktop y mobile)
  document.addEventListener('click', (e) => {
    // Verificar si el click fue en un botón con id themeToggle
    if (e.target && e.target.id === 'themeToggle') {
      const isLight = document.body.classList.contains('theme-light');
      applyTheme(isLight ? 'dark' : 'light');
    }
  });
  initFAB();
  initCollapsibles();
  const main = document.querySelector('main');
  if (main) initPullToRefresh(main);
  // Prefill email if stored
  try{
    const em = API.getActiveCompany?.();
    if(em && document.getElementById('email')) document.getElementById('email').value = em;
  }catch{}
  
  // Escuchar cambios del panel de desarrollo
  setupDevPanelListener();
});

// Función para escuchar cambios del panel de desarrollo
function setupDevPanelListener() {
  // Escuchar mensajes de postMessage
  window.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'DEV_PANEL_CHANGES') {
      console.log('Cambios detectados desde el panel de desarrollo:', event.data);
      reloadFeaturesFromDevPanel();
    }
  });
  
  // Escuchar cambios en localStorage
  window.addEventListener('storage', (event) => {
    if (event.key === 'dev_panel_changes') {
      console.log('Cambios detectados en localStorage desde el panel de desarrollo');
      reloadFeaturesFromDevPanel();
    }
  });
  
  // Verificar cambios periódicamente
  setInterval(() => {
    try {
      const lastChange = localStorage.getItem('dev_panel_changes');
      if (lastChange && window.lastDevPanelChange !== lastChange) {
        window.lastDevPanelChange = lastChange;
        console.log('Cambios detectados periódicamente desde el panel de desarrollo');
        reloadFeaturesFromDevPanel();
      }
    } catch (e) {
      // Ignorar errores de localStorage
    }
  }, 5000);
}

// Función para recargar features desde el panel de desarrollo
async function reloadFeaturesFromDevPanel() {
  try {
    console.log('Recargando features desde el panel de desarrollo...');
    
    // Limpiar cache
    const email = API.getActiveCompany?.();
    if (email) {
      const featuresKey = `taller.features:${email}`;
      const optionsKey = `taller.featureOptions:${email}`;
      try {
        localStorage.removeItem(featuresKey);
        localStorage.removeItem(optionsKey);
        console.log('Cache de features limpiado');
      } catch (e) {
        console.warn('Error limpiando cache:', e);
      }
    }
    
    // Recargar feature options
    if (typeof window.reloadFeatureOptions === 'function') {
      await window.reloadFeatureOptions();
    }
    
    // Aplicar feature gating
    if (typeof applyFeatureGating === 'function') {
      applyFeatureGating();
    }
    
    console.log('Features recargados desde el panel de desarrollo');
  } catch (e) {
    console.error('Error recargando features desde el panel de desarrollo:', e);
  }
}

// Navegación y boot por página
let sectionLogin, sectionApp, appHeader, portalSection, portalCompanyBtn, emailSpan, nameSpan, welcomeSpan, logoutBtn;

function initializeDOMElements() {
  sectionLogin = document.getElementById('loginSection');
  sectionApp = document.getElementById('appSection');
  appHeader = document.getElementById('appHeader');
  portalSection = document.getElementById('portalSection');
  portalCompanyBtn = document.getElementById('openCompanyLogin');
  emailSpan = document.getElementById('companyEmail');
  nameSpan = document.getElementById('companyName');
  welcomeSpan = document.getElementById('welcomeCompany');
  logoutBtn = document.getElementById('logoutBtn');
  loginBtn = document.getElementById('loginBtn');
  registerBtn = document.getElementById('registerBtn');
}
const lastTabKey = 'app:lastTab';
function __scopeFromBase(base){
  try{ return new URL(base || window.location.origin, window.location.origin).host || 'local'; }
  catch{ return 'local'; }
}
const __SCOPE = __scopeFromBase(window.API_BASE || window.BACKEND_URL || '');
const featuresKeyFor = (email) => `taller.features:${__SCOPE}:${String(email||'').toLowerCase()}`;
const FEATURE_CATALOG = [
  { key: 'notas', label: 'Notas' },
  { key: 'ventas', label: 'Ventas' },
  { key: 'cotizaciones', label: 'Cotizaciones' },
  { key: 'inventario', label: 'Inventario' },
  { key: 'precios', label: 'Lista de precios' },
  { key: 'cashflow', label: 'Flujo de Caja' },
  { key: 'payroll', label: 'Nómina' },
  { key: 'templates', label: 'Formatos / Plantillas' },
  { key: 'skus', label: 'SKUs' }
];
let lastFeaturesSyncTs = 0;
const getCurrentPage = () => document.body?.dataset?.page || 'home';
const setLastTab = (name) => {
  if (!name || name === 'home') return;
  try { sessionStorage.setItem(lastTabKey, name); } catch {}
};
const getLastTab = () => {
  try { return sessionStorage.getItem(lastTabKey) || null; } catch { return null; }
};

function updateCompanyLabels(input) {
  // Admite string (email) o objeto { email, name }
  const email = typeof input === 'string' ? input : (input?.email || '');
  const name = typeof input === 'object' ? (input?.name || '') : '';
  if (emailSpan) emailSpan.textContent = email || '';
  if (nameSpan) nameSpan.textContent = name || '';
  if (welcomeSpan) welcomeSpan.textContent = name || email || 'Tu empresa';
}

function showTab(name) {
  if (!name) return;
  const current = getCurrentPage();
  if (current === name) {
    highlightCurrentNav();
    return;
  }
  
  // Verificar si la pestaña está oculta antes de navegar
  if(name !== 'home' && name !== 'admin') {
    const hidden = isTabHidden(name);
    if(hidden) {
      // Si está oculta, redirigir a home
      const homeBtn = document.querySelector(`button[data-tab="home"]`);
      const homeHref = homeBtn?.dataset.href || 'index.html';
      window.location.href = homeHref;
      return;
    }
  }
  
  const btn = document.querySelector(`.tabs button[data-tab="${name}"]`);
  const href = btn?.dataset?.href;
  if (href) {
    if (name !== 'home') setLastTab(name);
    window.location.href = href;
  }
}
const pageInitializers = {
  notas: () => initNotes(),
  inventario: () => initInventory(),
  cotizaciones: () => initQuotes({ getCompanyEmail: () => document.getElementById("companyEmail")?.textContent || "" }),
  precios: () => initPrices(),
  ventas: () => initSales(),
  cashflow: () => initCashFlow(),
};

let pageBooted = false;
function bootCurrentPage() {
  if (pageBooted) return;
  
  // Verificar si la página actual está oculta
  const currentPage = getCurrentPage();
  if(currentPage && currentPage !== 'home' && currentPage !== 'admin') {
    const hidden = isTabHidden(currentPage);
    if(hidden) {
      // Si está oculta, redirigir a home
      const homeHref = document.querySelector(`button[data-tab="home"]`)?.dataset.href || 'index.html';
      window.location.href = homeHref;
      return;
    }
  }
  
  const init = pageInitializers[getCurrentPage()];
  if (typeof init === 'function') {
    init();
  }
  pageBooted = true;
}

function highlightCurrentNav() {
  const current = getCurrentPage();
  document.querySelectorAll('.tabs button[data-tab]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === current);
  });
  if (current && current !== 'home') setLastTab(current);
}

function setupNavigation() {
  document.querySelectorAll('.tabs button[data-tab]').forEach(btn => {
    if (btn.dataset.navBound === '1') return;
    btn.dataset.navBound = '1';
    btn.addEventListener('click', (ev) => {
      const tab = btn.dataset.tab;
      if (!tab) return;
      ev.preventDefault();
      if (tab === getCurrentPage()) return;
      showTab(tab);
    });
  });
  highlightCurrentNav();
}

function enterApp() {
  sectionLogin?.classList.add('hidden');
  sectionApp?.classList.remove('hidden');
  appHeader?.classList.remove('hidden');
  portalSection?.classList.add('hidden');
  logoutBtn?.classList.remove('hidden');
  
  // Limpiar caché de restrictions cuando se entra a la app (por si cambió la empresa)
  const currentEmail = API.getActiveCompany?.() || '';
  if(cachedRestrictionsEmail !== currentEmail) {
    cachedRestrictions = null;
    cachedRestrictionsEmail = null;
  }
  
  applyFeatureGating();
  setupNavigation();
  bootCurrentPage();
  // Siempre permanecer en Inicio tras login; el usuario elige a dónde ir.
  syncFeaturesFromServer(true);
}

// ================= FAB (Botón flotante móviles) =================
// ELIMINADO: El FAB ha sido removido completamente para evitar interferencias con modales y otras funciones
function initFAB(){
  // Eliminar cualquier FAB existente
  const existing = document.getElementById('app-fab');
  if(existing) {
    existing.remove();
  }
  // No crear nuevo FAB - función deshabilitada
  return;
}



// ================= Pull to refresh simple =================
function initPullToRefresh(container){
  let startY=0, pulling=false, active=false, indicator=null;
  function ensureIndicator(){
    if(indicator) return indicator;
    indicator=document.createElement('div');
    indicator.id='ptr-indicator';
    indicator.className = 'fixed top-2 left-1/2 -translate-x-1/2 -translate-y-[60px] bg-slate-800/90 dark:bg-slate-800/90 theme-light:bg-white text-white dark:text-white theme-light:text-slate-900 px-3 py-1.5 rounded-full text-xs shadow-lg transition-all duration-250 z-[12000] opacity-0';
    indicator.textContent='Suelta para refrescar';
    document.body.appendChild(indicator);
    return indicator;
  }
  container.addEventListener('touchstart',(e)=>{
    if(window.scrollY>0) return; // solo si estamos arriba
    if(e.touches.length!==1) return;
    startY=e.touches[0].clientY; pulling=true; active=false;
  }, { passive:true });
  container.addEventListener('touchmove',(e)=>{
    if(!pulling) return;
    const dy=e.touches[0].clientY-startY;
    if(dy>25){
      const ind=ensureIndicator();
      const pct=Math.min(1,(dy-25)/80);
      ind.style.opacity=String(pct);
      ind.style.transform=`translateX(-50%) translateY(${(-60+ pct*60)}px)`;
      active=pct>=1;
  ind.textContent= active ? 'Soltar para refrescar' : 'Desliza...';
    }
  }, { passive:true });
  container.addEventListener('touchend',()=>{
    if(!pulling){ return; }
    pulling=false;
    if(active){
      const current = getCurrentPage();
      if(current && current !== 'home'){
        refreshActiveTab(current);
      } else {
        window.location.reload();
      }
    }
    if(indicator){
      indicator.style.transform='translateX(-50%) translateY(-60px)';
      indicator.style.opacity='0';
      setTimeout(()=>{ indicator && indicator.remove(); indicator=null; },400);
    }
  });
}

function refreshActiveTab(tab){
  try{
    switch(tab){
      case 'ventas':
        if(document.getElementById('sales-main')) initSales();
        break;
      case 'inventario':
        if(document.getElementById('inventory-main')) initInventory();
        break;
      case 'cotizaciones':
        if(document.getElementById('quotes-main')) initQuotes({ getCompanyEmail: () => document.getElementById('companyEmail')?.textContent || '' });
        break;
      case 'cashflow':
        if(document.getElementById('cashflow-main')) initCashFlow();
        break;
      case 'reporte-tecnico':
        if(document.getElementById('techreport-main')) initTechReport();
        break;
      case 'notas':
        if(document.getElementById('notes-main')) initNotes();
        break;
      case 'precios':
        if(document.getElementById('prices-main')) initPrices();
        break;
      default:
        window.location.reload();
        return;
    }
  }catch(err){
    console.warn('[app] refreshActiveTab error', err);
  }
}

// ================= Secciones Colapsables en móvil =================
function initCollapsibles(){
  const rules = [
    { sel:'#q-history-card h3', body:'#q-history-list' },
    { sel:'#notes-history h3', body:'#notesList' }
  ];
  rules.forEach(r=>{
    const h = document.querySelector(r.sel); const body = document.querySelector(r.body);
    if(!h || !body) return;
    if(window.innerWidth>800) return; // solo móvil/tablet
    h.style.cursor='pointer';
    const stateKey='col:'+r.body;
    const collapsed = sessionStorage.getItem(stateKey)==='1';
    if(collapsed){ body.style.display='none'; h.classList.add('collapsed'); }
    const iconSpan = document.createElement('span'); iconSpan.textContent = collapsed ? ' ?' : ' ?'; iconSpan.style.fontSize='12px';
    h.appendChild(iconSpan);
    h.addEventListener('click', ()=>{
      const isHidden = body.style.display==='none';
      body.style.display = isHidden? '' : 'none';
      iconSpan.textContent = isHidden ? ' ?' : ' ?';
      sessionStorage.setItem(stateKey, isHidden ? '0':'1');
    });
  });
}

// ================= Modo densidad ================= (removido - ya no se usa)

// Login simple (usa tu API)
let loginBtn, registerBtn;

// Mover la lógica de autenticación dentro de DOMContentLoaded
function initializeAuth() {
  const storedEmail = API.getActiveCompany?.();
  const storedToken = storedEmail ? API.token.get(storedEmail) : API.token.get();
  
  // Guard: si no hay sesión y no estamos en Inicio, redirigir a Inicio para login
  if (!storedEmail || !storedToken) {
    // Mostrar el portal de acceso en Inicio cuando no hay sesión
    if (getCurrentPage() === 'home') {
      portalSection?.classList.remove('hidden');
    }
    if (getCurrentPage() !== 'home') {
      try { sessionStorage.setItem('app:pending', window.location.pathname); } catch {}
      window.location.href = 'index.html';
    }
  }
  if (storedEmail && storedToken) {
    API.setActiveCompany(storedEmail);
    updateCompanyLabels(storedEmail);
    enterApp();
  }
}



async function doLogin(isRegister = false) {
  const email = (document.getElementById('email').value || '').trim().toLowerCase();
  const password = (document.getElementById('password').value || '').trim();
  if (!email || !password) {
    alert('Ingresa correo y contraseña');
    return;
  }
  try {
    if (isRegister) {
      await API.registerCompany({ email, password });
    }
    const res = await API.loginCompany({ email, password }); // guarda token y setActiveCompany
    // UI
    const resolvedEmail = (res?.email || email);
    const compName = res?.company?.name || '';
    updateCompanyLabels({ email: resolvedEmail, name: compName });
    API.setActiveCompany(resolvedEmail);
  try{ if(res?.company?.features) localStorage.setItem(featuresKeyFor(resolvedEmail), JSON.stringify(res.company.features)); }catch{}
    // Cargar restrictions (forzar recarga desde servidor)
    cachedRestrictions = null;
    cachedRestrictionsEmail = null;
    await getRestrictions(true); // Forzar recarga desde servidor
    enterApp();
    applyFeatureGating();
    // Tras login exitoso, siempre ir a Inicio
    // pero si había una página pendiente, ir allí
    let pending = null; try{ pending = sessionStorage.getItem('app:pending'); sessionStorage.removeItem('app:pending'); }catch{}
    if (pending) window.location.href = pending; else if (getCurrentPage() !== 'home') showTab('home');
  } catch (e) {
    alert(e?.message || 'Error');
  }
}

function initializeEventListeners() {
  loginBtn?.addEventListener('click', () => doLogin(false));
  registerBtn?.addEventListener('click', () => doLogin(true));
  portalCompanyBtn?.addEventListener('click', () => {
    portalSection?.classList.add('hidden');
    sectionLogin?.classList.remove('hidden');
    try {
      document.getElementById('email')?.focus();
    } catch {}
    try {
      sectionLogin?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch {}
  });
}

function initializeLogoutListener() {
  logoutBtn?.addEventListener('click', async () => {
    try { await API.logout(); } catch {}
    try { sessionStorage.removeItem(lastTabKey); } catch {}
    // Limpiar contexto de admin
    try {
      sessionStorage.removeItem('admin:context');
      sessionStorage.removeItem('admin:email');
      sessionStorage.removeItem('admin:token');
      sessionStorage.removeItem('admin:company');
    } catch {}
    // Remover TODAS las barras de admin si existen (evitar duplicados)
    const allAdminBars = document.querySelectorAll('#adminIndicatorBar');
    allAdminBars.forEach(bar => {
      try {
        bar.remove();
      } catch(e) {
        try {
          if (bar.parentNode) {
            bar.parentNode.removeChild(bar);
          }
        } catch {}
      }
    });
    
    // Restaurar padding/margin
    const currentPadding = parseInt(getComputedStyle(document.body).paddingTop) || 0;
    if (currentPadding >= 24) {
      document.body.style.paddingTop = (currentPadding - 24) + 'px';
    } else {
      document.body.style.paddingTop = '';
    }
    if (appHeader) {
      const currentMargin = parseInt(getComputedStyle(appHeader).marginTop) || 0;
      if (currentMargin >= 24) {
        appHeader.style.marginTop = (currentMargin - 24) + 'px';
      } else {
        appHeader.style.marginTop = '';
      }
    }
    updateCompanyLabels('');
    sectionApp?.classList.add('hidden');
    sectionLogin?.classList.remove('hidden');
    appHeader?.classList.add('hidden');
    logoutBtn.classList.add('hidden');
    window.location.reload();
  });
}

// Reanudar sesión si hay token+empresa activos
(async () => {
  try {
    const me = await API.me(); // requiere token
    const company = me?.company || null;
    if (company?.email) {
      API.setActiveCompany(company.email);
      updateCompanyLabels({ email: company.email, name: company.name });
      // Persist features if provided
      try{ if(company.features) localStorage.setItem(featuresKeyFor(company.email), JSON.stringify(company.features)); }catch{}
      // Cargar restrictions (forzar recarga desde servidor)
      cachedRestrictions = null;
      cachedRestrictionsEmail = null;
      await getRestrictions(true); // Forzar recarga desde servidor
      enterApp();
      applyFeatureGating();
    } else {
      const active = API.getActiveCompany?.();
      if (active) updateCompanyLabels({ email: active });
      if (getCurrentPage() !== 'home') window.location.href = 'index.html';
    }
  } catch {
    const active = API.getActiveCompany?.();
    if (active) updateCompanyLabels({ email: active });
    if (getCurrentPage() !== 'home') window.location.href = 'index.html';
  }
})();

// Listener para detectar cambios en la empresa activa (polling y storage events)
if(typeof window !== 'undefined' && window.addEventListener) {
  let lastActiveCompany = API.getActiveCompany?.() || '';
  
  // Polling para detectar cambios en la empresa activa (cada 2 segundos)
  setInterval(() => {
    const currentActiveCompany = API.getActiveCompany?.() || '';
    if(currentActiveCompany && currentActiveCompany !== lastActiveCompany) {
      lastActiveCompany = currentActiveCompany;
      // La empresa activa cambió, limpiar caché de restrictions
      cachedRestrictions = null;
      cachedRestrictionsEmail = null;
      // Recargar restrictions y aplicar filtros
      getRestrictions(true).then(() => {
        applyFeatureGating();
      }).catch(() => {});
    }
  }, 2000);
  
  // También escuchar eventos de storage (para cambios entre pestañas)
  window.addEventListener('storage', (e) => {
    if(e.key && e.key.includes('taller.activeCompany')) {
      // La empresa activa cambió, limpiar caché de restrictions
      cachedRestrictions = null;
      cachedRestrictionsEmail = null;
      lastActiveCompany = API.getActiveCompany?.() || '';
      // Recargar restrictions y aplicar filtros
      getRestrictions(true).then(() => {
        applyFeatureGating();
      }).catch(() => {});
    }
  });
}

// === Notificaciones (campana) ===
(function(){
  // Header de autorización local para este módulo
  const authHeader = () => {
    try{
      const t = API?.token?.get?.();
      return t ? { Authorization: `Bearer ${t}` } : {};
    }catch{ return {}; }
  };
  let polling = null; let panel = null; let bell = null; let lastIds = new Set();
  function getHeaderActionsRow(){
    const appHeaderEl = document.getElementById('appHeader');
    if(!appHeaderEl) return null;
    // Buscar el contenedor de botones de acción (desktop o mobile)
    // Buscar por ID o por clase específica
    const desktopActions = appHeaderEl.querySelector('[class*="hidden md:flex"]');
    const mobileActions = appHeaderEl.querySelector('[class*="md:hidden flex"]');
    // Si no encontramos por clase, buscar por posición (último div con botones)
    if(!desktopActions && !mobileActions) {
      const allDivs = appHeaderEl.querySelectorAll('div');
      for(let div of allDivs) {
        if(div.querySelector('#themeToggle')) {
          return div;
        }
      }
    }
    // Preferir desktop, pero usar mobile si no existe desktop
    return desktopActions || mobileActions || null;
  }
  let audioContext = null;
  function initAudioContext(){
    if(!audioContext) {
      try {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
      } catch(e) {
        console.warn('AudioContext no disponible:', e);
      }
    }
    return audioContext;
  }
  function playNotificationSound(){
    try {
      const ctx = initAudioContext();
      if(!ctx) {
        // Fallback: vibrar en móvil si está disponible
        if(navigator.vibrate) {
          navigator.vibrate([100, 50, 100]);
        }
        return;
      }
      
      // Resumir contexto si está suspendido (requiere interacción del usuario)
      if(ctx.state === 'suspended') {
        ctx.resume().then(() => {
          playNotificationSound();
        }).catch(() => {
          // Si no se puede resumir, usar vibración en móvil
          if(navigator.vibrate) {
            navigator.vibrate([100, 50, 100]);
          }
        });
        return;
      }
      
      // Crear sonido de campana (dos tonos)
      const oscillator1 = ctx.createOscillator();
      const oscillator2 = ctx.createOscillator();
      const gainNode = ctx.createGain();
      
      oscillator1.connect(gainNode);
      oscillator2.connect(gainNode);
      gainNode.connect(ctx.destination);
      
      // Primer tono (más agudo)
      oscillator1.frequency.setValueAtTime(800, ctx.currentTime);
      oscillator1.type = 'sine';
      
      // Segundo tono (más grave, con delay)
      oscillator2.frequency.setValueAtTime(600, ctx.currentTime + 0.1);
      oscillator2.type = 'sine';
      
      // Volumen con fade out
      gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
      
      // Reproducir
      oscillator1.start(ctx.currentTime);
      oscillator1.stop(ctx.currentTime + 0.4);
      oscillator2.start(ctx.currentTime + 0.1);
      oscillator2.stop(ctx.currentTime + 0.4);
      
      // También vibrar en móvil si está disponible
      if(navigator.vibrate) {
        navigator.vibrate([100, 50, 100]);
      }
    } catch(e) {
      // Fallback: vibrar en móvil
      if(navigator.vibrate) {
        navigator.vibrate([100, 50, 100]);
      }
      console.log('🔔 Nueva notificación');
    }
  }
  function ensureBell(){
    // Buscar en desktop primero
    const desktopHeader = getHeaderActionsRow();
    if(desktopHeader && !desktopHeader.querySelector('#notifBell')) {
      bell = document.createElement('button');
      bell.id='notifBell';
      bell.className='p-2 text-slate-300 hover:text-white hover:bg-slate-700/50 rounded-lg transition-colors duration-200 relative';
      bell.innerHTML='🔔 <span id="notifCount" style="position:absolute;top:-6px;right:-6px;background:#ef4444;color:#fff;padding:2px 6px;border-radius:14px;font-size:10px;line-height:1;display:none;">0</span>';
      const lastButton = desktopHeader.querySelector('#themeToggle') || desktopHeader.querySelector('#mobileMenuToggle');
      if(lastButton && lastButton.parentNode) {
        lastButton.parentNode.insertBefore(bell, lastButton);
      } else {
        desktopHeader.appendChild(bell);
      }
      bell.addEventListener('click', togglePanel);
    }
    
    // Buscar específicamente en la barra móvil
    const appHeaderEl = document.getElementById('appHeader');
    if(appHeaderEl) {
      const mobileActions = appHeaderEl.querySelector('[class*="md:hidden flex"]');
      if(mobileActions && !mobileActions.querySelector('#notifBellMobile')) {
        const mobileBell = document.createElement('button');
        mobileBell.id='notifBellMobile';
        mobileBell.className='p-2 text-slate-300 hover:text-white hover:bg-slate-700/50 rounded-lg transition-colors duration-200 relative';
        mobileBell.innerHTML='🔔 <span id="notifCountMobile" style="position:absolute;top:-6px;right:-6px;background:#ef4444;color:#fff;padding:2px 6px;border-radius:14px;font-size:10px;line-height:1;display:none;">0</span>';
        // Insertar antes del botón de tema o menú hamburguesa
        const themeToggle = mobileActions.querySelector('#themeToggle');
        const menuToggle = mobileActions.querySelector('#mobileMenuToggle');
        const insertBefore = themeToggle || menuToggle;
        if(insertBefore && insertBefore.parentNode) {
          insertBefore.parentNode.insertBefore(mobileBell, insertBefore);
        } else {
          mobileActions.appendChild(mobileBell);
        }
        mobileBell.addEventListener('click', togglePanel);
      }
    }
  }
  function ensurePanel(){
    if(panel) return panel;
    panel = document.createElement('div');
    panel.id='notifPanel';
    panel.className = 'fixed top-[60px] right-[14px] w-80 max-h-[70vh] overflow-auto bg-slate-800/90 dark:bg-slate-800/90 theme-light:bg-white rounded-lg shadow-2xl p-3 hidden z-[2000]';
    panel.innerHTML='<div class="flex justify-between items-center mb-1.5"><strong class="text-white dark:text-white theme-light:text-slate-900">Notificaciones</strong><div class="flex gap-1.5"><button id="notifMarkAll" class="px-2 py-1 text-xs bg-slate-700/50 dark:bg-slate-700/50 hover:bg-slate-700 dark:hover:bg-slate-700 text-white dark:text-white font-semibold rounded transition-all duration-200 border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300 theme-light:bg-slate-200 theme-light:text-slate-700 theme-light:hover:bg-slate-300 theme-light:hover:text-slate-900">Marcar todo</button><button id="notifClose" class="px-2 py-1 text-xs bg-slate-700/50 dark:bg-slate-700/50 hover:bg-slate-700 dark:hover:bg-slate-700 text-white dark:text-white font-semibold rounded transition-all duration-200 border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300 theme-light:bg-slate-200 theme-light:text-slate-700 theme-light:hover:bg-slate-300 theme-light:hover:text-slate-900">Cerrar</button></div></div><div id="notifList" class="flex flex-col gap-2 text-xs"></div>';
    document.body.appendChild(panel);
    panel.querySelector('#notifClose').onclick = togglePanel;
    panel.querySelector('#notifMarkAll').onclick = markAll;
    return panel;
  }
  function fmtAgo(ts){
    const d = new Date(ts); const diff = Date.now()-d.getTime(); const m=Math.floor(diff/60000); if(m<1) return 'ahora'; if(m<60) return m+'m'; const h=Math.floor(m/60); if(h<24) return h+'h'; const days=Math.floor(h/24); return days+'d'; }
  async function fetchNotifications(){
    try{
      const res = await fetch((API.base||'') + '/api/v1/notifications?unread=1&limit=30', { headers: authHeader() });
      const txt = await res.text(); let data; try{ data=JSON.parse(txt);}catch{ data=txt; }
      if(!res.ok) throw new Error(data?.error || res.statusText);
      const list = data?.data || [];
      renderNotifications(list);
    }catch(e){ /* silent */ }
  }
  function renderNotifications(list){
    ensureBell(); ensurePanel();
    
    // Detectar nuevas notificaciones comparando con las anteriores
    const currentIds = new Set(list.map(n => String(n._id)));
    const hasNewNotifications = list.length > 0 && Array.from(currentIds).some(id => !lastIds.has(id));
    
    // Actualizar contador en ambas campanitas (desktop y mobile)
    const countEl = document.getElementById('notifCount');
    const countElMobile = document.getElementById('notifCountMobile');
    if(countEl){ countEl.textContent = String(list.length); countEl.style.display = list.length? 'inline-block':'none'; }
    if(countElMobile){ countElMobile.textContent = String(list.length); countElMobile.style.display = list.length? 'inline-block':'none'; }
    
    // Reproducir sonido solo si hay nuevas notificaciones Y la pestaña está visible
    // No reproducir si lastIds está vacío (primera carga) para evitar sonar con todas las notificaciones existentes
    // Esto evita que suene cuando cambias de pestaña y vuelves
    if(hasNewNotifications && document.visibilityState === 'visible' && lastIds.size > 0) {
      playNotificationSound();
    }
    
    const ul = document.getElementById('notifList'); if(!ul) return;
    ul.innerHTML='';
    // Friendly formatter for notification types
    const fmt = (n) => {
      const t = String(n?.type||'');
      const d = n?.data||{};
      const ago = fmtAgo(n.createdAt);
      const by = d?.user || d?.by || d?.createdBy || '';
      const who = by ? ` por ${by}` : '';
      // Map known events
      switch(true){
        case /^inventory\.lowstock$/.test(t):{
          const baseText = `${d?.sku ? d.sku + ': ' : ''}${d?.name || 'Producto'} - quedan ${d?.stock ?? '?'} (minimo ${d?.minStock ?? '?'})`;
          const action = d?.purchaseLabel ? ` - Pedir mas en (${d.purchaseLabel})` : ' - Pedir mas';
          return { icon:'⚠️', title:'Stock bajo', body: baseText + action, meta: ago, urgent: false };
        }
        case /^inventory\.criticalstock$/.test(t):{
          const baseText = `${d?.sku ? d.sku + ': ' : ''}${d?.name || 'Producto'} - quedan ${d?.stock ?? '?'} (minimo ${d?.minStock ?? '?'})`;
          const action = d?.purchaseLabel ? ` - Pedir mas en (${d.purchaseLabel})` : ' - Pedir mas';
          return { icon:'🚨', title:'STOCK MUY BAJO', body: baseText + action, meta: ago, urgent: true };
        }
        case /^calendar\.event$/.test(t):{
          const eventTitle = d?.title || 'Evento del calendario';
          const plate = d?.plate ? ` - Placa: ${d.plate}` : '';
          const customerName = d?.customerName ? ` - Cliente: ${d.customerName}` : '';
          const startDate = d?.startDate ? new Date(d.startDate).toLocaleString('es-CO', { 
            weekday: 'long', 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric', 
            hour: '2-digit', 
            minute: '2-digit' 
          }) : '';
          return { icon:'📅', title:'Recordatorio de cita', body: `${eventTitle}${plate}${customerName}${startDate ? ' - ' + startDate : ''}`, meta: ago, urgent: false };
        }
        case /^sale\.created$/.test(t):
          return { icon:'??', title:'Nueva venta creada', body:`Se registró un nuevo pedido${d?.origin==='catalog'?' desde el catálogo público':''}.`, meta: ago };
        case /^workOrder\.created$/.test(t):
          return { icon:'??', title:'Nueva orden de trabajo', body:'Se generó una orden para instalación/servicio.', meta: ago };
        case /^item\.published$/.test(t):
          return { icon:'??', title:'Artículo publicado', body:`SKU ${d?.sku ? `(${d.sku}) ` : ''}ahora es público.`, meta: ago };
        case /^items\.published\.bulk$/.test(t):
          return { icon:'??', title:'Publicación masiva completada', body:`Se publicaron ${d?.modified ?? d?.count ?? d?.matched ?? ''} artículos.`, meta: ago };
        case /^items\.unpublished\.bulk$/.test(t):
          return { icon:'??', title:'Despublicación masiva completada', body:`Se despublicaron ${d?.modified ?? d?.count ?? d?.matched ?? ''} artículos.`, meta: ago };
        case /^price\./.test(t):
          return { icon:'??', title:'Actualización de precios', body:'Se actualizaron precios en la lista.', meta: ago };
        case /^inventory\./.test(t):
          return { icon:'??', title:'Movimiento de inventario', body:'Se registró un movimiento en inventario.', meta: ago };
        default:
          return { icon:'??', title: t.replace(/\./g,' · '), body: Object.keys(d||{}).length? JSON.stringify(d):'Sin detalles', meta: ago };
      }
    };

    list.forEach(n => {
      lastIds.add(String(n._id));
      const info = fmt(n);
      const div = document.createElement('div');
      
      // Aplicar estilos urgentes si es necesario
      const isUrgent = info.urgent === true;
      const urgentStyles = isUrgent ? 
        'background:linear-gradient(135deg, #dc2626, #b91c1c);border:2px solid #fca5a5;box-shadow:0 4px 12px rgba(220,38,38,0.3);' : 
        'background:rgba(30,41,59,0.9);border:1px solid rgba(148,163,184,0.3);';
      
      div.style.cssText=`${urgentStyles}padding:10px;border-radius:10px;display:flex;gap:10px;align-items:flex-start;`;
      
      const titleStyle = isUrgent ? 
        'font-weight:900;color:#fff;text-shadow:0 1px 2px rgba(0,0,0,0.5);' : 
        'font-weight:700;';
      
      const bodyStyle = isUrgent ? 
        'opacity:1;margin:4px 0;color:#fff;' : 
        'opacity:.9;margin:4px 0;';
      
      div.innerHTML = `
        <div style="font-size:20px;line-height:1.2;">${info.icon}</div>
        <div style="flex:1;min-width:0;">
          <div style='${titleStyle}'>${info.title}</div>
          <div style='${bodyStyle}'>${info.body}</div>
          <div style='display:flex;justify-content:space-between;align-items:center;margin-top:6px;'>
            <span style='font-size:11px;opacity:.6;'>${info.meta}</span>
            <button data-read='${n._id}' class='px-2 py-1 text-xs bg-slate-700/50 dark:bg-slate-700/50 hover:bg-slate-700 dark:hover:bg-slate-700 text-white dark:text-white font-semibold rounded transition-all duration-200 border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300 theme-light:bg-slate-200 theme-light:text-slate-700 theme-light:hover:bg-slate-300 theme-light:hover:text-slate-900'>Marcar leído</button>
          </div>
        </div>`;
      div.querySelector('[data-read]').onclick = () => markRead(n._id, div);
      ul.appendChild(div);
    });
    if(!list.length){ ul.innerHTML = '<div style="text-align:center;opacity:.6;">Sin nuevas notificaciones</div>'; }
  }
  async function markRead(id, el){
    try{
      await fetch((API.base||'') + '/api/v1/notifications/' + id + '/read', { method:'PATCH', headers:{ 'Content-Type':'application/json', ...authHeader() } });
      if(el) el.style.opacity='.35';
      lastIds.delete(String(id));
      const countEl = document.getElementById('notifCount');
      const countElMobile = document.getElementById('notifCountMobile');
      if(countEl) countEl.textContent = String(lastIds.size);
      if(countElMobile) countElMobile.textContent = String(lastIds.size);
      if(lastIds.size===0) {
        if(countEl) countEl.style.display='none';
        if(countElMobile) countElMobile.style.display='none';
      }
    }catch(e){ /* ignore */ }
  }
  async function markAll(){
    try{
      await fetch((API.base||'') + '/api/v1/notifications/read-all', { method:'POST', headers:{ 'Content-Type':'application/json', ...authHeader() } });
      lastIds.clear();
      const countEl = document.getElementById('notifCount');
      const countElMobile = document.getElementById('notifCountMobile');
      if(countEl) { countEl.textContent = '0'; countEl.style.display = 'none'; }
      if(countElMobile) { countElMobile.textContent = '0'; countElMobile.style.display = 'none'; }
      fetchNotifications();
    }catch(e){/* ignore */ }
  }
  function togglePanel(){ ensurePanel(); panel.style.display = panel.style.display==='none'? 'block':'none'; if(panel.style.display==='block'){ fetchNotifications(); } }
  function startPolling(){ if(polling) return; polling = setInterval(fetchNotifications, 30000); fetchNotifications(); }
  
  // Conectar SSE para recibir notificaciones en tiempo real
  let notificationSSE = null;
  function connectNotificationSSE(){
    if(notificationSSE) return; // Ya conectado
    try{
      const token = API?.token?.get?.();
      if(!token) return;
      
      // Usar API.base si existe y es válido, sino usar window.location.origin como fallback
      let base = API?.base || '';
      if(!base || base === '') {
        base = typeof window !== 'undefined' ? window.location.origin : '';
      }
      
      // Validar que base sea una URL válida
      if(!base || base === '') {
        console.warn('No se puede conectar SSE: base URL no disponible');
        return;
      }
      
      // Construir URL de forma segura
      let url;
      try {
        // Si base ya es una URL completa, usarla directamente
        if(base.startsWith('http://') || base.startsWith('https://')) {
          url = new URL('/api/v1/sales/stream', base);
        } else {
          // Si base es relativa, usar window.location.origin
          url = new URL('/api/v1/sales/stream', window.location.origin);
        }
        url.searchParams.set('token', token);
      } catch(urlError) {
        console.warn('Error construyendo URL SSE:', urlError);
        return;
      }
      
      notificationSSE = new EventSource(url.toString(), { withCredentials: false });
      
      notificationSSE.addEventListener('notification', (e) => {
        try{
          const data = JSON.parse(e.data);
          // Refrescar notificaciones cuando llega una nueva
          fetchNotifications();
        }catch(err){
          console.warn('Error parsing notification SSE:', err);
        }
      });
      
      notificationSSE.addEventListener('error', (e) => {
        // Solo loggear errores si realmente hay un problema (no en reconexión normal)
        if(notificationSSE?.readyState === EventSource.CLOSED) {
          console.warn('SSE notification connection closed, reconnecting...');
        }
        // Reconectar después de 5 segundos
        setTimeout(() => {
          if(notificationSSE) {
            notificationSSE.close();
            notificationSSE = null;
          }
          connectNotificationSSE();
        }, 5000);
      });
    }catch(e){
      console.warn('No se pudo conectar SSE para notificaciones:', e);
    }
  }
  
  // Inicializar AudioContext en la primera interacción del usuario
  function initAudioOnUserInteraction(){
    if(audioContext) return;
    const init = () => {
      initAudioContext();
      document.removeEventListener('click', init);
      document.removeEventListener('touchstart', init);
      document.removeEventListener('keydown', init);
    };
    document.addEventListener('click', init, { once: true });
    document.addEventListener('touchstart', init, { once: true });
    document.addEventListener('keydown', init, { once: true });
  }
  
  document.addEventListener('DOMContentLoaded', ()=>{ 
    ensureBell(); 
    startPolling();
    connectNotificationSSE();
    initAudioOnUserInteraction();
  });
})();

// ================= Feature gating (UI) =================
function getFeatures(){
  const email = API.getActiveCompany?.() || '';
  const key = featuresKeyFor(email);
  try{ const raw = localStorage.getItem(key); if(!raw) return null; return JSON.parse(raw); }catch{ return null; }
}
function isFeatureEnabled(name){
  const f = getFeatures();
  if(!f) return true; // por compatibilidad, si no hay flags, todo habilitado
  if(Object.prototype.hasOwnProperty.call(f, name)) return !!f[name];
  return true;
}
// Obtener restrictions desde localStorage o API
let cachedRestrictions = null;
let cachedRestrictionsEmail = null; // Track qué email tiene el caché

async function getRestrictions(force = false){
  const email = API.getActiveCompany?.() || '';
  if(!email) {
    cachedRestrictions = null;
    cachedRestrictionsEmail = null;
    return {};
  }
  
  // Si el email cambió, limpiar caché
  if(cachedRestrictionsEmail !== email) {
    cachedRestrictions = null;
    cachedRestrictionsEmail = null;
  }
  
  // Si hay caché y no se fuerza recarga, devolverlo
  if(cachedRestrictions && !force) {
    return cachedRestrictions;
  }
  
  try{
    // Intentar cargar desde localStorage primero (más rápido)
    const stored = localStorage.getItem(`taller.restrictions:${__SCOPE}:${email.toLowerCase()}`);
    if(stored && !force){
      try{
        cachedRestrictions = JSON.parse(stored);
        cachedRestrictionsEmail = email;
        return cachedRestrictions;
      }catch{}
    }
    
    // Cargar desde servidor (siempre para asegurar datos actualizados)
    const remote = await API.company.getRestrictions();
    if(remote && typeof remote === 'object'){
      cachedRestrictions = remote;
      cachedRestrictionsEmail = email;
      try{
        localStorage.setItem(`taller.restrictions:${__SCOPE}:${email.toLowerCase()}`, JSON.stringify(remote));
      }catch{}
      return remote;
    }
  }catch(err){
    console.warn('restrictions sync failed', err?.message || err);
  }
  
  // Si falla todo, devolver objeto vacío pero asegurar que el caché esté limpio si el email cambió
  if(cachedRestrictionsEmail !== email) {
    cachedRestrictions = {};
    cachedRestrictionsEmail = email;
  }
  return cachedRestrictions || {};
}

function isTabHidden(tabId){
  if(!tabId) return false;
  // Asegurar que tenemos restrictions cargadas
  if(!cachedRestrictions) {
    // Si no hay caché, intentar cargar síncronamente desde localStorage
    const email = API.getActiveCompany?.() || '';
    if(email) {
      try {
        const stored = localStorage.getItem(`taller.restrictions:${__SCOPE}:${email.toLowerCase()}`);
        if(stored) {
          cachedRestrictions = JSON.parse(stored);
          cachedRestrictionsEmail = email;
        }
      } catch {}
    }
  }
  
  const restrictions = cachedRestrictions || {};
  const hiddenTabs = restrictions.hiddenTabs || [];
  if(!Array.isArray(hiddenTabs)) return false;
  return hiddenTabs.includes(String(tabId));
}

function applyFeatureGating(){
  // Asegurar que restrictions estén cargadas antes de aplicar filtros
  if(!cachedRestrictions) {
    // Intentar cargar desde localStorage si no hay caché
    const email = API.getActiveCompany?.() || '';
    if(email) {
      try {
        const stored = localStorage.getItem(`taller.restrictions:${__SCOPE}:${email.toLowerCase()}`);
        if(stored) {
          cachedRestrictions = JSON.parse(stored);
          cachedRestrictionsEmail = email;
        }
      } catch {}
    }
  }
  
  // Aplicar filtrado por features
  document.querySelectorAll('.tabs button[data-feature], nav button[data-feature], .mobile-nav-tab[data-feature]').forEach(btn => {
    const feature = btn.getAttribute('data-feature');
    if(!feature) return;
    const enabled = isFeatureEnabled(feature);
    btn.style.display = enabled ? '' : 'none';
    // Si la pestaña actual está deshabilitada, redirigir a Inicio
    if(!enabled && btn.dataset.tab === getCurrentPage()){
      showTab('home');
    }
  });
  
  // Aplicar filtrado por restrictions.hiddenTabs
  document.querySelectorAll('.tabs button[data-tab], nav button[data-tab], .mobile-nav-tab[data-tab]').forEach(btn => {
    const tabId = btn.getAttribute('data-tab');
    if(!tabId || tabId === 'home' || tabId === 'admin') {
      // Asegurar que home y admin siempre sean visibles
      btn.style.display = '';
      return;
    }
    
    // Verificar tanto features como hiddenTabs
    const feature = btn.getAttribute('data-feature');
    let shouldHide = false;
    
    // Si tiene feature, verificar que esté habilitado
    if(feature) {
      const featureEnabled = isFeatureEnabled(feature);
      if(!featureEnabled) {
        shouldHide = true;
      }
    }
    
    // Verificar si está en hiddenTabs
    if(!shouldHide) {
      const hidden = isTabHidden(tabId);
      if(hidden) {
        shouldHide = true;
      }
    }
    
    if(shouldHide){
      btn.style.display = 'none';
      // Si la pestaña actual está oculta, redirigir a Inicio
      const currentPage = getCurrentPage();
      if(currentPage && String(currentPage) === String(tabId)){
        showTab('home');
      }
    } else {
      // Asegurar que la pestaña sea visible si no está oculta
      btn.style.display = '';
    }
  });
}

async function syncFeaturesFromServer(force=false){
  const email = API.getActiveCompany?.() || '';
  if(!email) return;
  const now = Date.now();
  if(!force && lastFeaturesSyncTs && (now - lastFeaturesSyncTs) < 60000) return;
  try{
    const remote = await API.company.getFeatures();
    if(remote && typeof remote === 'object'){
      setLocalFeatures(email, remote);
      lastFeaturesSyncTs = now;
    }
    // También sincronizar restrictions (forzar recarga)
    cachedRestrictions = null;
    cachedRestrictionsEmail = null;
    await getRestrictions(true); // Forzar recarga desde servidor
    applyFeatureGating();
  }catch(err){
    console.warn('feature sync failed', err?.message || err);
  }
}

// ============== Panel completo de features y feature options (Home) ==============
function featureList(){
  return FEATURE_CATALOG;
}

function featureOptionsList(){
  return {
    inventario: {
      label: 'Inventario',
      options: [
        { key: 'ingresoVehiculo', label: 'Ingreso por Vehículo' },
        { key: 'ingresoCompra', label: 'Ingreso por Compra' },
        { key: 'marketplace', label: 'Marketplace' },
        { key: 'publicCatalogFields', label: 'Campos Catálogo Público' }
      ]
    },
    ventas: {
      label: 'Ventas',
      options: [
        { key: 'importarCotizacion', label: 'Importar Cotización' },
        { key: 'ordenesTrabajo', label: 'Órdenes de Trabajo' }
      ]
    },
    precios: {
      label: 'Precios',
      options: [
        { key: 'importarCSV', label: 'Importar CSV' }
      ]
    },
    templates: {
      label: 'Formatos/Plantillas',
      options: [
        { key: 'duplicar', label: 'Duplicar Plantillas' },
        { key: 'activar', label: 'Activar/Desactivar Plantillas' }
      ]
    }
  };
}

async function loadCompanyFeatures(){
  try{ return await API.company.getFeatures(); }catch{ return getFeatures() || {}; }
}

async function loadCompanyFeatureOptions(){
  try{ return await API.company.getFeatureOptions(); }catch{ return {}; }
}

function setLocalFeatures(email, feats){
  try{ localStorage.setItem(featuresKeyFor(email), JSON.stringify(feats||{})); }catch{}
  lastFeaturesSyncTs = Date.now();
}


// ===== FUNCIÓN GLOBAL PARA RECARGAR FEATURE OPTIONS =====
window.reloadFeatureOptions = async function() {
  try {
    await loadFeatureOptionsAndRestrictions({ force: true });
    
    // Recargar inventario si estamos en esa página
    if (getCurrentPage() === 'inventario' && typeof renderIntakesList === 'function') {
      renderIntakesList();
    }
    
    // Recargar ventas si estamos en esa página
    if (getCurrentPage() === 'ventas' && typeof initSales === 'function') {
      initSales();
    }
    
    console.log('Feature options recargados correctamente');
  } catch (error) {
    console.error('Error al recargar feature options:', error);
  }
};

















