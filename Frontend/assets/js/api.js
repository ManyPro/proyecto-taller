// Frontend/api.js  (reemplazo 1:1)
export const API = {
  base: window.BACKEND_URL, // Asegúrate de definirla en index.html
  token: () => localStorage.getItem("token") || localStorage.getItem("companyToken") || "",
  async request(path, { method = "GET", json = null, formData = null } = {}) {
    const headers = {};
    if (!formData) headers["Content-Type"] = "application/json";
    const t = API.token();
    if (t) headers["Authorization"] = "Bearer " + t;
    const opts = { method, headers };
    if (json) opts.body = JSON.stringify(json);
    if (formData) { delete headers["Content-Type"]; opts.body = formData; }

    const res = await fetch(API.base + path, opts);
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(text || res.statusText);
    }
    const ct = res.headers.get("content-type") || "";
    if (ct.includes("application/json")) return res.json();
    return res;
  },

  // Auth
  login(email, password) { return this.request("/api/v1/auth/company/login", { method: "POST", json: { email, password } }); },
  register(name, email, password) { return this.request("/api/v1/auth/company/register", { method: "POST", json: { name, email, password } }); },
  me() { return this.request("/api/v1/auth/company/me"); },

  // ---- Files (unificado con Inventory) ----
  upload(files) {
    const fd = new FormData();
    for (const f of files) fd.append("files", f);
    return this.request("/api/v1/files/upload", { method: "POST", formData: fd });
  },
  mediaUrl(id) { return this.base + "/api/v1/files/" + id; },

  // Notes
  createNote(payload) { return this.request("/api/v1/notes", { method: "POST", json: payload }); },
  listNotes(params = {}) {
    const q = new URLSearchParams(params).toString();
    return this.request("/api/v1/notes" + (q ? ("?" + q) : ""));
  },
  updateNote(id, body) { return this.request("/api/v1/notes/" + id, { method: "PUT", json: body }); },
  deleteNote(id) { return this.request("/api/v1/notes/" + id, { method: "DELETE" }); },

  // Inventory
  saveVehicleIntake(body) { return this.request("/api/v1/inventory/vehicle-intakes", { method: "POST", json: body }); },
  listVehicleIntakes() { return this.request("/api/v1/inventory/vehicle-intakes"); },
  saveItem(body) { return this.request("/api/v1/inventory/items", { method: "POST", json: body }); },
  listItems(params = {}) {
    const q = new URLSearchParams(params).toString();
    return this.request("/api/v1/inventory/items" + (q ? ("?" + q) : ""));
  },
};

// === helpers para multipart / descargas con token (corrige base y retorna JSON cuando aplica) ===
export const API_EXTRAS = {
  base() { return API.base; },         // <- usa la misma base SIEMPRE
  token() { return API.token(); },

  async upload(path, formData, method = "POST") {
    const res = await fetch(`${this.base()}${path}`, {
      method,
      headers: { Authorization: `Bearer ${this.token()}` },
      body: formData,
    });
    if (!res.ok) throw new Error(await res.text());
    const ct = res.headers.get("content-type") || "";
    if (ct.includes("application/json")) return res.json();
    return {};
  },

  async download(path, displayName = "archivo") {
    const url = `${API.base}${path}`;   // <-- antes ponía this.base()
    const a = document.createElement("a");
    a.href = url;
    a.download = displayName;
    a.target = "_blank";
    document.body.appendChild(a);
    a.click();
    a.remove();
  },
};
