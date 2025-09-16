// assets/js/quotes.js
import { API } from "./api.js";

/**
 * Cotizaciones (frontend)
 * - Numeración por empresa (scoped por email).
 * - Borrador en localStorage.
 * - Items con totals, WA y PDF.
 */

export function initQuotes(ctx = {}) {
  // -------- helpers de contexto/empresa
  const getEmail = () =>
    (typeof ctx.getCompanyEmail === "function" ? ctx.getCompanyEmail() : "").trim();

  const key = (suffix) => `quotes:${suffix}::${getEmail() || "anon"}`;

  // -------- formateo de dinero (estilo CO)
  const money = (n) =>
    isFinite(n) ? "$" + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".") : "$0";

  const parsePrice = (v) =>
    Number(String(v || "0").replace(/[^\d]/g, "")) || 0;

  // -------- DOM refs (coinciden con tu index.html)
  const $ = (sel) => document.querySelector(sel);

  // Columna izquierda (datos)
  const noInput       = $("#q_no");
  const dtInput       = $("#q_datetime");
  const clientInput   = $("#q_clientName");
  const phoneInput    = $("#q_phone");
  const emailInput    = $("#q_email");
  const plateInput    = $("#q_plate");
  const brandInput    = $("#q_brand");
  const modelInput    = $("#q_model");
  const ccInput       = $("#q_cc");
  const saveLocalBtn  = $("#q_saveLocal");

  // Items
  const itemsBox      = $("#q_items");
  const addLineBtn    = $("#q_addLine");
  const subPSpan      = $("#q_subP");
  const subSSpan      = $("#q_subS");
  const totalSpan     = $("#q_total");

  // Acciones
  const sendWA        = $("#q_sendWhats");
  const exportPdf     = $("#q_exportPdf");

  // Columna derecha
  const noBig         = $("#q_no_big");
  const validDays     = $("#q_validDays");
  const waPreview     = $("#q_whatsPreview");
  const clearAllBtn   = $("#q_clearAll");

  // Seguridad: si no existe la sección (por si cambiaste tab), salgo.
  if (!noInput || !itemsBox) return;

  // -----------------------------------------------------------
  // Estado local
  // -----------------------------------------------------------
  let state = {
    meta: {
      no: "", date: "", client: "", phone: "", email: "",
      plate: "", brand: "", model: "", cc: "", validDays: ""
    },
    items: [] // { type: 'Producto'|'Servicio', desc:'', qty:'', price: number }
  };

  // -----------------------------------------------------------
  // Carga inicial: borrador o asigna nuevo número
  // -----------------------------------------------------------
  function ensureDateNow() {
    if (!dtInput.value) {
      const now = new Date();
      dtInput.value = now.toLocaleString();
    }
  }

  function loadDraft() {
    const raw = localStorage.getItem(key("current"));
    if (!raw) return false;
    try {
      const d = JSON.parse(raw);
      if (!d || !d.meta) return false;
      state = d;
      paintFromState();
      return true;
    } catch (_) { return false; }
  }

  function nextNumber() {
    const last = Number(localStorage.getItem(key("last")) || "0");
    const next = (last + 1);
    localStorage.setItem(key("last"), String(last)); // aún no lo avanzo hasta que exista draft
    return String(next).padStart(5, "0");
  }

  function newDraftIfNeeded() {
    // Si no había borrador, creo uno nuevo con el siguiente número
    if (loadDraft()) return;
    state.meta.no = nextNumber();
    state.items = [emptyLine()];
    // pinto y guardo
    paintFromState();
    persist();
  }

  // -----------------------------------------------------------
  // Pintado y persistencia
  // -----------------------------------------------------------
  function emptyLine() {
    return { type: "Producto", desc: "", qty: "", price: 0 };
  }

  function setInput(el, v) { if (el) el.value = v ?? ""; }

  function paintFromState() {
    // meta
    setInput(noInput, state.meta.no);
    setInput(noBig,  state.meta.no);
    ensureDateNow(); // si está vacío coloca ahora
    setInput(clientInput, state.meta.client);
    setInput(phoneInput,  state.meta.phone);
    setInput(emailInput,  state.meta.email);
    setInput(plateInput,  state.meta.plate);
    setInput(brandInput,  state.meta.brand);
    setInput(modelInput,  state.meta.model);
    setInput(ccInput,     state.meta.cc);
    setInput(validDays,   state.meta.validDays);

    // items
    renderItems();
    recalc();
  }

  function readMetaFromInputs() {
    state.meta.no       = (noInput.value || "").trim();
    state.meta.date     = dtInput.value;
    state.meta.client   = clientInput.value.trim();
    state.meta.phone    = phoneInput.value.trim();
    state.meta.email    = emailInput.value.trim();
    state.meta.plate    = plateInput.value.trim();
    state.meta.brand    = brandInput.value.trim();
    state.meta.model    = modelInput.value.trim();
    state.meta.cc       = ccInput.value.trim();
    state.meta.validDays= validDays.value.trim();
  }

  function persist() {
    readMetaFromInputs();
    localStorage.setItem(key("current"), JSON.stringify(state));
    // reservar número si es nuevo
    const last = Number(localStorage.getItem(key("last")) || "0");
    const curN = Number(state.meta.no || "0");
    if (curN > last) localStorage.setItem(key("last"), String(curN));
  }

  // -----------------------------------------------------------
  // Render de items
  // -----------------------------------------------------------
  function itemRowTpl(it, idx) {
    const id = (s) => `q_item_${s}_${idx}`;
    return `
      <div class="q-row" data-idx="${idx}">
        <select id="${id('type')}" class="q-cell">
          <option value="Producto"${it.type === 'Producto' ? ' selected' : ''}>Producto</option>
          <option value="Servicio"${it.type === 'Servicio' ? ' selected' : ''}>Servicio</option>
        </select>
        <input id="${id('desc')}" class="q-cell" placeholder="Descripción" value="${escapeHtml(it.desc)}"/>
        <input id="${id('qty')}"  class="q-cell" placeholder="Cant." value="${escapeHtml(it.qty ?? "")}"/>
        <input id="${id('price')}" class="q-cell" placeholder="Precio unit." value="${it.price ? money(it.price) : ''}"/>
        <div class="q-cell q-sub" id="${id('sub')}">${money(lineSubtotal(it))}</div>
        <button class="q-del" title="Eliminar" data-del="${idx}">×</button>
      </div>`;
  }

  function lineSubtotal(it) {
    const q = Number(String(it.qty || "").replace(/[^\d]/g, "")) || 0;
    return (q > 0 ? q : 1) * (Number(it.price) || 0);
  }

  function renderItems() {
    const head = `
      <div class="q-head">
        <div class="q-h">Tipo</div>
        <div class="q-h">Descripción</div>
        <div class="q-h">Cant.</div>
        <div class="q-h">Precio</div>
        <div class="q-h">Subtotal</div>
        <div class="q-h"></div>
      </div>`;
    itemsBox.innerHTML = head + state.items.map(itemRowTpl).join("");
  }

  function connectRowEvents() {
    itemsBox.querySelectorAll(".q-row").forEach(row => {
      const idx = Number(row.dataset.idx);
      const typeEl  = row.querySelector("select");
      const descEl  = row.querySelector('input[id*="_desc_"]');
      const qtyEl   = row.querySelector('input[id*="_qty_"]');
      const priceEl = row.querySelector('input[id*="_price_"]');
      const subEl   = row.querySelector(".q-sub");
      const delBtn  = row.querySelector(".q-del");

      const update = () => {
        state.items[idx].type  = typeEl.value;
        state.items[idx].desc  = descEl.value;
        state.items[idx].qty   = qtyEl.value;
        state.items[idx].price = parsePrice(priceEl.value);
        subEl.textContent = money(lineSubtotal(state.items[idx]));
        recalc();
        persist();
      };

      typeEl.onchange = update;
      descEl.oninput = update;
      qtyEl.oninput = update;
      priceEl.oninput = update;

      delBtn.onclick = () => {
        state.items.splice(idx, 1);
        if (state.items.length === 0) state.items.push(emptyLine());
        renderItems(); connectRowEvents(); recalc(); persist();
      };
    });
  }

  function recalc() {
    let subP = 0, subS = 0;
    for (const it of state.items) {
      const sub = lineSubtotal(it);
      if (it.type === "Servicio") subS += sub; else subP += sub;
    }
    const tot = subP + subS;
    subPSpan.textContent  = money(subP);
    subSSpan.textContent  = money(subS);
    totalSpan.textContent = money(tot);

    // preview WhatsApp
    waPreview.value = buildWhatsText();
  }

  // -----------------------------------------------------------
  // WA / PDF
  // -----------------------------------------------------------
  function buildWhatsText() {
    const m = state.meta;
    const title = `*Cotización ${m.no}*`;
    const veh = (m.brand || m.model || m.plate || m.cc)
      ? `\nVehículo: ${[m.brand, m.model].filter(Boolean).join(" ")}${m.plate ? ` — Placa: ${m.plate}` : ""}${m.cc ? ` — Cilindraje: ${m.cc}` : ""}`
      : "";

    const rows = state.items.map(it => {
      const q = Number(String(it.qty || "").replace(/[^\d]/g, "")) || 0;
      const sub = lineSubtotal(it);
      const qtyTxt = q > 0 ? ` x ${q}` : "";
      return `✅ ${it.desc}${qtyTxt}\n${money(sub)}`;
    }).join("\n\n");

    const tot = subPSpan.textContent && subSSpan.textContent && totalSpan.textContent
      ? `\n\nSubtotal Productos: ${subPSpan.textContent}\nSubtotal Servicios: ${subSSpan.textContent}\n*TOTAL:* ${totalSpan.textContent}`
      : "";

    const valid = state.meta.validDays ? `\nValidez: ${state.meta.validDays} días` : "";
    return `${title}${veh}\n\n${rows}${tot}\n\n_Valores SIN IVA_${valid}`;
  }

  function onSendWhats() {
    persist();
    const txt = encodeURIComponent(buildWhatsText());
    window.open(`https://wa.me/?text=${txt}`, "_blank");
  }

  function onExportPdf() {
    persist();
    const m = state.meta;

    const rows = state.items.map(it => {
      const q = Number(String(it.qty || "").replace(/[^\d]/g, "")) || 0;
      const qtyTxt = q > 0 ? q : 1;
      return `
        <tr>
          <td>${it.type}</td>
          <td>${escapeHtml(it.desc)}</td>
          <td style="text-align:center">${qtyTxt}</td>
          <td style="text-align:right">${money(Number(it.price) || 0)}</td>
          <td style="text-align:right">${money(lineSubtotal(it))}</td>
        </tr>`;
    }).join("");

    const html = `
<!doctype html><html><head><meta charset="utf-8"/>
<title>Cotización ${m.no}</title>
<style>
  body{font-family:system-ui,-apple-system,Segoe UI,Roboto; margin:20mm;}
  .hdr{display:flex; align-items:center; justify-content:space-between; margin-bottom:14mm;}
  .brand{font-size:22px; letter-spacing:.5px; color:#b39100; font-weight:700;}
  .title{font-size:20px; font-weight:800;}
  .logo{width:28mm;height:auto;}
  .wm{position:fixed; left:5%; right:5%; top:32%; opacity:.06; font-size:120px; color:#000; text-align:center; user-select:none;}
  table{width:100%; border-collapse:collapse; font-size:12px;}
  th, td{border:1px solid #ccc; padding:6px;}
  th{background:#f5f5f5; text-align:left;}
  .r{text-align:right}
  .foot{margin-top:8mm; font-size:11px}
</style>
</head><body>
  <div class="hdr">
    <div class="brand">CASA RENAULT H&H</div>
    <img class="logo" src="https://upload.wikimedia.org/wikipedia/commons/thumb/5/5c/Renault_2021.svg/512px-Renault_2021.svg.png" />
  </div>

  <div style="margin-bottom:6mm">
    <div class="title">COTIZACIÓN</div>
    <div style="margin-top:2mm; font-size:12px">
      <strong>No.</strong> ${m.no} &nbsp;&nbsp; <strong>Fecha:</strong> ${m.date || dtInput.value}
      <br/>
      <strong>Cliente:</strong> ${escapeHtml(m.client || "")}
      &nbsp;&nbsp; <strong>Tel:</strong> ${escapeHtml(m.phone || "")}
      &nbsp;&nbsp; <strong>Email:</strong> ${escapeHtml(m.email || "")}
      <br/>
      <strong>Vehículo:</strong> ${[m.brand, m.model].filter(Boolean).join(" ") || "-"}
      ${m.plate ? ` &nbsp;&nbsp; <strong>Placa:</strong> ${escapeHtml(m.plate)}` : ""}
      ${m.cc ? ` &nbsp;&nbsp; <strong>Cilindraje:</strong> ${escapeHtml(m.cc)}` : ""}
    </div>
  </div>

  <table>
    <thead>
      <tr><th>Tipo</th><th>Descripción</th><th>Cant.</th><th class="r">Precio unit.</th><th class="r">Subtotal</th></tr>
    </thead>
    <tbody>${rows}</tbody>
    <tfoot>
      <tr><td colspan="4" class="r"><strong>Subtotal Productos</strong></td><td class="r">${subPSpan.textContent}</td></tr>
      <tr><td colspan="4" class="r"><strong>Subtotal Servicios</strong></td><td class="r">${subSSpan.textContent}</td></tr>
      <tr><td colspan="4" class="r"><strong>TOTAL</strong></td><td class="r">${totalSpan.textContent}</td></tr>
    </tfoot>
  </table>

  <div class="foot">
    Valores <strong>SIN IVA</strong>${m.validDays ? ` — Validez: ${m.validDays} días` : ""}<br/>
    Calle 69° No. 87-39 • Cel: 301 205 9320 • Bogotá D.C • Contacto: HUGO MANRIQUE 311 513 1603
  </div>

  <div class="wm">RENAULT</div>
  <script>window.onload=()=>{setTimeout(()=>window.print(),200)}</script>
</body></html>`;
    const w = window.open("", "_blank");
    w.document.open(); w.document.write(html); w.document.close();
  }

  // -----------------------------------------------------------
  // Eventos globales
  // -----------------------------------------------------------
  function onAddLine() {
    state.items.push(emptyLine());
    renderItems(); connectRowEvents(); persist();
  }

  function onSaveLocal() {
    persist();
    alert("Borrador guardado localmente.");
  }

  function onClearAll() {
    if (!confirm("Borrar todo el borrador de esta empresa?")) return;
    localStorage.removeItem(key("current"));
    // el last se conserva; el próximo arranque usará last+1
    state = { meta: { no: nextNumber() }, items: [emptyLine()] };
    paintFromState(); persist();
  }

  // Entradas que disparan persist
  [clientInput, phoneInput, emailInput, plateInput, brandInput, modelInput, ccInput, validDays]
    .forEach(el => el && (el.oninput = () => { persist(); recalc(); }));

  // Botones
  addLineBtn && (addLineBtn.onclick = onAddLine);
  saveLocalBtn && (saveLocalBtn.onclick = onSaveLocal);
  clearAllBtn  && (clearAllBtn.onclick = onClearAll);
  sendWA      && (sendWA.onclick = onSendWhats);
  exportPdf   && (exportPdf.onclick = onExportPdf);

  // Render/boot
  renderItems(); connectRowEvents(); newDraftIfNeeded();

  // Para recalcular después de render
  recalc();

  // util
  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g,"&amp;")
      .replace(/</g,"&lt;")
      .replace(/>/g,"&gt;")
      .replace(/"/g,"&quot;");
  }
}
