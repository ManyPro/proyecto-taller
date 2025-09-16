import { API } from "./api.js";
import { initNotes } from "./notes.js";
import { initInventory } from "./inventory.js";
import { initQuotes } from "./quotes.js"; // ⬅️ NUEVO

const loginSection = document.getElementById("loginSection");
const appSection = document.getElementById("appSection");
const companyEmail = document.getElementById("companyEmail");
const logoutBtn = document.getElementById("logoutBtn");

// Auth UI
const email = document.getElementById("email");
const password = document.getElementById("password");
const loginBtn = document.getElementById("loginBtn");
const registerBtn = document.getElementById("registerBtn");

let modulesReady = false;
function ensureModules() {
  if (!modulesReady) {
    initNotes();
    initInventory();
    // ⬇️ Inicializa Cotizaciones y le pasamos cómo leer el email de empresa para "scopear" localStorage por empresa
    initQuotes({
      getCompanyEmail: () => document.getElementById("companyEmail")?.textContent || ""
    });
    modulesReady = true;
  }
}

function setLoggedIn(emailStr, token) {
  document.getElementById("modal")?.classList.add("hidden");
  if (token) API.token.set(token);           // ✅ usa el token store del API
  loginSection.classList.add("hidden");
  appSection.classList.remove("hidden");
  document.querySelector('button[data-tab="notas"]').click();
  companyEmail.textContent = emailStr;
  logoutBtn.classList.remove("hidden");
  ensureModules();                           // ✅ inicializa módulos al loguear manualmente
}
function setLoggedOut() {
  API.token.clear();                         // ✅ limpia token vía API
  loginSection.classList.remove("hidden");
  appSection.classList.add("hidden");
  companyEmail.textContent = "";
  logoutBtn.classList.add("hidden");
}

loginBtn.onclick = async () => {
  try {
    const r = await API.login({
      email: email.value.trim(),
      password: password.value
    });
    // ⬇️ Guarda token y refresca la SPA para entrar "limpio"
    API.token.set(r.token);
    setTimeout(() => window.location.reload(), 50);
  } catch (e) {
    alert("Error: " + e.message);
  }
};

registerBtn.onclick = async () => {
  try {
    const name = prompt("Nombre de la empresa:");
    if (!name) return;
    const r = await API.register({
      name,
      email: email.value.trim(),
      password: password.value
    });
    // ⬇️ Guarda token y refresca la SPA
    API.token.set(r.token);
    setTimeout(() => window.location.reload(), 50);
  } catch (e) {
    alert("Error: " + e.message);
  }
};

logoutBtn.onclick = () => setLoggedOut();

// Tabs (reemplazo robusto)
const tabsRoot = document.querySelector(".tabs");
const panes = Array.from(document.querySelectorAll(".tab"));

function showTab(name) {
  panes.forEach(p => p.classList.toggle("active", p.id === `tab-${name}`));
}

tabsRoot.addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-tab]");
  if (!btn) return;
  tabsRoot.querySelectorAll("button[data-tab]").forEach(b => b.classList.toggle("active", b === btn));
  showTab(btn.dataset.tab);
});

// Asegurar que inicia solo Notas visible
const initial = document.querySelector('.tabs button.active')?.dataset.tab || 'notas';
showTab(initial);

// Try auto-login (NO recarga aquí para evitar loop)
(async function boot() {
  const t = API.token.get();
  if (t) {
    try {
      const meResp = await API.me();         // { company: {...} }
      setLoggedIn(meResp.company.email, t);  // ✅ toma email desde company
    } catch {
      setLoggedOut();
    }
  } else {
    setLoggedOut();
  }

  if (!appSection.classList.contains("hidden")) {
    ensureModules();
  }
})();
