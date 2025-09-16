/* assets/js/app.js
   Orquestador de la UI: login, tabs y boot de módulos (notas, inventario, cotizaciones)
*/

import { initNotes } from "./notes.js";
import { initInventory } from "./inventory.js";
import { initQuotes } from "./quotes.js";
import { API } from "./api.js";

let modulesReady = false;

// Tabs simples
const tabsNav = document.querySelector('.tabs');
const sectionLogin = document.getElementById('loginSection');
const sectionApp = document.getElementById('appSection');
const emailSpan = document.getElementById('companyEmail');
const logoutBtn = document.getElementById('logoutBtn');

function showTab(name) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tabs button').forEach(b => b.classList.remove('active'));
  const tab = document.getElementById(`tab-${name}`);
  const btn = document.querySelector(`.tabs button[data-tab="${name}"]`);
  if (tab) tab.classList.add('active');
  if (btn) btn.classList.add('active');
}

// Boot de módulos (se llama tras login OK)
function ensureModules() {
  if (modulesReady) return;

  initNotes();
  initInventory();

  // Inicializa Cotizaciones con un callback para conocer el email de la empresa.
  initQuotes({
    getCompanyEmail: () => document.getElementById("companyEmail")?.textContent || ""
  });

  modulesReady = true;
}

// Login simple (usa tu API)
const loginBtn = document.getElementById('loginBtn');
const registerBtn = document.getElementById('registerBtn');

async function doLogin(isRegister = false) {
  const email = (document.getElementById('email').value || '').trim();
  const password = (document.getElementById('password').value || '').trim();
  if (!email || !password) {
    alert('Ingresa correo y contraseña');
    return;
  }
  try {
    if (isRegister) {
      await API.registerCompany({ email, password });
    }
    await API.loginCompany({ email, password });
    // UI
    emailSpan.textContent = email;
    sectionLogin.classList.add('hidden');
    sectionApp.classList.remove('hidden');
    logoutBtn.classList.remove('hidden');
    ensureModules();
    showTab('notas');
  } catch (e) {
    alert(e?.message || 'Error');
  }
}

loginBtn?.addEventListener('click', () => doLogin(false));
registerBtn?.addEventListener('click', () => doLogin(true));

logoutBtn?.addEventListener('click', async () => {
  try {
    await API.logout();
  } catch {}
  emailSpan.textContent = '';
  sectionApp.classList.add('hidden');
  sectionLogin.classList.remove('hidden');
  logoutBtn.classList.add('hidden');
});

// Tabs
tabsNav?.addEventListener('click', (ev) => {
  const btn = ev.target.closest('button[data-tab]');
  if (!btn) return;
  const tab = btn.dataset.tab;
  showTab(tab);
});

// Si ya estás autenticado (por ejemplo por cookie), levantar módulos
(async () => {
  try {
    const me = await API.me();
    if (me?.email) {
      emailSpan.textContent = me.email;
      sectionLogin.classList.add('hidden');
      sectionApp.classList.remove('hidden');
      logoutBtn.classList.remove('hidden');
      ensureModules();
      showTab('notas');
    }
  } catch {}
})();
