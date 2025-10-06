/* assets/js/app.js
   Orquestador de la UI: login, tabs y boot de módulos (notas, inventario, cotizaciones, precios, ventas)
*/

import { initNotes } from "./notes.js";
import { initInventory } from "./inventory.js";
import { initQuotes } from "./quotes.js";
import { API } from "./api.js";
import { initPrices } from "./prices.js";
import { initSales } from "./sales.js";
import { initTechReport } from "./techreport.js";

let modulesReady = false;

// ========== THEME (oscuro / claro) ==========
const THEME_KEY = 'app:theme';
const DENSE_KEY = 'app:dense';
function applyTheme(theme){
  const body = document.body;
  if(!body) return;
  if(theme === 'light') body.classList.add('theme-light'); else body.classList.remove('theme-light');
  try{ localStorage.setItem(THEME_KEY, theme); }catch{}
  const btn = document.getElementById('themeToggle');
  if(btn) btn.textContent = theme === 'light' ? '🌙' : '🌗';
  if(btn) btn.title = theme === 'light' ? 'Cambiar a oscuro' : 'Cambiar a claro';
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
  applyTheme(detectInitialTheme());
  document.getElementById('themeToggle')?.addEventListener('click', ()=>{
    const isLight = document.body.classList.contains('theme-light');
    applyTheme(isLight ? 'dark' : 'light');
  });
  initFAB();
  initSwipeTabs();
  initCollapsibles();
  initDenseToggle();
});

// Tabs simples
const tabsNav = document.querySelector('.tabs');
const sectionLogin = document.getElementById('loginSection');
const sectionApp = document.getElementById('appSection');
const emailSpan = document.getElementById('companyEmail');
const logoutBtn = document.getElementById('logoutBtn');
const lastTabKey = 'app:lastTab';
const setLastTab = (name) => { try { sessionStorage.setItem(lastTabKey, name); } catch {} };
const getLastTab = () => { try { return sessionStorage.getItem(lastTabKey) || 'notas'; } catch { return 'notas'; } };

function showTab(name) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tabs button').forEach(b => b.classList.remove('active'));
  const tab = document.getElementById(`tab-${name}`);
  const btn = document.querySelector(`.tabs button[data-tab="${name}"]`);
  if (tab) tab.classList.add('active');
  if (btn) btn.classList.add('active');
  setLastTab(name);
  if(name === 'reporte-tecnico'){
    // Lazy init (idempotente)
    setTimeout(()=> initTechReport(), 30);
  }
}
function ensureModules() {
  if (modulesReady) return;
  initNotes();
  initInventory();
  initQuotes({ getCompanyEmail: () => document.getElementById("companyEmail")?.textContent || "" });
  initPrices();
  initSales();
  // No inicializamos reporte técnico hasta que se abra la pestaña
  modulesReady = true;
}

// ================= FAB (Botón flotante móviles) =================
function initFAB(){
  const existing = document.getElementById('app-fab');
  if(existing) return;
  const fab = document.createElement('div');
  fab.id='app-fab';
  fab.innerHTML = `<button id="fab-main" title="Acciones rápidas">＋</button>
    <div id="fab-menu" class="hidden">
      <button data-act="venta">Nueva Venta</button>
      <button data-act="nota">Nueva Nota</button>
      <button data-act="cotizacion">Nueva Cotización</button>
    </div>`;
  document.body.appendChild(fab);
  const mainBtn = fab.querySelector('#fab-main');
  const menu = fab.querySelector('#fab-menu');
  mainBtn.addEventListener('click', ()=> menu.classList.toggle('hidden'));
  menu.addEventListener('click', async (ev)=>{
    const btn = ev.target.closest('button[data-act]'); if(!btn) return;
    menu.classList.add('hidden');
    const act = btn.dataset.act;
    if(act==='venta'){
      try{ const { sales } = await import('./sales.js'); }catch{}
      // Simular click en Nueva Venta
      document.getElementById('sales-start')?.click();
      showTab('ventas');
    } else if(act==='nota'){
      showTab('notas');
      document.getElementById('n-plate')?.focus();
    } else if(act==='cotizacion'){
      showTab('cotizaciones');
      document.getElementById('q-client-name')?.focus();
    }
  });
  // Ocultar fab en desktop
  const mq = window.matchMedia('(min-width: 861px)');
  const toggle = ()=>{ fab.style.display = mq.matches ? 'none':'flex'; };
  mq.addEventListener('change', toggle); toggle();
}

// ================= Swipe Tabs (gestos horizontales) =================
function initSwipeTabs(){
  const container = document.querySelector('main'); if(!container) return;
  let startX=0, startY=0, tracking=false;
  container.addEventListener('touchstart',(e)=>{
    if(e.touches.length!==1) return; const t=e.touches[0];
    startX=t.clientX; startY=t.clientY; tracking=true;
  }, { passive:true });
  container.addEventListener('touchmove',(e)=>{
    if(!tracking) return; const t=e.touches[0];
    const dx=t.clientX-startX; const dy=Math.abs(t.clientY-startY);
    if(Math.abs(dx)>60 && dy<40){
      tracking=false;
      const order = Array.from(document.querySelectorAll('.tabs button[data-tab]')).map(b=>b.dataset.tab);
      const currentTab = (sessionStorage.getItem('app:lastTab')||'notas');
      const idx = order.indexOf(currentTab);
      if(idx>=0){
        const next = dx<0 ? order[idx+1] : order[idx-1];
        if(next){ showTab(next); }
      }
    }
  }, { passive:true });
  container.addEventListener('touchend', ()=> tracking=false);
  initPullToRefresh(container);
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
      ind.textContent= active ? 'Soltar para refrescar' : 'Desliza…';
    }
  }, { passive:true });
  container.addEventListener('touchend',()=>{
    if(!pulling){ return; }
    pulling=false;
    if(active){
      const tab = sessionStorage.getItem('app:lastTab')||'notas';
      refreshActiveTab(tab);
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
    if(tab==='ventas'){ import('./sales.js').then(()=>{ const btn=document.getElementById('sales-start'); }); }
    if(tab==='inventario'){ import('./inventory.js').then(m=> m?.initInventory && m.initInventory()); }
    if(tab==='cotizaciones'){ import('./quotes.js').then(()=>{}); }
    if(tab==='cashflow'){ import('./cashflow.js').then(m=> m?.initCashFlow && m.initCashFlow()); }
    if(tab==='reporte-tecnico'){ import('./techreport.js').then(()=>{}); }
    if(tab==='notas'){ import('./notes.js').then(()=>{}); }
  }catch{}
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
    const iconSpan = document.createElement('span'); iconSpan.textContent = collapsed ? ' ▶' : ' ▼'; iconSpan.style.fontSize='12px';
    h.appendChild(iconSpan);
    h.addEventListener('click', ()=>{
      const isHidden = body.style.display==='none';
      body.style.display = isHidden? '' : 'none';
      iconSpan.textContent = isHidden ? ' ▼' : ' ▶';
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
      btn.textContent='📏';
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
const loginBtn = document.getElementById('loginBtn');
const registerBtn = document.getElementById('registerBtn');
const storedEmail = API.getActiveCompany?.();
const storedToken = storedEmail ? API.token.get(storedEmail) : API.token.get();
if (storedEmail && storedToken) {
  API.setActiveCompany(storedEmail);
  if(emailSpan) emailSpan.textContent = storedEmail;
  sectionLogin.classList.add('hidden');
  sectionApp.classList.remove('hidden');
  logoutBtn.classList.remove('hidden');
  ensureModules();
  showTab(getLastTab());
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
  if(emailSpan) emailSpan.textContent = (res?.email || email);
    API.setActiveCompany(emailSpan.textContent); // redundante pero seguro
    sectionLogin.classList.add('hidden');
    sectionApp.classList.remove('hidden');
    logoutBtn.classList.remove('hidden');
    ensureModules();
    showTab(getLastTab());
  } catch (e) {
    alert(e?.message || 'Error');
  }
}

loginBtn?.addEventListener('click', () => doLogin(false));
registerBtn?.addEventListener('click', () => doLogin(true));

logoutBtn?.addEventListener('click', async () => {
  try { await API.logout(); } catch {}
  try { sessionStorage.removeItem(lastTabKey); } catch {}
  if(emailSpan) emailSpan.textContent = '';
  sectionApp.classList.add('hidden');
  sectionLogin.classList.remove('hidden');
  logoutBtn.classList.add('hidden');
  window.location.reload();
});

// Tabs
tabsNav?.addEventListener('click', (ev) => {
  const btn = ev.target.closest('button[data-tab]');
  if (!btn) return;
  const tab = btn.dataset.tab;
  if (!tab) return;
  ev.preventDefault();
  showTab(tab);
});

// Reanudar sesión si hay token+empresa activos
(async () => {
  try {
    const me = await API.me(); // requiere token
    if (me?.email) {
      API.setActiveCompany(me.email);
  if(emailSpan) emailSpan.textContent = me.email;
      sectionLogin.classList.add('hidden');
      sectionApp.classList.remove('hidden');
      logoutBtn.classList.remove('hidden');
      ensureModules();
      showTab(getLastTab());
    } else {
      const active = API.getActiveCompany?.();
  if (active && emailSpan) emailSpan.textContent = active;
    }
  } catch {
    const active = API.getActiveCompany?.();
  if (active && emailSpan) emailSpan.textContent = active;
  }
})();
