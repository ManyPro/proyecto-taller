export const API = {
  base: window.BACKEND_URL,
  token: () => localStorage.getItem("token") || "",

  async request(path, { method = "GET", json = null, formData = null, noAuth = false } = {}) {
    const headers = {};
    // Para JSON estándar
    if (!formData) headers["Content-Type"] = "application/json";
    headers["Accept"] = "application/json";

    const opts = { method, headers };

    if (json) opts.body = JSON.stringify(json);
    if (formData) {
      // Deja que el browser ponga el boundary
      delete headers["Content-Type"];
      opts.body = formData;
    }

    const t = API.token();
    if (!noAuth && t) headers["Authorization"] = `Bearer ${t}`;

    const res = await fetch(`${API.base}${path}`, opts);

    if (!res.ok) {
      let msg = "";
      try { msg = await res.text(); } catch {}
      throw new Error(msg || res.statusText);
    }

    const ct = res.headers.get("content-type") || "";
    if (ct.includes("application/json")) return res.json();
    return res;
  },

  // -------- Auth (sin Authorization en login/register) --------
  login(email, password) {
    return this.request("/api/v1/auth/company/login", {
      method: "POST",
      json: { email, password },
      noAuth: true,
    });
  },
  register(name, email, password) {
    return this.request("/api/v1/auth/company/register", {
      method: "POST",
      json: { name, email, password },
      noAuth: true,
    });
  },
  me() {
    return this.request("/api/v1/auth/company/me");
  },

  // -------- Notes --------
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
  updateNote(id, body) { return this.request(`/api/v1/notes/${id}`, { method: "PUT", json: body }); },
  deleteNote(id) { return this.request(`/api/v1/notes/${id}`, { method: "DELETE" }); },
  mediaUrl(id) { return `${this.base}/api/v1/media/${id}`; },

  // -------- Inventory --------
  saveVehicleIntake(body) {
    return this.request("/api/v1/inventory/vehicle-intakes", { method: "POST", json: body });
  },
  listVehicleIntakes() { return this.request("/api/v1/inventory/vehicle-intakes"); },

  saveItem(body) { return this.request("/api/v1/inventory/items", { method: "POST", json: body }); },
  listItems(params = {}) {
    const q = new URLSearchParams(params).toString();
    return this.request("/api/v1/inventory/items" + (q ? ("?" + q) : ""));
  },
};
