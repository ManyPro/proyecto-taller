/* assets/js/sales.js — FRONTEND PURO
   Hace funcionar la pestaña de Ventas: botones, render de tabla, QR (fallback jsQR) y SSE.
   Requiere que api.js exponga API con:
     API.sales.{start,get,addItem,updateItem,removeItem,setCustomerVehicle,close,list,cancel}
     API.inventory.itemsList (picker)
     API.servicesList, API.pricesList  (picker de precios)
     API.live.connect()                 (SSE; opcional)
*/
import { API } from './api.esm.js';
import { loadFeatureOptionsAndRestrictions, getFeatureOptions, gateElement } from './feature-gating.js';

// ---------- helpers ----------
const $  = (s, r=document)=>r.querySelector(s);
const clone = (id)=>document.getElementById(id)?.content?.firstElementChild?.cloneNode(true);
const money = (n)=> new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',maximumFractionDigits:0}).format(Number(n||0));

function padSaleNumber(n){
  return String(n ?? '').toString().padStart(5,'0');
}

function describeCustomer(customer){
  const c = customer || {};
  const parts = [];
  if (c.name) parts.push(c.name);
  if (c.idNumber) parts.push('ID: ' + c.idNumber);
  if (c.phone) parts.push('Tel: ' + c.phone);
  if (c.email) parts.push(c.email);
  if (c.address) parts.push(c.address);
  return parts.join(' | ') || 'N/A';
}

function describeVehicle(vehicle){
  const v = vehicle || {};
  const parts = [];
  if (v.plate) parts.push(v.plate);
  const specs = [v.brand, v.line, v.engine].filter(Boolean).join(' ');
  if (specs) parts.push(specs.trim());
  if (v.year) parts.push('Año ' + v.year);
  if (v.mileage != null) parts.push((v.mileage || 0) + ' km');
  return parts.join(' | ') || 'N/A';
}

function printSaleTicket(sale){
  if(!sale) return;
  function fallback(){
    const number = padSaleNumber(sale.number || sale._id || '');
    const linesOut = [
      'Factura simple',
      '',
      '# ' + number + '  Total: ' + money(sale.total || 0),
      '',
      'Cliente: ' + describeCustomer(sale.customer),
      'Vehículo: ' + describeVehicle(sale.vehicle),
      '',
      'Items:'
    ];
    (sale.items || []).forEach(it => {
      linesOut.push('- ' + (it.qty || 0) + ' x ' + (it.name || it.sku || '') + ' (' + money(it.total || 0) + ')');
    });
    const txt = linesOut.join('\n');
    const win = window.open('', '_blank');
    if (!win) { alert('No se pudo abrir ventana de impresión'); return; }
    win.document.write('<pre>' + txt + '</pre>');
    win.document.close(); win.focus(); win.print(); try { win.close(); } catch {}
  }
  // Intento con plantilla activa invoice
  if(API?.templates?.active){
    API.templates.active('invoice')
      .then(tpl=>{
        if(!tpl || !tpl.contentHtml){ fallback(); return; }
        return API.templates.preview({ type:'invoice', contentHtml: tpl.contentHtml, contentCss: tpl.contentCss, sampleId: sale._id })
          .then(r=>{
            const win = window.open('', '_blank');
            if(!win){ fallback(); return; }
            const css = r.css ? `<style>${r.css}</style>`:'';
            win.document.write(`<!doctype html><html><head><meta charset='utf-8'>${css}</head><body>${r.rendered}</body></html>`);
            win.document.close(); win.focus(); win.print(); try{ win.close(); }catch{}
          })
          .catch(()=> fallback());
      })
      .catch(()=> fallback());
  } else fallback();
}

// Imprimir Orden de Trabajo usando plantilla workOrder si existe
function printWorkOrder(){
  if(!current){ alert('No hay venta activa'); return; }
  const sale = current;
  function fallback(){
    const lines = [];
    lines.push('ORDEN DE TRABAJO');
    lines.push('# ' + padSaleNumber(sale.number||''));
    lines.push('Cliente: ' + describeCustomer(sale.customer));
    lines.push('Vehículo: ' + describeVehicle(sale.vehicle));
    lines.push('--- Ítems ---');
    (sale.items||[]).forEach(it=> lines.push('- '+ (it.qty||0) + ' x ' + (it.name||it.sku||'') ));
    const win = window.open('', '_blank');
    if(!win){ alert('No se pudo abrir impresión'); return; }
    win.document.write('<pre>'+lines.join('\n')+'</pre>');
    win.document.close(); win.focus(); win.print(); try{ win.close(); }catch{}
  }
  if(API?.templates?.active){
    API.templates.active('workOrder')
      .then(tpl=>{
        if(!tpl || !tpl.contentHtml){ fallback(); return; }
        return API.templates.preview({ type:'workOrder', contentHtml: tpl.contentHtml, contentCss: tpl.contentCss, sampleId: sale._id })
          .then(r=>{
            const win = window.open('', '_blank');
            if(!win){ fallback(); return; }
            const css = r.css? `<style>${r.css}</style>`:'';
            win.document.write(`<!doctype html><html><head><meta charset='utf-8'>${css}</head><body>${r.rendered}</body></html>`);
            win.document.close(); win.focus(); win.print(); try{ win.close(); }catch{}
          })
          .catch(()=> fallback());
      })
      .catch(()=> fallback());
  } else fallback();
}


// ---------- estado ----------
let es = null;         // EventSource (SSE)
let current = null;    // venta actual
let openSales = [];    // ventas abiertas (draft) compartidas
// Lista dinámica de técnicos por empresa, cargada desde backend
let companyTechnicians = [];
let technicianSelectInitialized = false;
let starting = false;  // evita doble clic en "Nueva venta"
let salesRefreshTimer = null;
let lastQuoteLoaded = null; // referencia a la cotización mostrada en el mini panel
const QUOTE_LINK_KEY = 'sales:quoteBySale';
let saleQuoteLinks = loadSaleQuoteLinks();
const saleQuoteCache = new Map();
let saleQuoteRequestToken = 0;

function loadSaleQuoteLinks(){
  if (typeof localStorage === 'undefined') return {};
  try{
    const raw = localStorage.getItem(QUOTE_LINK_KEY);
    if(!raw) return {};
    const parsed = JSON.parse(raw);
    if(parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
  }catch{}
  return {};
}

function persistSaleQuoteLinks(){
  if (typeof localStorage === 'undefined') return;
  try{ localStorage.setItem(QUOTE_LINK_KEY, JSON.stringify(saleQuoteLinks)); }catch{}
}

function setSaleQuoteLink(saleId, quoteId){
  if(!saleId) return;
  if(quoteId){
    saleQuoteLinks[saleId] = quoteId;
  } else {
    delete saleQuoteLinks[saleId];
  }
  persistSaleQuoteLinks();
}

function getSaleQuoteId(saleId){
  return saleQuoteLinks?.[saleId] || '';
}

function ensureSaleQuoteLink(q){
  if(!current?._id) return;
  const quoteId = q?._id || q?.id || '';
  if(!quoteId) return;
  saleQuoteCache.set(quoteId, q);
  setSaleQuoteLink(current._id, quoteId);
}

async function renderQuoteForCurrentSale(){
  const saleId = current?._id;
  if(!saleId){
    renderQuoteMini(null);
    return;
  }
  const quoteId = getSaleQuoteId(saleId);
  if(!quoteId){
    renderQuoteMini(null);
    return;
  }
  const token = ++saleQuoteRequestToken;
  try{
    let quote = saleQuoteCache.get(quoteId);
    if(!quote){
      quote = await API.quoteGet(quoteId);
      if(quote) saleQuoteCache.set(quoteId, quote);
    }
    if(token !== saleQuoteRequestToken) return;
    if(quote){
      renderQuoteMini(quote);
    } else {
      setSaleQuoteLink(saleId, null);
      renderQuoteMini(null);
    }
  }catch(err){
    if(token === saleQuoteRequestToken){
      console.warn('No se pudo cargar la cotizacion vinculada', err);
      renderQuoteMini(null);
    }
  }
}

// ---- helper: mapear item de cotización -> payload addItem/addItemsBatch ----
function mapQuoteItemToSale(it){
  const unit = Number(it.unitPrice ?? it.unit ?? 0) || 0;
  const qty  = Number(it.qty || 1) || 1;
  let source = it.source || it.kindSource || '';
  // Normalizar refId (posibles variantes legacy)
  const refId = it.refId || it.refID || it.ref_id || null;
  // Heurística: si es PRODUCTO y no tiene source pero hay sku/refId -> tratar como inventario
  const kindUpper = String(it.kind || it.type || '').toUpperCase();
  if(!source && kindUpper === 'PRODUCTO' && (refId || it.sku)) source = 'inventory';
  if(source === 'inventory'){
    return { source:'inventory', refId: refId || undefined, sku: it.sku || undefined, qty, unitPrice:unit };
  }
  if(source === 'price'){
    return { source:'price', refId: refId || undefined, qty, unitPrice:unit };
  }
  // Legacy/manual: no afecta stock. Usamos 'service' genérico con nombre.
  return {
    source:'service',
    name: it.description || it.name || 'Item',
    sku: it.sku || undefined,
    qty,
    unitPrice: unit
  };
}

function labelForSale(sale) {
  const plate = sale?.vehicle?.plate || '';
  return plate ? `VENTA - ${plate.toUpperCase()}` : String(sale?._id || '').slice(-6).toUpperCase();
}

function syncCurrentIntoOpenList() {
  if (!current?._id) return;
  const idx = openSales.findIndex((s) => s._id === current._id);
  const copy = JSON.parse(JSON.stringify(current));
  if (idx >= 0) openSales[idx] = copy;
  else openSales.unshift(copy);
}

async function refreshOpenSales(options = {}) {
  const { focusId = null, preferCurrent = null } = options;
  try {
    const res = await API.sales.list({ status: 'draft', limit: 100 });
    const items = Array.isArray(res?.items) ? res.items : [];
    openSales = items;
    let targetId = focusId || preferCurrent?._id || current?._id || null;
    if (targetId) {
      const found = openSales.find((s) => s._id === targetId);
      if (found) {
        current = found;
      } else if (preferCurrent) {
        current = preferCurrent;
        syncCurrentIntoOpenList();
      } else if (current && current._id === targetId) {
        current = null;
      }
    }
    if (!current && openSales.length) current = openSales[0];
    renderTabs();
    renderSale();
    renderWO();
    await renderQuoteForCurrentSale();
  } catch (err) {
    console.error('refreshOpenSales failed', err);
  }
}

function startSalesAutoRefresh() {
  if (salesRefreshTimer) return;
  salesRefreshTimer = setInterval(() => {
    refreshOpenSales({ focusId: current?._id || null });
  }, 10000);
}

// Registrar listener botón Imprimir OT cuando exista en DOM
document.addEventListener('DOMContentLoaded', ()=>{
  const btnWO = document.getElementById('sv-print-wo');
  if(btnWO) btnWO.addEventListener('click', ()=> printWorkOrder());
});

// ===== Modal Cerrar Venta =====
let companyPrefs = { laborPercents: [] };
let techConfig = { laborKinds: [], technicians: [] };
async function ensureCompanyData(){
  try { companyTechnicians = await API.company.getTechnicians(); } catch { companyTechnicians = []; }
  try { companyPrefs = await API.company.getPreferences(); } catch { companyPrefs = { laborPercents: [] }; }
  try { 
    // Usar API.get directamente como alternativa más robusta
    const response = await API.get('/api/v1/company/tech-config');
    techConfig = response?.config || response || { laborKinds: [], technicians: [] };
    console.log('techConfig cargado:', techConfig);
    console.log('laborKinds:', techConfig?.laborKinds);
  } catch (err) { 
    console.error('Error cargando techConfig:', err);
    techConfig = { laborKinds: [], technicians: [] }; 
  }
}

// === Multi-payment close sale modal construction ===
function buildCloseModalContent(){
  const total = current?.total || 0;
  const wrap = document.createElement('div');
  wrap.innerHTML = `
    <h3>Cerrar venta</h3>
    <div class="muted" style="font-size:12px;margin-bottom:6px;">Total venta: <strong>${money(total)}</strong></div>
    <div id="cv-payments-block" class="card" style="padding:10px; margin-bottom:12px;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
        <strong>Formas de pago</strong>
        <button id="cv-add-payment" type="button" class="small secondary">+ Agregar</button>
      </div>
      <table style="width:100%; font-size:12px; border-collapse:collapse;" id="cv-payments-table">
        <thead>
          <tr style="text-align:left;">
            <th style="padding:4px 2px;">Método</th>
            <th style="padding:4px 2px;">Cuenta</th>
            <th style="padding:4px 2px; width:90px;">Monto</th>
            <th style="padding:4px 2px; width:32px;"></th>
          </tr>
        </thead>
        <tbody id="cv-payments-body"></tbody>
      </table>
      <div id="cv-payments-summary" style="margin-top:6px; font-size:11px;" class="muted"></div>
    </div>
    <div class="grid-2" style="gap:12px;">
      <div style="display:none;">
        <label>Técnico (cierre)</label>
        <select id="cv-technician"></select>
        <div id="cv-initial-tech" class="muted" style="margin-top:4px;font-size:11px;display:none;"></div>
      </div>
      <div style="display:none;">
        <label>% Técnico</label>
        <select id="cv-laborPercent"></select>
        <input id="cv-laborPercentManual" type="number" min="0" max="100" placeholder="Manual %" style="margin-top:4px;display:none;" />
        <button id="cv-toggle-percent" type="button" class="small" style="margin-top:4px;">Manual %</button>
      </div>
      <div style="grid-column:1/3;">
        <label>Comprobante (opcional)</label>
        <input id="cv-receipt" type="file" accept="image/*,.pdf" />
      </div>
      <div style="grid-column:1/3; font-size:12px; display:none;" class="muted" id="cv-laborSharePreview"></div>
      <div class="sticky-actions" style="grid-column:1/3; margin-top:8px; display:flex; gap:8px;">
        <button id="cv-confirm">Confirmar cierre</button>
        <button type="button" class="secondary" id="cv-cancel">Cancelar</button>
      </div>
      <div id="cv-msg" class="muted" style="grid-column:1/3; margin-top:6px; font-size:12px;"></div>
    </div>`;
  return wrap;
}

function openCloseModal(){
  const modal = document.getElementById('modal');
  const body = document.getElementById('modalBody');
  if(!modal||!body) return;
  ensureCompanyData().then(()=>{
    // Asegurar que techConfig esté cargado
    console.log('techConfig después de ensureCompanyData:', techConfig);
    console.log('laborKinds disponibles:', techConfig?.laborKinds);
    body.innerHTML='';
    const content = buildCloseModalContent();
    body.appendChild(content);
    fillCloseModal();
    // Agregar clase para hacer el modal más ancho
    const modalContent = modal.querySelector('.modal-content');
    if(modalContent) {
      modalContent.classList.add('close-sale-modal');
    }
    modal.classList.remove('hidden');
  }).catch(err => {
    console.error('Error al cargar datos de la empresa:', err);
    alert('Error al cargar configuración. Por favor, recarga la página.');
  });
}

function fillCloseModal(){
  const techSel = document.getElementById('cv-technician');
  techSel.innerHTML = '<option value="">-- Ninguno --</option>' + (companyTechnicians||[]).map(t=>`<option value="${t}">${t}</option>`).join('') + '<option value="__ADD_TECH__">+ Agregar técnico…</option>';
  const initialTechLabel = document.getElementById('cv-initial-tech');
  if(current){
    if(current.initialTechnician){
      if(initialTechLabel){
        initialTechLabel.style.display='block';
        initialTechLabel.textContent = 'Asignado al inicio: ' + current.initialTechnician;
      }
      techSel.value = current.technician || current.initialTechnician;
    } else if(current.technician){
      techSel.value = current.technician;
    }
  }

  // Labor percent options (ocultos pero necesarios para compatibilidad)
  const percSel = document.getElementById('cv-laborPercent');
  const perc = (companyPrefs?.laborPercents||[]);
  percSel.innerHTML = '<option value="">-- % --</option>' + perc.map(p=>`<option value="${p}">${p}%</option>`).join('');
  const manualPercentInput = document.getElementById('cv-laborPercentManual');
  const percentToggle = document.getElementById('cv-toggle-percent');
  const sharePrev = document.getElementById('cv-laborSharePreview');
  const msg = document.getElementById('cv-msg');

  // ---- Desglose por maniobra (dinámico, sin tocar el HTML base) ----
  try {
    const grid = document.querySelector('.grid-2');
    const wrap = document.createElement('div');
    wrap.style.gridColumn = '1/3';
    wrap.innerHTML = `
      <label>Desglose de mano de obra</label>
      <div class="card" style="padding:8px;">
        <div class="row between" style="align-items:center;">
          <strong>Participación técnica</strong>
          <div class="row" style="gap:6px;align-items:center;">
            <button id="cv-add-commission" type="button" class="small secondary">+ Línea</button>
          </div>
        </div>
        <table class="table small" style="width:100%;">
          <thead><tr><th>Técnico</th><th>Tipo</th><th class="t-right">Valor MO</th><th class="t-right">% Tec</th><th class="t-right">Participación</th><th></th></tr></thead>
          <tbody id="cv-comm-body"></tbody>
        </table>
      </div>`;
    grid.insertBefore(wrap, grid.querySelector('#cv-receipt')?.parentElement);

    const tbody = wrap.querySelector('#cv-comm-body');
    
    // Función para obtener laborKinds actualizados
    async function getLaborKinds() {
      try {
        // Usar API.get directamente como alternativa más robusta
        const response = await API.get('/api/v1/company/tech-config');
        const config = response?.config || response || { laborKinds: [] };
        return config?.laborKinds || [];
      } catch (err) {
        console.error('Error obteniendo laborKinds:', err);
        // Fallback a techConfig cargado previamente
        return techConfig?.laborKinds || [];
      }
    }
    
    async function addLine(pref={}){
      const tr = document.createElement('tr');
      const techOpts = ['',''].concat(companyTechnicians||[]).map(t=> `<option value="${t}">${t}</option>`).join('');
      
      // Obtener laborKinds actualizados
      const laborKinds = await getLaborKinds();
      const laborKindsList = laborKinds.map(k=> {
        const name = typeof k === 'string' ? k : (k?.name || '');
        return name;
      }).filter(k => k && k.trim() !== ''); // Filtrar vacíos
      
      console.log('laborKinds obtenidos:', laborKinds);
      console.log('laborKindsList procesado:', laborKindsList);
      
      const kindOpts = '<option value="">-- Seleccione tipo --</option>' + laborKindsList.map(k=> `<option value="${k}">${k}</option>`).join('');
      tr.innerHTML = `
        <td><select data-role="tech">${techOpts}</select></td>
        <td><select data-role="kind">${kindOpts}</select></td>
        <td class="t-right"><input data-role="lv" type="number" min="0" step="1" value="${Number(pref.laborValue||0)||0}" style="width:100px;"></td>
        <td class="t-right"><input data-role="pc" type="number" min="0" max="100" step="1" value="${Number(pref.percent||0)||0}" style="width:80px;"></td>
        <td class="t-right" data-role="share">$0</td>
        <td class="t-center"><button type="button" class="small danger" data-role="del">×</button></td>`;
      tbody.appendChild(tr);
      const techSel2 = tr.querySelector('select[data-role=tech]');
      const kindSel2 = tr.querySelector('select[data-role=kind]');
      const lvInp = tr.querySelector('input[data-role=lv]');
      const pcInp = tr.querySelector('input[data-role=pc]');
      const shareCell = tr.querySelector('[data-role=share]');
      const delBtn = tr.querySelector('button[data-role=del]');
      if(pref.technician) techSel2.value = pref.technician;
      if(pref.kind) kindSel2.value = pref.kind;
      function recalc(){
        const lv = Number(lvInp.value||0)||0; const pc=Number(pcInp.value||0)||0; const sh = Math.round(lv*pc/100);
        shareCell.textContent = money(sh);
      }
      [lvInp, pcInp, techSel2, kindSel2].forEach(el=> el.addEventListener('input', recalc));
      delBtn.addEventListener('click', ()=> tr.remove());
      recalc();
      // autocompletar % desde perfil del técnico o desde defaultPercent del tipo
      function autoFillPercent(){
        const name = techSel2.value; const kind = (kindSel2.value||'').toUpperCase();
        if(!name || !kind) return;
        // Primero buscar en el perfil del técnico
        const prof = (techConfig?.technicians||[]).find(t=> t.name===name);
        if(prof && kind){ 
          const r = (prof.rates||[]).find(x=> String(x.kind||'').toUpperCase()===kind); 
          if(r && r.percent > 0){ 
            pcInp.value = Number(r.percent||0); 
            recalc(); 
            return;
          }
        }
        // Si no está en el perfil, usar el defaultPercent del tipo
        getLaborKinds().then(laborKinds => {
          const laborKind = laborKinds.find(k=> {
            const kindName = typeof k === 'string' ? k : (k?.name || '');
            return String(kindName).toUpperCase() === kind;
          });
          if(laborKind && typeof laborKind === 'object' && laborKind.defaultPercent > 0){
            pcInp.value = Number(laborKind.defaultPercent||0);
            recalc();
          }
        });
      }
      techSel2.addEventListener('change', autoFillPercent);
      kindSel2.addEventListener('change', autoFillPercent);
      return tr;
    }
    wrap.querySelector('#cv-add-commission').addEventListener('click', ()=> addLine({}).catch(err => console.error('Error agregando línea:', err)));
    // precargar una línea si hay técnico
    if((techSel.value||'').trim()){ addLine({ technician: techSel.value }).catch(err => console.error('Error precargando línea:', err)); }
  } catch{}

  // Dynamic payments
  const pmBody = document.getElementById('cv-payments-body');
  const addBtn = document.getElementById('cv-add-payment');
  const summary = document.getElementById('cv-payments-summary');
  let accountsCache = [];
  let payments = [];

  async function loadAccounts(){
    try {
      accountsCache = await API.accounts.list();
      if(!accountsCache.length){
        try { await API.accounts.create({ name:'Caja', type:'CASH' }); } catch{}
        accountsCache = await API.accounts.list();
      }
    }catch{ accountsCache = []; }
  }

  function methodOptionsHTML(selected=''){
    const opts = ['', 'EFECTIVO','TRANSFERENCIA','TARJETA','OTRO'];
    return opts.map(v=>`<option value="${v}" ${v===selected?'selected':''}>${v? v : '--'}</option>`).join('');
  }
  function accountOptionsHTML(selected=''){
    if(!accountsCache.length) return '<option value="">(sin cuentas)</option>';
    return accountsCache.map(a=>`<option value="${a._id}" ${a._id===selected?'selected':''}>${a.name}</option>`).join('');
  }
  function recalc(){
    const sum = payments.reduce((a,p)=> a + (Number(p.amount)||0), 0);
    const total = Number(current?.total||0);
    const diff = total - sum;
    let html = `Suma: <strong>${money(sum)}</strong> / Total: ${money(total)}.`;
    if(Math.abs(diff) > 0.01){
      html += diff>0 ? ` Falta ${money(diff)}.` : ` Excede por ${money(-diff)}.`;
      summary.style.color = '#b03030';
    }else{ summary.style.color=''; html += ' OK'; }
    summary.innerHTML = html;
    const confirmBtn = document.getElementById('cv-confirm');
    if(confirmBtn){ confirmBtn.disabled = Math.abs(diff) > 0.01 || payments.length===0; }
  }
  function bindRowEvents(tr, pay){
    const mSel = tr.querySelector('select[data-role=method]');
    const aSel = tr.querySelector('select[data-role=account]');
    const amt  = tr.querySelector('input[data-role=amount]');
    const del  = tr.querySelector('button[data-role=del]');
    mSel.addEventListener('change', ()=>{ pay.method = mSel.value.trim().toUpperCase(); recalc(); });
    aSel.addEventListener('change', ()=>{ pay.accountId = aSel.value||null; });
    amt.addEventListener('input', ()=>{ pay.amount = Number(amt.value||0)||0; recalc(); });
    del.addEventListener('click', ()=>{
      payments = payments.filter(p => p !== pay);
      tr.remove(); recalc();
    });
  }
  function addPaymentRow(p){
    const pay = { method:'', amount:0, accountId:'', ...(p||{}) };
    payments.push(pay);
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="padding:2px 2px;"><select data-role="method" style="width:110px;">${methodOptionsHTML(pay.method)}</select></td>
      <td style="padding:2px 2px;"><select data-role="account" style="width:140px;">${accountOptionsHTML(pay.accountId)}</select></td>
      <td style="padding:2px 2px;"><input data-role="amount" type="number" min="0" step="1" value="${pay.amount||''}" style="width:90px;" /></td>
      <td style="padding:2px 2px; text-align:center;"><button data-role="del" type="button" class="small danger">×</button></td>`;
    pmBody.appendChild(tr);
    bindRowEvents(tr, pay);
  }
  addBtn.addEventListener('click', ()=> addPaymentRow({ amount:0 }));

  (async ()=>{
    await loadAccounts();
    // Prefill single row with full total
    addPaymentRow({ method:'EFECTIVO', amount: Number(current?.total||0), accountId: accountsCache[0]?._id||'' });
    recalc();
  })();

  // Technician add inline
  techSel.addEventListener('change', async ()=>{
    if(techSel.value === '__ADD_TECH__'){
      const name = prompt('Nombre del técnico (se guardará en mayúsculas):');
      techSel.value='';
      if(!name) return;
      try{ companyTechnicians = await API.company.addTechnician(name); fillCloseModal(); }
      catch(e){ alert(e?.message||'No se pudo agregar'); }
    }
  });

  document.getElementById('cv-cancel').addEventListener('click', ()=>{
    // Detect if user edited payments and ask
    const edited = payments.some(p=>p.amount>0 || p.method);
    if(edited && !confirm('Hay cambios en los pagos sin cerrar. ¿Cerrar modal?')) return;
    document.getElementById('modal')?.classList.add('hidden');
  });

  document.getElementById('cv-confirm').addEventListener('click', async ()=>{
    if(!current) return;
    msg.textContent='Procesando...';
    // Validar suma exacta
    const sum = payments.reduce((a,p)=> a + (Number(p.amount)||0), 0);
    const total = Number(current?.total||0);
    if(Math.abs(sum-total) > 0.01){ msg.textContent='La suma de pagos no coincide con el total.'; return; }
    const filtered = payments.filter(p=> p.method && p.amount>0);
    if(!filtered.length){ msg.textContent='Agregar al menos una forma de pago válida'; return; }
    try{
      let receiptUrl='';
      const file = document.getElementById('cv-receipt').files?.[0];
      if(file){
        const uploadRes = await API.mediaUpload ? API.mediaUpload([file]) : null;
        if(uploadRes && uploadRes.files && uploadRes.files[0]){
          receiptUrl = uploadRes.files[0].url || uploadRes.files[0].path || '';
        }
      }
      // Build labor commissions from table if present
      const comm = [];
      const commBody = document.getElementById('cv-comm-body');
      if (commBody) {
        commBody.querySelectorAll('tr').forEach(tr=>{
          const tech = tr.querySelector('select[data-role=tech]')?.value?.trim().toUpperCase();
          const kind = tr.querySelector('select[data-role=kind]')?.value?.trim().toUpperCase();
          const lv = Number(tr.querySelector('input[data-role=lv]')?.value||0)||0;
          const pc = Number(tr.querySelector('input[data-role=pc]')?.value||0)||0;
          if(tech && kind && lv>0 && pc>=0) comm.push({ technician: tech, kind, laborValue: lv, percent: pc });
        });
      }
      const payload = {
        paymentMethods: filtered.map(p=>({ method:p.method, amount:Number(p.amount)||0, accountId:p.accountId||null })),
        technician: techSel.value||'',
        laborValue: 0,
        laborPercent: 0,
        laborCommissions: comm,
        paymentReceiptUrl: receiptUrl
      };
      await API.sales.close(current._id, payload);
      alert('Venta cerrada');
      document.getElementById('modal')?.classList.add('hidden');
      setSaleQuoteLink(current._id, null);
      current = null;
      await refreshOpenSales();
    }catch(e){ msg.textContent = e?.message||'Error'; msg.classList.add('error'); }
  });
}

function stopSalesAutoRefresh() {
  if (!salesRefreshTimer) return;
  clearInterval(salesRefreshTimer);
  salesRefreshTimer = null;
}


// ---------- tabs ----------
async function switchTo(id){
  try{
    const sale = await API.sales.get(id);
    current = sale;
    syncCurrentIntoOpenList();
    renderTabs(); renderSale(); renderWO(); await renderQuoteForCurrentSale();
  }catch(e){ console.error(e); }
}

function renderTabs(){ /* legacy no-op kept for backward compatibility */ renderCapsules(); }

function renderCapsules(){
  const cont = document.getElementById('sales-capsules'); if(!cont) return;
  cont.innerHTML='';
  for(const sale of openSales){
    if(!sale?._id) continue;
    const tpl = document.getElementById('tpl-sale-capsule');
    const node = tpl?.content?.firstElementChild?.cloneNode(true);
    if(!node) continue;
    node.dataset.id = sale._id;
    node.querySelector('.sc-plate').textContent = (sale.vehicle?.plate||'—');
  const vehParts = [sale.vehicle?.brand, sale.vehicle?.line, sale.vehicle?.engine].filter(Boolean).map(v=>String(v).toUpperCase());
  node.querySelector('[data-veh]').textContent = vehParts.join(' ') || '—';
    node.querySelector('[data-total]').textContent = money(sale.total||0);
    node.querySelector('[data-tech]').textContent = sale.technician || '—';
    if(current && sale._id===current._id) node.classList.add('active');
    node.addEventListener('click', (e)=>{
      if(e.target.classList.contains('sc-close')) return; // handled separately
      switchTo(sale._id);
    });
    node.querySelector('.sc-close').addEventListener('click', async (e)=>{
      e.stopPropagation();
      if(!confirm('Cancelar esta venta?')) return;
      try{ await API.sales.cancel(sale._id); }catch(err){ alert(err?.message||'No se pudo cancelar'); }
      setSaleQuoteLink(sale._id, null);
      if(current && current._id===sale._id) current=null;
      await refreshOpenSales();
    });
    cont.appendChild(node);
  }
  if(!openSales.length){
    const empty=document.createElement('div'); empty.className='muted'; empty.style.fontSize='12px'; empty.textContent='No hay ventas abiertas';
    cont.appendChild(empty);
  }
  setupTechnicianSelect();
}

async function setupTechnicianSelect(){
  const sel = document.getElementById('sales-technician');
  if(!sel) return;
  // Cargar lista dinámica si aún no cargada
  if(!companyTechnicians.length){
    try { companyTechnicians = await API.company.getTechnicians(); } catch { companyTechnicians = []; }
  }
  sel.innerHTML='';
  sel.appendChild(new Option('— Técnico —',''));
  (companyTechnicians||[]).forEach(t=> sel.appendChild(new Option(t,t)));
  sel.appendChild(new Option('+ Agregar técnico…','__ADD_TECH__'));
  sel.classList.remove('hidden');
  if(current){ sel.value = current.technician || current.initialTechnician || ''; }
  if(!technicianSelectInitialized){
    sel.addEventListener('change', async ()=>{
      if(sel.value === '__ADD_TECH__'){
        const name = prompt('Nombre del técnico (se guardará en mayúsculas):');
        sel.value = ''; // reset temporal
        if(name){
          try{
            companyTechnicians = await API.company.addTechnician(name);
            await setupTechnicianSelect();
            // Reseleccionar el recién agregado si existe
            const upper = String(name).trim().toUpperCase();
            if(companyTechnicians.includes(upper)){
              sel.value = upper;
              if(current?._id){
                try{ current = await API.sales.setTechnician(current._id, upper); syncCurrentIntoOpenList(); renderCapsules(); }catch{}
              }
            }
          }catch(e){ alert(e?.message||'No se pudo agregar'); }
        }
        return;
      }
      if(!current?._id) return;
      try{
        current = await API.sales.setTechnician(current._id, sel.value||'');
        syncCurrentIntoOpenList();
        renderCapsules();
      }catch(e){ alert(e?.message||'No se pudo asignar técnico'); }
    });
    technicianSelectInitialized = true;
  }
}

// ---------- mini resumen cliente/vehículo ----------
function renderMini(){
  const lp = document.getElementById('sv-mini-plate'), ln = document.getElementById('sv-mini-name'), lr = document.getElementById('sv-mini-phone');
  const c = current?.customer || {}, v = current?.vehicle || {};
  if (lp) lp.textContent = v.plate || '—';
  if (ln) ln.textContent = `Cliente: ${c.name || '—'}`;
  if (lr) lr.textContent = `Cel: ${c.phone || '—'}`;
}

// ---------- tabla de venta ----------
function renderSale(){
  const body = document.getElementById('sales-body'), total = document.getElementById('sales-total');
  if (!body) return;
  body.innerHTML = '';

  (current?.items||[]).forEach(it=>{
    const tr = clone('tpl-sale-row');
    tr.querySelector('[data-sku]').textContent = it.sku || '';
    const nameCell = tr.querySelector('[data-name]');
    let label = it.name || '';
    nameCell.textContent = label; // default
    if (it.source === 'inventory') {
      const badge = document.createElement('span'); badge.className='inv-badge'; badge.textContent='INV';
      nameCell.textContent=''; nameCell.appendChild(badge); nameCell.appendChild(document.createTextNode(label));
      tr.classList.add('sale-row-inventory');
    } else if (it.source === 'price') {
      const badge = document.createElement('span'); badge.className='price-badge'; badge.textContent='PRC';
      nameCell.textContent=''; nameCell.appendChild(badge); nameCell.appendChild(document.createTextNode(label));
      tr.classList.add('sale-row-price');
    } else if (it.source === 'service') {
      const badge = document.createElement('span'); badge.className='service-badge'; badge.textContent='SRV';
      nameCell.textContent=''; nameCell.appendChild(badge); nameCell.appendChild(document.createTextNode(label));
      tr.classList.add('sale-row-service');
    }
    const qty = tr.querySelector('.qty'); qty.value = String(it.qty||1);
    tr.querySelector('[data-unit]').textContent  = money(it.unitPrice||0);
    tr.querySelector('[data-total]').textContent = money(it.total||0);

    qty.addEventListener('change', async ()=>{
      const v = Math.max(1, Number(qty.value||1) || 1);
      current = await API.sales.updateItem(current._id, it._id, { qty: v });
      syncCurrentIntoOpenList();
        renderTabs();
      renderSale(); renderWO();
    });

    const actions = tr.querySelector('td:last-child');
    const btnEdit = document.createElement('button'); btnEdit.textContent='Editar $'; btnEdit.className='secondary';
    btnEdit.onclick = async ()=>{
      const v = prompt('Nuevo precio unitario:', String(it.unitPrice||0)); if (v==null) return;
      current = await API.sales.updateItem(current._id, it._id, { unitPrice: Number(v)||0 });
      syncCurrentIntoOpenList();
        renderTabs();
      renderSale(); renderWO();
    };
    const btnZero = document.createElement('button'); btnZero.textContent='Precio 0'; btnZero.className='secondary';
    btnZero.onclick = async ()=>{
      current = await API.sales.updateItem(current._id, it._id, { unitPrice: 0 });
      syncCurrentIntoOpenList();
        renderTabs();
      renderSale(); renderWO();
    };
    const btnDel = tr.querySelector('button.remove');
    btnDel.onclick = async ()=>{
      await API.sales.removeItem(current._id, it._id);
      current = await API.sales.get(current._id);
      syncCurrentIntoOpenList();
        renderTabs();
      renderSale(); renderWO();
    };
    actions.prepend(btnEdit); actions.prepend(btnZero);

    body.appendChild(tr);
  });

  if (total) total.textContent = money(current?.total||0);
  renderMini(); renderCapsules(); setupTechnicianSelect();

  // Leyenda dinámica de orígenes
  try {
    const legendId='sales-legend-origin';
    const items = current?.items||[];
    const kinds = new Set(items.map(i=>i.source).filter(Boolean));
    let legend=document.getElementById(legendId);
    if(kinds.size){
      const parts=[];
      if(kinds.has('inventory')) parts.push('<span class="inv-badge">INV</span> Descuenta stock');
      if(kinds.has('price')) parts.push('<span class="price-badge">PRC</span> Desde lista precios');
      if(kinds.has('service')) parts.push('<span class="service-badge">SRV</span> Servicio / mano de obra');
      const html = parts.join(' &nbsp; ');
      if(!legend){
        legend=document.createElement('div'); legend.id=legendId; legend.style.marginTop='6px'; legend.style.fontSize='11px'; legend.style.opacity='.8';
        body.parentElement?.appendChild(legend);
      }
      legend.innerHTML = html;
    } else if(legend){ legend.remove(); }
  }catch{}
}

// ---------- orden de trabajo (preview simple) ----------
function renderWO(){
  const b = document.getElementById('sv-wo-body'); if (!b) return;
  b.innerHTML = '';
  for(const it of (current?.items||[])){
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${it.name||''}</td><td class="t-center">${String(it.qty||1)}</td>`;
    b.appendChild(tr);
  }
}

// ---------- modal genérico ----------
function openModal(node){
  const modal = document.getElementById('modal'), slot = document.getElementById('modalBody'), x = document.getElementById('modalClose');
  if (!modal||!slot||!x) return;
  slot.replaceChildren(node);
  modal.classList.remove('hidden');
  x.onclick = ()=> modal.classList.add('hidden');
}
function closeModal(){ const m = document.getElementById('modal'); if (m) m.classList.add('hidden'); }

// ---------- QR ----------
function openQR(){
  if (!current) return alert('Crea primero una venta');
  const tpl = document.getElementById('tpl-qr-scanner'); const node = tpl.content.firstElementChild.cloneNode(true);
  openModal(node);

  const video = node.querySelector('#qr-video');
  const canvas = node.querySelector('#qr-canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const sel = node.querySelector('#qr-cam');
  const msg = node.querySelector('#qr-msg');
  const list = node.querySelector('#qr-history');
  const multiModeBtn = node.querySelector('#qr-multi-mode');
  const finishMultiBtn = node.querySelector('#qr-finish-multi');
  const manualInput = node.querySelector('#qr-manual');
  const manualBtn = node.querySelector('#qr-add-manual');

  let stream=null, running=false, detector=null, lastCode='', lastTs=0;
  let multiMode = false; // Modo múltiples items activo

  async function fillCams(){
    try{
      const devs = await navigator.mediaDevices.enumerateDevices();
      const cams = devs.filter(d=>d.kind==='videoinput');
      
      // Detectar si es móvil
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      
      sel.replaceChildren(...cams.map((c,i)=>{
        const o=document.createElement('option'); 
        o.value=c.deviceId; 
        o.textContent=c.label||('Cam '+(i+1)); 
        // Si es móvil y la cámara parece ser trasera (environment), marcarla como seleccionada
        if (isMobile && (c.label?.toLowerCase().includes('back') || c.label?.toLowerCase().includes('rear') || c.label?.toLowerCase().includes('environment'))) {
          o.selected = true;
        }
        return o;
      }));
      
      // Si es móvil y no hay cámara seleccionada, dejar vacío para que start() use facingMode: 'environment'
      if (isMobile && !sel.value) {
        sel.value = '';
      }
    }catch{}
  }

  function stop(){ try{ video.pause(); }catch{}; try{ (stream?.getTracks()||[]).forEach(t=>t.stop()); }catch{}; running=false; }
  async function start(){
    try{
      stop();
      // Forzar cámara trasera en móviles (environment = cámara trasera)
      // Si hay una cámara seleccionada manualmente, usarla; sino, forzar environment
      const videoConstraints = sel.value 
        ? { deviceId: { exact: sel.value } }
        : { facingMode: 'environment' }; // Siempre forzar cámara trasera en móviles
      
      const cs = { video: videoConstraints, audio: false };
      stream = await navigator.mediaDevices.getUserMedia(cs);
      video.srcObject = stream; await video.play();
      running = true;
      if (window.BarcodeDetector) { detector = new BarcodeDetector({ formats: ['qr_code'] }); tickNative(); }
      else { tickCanvas(); }
      msg.textContent='';
    }catch(e){ msg.textContent='No se pudo abrir cámara: '+(e?.message||e?.name||'Desconocido'); }
  }
  function accept(value){
    const normalized = String(value || '').trim().toUpperCase();
    const t = Date.now();
    // Aumentar delay a 3 segundos para evitar escaneos duplicados
    if (lastCode === normalized && t - lastTs < 3000) return false;
    lastCode = normalized;
    lastTs = t;
    return true;
  }

  function parseInventoryCode(raw){
    const text = String(raw || '').trim();
    if (!text) return { itemId:'', sku:'', raw:text };
    const upper = text.toUpperCase();
    if (upper.startsWith('IT:')){
      const parts = text.split(':').map(p => p.trim()).filter(Boolean);
      return {
        companyId: parts[1] || '',
        itemId: parts[2] || '',
        sku: parts[3] || ''
      };
    }
    const match = text.match(/[a-f0-9]{24}/i);
    return { companyId:'', itemId: match ? match[0] : '', sku:'', raw:text };
  }

  // Función para reproducir sonido de confirmación
  function playConfirmSound(){
    try {
      // Crear un sonido de beep usando AudioContext
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      oscillator.frequency.value = 800; // Frecuencia del beep
      oscillator.type = 'sine';
      
      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);
      
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.1);
    } catch (err) {
      console.warn('No se pudo reproducir sonido:', err);
    }
  }
  
  // Función para mostrar popup de confirmación
  function showItemAddedPopup(){
    // Crear popup temporal
    const popup = document.createElement('div');
    popup.textContent = '✓ Item agregado!';
    popup.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: rgba(16, 185, 129, 0.95);
      color: white;
      padding: 20px 40px;
      border-radius: 12px;
      font-size: 18px;
      font-weight: 600;
      z-index: 10000;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
      pointer-events: none;
      animation: fadeInOut 1.5s ease-in-out;
    `;
    
    // Agregar animación CSS si no existe
    if (!document.getElementById('qr-popup-style')) {
      const style = document.createElement('style');
      style.id = 'qr-popup-style';
      style.textContent = `
        @keyframes fadeInOut {
          0% { opacity: 0; transform: translate(-50%, -50%) scale(0.8); }
          20% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
          80% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
          100% { opacity: 0; transform: translate(-50%, -50%) scale(0.8); }
        }
      `;
      document.head.appendChild(style);
    }
    
    document.body.appendChild(popup);
    
    // Remover después de 1.5 segundos
    setTimeout(() => {
      popup.remove();
    }, 1500);
  }

  async function handleCode(raw, fromManual = false){
    const text = String(raw || '').trim();
    if (!text) return;
    if (!fromManual && !accept(text)) return;
    const li=document.createElement('li'); li.textContent=text; list.prepend(li);
    const parsed = parseInventoryCode(text);
    try{
      if (parsed.itemId){
        current = await API.sales.addItem(current._id, { source:'inventory', refId: parsed.itemId, qty:1 });
      } else {
        const candidate = (parsed.sku || text).toUpperCase();
        current = await API.sales.addItem(current._id, { source:'inventory', sku:candidate, qty:1 });
      }
      syncCurrentIntoOpenList();
      renderTabs();
      renderSale(); renderWO();
      
      // Reproducir sonido de confirmación
      playConfirmSound();
      
      // Mostrar popup de confirmación
      showItemAddedPopup();
      
      // Solo cerrar automáticamente si NO está en modo múltiples
      if (!multiMode && !fromManual){ 
        stop(); 
        closeModal(); 
      }
      msg.textContent = '';
    }catch(e){ msg.textContent = e?.message || 'No se pudo agregar'; }
  }

  function onCode(code){
    handleCode(code);
  }
  async function tickNative(){ if(!running) return; try{ const codes=await detector.detect(video); if(codes?.[0]?.rawValue) onCode(codes[0].rawValue); }catch{} requestAnimationFrame(tickNative); }
  function tickCanvas(){
    if(!running) return;
    try{
      const w = video.videoWidth|0, h = video.videoHeight|0;
      if(!w||!h){ requestAnimationFrame(tickCanvas); return; }
      canvas.width=w; canvas.height=h;
      ctx.drawImage(video,0,0,w,h);
      const img = ctx.getImageData(0,0,w,h);
      if (window.jsQR){
        const qr = window.jsQR(img.data, w, h);
        if (qr && qr.data) onCode(qr.data);
      }
    }catch{}
    requestAnimationFrame(tickCanvas);
  }

  // Manejar botón de modo múltiples
  multiModeBtn?.addEventListener('click', () => {
    multiMode = true;
    multiModeBtn.style.display = 'none';
    if (finishMultiBtn) finishMultiBtn.style.display = 'inline-block';
    msg.textContent = 'Modo múltiples items activado. Escanea varios items seguidos.';
  });

  // Manejar botón de terminar modo múltiples
  finishMultiBtn?.addEventListener('click', () => {
    multiMode = false;
    multiModeBtn.style.display = 'inline-block';
    if (finishMultiBtn) finishMultiBtn.style.display = 'none';
    msg.textContent = 'Modo múltiples items desactivado.';
    stop();
    closeModal();
  });

  // Inicialmente ocultar el botón de terminar
  if (finishMultiBtn) finishMultiBtn.style.display = 'none';

  manualBtn?.addEventListener('click', () => {
    const val = manualInput?.value.trim();
    if (!val) return;
    handleCode(val, true);
    manualInput.value = '';
    manualInput.focus();
  });
  manualInput?.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') {
      ev.preventDefault();
      const val = manualInput.value.trim();
      if (val) {
        handleCode(val, true);
        manualInput.value = '';
      }
    }
  });

  node.querySelector('#qr-start').onclick = start;
  node.querySelector('#qr-stop').onclick  = stop;
  fillCams();
}

// ---------- agregar manual ----------
function openAddManual(){
  if (!current) return alert('Crea primero una venta');
  const tpl = document.getElementById('tpl-add-manual'); const node = tpl.content.firstElementChild.cloneNode(true);
  openModal(node);
  node.querySelector('#am-cancel').onclick = ()=> closeModal();
  node.querySelector('#am-add').onclick = async ()=>{
    const name = node.querySelector('#am-name').value.trim();
    const qty  = Number(node.querySelector('#am-qty').value||1)||1;
    const price= Number(node.querySelector('#am-price').value||0)||0;
    const sku  = node.querySelector('#am-sku').value.trim();
    if (!name) return alert('Descripción requerida');
    current = await API.sales.addItem(current._id, { source:'service', sku, name, qty, unitPrice:price });
    syncCurrentIntoOpenList();
    renderTabs();
    closeModal(); renderSale(); renderWO();
  };
}

// ---------- agregar general (picker) ----------
function openAddPicker(){
  if (!current) return alert('Crea primero una venta');
  const node = document.createElement('div'); node.className='card';
  node.innerHTML = `<h3>Agregar</h3>
    <div class="row" style="gap:8px;">
      <button id="go-inv" class="secondary">Desde inventario</button>
      <button id="go-pr"  class="secondary">Desde lista de precios</button>
    </div>`;
  openModal(node);
  node.querySelector('#go-inv').onclick = ()=>{ closeModal(); openPickerInventory(); };
  node.querySelector('#go-pr').onclick  = ()=>{ closeModal(); openPickerPrices(); };
}

// ---------- pickers ----------
async function openPickerInventory(){
  const tpl = document.getElementById('tpl-inv-picker'); const node = tpl.content.firstElementChild.cloneNode(true);
  openModal(node);
  const body=node.querySelector('#p-inv-body'), cnt=node.querySelector('#p-inv-count');
  const qName=node.querySelector('#p-inv-name'), qSku=node.querySelector('#p-inv-sku');
  let page=1, limit=20;
  async function load(reset=false){
    if(reset){ body.innerHTML=''; page=1; }
    const items = await API.inventory.itemsList({ name:qName.value||'', sku:qSku.value||'', page, limit });
    cnt.textContent = items.length;
    body.innerHTML = '';
    for(const it of items){
      const tr = clone('tpl-inv-row');
      tr.querySelector('img.thumb').src = (it.media?.[0]?.thumbUrl || it.media?.[0]?.url || '') || '';
      tr.querySelector('[data-sku]').textContent = it.sku||'';
      tr.querySelector('[data-name]').textContent = it.name||'';
      tr.querySelector('[data-stock]').textContent = it.stock ?? 0;
      tr.querySelector('[data-price]').textContent = money(it.salePrice||0);
      tr.querySelector('button.add').onclick = async ()=>{
        current = await API.sales.addItem(current._id, { source:'inventory', refId: it._id, qty:1 });
        syncCurrentIntoOpenList();
        renderTabs();
        renderSale(); renderWO();
      };
      body.appendChild(tr);
    }
  }
  node.querySelector('#p-inv-search').onclick = ()=> load(true);
  node.querySelector('#p-inv-more').onclick   = ()=> { page++; load(); };
  node.querySelector('#p-inv-cancel').onclick = ()=> closeModal();
  load(true);
}

async function openPickerPrices(){
  const tpl = document.getElementById('tpl-price-picker'); const node = tpl.content.firstElementChild.cloneNode(true);
  openModal(node);
  const head=node.querySelector('#p-pr-head'), body=node.querySelector('#p-pr-body'), cnt=node.querySelector('#p-pr-count');
  const svc=node.querySelector('#p-pr-svc');
  const b=node.querySelector('#p-pr-brand'), l=node.querySelector('#p-pr-line'), e=node.querySelector('#p-pr-engine'), y=node.querySelector('#p-pr-year');
  head.innerHTML = '<th>Marca</th><th>Línea</th><th>Motor</th><th>Año</th><th class="t-right">Precio</th><th></th>';
  try{
    const svcs = await API.servicesList();
    svc.replaceChildren(...(svcs||[]).map(s=>{ const o=document.createElement('option'); o.value=s._id; o.textContent=s.name||('Servicio '+s._id.slice(-6)); return o; }));
  }catch{}
  let page=1, limit=20;
  async function load(reset=false){
    if(reset){ body.innerHTML=''; page=1; }
    const rows = await API.pricesList({ serviceId: svc.value||'', brand:b.value||'', line:l.value||'', engine:e.value||'', year:y.value||'', page, limit });
    cnt.textContent = rows.length;
    body.innerHTML = '';
    for(const pe of rows){
      const tr = clone('tpl-price-row');
      tr.querySelector('[data-brand]').textContent = pe.brand||'';
      tr.querySelector('[data-line]').textContent  = pe.line||'';
      tr.querySelector('[data-engine]').textContent= pe.engine||'';
      tr.querySelector('[data-year]').textContent  = pe.year||'';
      tr.querySelector('[data-price]').textContent = money(pe.total||pe.price||0);
      tr.querySelector('button.add').onclick = async ()=>{
        current = await API.sales.addItem(current._id, { source:'price', refId: pe._id, qty:1 });
        syncCurrentIntoOpenList();
        renderTabs();
        renderSale(); renderWO();
      };
      body.appendChild(tr);
    }
  }
  node.querySelector('#p-pr-search').onclick = ()=> load(true);
  node.querySelector('#p-pr-more').onclick   = ()=> { page++; load(); };
  node.querySelector('#p-pr-cancel').onclick = ()=> closeModal();
  load(true);
}

// ---------- cotización → venta (mini) ----------
async function loadQuote(){
  const node=document.createElement('div'); node.className='card';
  node.innerHTML=`<h3>Selecciona una cotización</h3>
    <div class="row" style="gap:6px;">
      <input id="qh-text" placeholder="Buscar por cliente/placa..." />
      <button id="qh-apply" class="secondary">Buscar</button>
    </div>
    <div id="qh-list" class="list" style="max-height:300px; overflow:auto; margin-top:8px;"></div>
    <div class="row" style="margin-top:8px; justify-content:space-between; align-items:center;">
      <div id="qh-meta" style="font-size:12px; opacity:.8;">Página 1</div>
      <div style="display:flex; gap:6px;">
        <button id="qh-prev" class="secondary" disabled>◀</button>
        <button id="qh-next" class="secondary" disabled>▶</button>
      </div>
    </div>`;
  openModal(node);
  const list=node.querySelector('#qh-list'); const q=node.querySelector('#qh-text');
  const metaEl = node.querySelector('#qh-meta');
  const btnPrev = node.querySelector('#qh-prev');
  const btnNext = node.querySelector('#qh-next');
  let page=1; const pageSize=25;

  async function fetchList(reset=false){
    if(reset) page=1;
    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('pageSize', String(pageSize));
    if(q.value) params.set('q', q.value);
    const url='?'+params.toString();
    let raw=null; let items=[]; let metadata=null;
    try{
      raw = await API.quotesListRaw(url);
      if (Array.isArray(raw)) { items = raw; metadata = null; }
      else { items = raw.items||[]; metadata = raw.metadata||null; }
    }catch(e){
      list.innerHTML = `<div style="padding:8px;color:#c00;">Error: ${e?.message||'No se pudo cargar'}</div>`; return;
    }
    list.innerHTML='';
    items.forEach(qq=>{
      const btn=document.createElement('button'); btn.className='secondary';
      btn.textContent = `${(qq.number||'').toString().padStart(5,'0')} - ${qq?.client?.name||qq?.customer?.name||''} (${qq?.vehicle?.plate||''})`;
      btn.style.cssText='display:block;width:100%;text-align:left;margin-top:6px;';
      btn.onclick = ()=>{ closeModal(); renderQuoteMini(qq); };
      list.appendChild(btn);
    });
    if(items.length===0){
      const empty=document.createElement('div'); empty.style.cssText='padding:8px;opacity:.7;';
      empty.textContent = 'No hay cotizaciones en esta página';
      list.appendChild(empty);
    }
    if(metadata){
      metaEl.textContent = `Página ${metadata.page} de ${metadata.pages} (Total ${metadata.total})`;
      btnPrev.disabled = !metadata.hasPrev;
      btnNext.disabled = !metadata.hasNext;
    } else {
      metaEl.textContent = `Página ${page}`;
      btnPrev.disabled = page<=1;
      btnNext.disabled = items.length < pageSize;
    }
  }
  node.querySelector('#qh-apply').onclick = ()=> fetchList(true);
  btnPrev.onclick = ()=>{ if(page>1){ page--; fetchList(); } };
  btnNext.onclick = ()=>{ page++; fetchList(); };
  fetchList();
}
function renderQuoteMini(q){
  const head = document.getElementById('sv-q-header');
  const body = document.getElementById('sv-q-body');
  if (!head || !body) return;
  lastQuoteLoaded = q || null;

  if (lastQuoteLoaded && current?._id) {
    ensureSaleQuoteLink(lastQuoteLoaded);
  } else if (!lastQuoteLoaded && current?._id) {
    setSaleQuoteLink(current._id, null);
  }

  if (!q) {
    head.textContent = '- ninguna cotizacion cargada -';
    body.innerHTML = '';
    const btnReset = document.getElementById('sv-q-to-sale');
    if (btnReset) btnReset.onclick = null;
    return;
  }

  const clientName = q?.client?.name || q?.customer?.name || '';
  const number = q?.number ?? q?.code ?? q?._id ?? '';
  const titleParts = [`Cotizacion #${number ? String(number) : '-'}`];
  if (clientName) titleParts.push(clientName);
  head.textContent = titleParts.join(' - ');
  body.innerHTML = '';

  const itemsAlready = Array.isArray(current?.items) ? current.items : [];

  (q?.items || []).forEach(it => {
    const unit = Number(it.unitPrice ?? it.unit ?? 0) || 0;
    const qty = Number(it.qty || 1) || 1;
    const total = unit * qty;
    const sku = it.sku || '';
    const name = it.description || it.name || '';
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${sku}</td>
      <td>${name || 'Item'}</td>
      <td class="t-center">${qty}</td>
      <td class="t-right">${money(unit)}</td>
      <td class="t-right">${money(total)}</td>
      <td class="t-center"><button class="add secondary" type="button">+</button></td>
    `;
    const btn = tr.querySelector('button.add');
    const alreadyInSale = itemsAlready.some(ci => {
      const skuMatch = (ci.sku || '').toUpperCase() === String(it.sku || '').toUpperCase();
      const nameMatch = (ci.name || '').toUpperCase() === String(it.description || it.name || '').toUpperCase();
      return skuMatch || nameMatch;
    });
    if (btn) {
      btn.onclick = async () => {
        if (!current) {
          current = await API.sales.start();
          syncCurrentIntoOpenList();
          renderTabs();
        }
        ensureSaleQuoteLink(q);
        try {
          const payload = mapQuoteItemToSale(it);
          current = await API.sales.addItem(current._id, payload);
          syncCurrentIntoOpenList();
          renderTabs();
          renderSale();
          renderWO();
          tr.classList.add('added');
          btn.disabled = true;
          btn.textContent = 'V';
        } catch (err) {
          alert(err?.message || 'No se pudo agregar el item');
        }
      };
    }
    if (alreadyInSale) {
      tr.classList.add('added');
      if (btn) {
        btn.disabled = true;
        btn.textContent = 'V';
      }
    }
    body.appendChild(tr);
  });

  const btnAll = document.getElementById('sv-q-to-sale');
  if (btnAll) {
    btnAll.onclick = async () => {
      if (!q?.items?.length) return;
      if (!current) {
        current = await API.sales.start();
        syncCurrentIntoOpenList();
        renderTabs();
      }
      ensureSaleQuoteLink(q);
      try {
        const batchPayload = q.items.map(mapQuoteItemToSale);
        current = await API.sales.addItemsBatch(current._id, batchPayload);
        syncCurrentIntoOpenList();
        renderTabs();
        renderSale();
        renderWO();
      } catch (err) {
        alert(err?.message || 'No se pudo agregar items (batch)');
        return;
      }
      Array.from(document.querySelectorAll('#sv-q-body tr')).forEach(row => {
        row.classList.add('added');
        const button = row.querySelector('button.add');
        if (button) {
          button.disabled = true;
          button.textContent = 'V';
        }
      });
    };
  }
}

// Aplica cliente/vehículo desde la última cotización cargada
async function applyQuoteCustomerVehicle(){
  if(!lastQuoteLoaded){ alert('Primero selecciona una cotización'); return; }
  try{
    if(!current){
      current = await API.sales.start();
      syncCurrentIntoOpenList();
      renderTabs();
    }
    const q = lastQuoteLoaded;
    ensureSaleQuoteLink(q);
    const payload = {
      customer: {
        name: q?.client?.name || q?.customer?.name || '',
        phone: q?.client?.phone || q?.customer?.phone || '',
        email: q?.client?.email || q?.customer?.email || '',
        address: ''
      },
      vehicle: {
        plate: (q?.vehicle?.plate||'').toUpperCase(),
        brand: (q?.vehicle?.make||q?.vehicle?.brand||'').toUpperCase(),
        line:  (q?.vehicle?.line||'').toUpperCase(),
        engine: (q?.vehicle?.displacement||'').toUpperCase(),
        year: q?.vehicle?.modelYear ? Number(q.vehicle.modelYear)||null : null,
        mileage: null
      }
    };
    current = await API.sales.setCustomerVehicle(current._id, payload);
    syncCurrentIntoOpenList();
    renderTabs(); renderMini();
  }catch(e){ alert(e?.message||'No se pudo aplicar datos'); }
}

// ---------- editar cliente/vehículo ----------
function openEditCV(){
  if(!current) return alert('Crea primero una venta');
  const node = clone('sales-cv-template');
  const c=current.customer||{}, v=current.vehicle||{};
  node.querySelector('#c-name').value = c.name||'';
  node.querySelector('#c-id').value   = c.idNumber||'';
  node.querySelector('#c-phone').value= c.phone||'';
  node.querySelector('#c-email').value= c.email||'';
  node.querySelector('#c-address').value= c.address||'';
  node.querySelector('#v-plate').value = v.plate||'';
  node.querySelector('#v-brand').value = v.brand||'';
  node.querySelector('#v-line').value  = v.line||'';
  node.querySelector('#v-engine').value= v.engine||'';
  node.querySelector('#v-year').value  = v.year??'';
  node.querySelector('#v-mile').value  = v.mileage??'';
  openModal(node);

  const plateInput = $('#v-plate', node);
  const idInput = $('#c-id', node);
  const mileageInput = $('#v-mile', node);
  const watchSelectors = ['#c-name','#c-id','#c-phone','#c-email','#c-address','#v-brand','#v-line','#v-engine','#v-year','#v-mile'];
  watchSelectors.forEach((sel)=>{ const input=$(sel,node); if(input) input.addEventListener('input',()=>{ input.dataset.dirty='1'; }); });

  let lastLookupPlate = '';
  let lastLookupId = '';
  let loadingProfile = false;

  const applyProfile = (profile, plateCode) => {
    if (!profile) return;
    const cust = profile.customer || {};
    const veh = profile.vehicle || {};
    const assign = (selector, value) => {
      const input = $(selector, node);
      if (!input) return;
      if (input.dataset.dirty === '1' && input.dataset.prefilledPlate === plateCode) return;
      const normalized = value == null ? '' : String(value);
      input.value = normalized;
      input.dataset.prefilledPlate = plateCode;
      if (normalized) delete input.dataset.dirty;
    };

    assign('#c-name', cust.name || '');
    assign('#c-id', cust.idNumber || '');
    assign('#c-phone', cust.phone || '');
    assign('#c-email', cust.email || '');
    assign('#c-address', cust.address || '');
    assign('#v-brand', veh.brand || '');
    assign('#v-line', veh.line || '');
    assign('#v-engine', veh.engine || '');
    assign('#v-year', veh.year != null ? veh.year : '');

    if (plateInput) {
      plateInput.value = plateCode;
      plateInput.dataset.prefilledPlate = plateCode;
    }

    if (mileageInput) {
      if (mileageInput.dataset.dirty !== '1') mileageInput.value = '';
      if (veh.mileage != null && veh.mileage !== '') {
        mileageInput.placeholder = `Ultimo: ${veh.mileage}`;
      } else {
        mileageInput.placeholder = '';
      }
    }
  };

  const loadProfile = async (force=false) => {
    if (!plateInput || loadingProfile) return;
    let raw = plateInput.value.trim().toUpperCase();
    plateInput.value = raw;
    if (!raw) return;
    if (!force && raw === lastLookupPlate) return;
    loadingProfile = true;
    try{
      let profile = null;
      try { profile = await API.sales.profileByPlate(raw, { fuzzy: true }); } catch {}
      if (!profile) { try { profile = await API.sales.profileByPlate(raw); } catch {} }
      if (profile) {
        applyProfile(profile, raw);
      }
    }catch(err){ console.warn('No se pudo cargar perfil', err?.message||err); }
    finally{
      loadingProfile = false;
      lastLookupPlate = raw;
    }
  };

  const loadProfileById = async (force = false) => {
    if (!idInput || loadingProfile) return;
    const raw = String(idInput.value || '').trim();
    if (!raw) return;
    if (!force && raw === lastLookupId) return;
    loadingProfile = true;
    try {
      const profile = await API.sales.profileById(raw);
      if (profile) {
        // Mantener placa actual si el usuario ya la ingresó manualmente; si viene en el perfil y el campo no está sucio, aplícala
        const plateCode = (plateInput?.value || '').trim().toUpperCase() || (profile.vehicle?.plate || '').toUpperCase();
        applyProfile(profile, plateCode);
      }
    } catch (err) {
      console.warn('No se pudo cargar perfil por ID', err?.message || err);
    } finally {
      loadingProfile = false;
      lastLookupId = raw;
    }
  };

  if (plateInput) {
    plateInput.addEventListener('input', (ev)=>{
      const upper = ev.target.value.toUpperCase();
      if (ev.target.value !== upper) ev.target.value = upper;
      if(current){
        current.vehicle = current.vehicle||{};
        current.vehicle.plate = upper;
        syncCurrentIntoOpenList();
        renderCapsules();
      }
    });
    plateInput.addEventListener('change', ()=> loadProfile(true));
    plateInput.addEventListener('keydown', (ev)=>{
      if (ev.key === 'Enter') {
        ev.preventDefault();
        loadProfile(true);
      }
    });
  }

  if (idInput) {
    idInput.addEventListener('change', () => loadProfileById(true));
    idInput.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') { ev.preventDefault(); loadProfileById(true); }
    });
  }

  if (mileageInput) {
    mileageInput.addEventListener('input', ()=>{ mileageInput.dataset.dirty='1'; });
  }

  if (plateInput && plateInput.value && !c.name && !c.phone && !v.brand && !v.line && !v.engine) {
    loadProfile(true);
  }

  // Live update brand/line/engine in capsule
  ['#v-brand','#v-line','#v-engine'].forEach(sel=>{
    const input=$(sel,node); if(!input) return;
    input.addEventListener('input', ()=>{
      if(!current) return;
      current.vehicle = current.vehicle||{};
      current.vehicle.brand = $('#v-brand',node).value.trim().toUpperCase();
      current.vehicle.line = $('#v-line',node).value.trim().toUpperCase();
      current.vehicle.engine = $('#v-engine',node).value.trim().toUpperCase();
      syncCurrentIntoOpenList();
      renderCapsules();
    });
  });

  node.querySelector('#sales-save-cv').onclick = async ()=>{
    const payload = {
      customer:{
        name: $('#c-name',node).value.trim(),
        idNumber: $('#c-id',node).value.trim(),
        phone: $('#c-phone',node).value.trim(),
        email: $('#c-email',node).value.trim(),
        address: $('#c-address',node).value.trim()
      },
      vehicle:{
        plate: $('#v-plate',node).value.trim(),
        brand: $('#v-brand',node).value.trim(),
        line:  $('#v-line',node).value.trim(),
        engine:$('#v-engine',node).value.trim(),
        year:  Number($('#v-year',node).value||'')||null,
        mileage:Number($('#v-mile',node).value||'')||null
      }
    };
    try{
      await API.sales.setCustomerVehicle(current._id, payload);
      current = await API.sales.get(current._id);
      syncCurrentIntoOpenList();
      renderCapsules();
      renderMini();
      closeModal();
    }catch(e){ alert(e?.message||'No se pudo guardar'); }
  };
}

// ---------- historial ----------
function openSalesHistory(){
  const node = clone('tpl-sales-history');
  openModal(node);
  const from=$('#sh-from',node), to=$('#sh-to',node), plate=$('#sh-plate',node);
  const body=$('#sh-body',node), total=$('#sh-total',node);
  const prevBtn=$('#sh-prev',node), nextBtn=$('#sh-next',node), pagEl=$('#sh-pag',node);
  let page = 1;
  // Set default date range to today ONLY when no plate filter is used
  try {
    const setToday = !plate.value; // if plate is empty
    if (setToday){
      const d = new Date();
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth()+1).padStart(2,'0');
      const dd = String(d.getDate()).padStart(2,'0');
      const today = `${yyyy}-${mm}-${dd}`;
      from.value = from.value || today;
      to.value = to.value || today;
    }
  } catch {}
  async function load(){
    const params = { status:'closed' };
    const hasPlate = !!plate.value.trim();
    if (hasPlate){
      params.plate = plate.value.trim();
      params.limit = 50;
    } else {
      if(from.value) params.from=from.value;
      if(to.value)   params.to=to.value;
      params.limit = 50;
    }
    params.page = page;
    const res = await API.sales.list(params);
    body.innerHTML=''; let acc=0;
    (res?.items||[]).forEach(s=>{
      const tr=document.createElement('tr');
      const date=new Date(s.createdAt); const d=date.toLocaleDateString();
      const num = padSaleNumber(s.number || s._id || '');
      tr.innerHTML = `<td>${num}</td><td>${s?.vehicle?.plate||''}</td><td>${d}</td><td class="t-right">${money(s.total||0)}</td><td class="t-right"><button class="secondary" data-id="${s._id}">Ver</button></td>`;
      tr.querySelector('button').onclick = ()=> openSaleHistoryDetail(s._id);
      body.appendChild(tr); acc += Number(s.total||0);
    });
    total.textContent = money(acc);
    // pagination state
    try{
      const cur = Number(res?.page||page||1);
      const lim = Number(res?.limit||params.limit||50);
      const tot = Number(res?.total||0);
      const pages = Math.max(1, Math.ceil((tot||0)/(lim||50)));
      page = Math.min(Math.max(1, cur), pages);
      if (pagEl) pagEl.textContent = `Página ${page} de ${pages} · ${tot} registros`;
      if (prevBtn) prevBtn.disabled = page <= 1;
      if (nextBtn) nextBtn.disabled = page >= pages;
    } catch{}
  }
  $('#sh-search',node).onclick = ()=>{ page = 1; load(); };
  if (prevBtn) prevBtn.onclick = ()=>{ if(page>1){ page--; load(); } };
  if (nextBtn) nextBtn.onclick = ()=>{ page++; load(); };
  load();
}

async function openSaleHistoryDetail(id){
  if (!id) return;
  try{
    const sale = await API.sales.get(id);
    const node = clone('tpl-sale-history-detail');
    if (!node) return;
    node.querySelector('[data-number]').textContent = padSaleNumber(sale.number || sale._id || '');
    node.querySelector('[data-date]').textContent = sale.createdAt ? new Date(sale.createdAt).toLocaleString() : '';
    node.querySelector('[data-status]').textContent = sale.status || 'N/A';
    node.querySelector('[data-customer]').textContent = describeCustomer(sale.customer);
    node.querySelector('[data-vehicle]').textContent = describeVehicle(sale.vehicle);
    const itemsBody = node.querySelector('[data-items]');
    itemsBody.innerHTML = '';
    (sale.items || []).forEach(it => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${it.sku || ''}</td><td>${it.name || ''}</td><td class="t-center">${it.qty || 0}</td><td class="t-right">${money(it.unitPrice || 0)}</td><td class="t-right">${money(it.total || 0)}</td>`;
      itemsBody.appendChild(tr);
    });
    // If no items (e.g., legacy import), show notes as a hint of work done
    if ((!sale.items || sale.items.length === 0) && sale.notes) {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td colspan="5" class="muted">Notas: ${sale.notes.replace(/\n/g,'<br/>')}</td>`;
      itemsBody.appendChild(tr);
    }
    node.querySelector('[data-subtotal]').textContent = money(sale.subtotal || 0);
    node.querySelector('[data-total]').textContent = money(sale.total || 0);
    // Render pagos (multi-payment)
    try {
      const payBody = node.querySelector('[data-payments]');
      const payTotalEl = node.querySelector('[data-payments-total]');
      if (payBody && payTotalEl) {
        payBody.innerHTML='';
        const list = Array.isArray(sale.paymentMethods) && sale.paymentMethods.length ? sale.paymentMethods : (sale.paymentMethod ? [{ method: sale.paymentMethod, amount: sale.total||0, accountId: null }] : []);
        let acc = 0;
        list.forEach(p => {
          const tr = document.createElement('tr');
            const method = (p.method||'').toString().toUpperCase();
            const accountName = p.account?.name || p.accountName || p.accountId || '';
            const amt = Number(p.amount||0);
            acc += amt;
            tr.innerHTML = `<td>${method}</td><td>${accountName||'—'}</td><td class="t-right">${money(amt)}</td>`;
            payBody.appendChild(tr);
        });
        payTotalEl.textContent = money(acc);
        if(!list.length){
          const tr=document.createElement('tr'); tr.innerHTML='<td colspan="3" class="t-center muted">Sin información de pagos</td>'; payBody.appendChild(tr);
        }
      }
    } catch(e) { console.warn('render pagos historial', e); }
    const printBtn = node.querySelector('[data-print]');
    if (printBtn) printBtn.onclick = () => printSaleTicket(sale);
    openModal(node);
  }catch(e){ alert(e?.message || 'No se pudo cargar la venta'); }
}
// ---------- live (SSE) ----------
function connectLive(){
  if (es || !API?.live?.connect) return;
  try{
    es = API.live.connect((event, data)=>{
      if (event === 'sale:started'){
        refreshOpenSales({ focusId: current?._id || null });
        return;
      }
      if (!data?.id) return;
      if (event === 'sale:updated'){
        if (current && current._id === data.id){
          API.sales.get(current._id)
            .then(async (s)=>{ current = s; syncCurrentIntoOpenList(); renderTabs(); renderSale(); renderWO(); await renderQuoteForCurrentSale(); })
            .catch((err)=> { console.warn('No se pudo refrescar venta en vivo', err); refreshOpenSales({ focusId: current?._id || null }); });
        } else {
          refreshOpenSales({ focusId: current?._id || null });
        }
        return;
      }
      if (event === 'sale:closed' || event === 'sale:cancelled'){
        setSaleQuoteLink(data.id, null);
        if (current && current._id === data.id) current = null;
        refreshOpenSales({ focusId: current?._id || null });
      }
    });
  }catch(e){ console.warn('SSE no disponible:', e?.message||e); }
}

// ---------- init ----------
export function initSales(){
  const ventas = document.getElementById('tab-ventas'); if (!ventas) return;

  // Sub-feature gating: ventas.importarCotizacion y ventas.ordenesTrabajo
  (async ()=>{
    await loadFeatureOptionsAndRestrictions();
    const fo = getFeatureOptions();
    const v = (fo.ventas||{});
    // Importar cotización (botones relacionados)
    const canImport = v.importarCotizacion !== false; // default true
    gateElement(canImport, '#sv-loadQuote');
    gateElement(canImport, '#sv-applyQuoteCV');
    gateElement(canImport, '#sv-q-to-sale');
    // Orden de trabajo (imprimir)
    const canWO = v.ordenesTrabajo !== false; // default true
    gateElement(canWO, '#sv-wo-card');
    gateElement(canWO, '#sv-print-wo');
  })();

  try { localStorage.removeItem('sales:lastQuoteId'); } catch {}

  refreshOpenSales();
  startSalesAutoRefresh();

  document.getElementById('sales-start')?.addEventListener('click', async (ev)=>{
    if (starting) return; starting=true;
    const btn = ev.currentTarget; if (btn) btn.disabled=true;
    try{
      const s = await API.sales.start();
      current = s;
      syncCurrentIntoOpenList();
        renderTabs(); renderSale(); renderWO(); await renderQuoteForCurrentSale();
      await refreshOpenSales({ focusId: s._id, preferCurrent: s });
    }catch(e){ alert(e?.message||'No se pudo crear la venta'); }
    finally{ starting=false; if(btn) btn.disabled=false; }
  });

  document.getElementById('sales-scan-qr')?.addEventListener('click', openQR);
  document.getElementById('sales-add-general')?.addEventListener('click', openAddPicker);
  document.getElementById('sales-add-manual')?.addEventListener('click', openAddManual);
  document.getElementById('sales-history')?.addEventListener('click', openSalesHistory);
  document.getElementById('sv-edit-cv')?.addEventListener('click', openEditCV);
  document.getElementById('sv-loadQuote')?.addEventListener('click', loadQuote);
  document.getElementById('sv-applyQuoteCV')?.addEventListener('click', applyQuoteCustomerVehicle);

  document.getElementById('sales-close')?.addEventListener('click', async ()=>{
    if (!current) return;
    openCloseModal();
  });

  document.getElementById('sales-print')?.addEventListener('click', async ()=>{
    if (!current) return;
    try{
      const fresh = await API.sales.get(current._id);
      printSaleTicket(fresh);
    }catch(e){ alert(e?.message||'No se pudo imprimir'); }
  });

  connectLive();
}





