export const API = {
  base: window.BACKEND_URL,
  token: () => localStorage.getItem("token") || "",
  async request(path, { method = "GET", json = null, formData = null } = {}) {
    const headers = {};
    if (!formData) headers["Content-Type"] = "application/json";
    const opts = { method, headers };
    if (json) opts.body = JSON.stringify(json);
    if (formData) { delete headers["Content-Type"]; opts.body = formData; }
    const t = API.token();
    if (t) headers["Authorization"] = "Bearer " + t;
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

  // Notes
  upload(files) {
    const fd = new FormData();
    for (const f of files) fd.append("files", f);
    return this.request("/api/v1/media/upload", { method: "POST", formData: fd });
  },
  createNote(payload) { return this.request("/api/v1/notes", { method: "POST", json: payload }); },
  listNotes(params = {}) {
    const q = new URLSearchParams(params).toString();
    return this.request("/api/v1/notes" + (q ? ("?" + q) : ""));
  },
  updateNote(id, body) { return this.request("/api/v1/notes/" + id, { method: "PUT", json: body }); },
  deleteNote(id) { return this.request("/api/v1/notes/" + id, { method: "DELETE" }); },
  mediaUrl(id) { return this.base + "/api/v1/media/" + id; },

  // Inventory
  saveVehicleIntake(body) { return this.request("/api/v1/inventory/vehicle-intakes", { method: "POST", json: body }); },
  listVehicleIntakes() { return this.request("/api/v1/inventory/vehicle-intakes"); },
  saveItem(body) { return this.request("/api/v1/inventory/items", { method: "POST", json: body }); },
  listItems(params = {}) {
    const q = new URLSearchParams(params).toString();
    return this.request("/api/v1/inventory/items" + (q ? ("?" + q) : ""));
  },
};

// === helpers para multipart / descargas con token ===
export const API_EXTRAS = {
  base() {
    // Reusa la base que ya usas en API.request.
    // Si tu API tiene otra forma, ajusta:
    const b = localStorage.getItem("apiBase") || window.API_BASE || "";
    return b;
  },
  token() {
    return localStorage.getItem("token") || localStorage.getItem("companyToken") || "";
  },
  async upload(path, formData, method = "POST") {
    const res = await fetch(`${this.base()}${path}`, {
      method,
      headers: { Authorization: `Bearer ${this.token()}` },
      body: formData,
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json().catch(() => ({}));
  },
  async download(path, filename) {
    const res = await fetch(`${this.base()}${path}`, {
      headers: { Authorization: `Bearer ${this.token()}` },
    });
    if (!res.ok) throw new Error(await res.text());
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  },
};
