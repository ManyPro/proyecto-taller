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

// Login simple (usa tu API)
const loginBtn = document.getElementById('loginBtn');
const registerBtn = document.getElementById('registerBtn');
const storedEmail = API.getActiveCompany?.();
const storedToken = storedEmail ? API.token.get(storedEmail) : API.token.get();
if (storedEmail && storedToken) {
  API.setActiveCompany(storedEmail);
  emailSpan.textContent = storedEmail;
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
    emailSpan.textContent = (res?.email || email);
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
  emailSpan.textContent = '';
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
  setLastTab(tab);
  window.location.reload();
});

// Reanudar sesión si hay token+empresa activos
(async () => {
  try {
    const me = await API.me(); // requiere token
    if (me?.email) {
      API.setActiveCompany(me.email);
      emailSpan.textContent = me.email;
      sectionLogin.classList.add('hidden');
      sectionApp.classList.remove('hidden');
      logoutBtn.classList.remove('hidden');
      ensureModules();
      showTab(getLastTab());
    } else {
      const active = API.getActiveCompany?.();
      if (active) emailSpan.textContent = active;
    }
  } catch {
    const active = API.getActiveCompany?.();
    if (active) emailSpan.textContent = active;
  }
})();
