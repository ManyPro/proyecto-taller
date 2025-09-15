import { API } from "./api.js";
import { initNotes } from "./notes.js";
import { initInventory } from "./inventory.js";

const loginSection = document.getElementById("loginSection");
const appSection = document.getElementById("appSection");
const companyEmail = document.getElementById("companyEmail");
const logoutBtn = document.getElementById("logoutBtn");

// Auth UI
const email = document.getElementById("email");
const password = document.getElementById("password");
const loginBtn = document.getElementById("loginBtn");
const registerBtn = document.getElementById("registerBtn");

function setLoggedIn(emailStr, token) {
  document.getElementById("modal")?.classList.add("hidden");
  if (token) localStorage.setItem("token", token);

  loginSection.classList.add("hidden");
  appSection.classList.remove("hidden");
  companyEmail.textContent = emailStr;
  logoutBtn.classList.remove("hidden");

  // Inicializa módulos una sola vez
  if (!window.__modulesBooted) {
    initNotes();
    initInventory();
    window.__modulesBooted = true;
  }

  // Muestra pestaña Notas por defecto
  document.querySelector('button[data-tab="notas"]')?.click();
}

function setLoggedOut() {
  localStorage.removeItem("token");
  loginSection.classList.remove("hidden");
  appSection.classList.add("hidden");
  companyEmail.textContent = "";
  logoutBtn.classList.add("hidden");
}

loginBtn.onclick = async () => {
  try {
    const r = await API.login(email.value.trim(), password.value);
    setLoggedIn(r.company.email, r.token);
  } catch (e) {
    alert("Error: " + e.message);
  }
};

registerBtn.onclick = async () => {
  try {
    const name = prompt("Nombre de la empresa:");
    if (!name) return;
    const r = await API.register(name, email.value.trim(), password.value);
    setLoggedIn(r.company.email, r.token);
  } catch (e) {
    alert("Error: " + e.message);
  }
};

logoutBtn.onclick = () => setLoggedOut();

// ----- Tabs -----
const tabsRoot = document.querySelector(".tabs");
const panes = Array.from(document.querySelectorAll(".tab"));
function showTab(name) {
  panes.forEach(p => p.classList.toggle("active", p.id === `tab-${name}`));
}
tabsRoot.addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-tab]");
  if (!btn) return;
  tabsRoot.querySelectorAll("button[data-tab]")
    .forEach(b => b.classList.toggle("active", b === btn));
  showTab(btn.dataset.tab);
});
// Asegura Notas como inicial visible si ya tiene la clase
const initial = document.querySelector('.tabs button.active')?.dataset.tab || 'notas';
showTab(initial);

// ----- Auto-login -----
(async function boot() {
  const t = API.token();
  if (t) {
    try {
      const me = await API.me();
      setLoggedIn(me.email, t);
    } catch {
      setLoggedOut();
    }
  } else {
    setLoggedOut();
  }
})();
