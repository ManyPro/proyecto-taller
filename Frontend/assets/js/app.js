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
import { loadFeatureOptionsAndRestrictions, getFeatureOptions, getRestrictions, gateElement } from "./feature-gating.js";

export { loadFeatureOptionsAndRestrictions, getFeatureOptions, getRestrictions, gateElement } from "./feature-gating.js";

// ========== THEME (oscuro / claro) ==========
const THEME_KEY = 'app:theme';
const DENSE_KEY = 'app:dense';
function applyTheme(theme){
  const body = document.body;
  if(!body) return;
  if(theme === 'light') body.classList.add('theme-light'); else body.classList.remove('theme-light');
  try{ localStorage.setItem(THEME_KEY, theme); }catch{}
  const btn = document.getElementById('themeToggle');
  if(btn) btn.textContent = theme === 'light' ? '🌙' : '🌞';
  if(btn) btn.title = theme === 'light' ? 'Cambiar a oscuro' : 'Cambiar a claro';
  // Swap logo by theme
  const logo = document.getElementById('brandLogo');
  if(logo){
    // theme-light => usa darklogo (logo negro). Tema oscuro => usa lightlogo.
    const src = theme === 'light' ? 'assets/darklogo.png' : 'assets/lightlogo.png';
    if(logo.getAttribute('src') !== src) logo.setAttribute('src', src);
  }
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
document.addEventListener('DOMContentLoaded', ()=>{
  initializeDOMElements();
  initializeEventListeners();
  initializeLogoutListener();
  initializeAuth();
  applyTheme(detectInitialTheme());
  document.getElementById('themeToggle')?.addEventListener('click', ()=>{
    const isLight = document.body.classList.contains('theme-light');
    applyTheme(isLight ? 'dark' : 'light');
  });
  initFAB();
  initCollapsibles();
  initDenseToggle();
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
    indicator.style.cssText='position:fixed;top:8px;left:50%;transform:translateX(-50%) translateY(-60px);background:var(--card);color:var(--text);padding:6px 12px;border-radius:20px;font-size:12px;box-shadow:0 4px 10px rgba(0,0,0,.3);transition:transform .25s ease, opacity .25s ease;z-index:12000;opacity:0;';
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

// ================= Modo densidad =================
export function toggleDense(on){
  document.body.classList.toggle('dense', !!on);
  try{ localStorage.setItem(DENSE_KEY, on ? '1':'0'); }catch{}
}

function initDenseToggle(){
  let btn = document.getElementById('denseToggle');
  if(!btn){
    // Insert next to themeToggle if exists
    const themeBtn = document.getElementById('themeToggle');
    if(themeBtn && themeBtn.parentElement){
      btn = document.createElement('button');
      btn.id='denseToggle';
      btn.className='secondary';
      btn.title='Modo compacto';
      btn.textContent='↕';
      themeBtn.parentElement.insertBefore(btn, themeBtn);
    }
  }
  const stored = (()=>{ try{return localStorage.getItem(DENSE_KEY);}catch{return null;} })();
  if(stored==='1') toggleDense(true);
  btn?.addEventListener('click',()=>{
    const active = document.body.classList.contains('dense');
    toggleDense(!active);
  });
}

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
      enterApp();
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
    const rows = appHeaderEl.querySelectorAll('.row');
    if(rows && rows.length){ return rows[rows.length - 1]; }
    return null;
  }
  function ensureBell(){
    const header = getHeaderActionsRow();
    if(!header) return;
    if(document.getElementById('notifBell')) return;
    bell = document.createElement('button');
    bell.id='notifBell'; bell.className='secondary'; bell.style.position='relative'; bell.innerHTML='\uD83D\uDD14 <span id="notifCount" style="position:absolute;top:-6px;right:-6px;background:#ef4444;color:#fff;padding:2px 6px;border-radius:14px;font-size:10px;line-height:1;display:none;">0</span>';
  header.appendChild(bell);
    bell.addEventListener('click', togglePanel);
  }
  function ensurePanel(){
    if(panel) return panel;
    panel = document.createElement('div');
    panel.id='notifPanel';
    panel.style.cssText='position:fixed;top:60px;right:14px;width:320px;max-height:70vh;overflow:auto;background:var(--card);color:var(--text);border-radius:10px;box-shadow:0 6px 20px rgba(0,0,0,.35);padding:12px;display:none;z-index:2000;';
    panel.innerHTML='<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;"><strong>Notificaciones</strong><div style="display:flex;gap:6px;"><button id="notifMarkAll" class="secondary" style="font-size:11px;">Marcar todo</button><button id="notifClose" class="secondary" style="font-size:11px;">Cerrar</button></div></div><div id="notifList" style="display:flex;flex-direction:column;gap:8px;font-size:12px;"></div>';
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
    const countEl = document.getElementById('notifCount');
    if(countEl){ countEl.textContent = String(list.length); countEl.style.display = list.length? 'inline-block':'none'; }
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
        'background:var(--card-alt,#1e293b);border:1px solid var(--border);';
      
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
            <button data-read='${n._id}' style='font-size:11px;' class='secondary'>Marcar leído</button>
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
      const countEl = document.getElementById('notifCount'); if(countEl) countEl.textContent = String(lastIds.size); if(lastIds.size===0 && countEl) countEl.style.display='none';
    }catch(e){ /* ignore */ }
  }
  async function markAll(){
    try{
      await fetch((API.base||'') + '/api/v1/notifications/read-all', { method:'POST', headers:{ 'Content-Type':'application/json', ...authHeader() } });
      lastIds.clear(); fetchNotifications();
    }catch(e){/* ignore */ }
  }
  function togglePanel(){ ensurePanel(); panel.style.display = panel.style.display==='none'? 'block':'none'; if(panel.style.display==='block'){ fetchNotifications(); } }
  function startPolling(){ if(polling) return; polling = setInterval(fetchNotifications, 30000); fetchNotifications(); }
  document.addEventListener('DOMContentLoaded', ()=>{ ensureBell(); startPolling(); });
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
function applyFeatureGating(){
  document.querySelectorAll('.tabs button[data-feature]').forEach(btn => {
    const feature = btn.getAttribute('data-feature');
    if(!feature) return;
    const enabled = isFeatureEnabled(feature);
    btn.style.display = enabled ? '' : 'none';
    // Si la pestaña actual está deshabilitada, redirigir a Inicio
    if(!enabled && btn.dataset.tab === getCurrentPage()){
      showTab('home');
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
      applyFeatureGating();
    }
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

















