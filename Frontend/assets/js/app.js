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
  if (token) localStorage.setItem("token", token);
  loginSection.classList.add("hidden");
  appSection.classList.remove("hidden");
  document.querySelector('button[data-tab="notas"]').click();
  companyEmail.textContent = emailStr;
  logoutBtn.classList.remove("hidden");
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

// Tabs
const tabs = document.querySelectorAll(".tabs button");
const tabSections = document.querySelectorAll(".tab");
tabs.forEach(btn => {
  btn.onclick = () => {
    tabs.forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    tabSections.forEach(s => s.classList.remove("active"));
    document.getElementById("tab-"+btn.dataset.tab).classList.add("active");
  };
});

// Try auto-login
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

  if (!appSection.classList.contains("hidden")) {
    initNotes();
    initInventory();
  }
})();
