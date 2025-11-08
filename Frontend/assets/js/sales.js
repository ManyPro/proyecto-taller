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

  // Mostrar slots abiertos pendientes primero
  if (current?.openSlots && current.openSlots.length > 0) {
    const incompleteSlots = current.openSlots.filter(slot => !slot.completed);
    incompleteSlots.forEach((slot, slotIdx) => {
      const tr = clone('tpl-sale-row');
      tr.querySelector('[data-sku]').textContent = 'SLOT';
      const nameCell = tr.querySelector('[data-name]');
      nameCell.innerHTML = '';
      const badge = document.createElement('span');
      badge.className = 'open-slot-badge';
      badge.textContent = 'SLOT ABIERTO';
      badge.style.cssText = 'background:var(--warning, #f59e0b);color:white;padding:2px 6px;border-radius:4px;font-size:10px;font-weight:600;margin-right:8px;';
      nameCell.appendChild(badge);
      nameCell.appendChild(document.createTextNode(slot.slotName || 'Slot abierto'));
      tr.classList.add('sale-row-open-slot');
      
      const qty = tr.querySelector('.qty');
      qty.value = String(slot.qty || 1);
      qty.disabled = true; // No se puede editar cantidad de slots abiertos
      
      tr.querySelector('[data-unit]').textContent = money(slot.estimatedPrice || 0);
      tr.querySelector('[data-total]').textContent = money((slot.qty || 1) * (slot.estimatedPrice || 0));
      
      const actions = tr.querySelector('td:last-child');
      actions.innerHTML = '';
      const btnComplete = document.createElement('button');
      btnComplete.className = 'primary';
      btnComplete.textContent = '📷 Completar con QR';
      btnComplete.style.cssText = 'padding:6px 12px;border-radius:4px;border:none;cursor:pointer;font-size:12px;';
      btnComplete.onclick = async () => {
        try {
          await completeOpenSlotWithQR(current._id, slotIdx, slot);
        } catch (err) {
          alert('Error: ' + (err?.message || 'No se pudo completar el slot'));
        }
      };
      actions.appendChild(btnComplete);
      
      body.appendChild(tr);
    });
  }
  
  // Agrupar items por combo para renderizarlos juntos
  // Los combos se agregan con SKU "COMBO-xxx" y los items siguientes hasta el próximo combo son parte de él
  const items = current?.items || [];
  let i = 0;
  
  // Cache para almacenar el número de productos de cada combo
  const comboProductsCountCache = new Map();
  
  while (i < items.length) {
    const it = items[i];
    const sku = String(it.sku || '').toUpperCase();
    const isCombo = sku.startsWith('COMBO-');
    
    if (isCombo) {
      // Encontramos un combo, agrupar items siguientes hasta el próximo combo o fin
      const comboItems = [it];
      i++;
      
      // Obtener el número de productos del combo desde el PriceEntry (con cache)
      let comboProductsCount = 0;
      if (it.refId) {
        if (comboProductsCountCache.has(it.refId)) {
          comboProductsCount = comboProductsCountCache.get(it.refId);
        } else {
          // Intentar obtener el PriceEntry del combo para saber cuántos productos tiene
          // Por ahora, usamos una heurística mejorada
          comboProductsCount = null; // null significa que no sabemos
        }
      }
      
      // Agregar items consecutivos que son parte del combo
      // Los items del combo pueden tener:
      // - SKU que empieza con "CP-" (producto del combo sin vincular)
      // - source 'inventory' o 'price' y venir inmediatamente después del combo
      // Detener si encontramos:
      // - Otro combo
      // - Más items de los que tiene el combo (si sabemos el número)
      // - Un item que claramente no pertenece al combo
      while (i < items.length) {
        const nextIt = items[i];
        const nextSku = String(nextIt.sku || '').toUpperCase();
        
        // Si encontramos otro combo, detener
        if (nextSku.startsWith('COMBO-')) {
          break;
        }
        
        // Si sabemos cuántos productos tiene el combo y ya agregamos todos, detener
        if (comboProductsCount !== null && comboItems.length - 1 >= comboProductsCount) {
          break;
        }
        
        // Si el SKU empieza con "CP-", es definitivamente parte del combo
        if (nextSku.startsWith('CP-')) {
          comboItems.push(nextIt);
          i++;
          continue;
        }
        
        // Heurística conservadora: solo agregar items que claramente son parte del combo
        // Los items del combo pueden tener:
        // - SKU que empieza con "CP-" (definitivamente parte del combo) - ya manejado arriba
        // - Precio 0 (parte del combo sin precio)
        // NOTA: Los items del combo con item vinculado pueden tener precio > 0, pero sin una forma
        // confiable de identificarlos, preferimos ser conservadores y solo agregar items con precio 0 o CP-
        // para evitar agregar items independientes al combo
        
        const nextUnitPrice = Number(nextIt.unitPrice || 0);
        const nextTotal = Number(nextIt.total || 0);
        
        if (nextUnitPrice === 0 && nextTotal === 0) {
          // Item con precio 0, probablemente parte del combo
          comboItems.push(nextIt);
          i++;
        } else {
          // Item con precio > 0 y no es CP-
          // Para evitar agregar items independientes (como el amortiguador), no lo agregamos al combo
          // Si el combo tiene items vinculados con precio, estos se mostrarán como items independientes
          // pero es preferible a mostrar items independientes como parte del combo
          break;
        }
      }
      
      renderComboGroup(body, it.refId, comboItems);
    } else {
      // Item normal, renderizar individualmente
      renderSaleItem(body, it);
      i++;
    }
  }
  
  function renderComboGroup(container, comboRefId, comboItemsList) {
    if (comboItemsList.length === 0) return;
    
    // El primer item es el combo principal
    const comboMain = comboItemsList[0];
    const comboSubItems = comboItemsList.slice(1);
    
    // Renderizar combo principal (más grande)
    const comboTr = clone('tpl-sale-row');
    comboTr.classList.add('sale-row-combo-main');
    comboTr.style.cssText = 'background:rgba(147, 51, 234, 0.1);border-left:4px solid #9333ea;font-weight:600;';
    
    comboTr.querySelector('[data-sku]').textContent = comboMain.sku || '';
    const nameCell = comboTr.querySelector('[data-name]');
    nameCell.innerHTML = '';
    const badge = document.createElement('span');
    badge.className = 'combo-badge';
    badge.textContent = 'COM';
    badge.style.cssText = 'background:#9333ea;color:white;padding:4px 10px;border-radius:6px;font-size:14px;font-weight:700;margin-right:10px;display:inline-block;';
    nameCell.appendChild(badge);
    nameCell.appendChild(document.createTextNode(comboMain.name || ''));
    
    const qty = comboTr.querySelector('.qty');
    qty.value = String(comboMain.qty || 1);
    qty.style.cssText = 'font-weight:600;font-size:14px;';
    
    const unitCell = comboTr.querySelector('[data-unit]');
    unitCell.textContent = money(comboMain.unitPrice || 0);
    unitCell.style.cssText = 'font-weight:700;font-size:16px;color:#9333ea;';
    
    const totalCell = comboTr.querySelector('[data-total]');
    totalCell.textContent = money(comboMain.total || 0);
    totalCell.style.cssText = 'font-weight:700;font-size:16px;color:#9333ea;';
    
    setupItemActions(comboTr, comboMain);
    container.appendChild(comboTr);
    
    // Renderizar items del combo (indentados)
    comboSubItems.forEach(subItem => {
      const subTr = clone('tpl-sale-row');
      subTr.classList.add('sale-row-combo-item');
      subTr.style.cssText = 'background:rgba(147, 51, 234, 0.05);padding-left:32px;border-left:2px solid #9333ea;margin-left:16px;';
      
      subTr.querySelector('[data-sku]').textContent = subItem.sku || '';
      const subNameCell = subTr.querySelector('[data-name]');
      subNameCell.innerHTML = '';
      
      // Determinar badge según el tipo de item del combo
      let badgeText = 'PRD';
      let badgeColor = '#86efac'; // Verde claro
      if (subItem.source === 'inventory') {
        badgeText = 'INV';
        badgeColor = '#10b981'; // Verde
      } else if (String(subItem.sku || '').toUpperCase().startsWith('SRV-')) {
        badgeText = 'SRV';
        badgeColor = '#3b82f6'; // Azul
      }
      
      const subBadge = document.createElement('span');
      subBadge.textContent = badgeText;
      subBadge.style.cssText = `background:${badgeColor};color:white;padding:2px 6px;border-radius:4px;font-size:10px;font-weight:600;margin-right:8px;`;
      subNameCell.appendChild(subBadge);
      subNameCell.appendChild(document.createTextNode(subItem.name || ''));
      
      const subQty = subTr.querySelector('.qty');
      subQty.value = String(subItem.qty || 1);
      
      subTr.querySelector('[data-unit]').textContent = money(subItem.unitPrice || 0);
      subTr.querySelector('[data-total]').textContent = money(subItem.total || 0);
      
      setupItemActions(subTr, subItem);
      container.appendChild(subTr);
    });
  }
  
  function renderSaleItem(container, it) {
    const tr = clone('tpl-sale-row');
    tr.querySelector('[data-sku]').textContent = it.sku || '';
    const nameCell = tr.querySelector('[data-name]');
    let label = it.name || '';
    nameCell.textContent = label; // default
    
    const sku = String(it.sku || '').toUpperCase();
    
    // Determinar tipo y badge
    if (it.source === 'inventory') {
      const badge = document.createElement('span');
      badge.className = 'inv-badge';
      badge.textContent = 'INV';
      badge.style.cssText = 'background:#10b981;color:white;padding:2px 6px;border-radius:4px;font-size:10px;font-weight:600;margin-right:8px;';
      nameCell.textContent = '';
      nameCell.appendChild(badge);
      nameCell.appendChild(document.createTextNode(label));
      tr.classList.add('sale-row-inventory');
    } else if (sku.startsWith('COMBO-')) {
      // Combo (no debería llegar aquí si está agrupado, pero por si acaso)
      const badge = document.createElement('span');
      badge.className = 'combo-badge';
      badge.textContent = 'COM';
      badge.style.cssText = 'background:#9333ea;color:white;padding:2px 6px;border-radius:4px;font-size:10px;font-weight:600;margin-right:8px;';
      nameCell.textContent = '';
      nameCell.appendChild(badge);
      nameCell.appendChild(document.createTextNode(label));
      tr.classList.add('sale-row-combo');
    } else if (sku.startsWith('SRV-') || it.source === 'service') {
      const badge = document.createElement('span');
      badge.className = 'service-badge';
      badge.textContent = 'SRV';
      badge.style.cssText = 'background:#3b82f6;color:white;padding:2px 6px;border-radius:4px;font-size:10px;font-weight:600;margin-right:8px;';
      nameCell.textContent = '';
      nameCell.appendChild(badge);
      nameCell.appendChild(document.createTextNode(label));
      tr.classList.add('sale-row-service');
    } else if (it.source === 'price' || sku.startsWith('CP-') || sku.startsWith('PRD-')) {
      // Producto sin item linkeado
      const badge = document.createElement('span');
      badge.className = 'product-badge';
      badge.textContent = 'PRD';
      badge.style.cssText = 'background:#86efac;color:#065f46;padding:2px 6px;border-radius:4px;font-size:10px;font-weight:600;margin-right:8px;';
      nameCell.textContent = '';
      nameCell.appendChild(badge);
      nameCell.appendChild(document.createTextNode(label));
      tr.classList.add('sale-row-product');
    }
    
    const qty = tr.querySelector('.qty');
    qty.value = String(it.qty || 1);
    tr.querySelector('[data-unit]').textContent = money(it.unitPrice || 0);
    tr.querySelector('[data-total]').textContent = money(it.total || 0);
    
    setupItemActions(tr, it);
    container.appendChild(tr);
  }
  
  function setupItemActions(tr, it) {
    const qty = tr.querySelector('.qty');
    qty.addEventListener('change', async () => {
      const v = Math.max(1, Number(qty.value || 1) || 1);
      current = await API.sales.updateItem(current._id, it._id, { qty: v });
      syncCurrentIntoOpenList();
      renderTabs();
      renderSale();
      renderWO();
    });

    const actions = tr.querySelector('td:last-child');
    const btnEdit = document.createElement('button');
    btnEdit.textContent = 'Editar $';
    btnEdit.className = 'secondary';
    btnEdit.onclick = async () => {
      const v = prompt('Nuevo precio unitario:', String(it.unitPrice || 0));
      if (v == null) return;
      current = await API.sales.updateItem(current._id, it._id, { unitPrice: Number(v) || 0 });
      syncCurrentIntoOpenList();
      renderTabs();
      renderSale();
      renderWO();
    };
    const btnZero = document.createElement('button');
    btnZero.textContent = 'Precio 0';
    btnZero.className = 'secondary';
    btnZero.onclick = async () => {
      current = await API.sales.updateItem(current._id, it._id, { unitPrice: 0 });
      syncCurrentIntoOpenList();
      renderTabs();
      renderSale();
      renderWO();
    };
    const btnDel = tr.querySelector('button.remove');
    btnDel.onclick = async () => {
      await API.sales.removeItem(current._id, it._id);
      current = await API.sales.get(current._id);
      syncCurrentIntoOpenList();
      renderTabs();
      renderSale();
      renderWO();
    };
    actions.prepend(btnEdit);
    actions.prepend(btnZero);
  }

  if (total) total.textContent = money(current?.total||0);
  renderMini(); renderCapsules(); setupTechnicianSelect();

  // Leyenda dinámica de orígenes
  try {
    const legendId='sales-legend-origin';
    const items = current?.items||[];
    const hasInventory = items.some(i=>i.source === 'inventory');
    const hasCombo = items.some(i=>String(i.sku||'').toUpperCase().startsWith('COMBO-'));
    const hasService = items.some(i=>i.source === 'service' || String(i.sku||'').toUpperCase().startsWith('SRV-'));
    const hasProduct = items.some(i=>i.source === 'price' && !String(i.sku||'').toUpperCase().startsWith('COMBO-') && !String(i.sku||'').toUpperCase().startsWith('SRV-'));
    
    let legend=document.getElementById(legendId);
    if(hasInventory || hasCombo || hasService || hasProduct){
      const parts=[];
      if(hasInventory) parts.push('<span style="background:#10b981;color:white;padding:2px 6px;border-radius:4px;font-size:10px;font-weight:600;">INV</span> Inventario');
      if(hasCombo) parts.push('<span style="background:#9333ea;color:white;padding:2px 6px;border-radius:4px;font-size:10px;font-weight:600;">COM</span> Combo');
      if(hasService) parts.push('<span style="background:#3b82f6;color:white;padding:2px 6px;border-radius:4px;font-size:10px;font-weight:600;">SRV</span> Servicio');
      if(hasProduct) parts.push('<span style="background:#86efac;color:#065f46;padding:2px 6px;border-radius:4px;font-size:10px;font-weight:600;">PRD</span> Producto');
      const html = parts.join(' &nbsp; ');
      if(!legend){
        legend=document.createElement('div'); legend.id=legendId; legend.style.marginTop='6px'; legend.style.fontSize='11px'; legend.style.opacity='.8';
        body.parentElement?.appendChild(legend);
      }
      legend.innerHTML = html;
    } else if(legend){ legend.remove(); }
  }catch{}
}

// ---------- completar slot abierto con QR ----------
async function completeOpenSlotWithQR(saleId, slotIndex, slot) {
  return new Promise((resolve, reject) => {
    // Abrir modal QR similar a openQR pero específico para completar slot
    const tpl = document.getElementById('tpl-qr-scanner');
    if (!tpl) {
      reject(new Error('Template de QR no encontrado'));
      return;
    }
    const node = tpl.content.firstElementChild.cloneNode(true);
    openModal(node);
    
    const video = node.querySelector('#qr-video');
    const canvas = node.querySelector('#qr-canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const sel = node.querySelector('#qr-cam');
    const msg = node.querySelector('#qr-msg');
    const list = node.querySelector('#qr-history');
    const manualInput = node.querySelector('#qr-manual');
    const manualBtn = node.querySelector('#qr-add-manual');
    
    let stream = null, running = false, detector = null, lastCode = '', lastTs = 0;
    let cameraDisabled = false;
    
    msg.textContent = `Escanea el código QR del item para completar el slot: "${slot.slotName}"`;
    
    async function fillCams() {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(d => d.kind === 'videoinput');
        sel.innerHTML = '<option value="">Seleccionar cámara...</option>';
        videoDevices.forEach((dev, idx) => {
          const opt = document.createElement('option');
          opt.value = dev.deviceId;
          opt.textContent = dev.label || `Cámara ${idx + 1}`;
          sel.appendChild(opt);
        });
        if (videoDevices.length === 1) sel.value = videoDevices[0].deviceId;
      } catch (err) {
        console.warn('No se pudieron listar cámaras:', err);
      }
    }
    
    function stop() {
      running = false;
      if (stream) {
        stream.getTracks().forEach(t => t.stop());
        stream = null;
      }
      if (video.srcObject) video.srcObject = null;
    }
    
    async function start() {
      if (running || cameraDisabled) return;
      stop();
      const deviceId = sel.value;
      if (!deviceId) {
        msg.textContent = 'Selecciona una cámara';
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { deviceId: { exact: deviceId }, facingMode: 'environment' }
        });
        video.srcObject = stream;
        await video.play();
        running = true;
        msg.textContent = `Escaneando para slot: "${slot.slotName}"...`;
        tickNative();
      } catch (err) {
        console.error('Error al iniciar cámara:', err);
        msg.textContent = 'Error al acceder a la cámara';
      }
    }
    
    function parseInventoryCode(text) {
      if (text.toUpperCase().startsWith('IT:')) {
        const parts = text.split(':').map(p => p.trim()).filter(Boolean);
        return { itemId: parts.length >= 3 ? parts[2] : (parts.length === 2 ? parts[1] : null) };
      }
      return { sku: text.toUpperCase() };
    }
    
    function accept(text) {
      const now = Date.now();
      if (text === lastCode && (now - lastTs) < 2000) return false;
      lastCode = text;
      lastTs = now;
      return true;
    }
    
    async function handleCode(raw, fromManual = false) {
      const text = String(raw || '').trim();
      if (!text) return;
      if (!fromManual && !accept(text)) return;
      
      cameraDisabled = true;
      stop();
      
      const li = document.createElement('li');
      li.textContent = text;
      list.prepend(li);
      
      const parsed = parseInventoryCode(text);
      try {
        let itemId = null;
        let sku = null;
        
        if (parsed.itemId) {
          itemId = parsed.itemId;
        } else if (parsed.sku) {
          sku = parsed.sku;
        }
        
        const result = await API.sales.completeSlot(saleId, slotIndex, itemId, sku);
        current = result.sale;
        syncCurrentIntoOpenList();
        renderTabs();
        renderSale();
        renderWO();
        closeModal();
        playConfirmSound();
        showItemAddedPopup();
        resolve(result);
      } catch (err) {
        cameraDisabled = false;
        msg.textContent = 'Error: ' + (err?.message || 'No se pudo completar el slot');
        msg.style.color = 'var(--danger, #ef4444)';
        reject(err);
      }
    }
    
    async function tickNative() {
      if (!running || cameraDisabled) return;
      try {
        if (video.readyState === video.HAVE_ENOUGH_DATA) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          
          if (typeof BarcodeDetector !== 'undefined') {
            if (!detector) detector = new BarcodeDetector({ formats: ['qr_code'] });
            const codes = await detector.detect(imageData);
            if (codes && codes.length > 0) {
              await handleCode(codes[0].rawValue);
              return;
            }
          }
          
          // Fallback a jsQR si está disponible
          if (typeof jsQR !== 'undefined') {
            const code = jsQR(imageData.data, imageData.width, imageData.height);
            if (code && code.data) {
              await handleCode(code.data);
              return;
            }
          }
        }
      } catch (err) {
        console.warn('Error en detección QR:', err);
      }
      requestAnimationFrame(tickNative);
    }
    
    sel.addEventListener('change', start);
    manualBtn?.addEventListener('click', () => {
      const val = manualInput?.value.trim();
      if (!val) return;
      handleCode(val, true);
      manualInput.value = '';
    });
    manualInput?.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') {
        ev.preventDefault();
        const val = manualInput.value.trim();
        if (val) handleCode(val, true);
      }
    });
    
    fillCams();
    
    // Limpiar al cerrar modal
    const originalClose = window.closeModal;
    window.closeModal = function() {
      stop();
      if (originalClose) originalClose();
      window.closeModal = originalClose;
      reject(new Error('Cancelado por el usuario'));
    };
  });
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
  const singleModeBtn = node.querySelector('#qr-single-mode');
  const multiModeBtn = node.querySelector('#qr-multi-mode');
  const finishMultiBtn = node.querySelector('#qr-finish-multi');
  const manualInput = node.querySelector('#qr-manual');
  const manualBtn = node.querySelector('#qr-add-manual');

  let stream=null, running=false, detector=null, lastCode='', lastTs=0;
  let multiMode = false; // Modo múltiples items activo
  let cameraDisabled = false; // Control para deshabilitar cámara durante delay

  async function fillCams(){
    try{
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      
      // En móviles, no intentar enumerar sin permisos - simplemente crear opción por defecto
      // Los permisos se solicitarán cuando se presione el botón de iniciar
      if (isMobile) {
        const defaultOpt = document.createElement('option');
        defaultOpt.value = '';
        defaultOpt.textContent = 'Cámara trasera (automática)';
        sel.replaceChildren(defaultOpt);
        sel.value = '';
        return;
      }
      
      // En desktop, intentar enumerar dispositivos
      try {
        const devs = await navigator.mediaDevices.enumerateDevices();
        const cams = devs.filter(d=>d.kind==='videoinput');
        
        if (cams.length === 0) {
          const defaultOpt = document.createElement('option');
          defaultOpt.value = '';
          defaultOpt.textContent = 'Cámara predeterminada';
          sel.replaceChildren(defaultOpt);
          sel.value = '';
          return;
        }
        
        sel.replaceChildren(...cams.map((c,i)=>{
          const o=document.createElement('option'); 
          o.value=c.deviceId; 
          o.textContent=c.label||('Cam '+(i+1)); 
          return o;
        }));
      } catch (enumErr) {
        console.warn('Error al enumerar dispositivos:', enumErr);
        // Crear opción por defecto
        const defaultOpt = document.createElement('option');
        defaultOpt.value = '';
        defaultOpt.textContent = 'Cámara predeterminada';
        sel.replaceChildren(defaultOpt);
        sel.value = '';
      }
    }catch(err){
      console.error('Error al cargar cámaras:', err);
      const defaultOpt = document.createElement('option');
      defaultOpt.value = '';
      defaultOpt.textContent = 'Cámara predeterminada';
      sel.replaceChildren(defaultOpt);
      sel.value = '';
    }
  }

  function stop(){ 
    try{ 
      video.pause(); 
      video.srcObject = null;
    }catch{}; 
    try{ 
      (stream?.getTracks()||[]).forEach(t=>t.stop()); 
    }catch{}; 
    running=false; 
    stream = null;
  }
  
  async function start(){
    try{
      stop();
      
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      
      // Construir constraints de video
      let videoConstraints;
      
      if (sel.value && sel.value.trim() !== '') {
        // Si hay una cámara seleccionada manualmente, usarla
        videoConstraints = { deviceId: { exact: sel.value } };
      } else if (isMobile) {
        // En móviles, forzar cámara trasera (environment) con configuración más específica
        videoConstraints = { 
          facingMode: 'environment',
          width: { ideal: 1280 },
          height: { ideal: 720 }
        };
      } else {
        // En desktop, usar cualquier cámara disponible
        videoConstraints = true;
      }
      
      const cs = { 
        video: videoConstraints, 
        audio: false 
      };
      
      msg.textContent = 'Solicitando acceso a la cámara...';
      msg.style.color = 'var(--text)';
      
      // Solicitar acceso a la cámara
      stream = await navigator.mediaDevices.getUserMedia(cs);
      
      // Configurar el video para móviles
      video.setAttribute('playsinline', 'true');
      video.setAttribute('webkit-playsinline', 'true');
      video.muted = true;
      video.srcObject = stream; 
      
      // En móviles, esperar a que el video esté listo
      await new Promise((resolve, reject) => {
        video.onloadedmetadata = () => {
          video.play().then(resolve).catch(reject);
        };
        video.onerror = reject;
        // Timeout de seguridad
        setTimeout(() => {
          if (video.readyState >= 2) {
            video.play().then(resolve).catch(reject);
          } else {
            reject(new Error('Timeout esperando video'));
          }
        }, 5000);
      });
      
      running = true;
      
      // Actualizar lista de cámaras después de obtener permisos (solo en desktop)
      if (!isMobile) {
        try {
          const devs = await navigator.mediaDevices.enumerateDevices();
          const cams = devs.filter(d=>d.kind==='videoinput' && d.label);
          if (cams.length > 0 && sel.children.length <= 1) {
            sel.replaceChildren(...cams.map((c,i)=>{
              const o=document.createElement('option'); 
              o.value=c.deviceId; 
              o.textContent=c.label||('Cam '+(i+1)); 
              return o;
            }));
          }
        } catch (enumErr) {
          console.warn('No se pudieron actualizar las cámaras:', enumErr);
        }
      }
      
      if (window.BarcodeDetector) { 
        detector = new BarcodeDetector({ formats: ['qr_code'] }); 
        tickNative(); 
      } else { 
        tickCanvas(); 
      }
      msg.textContent='';
    }catch(e){ 
      console.error('Error al iniciar cámara:', e);
      let errorMsg = '';
      if (e.name === 'NotAllowedError' || e.name === 'PermissionDeniedError') {
        errorMsg = '❌ Permisos de cámara denegados. Por favor, permite el acceso a la cámara en la configuración del navegador.';
      } else if (e.name === 'NotFoundError' || e.name === 'DevicesNotFoundError') {
        errorMsg = '❌ No se encontró ninguna cámara. Verifica que tu dispositivo tenga una cámara disponible.';
      } else if (e.name === 'NotReadableError' || e.name === 'TrackStartError') {
        errorMsg = '❌ La cámara está siendo usada por otra aplicación. Cierra otras apps que usen la cámara e intenta de nuevo.';
      } else if (e.name === 'OverconstrainedError' || e.name === 'ConstraintNotSatisfiedError') {
        errorMsg = '❌ La cámara no soporta las características requeridas. Intenta con otra cámara.';
      } else {
        errorMsg = '❌ No se pudo abrir cámara: ' + (e?.message||e?.name||'Error desconocido');
      }
      msg.textContent = errorMsg;
      msg.style.color = 'var(--danger, #ef4444)';
      running = false;
    }
  }
  function accept(value){
    // Si la cámara está deshabilitada (durante delay), no aceptar códigos
    if (cameraDisabled) return false;
    
    const normalized = String(value || '').trim().toUpperCase();
    if (!normalized) return false;
    
    const t = Date.now();
    // Delay más corto en modo múltiple (500ms) vs modo single (1500ms) para evitar escaneos duplicados pero permitir escaneos rápidos
    const delay = multiMode ? 500 : 1500;
    
    // Si es el mismo código y está dentro del delay, rechazar
    if (lastCode === normalized && t - lastTs < delay) {
      return false;
    }
    
    // Si es un código diferente, aceptarlo inmediatamente
    // Si es el mismo código pero pasó el delay, también aceptarlo
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
    
    // Deshabilitar cámara inmediatamente al detectar un código para evitar procesar el mismo código múltiples veces
    cameraDisabled = true;
    console.log('Código detectado, deshabilitando cámara temporalmente:', text);
    
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
      
      // Mostrar popup de confirmación (dura 1.5 segundos)
      showItemAddedPopup();
      
      // Si es modo single, cerrar después de 1.5 segundos (cuando desaparece la notificación)
      if (!multiMode && !fromManual){ 
        setTimeout(() => {
          stop(); 
          closeModal();
        }, 1500);
        return; // No reanudar cámara en modo single
      }
      
      // En modo múltiple, reanudar cámara después de un delay corto (500ms)
      // NO llamar a stop(), solo deshabilitar temporalmente la detección
      const resumeDelay = 500;
      setTimeout(() => {
        cameraDisabled = false;
        // Limpiar el último código escaneado para permitir escanear el mismo código nuevamente después del delay
        // Esto permite escanear múltiples veces el mismo item si es necesario
        lastCode = '';
        lastTs = 0;
        console.log('Reanudando detección QR en modo múltiple. Stream activo:', stream?.active, 'Running:', running);
        
        // Verificar que el stream siga activo
        if (stream && stream.active) {
          const tracks = stream.getTracks();
          const videoTrack = tracks.find(t => t.kind === 'video');
          if (videoTrack && videoTrack.readyState === 'ended') {
            console.warn('El track de video terminó, reiniciando cámara...');
            if (multiMode) {
              start().catch(err => {
                console.warn('Error al reiniciar cámara:', err);
                msg.textContent = 'Error al reiniciar cámara. Intenta escanear de nuevo.';
              });
            }
          } else if (video && (video.paused || video.ended)) {
            console.warn('Video pausado o terminado, intentando reproducir...');
            video.play().catch(err => {
              console.warn('Error al reproducir video:', err);
            });
          }
        } else if (!running && multiMode) {
          console.log('Stream no está corriendo, reiniciando cámara...');
          start().catch(err => {
            console.warn('Error al reiniciar cámara:', err);
            msg.textContent = 'Error al reiniciar cámara. Intenta escanear de nuevo.';
          });
        } else if (running && multiMode) {
          console.log('Cámara ya está corriendo, solo reanudando detección');
        }
      }, resumeDelay);
      
      msg.textContent = '';
    }catch(e){ 
      msg.textContent = e?.message || 'No se pudo agregar';
      // Reanudar cámara incluso si hay error (más rápido en modo múltiple)
      const resumeDelay = multiMode ? 500 : 1500;
      setTimeout(() => {
        cameraDisabled = false;
        // Limpiar el último código escaneado para permitir reintentos
        lastCode = '';
        lastTs = 0;
        
        // Asegurarse de que el stream siga corriendo en modo múltiple
        if (!running && multiMode) {
          start().catch(err => {
            console.warn('Error al reanudar cámara después de error:', err);
          });
        }
      }, resumeDelay);
    }
  }

  function onCode(code){
    handleCode(code);
  }
  async function tickNative(){ 
    if(!running || cameraDisabled) {
      if (running && cameraDisabled) {
        // La cámara está corriendo pero deshabilitada temporalmente (normal durante delay)
        requestAnimationFrame(tickNative);
      }
      return;
    }
    try{ 
      const codes=await detector.detect(video); 
      if(codes && codes.length > 0 && codes[0]?.rawValue) {
        console.log('QR detectado en modo múltiple:', codes[0].rawValue);
        onCode(codes[0].rawValue);
      }
    }catch(e){
      // Silenciar errores de detección, pero loguear si es necesario
      if (e.message && !e.message.includes('No image') && !e.message.includes('not readable')) {
        console.warn('Error en detección nativa:', e);
      }
    } 
    requestAnimationFrame(tickNative); 
  }
  
  function tickCanvas(){
    if(!running || cameraDisabled) {
      if (running && cameraDisabled) {
        // La cámara está corriendo pero deshabilitada temporalmente (normal durante delay)
        requestAnimationFrame(tickCanvas);
      }
      return;
    }
    try{
      const w = video.videoWidth|0, h = video.videoHeight|0;
      if(!w||!h){ 
        requestAnimationFrame(tickCanvas); 
        return; 
      }
      canvas.width=w; 
      canvas.height=h;
      ctx.drawImage(video,0,0,w,h);
      const img = ctx.getImageData(0,0,w,h);
      if (window.jsQR){
        const qr = window.jsQR(img.data, w, h);
        if (qr && qr.data) {
          console.log('QR detectado (jsQR) en modo múltiple:', qr.data);
          onCode(qr.data);
        }
      }
    }catch(e){
      // Silenciar errores menores, pero loguear si es necesario
      if (e.message && !e.message.includes('videoWidth') && !e.message.includes('not readable')) {
        console.warn('Error en tickCanvas:', e);
      }
    }
    requestAnimationFrame(tickCanvas);
  }

  // Manejar botón de modo single (solo un item)
  singleModeBtn?.addEventListener('click', async () => {
    multiMode = false;
    singleModeBtn.style.display = 'none';
    multiModeBtn.style.display = 'none';
    if (finishMultiBtn) finishMultiBtn.style.display = 'none';
    msg.textContent = 'Modo: Agregar solo un item. Escanea un código para agregarlo y cerrar.';
    await fillCams();
    await start();
  });

  // Manejar botón de modo múltiples
  multiModeBtn?.addEventListener('click', async () => {
    multiMode = true;
    singleModeBtn.style.display = 'none';
    multiModeBtn.style.display = 'none';
    if (finishMultiBtn) finishMultiBtn.style.display = 'inline-block';
    msg.textContent = 'Modo múltiples items activado. Escanea varios items seguidos.';
    await fillCams();
    await start();
  });

  // Manejar botón de terminar modo múltiples
  finishMultiBtn?.addEventListener('click', () => {
    multiMode = false;
    singleModeBtn.style.display = 'inline-block';
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

  // Cargar cámaras al abrir el modal
  fillCams();
}

// ---------- agregar unificado (QR + Manual) ----------
function openAddUnified(){
  console.log('openAddUnified llamada, current:', current);
  if (!current) {
    console.warn('No hay venta actual');
    alert('Crea primero una venta');
    return;
  }
  
  console.log('Creando modal de agregar...');
  // Modal inicial: elegir entre QR y Manual
  const node = document.createElement('div');
  node.className = 'card';
  node.style.cssText = 'max-width:600px;margin:0 auto;';
  node.innerHTML = `
    <h3 style="margin-top:0;margin-bottom:24px;text-align:center;">Agregar items</h3>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px;">
      <button id="add-qr-btn" class="primary" style="padding:24px;border-radius:12px;font-size:16px;font-weight:600;display:flex;flex-direction:column;align-items:center;gap:8px;border:none;cursor:pointer;transition:all 0.2s;">
        <span style="font-size:48px;">📷</span>
        <span>Agregar QR</span>
      </button>
      <button id="add-manual-btn" class="secondary" style="padding:24px;border-radius:12px;font-size:16px;font-weight:600;display:flex;flex-direction:column;align-items:center;gap:8px;border:none;cursor:pointer;transition:all 0.2s;">
        <span style="font-size:48px;">✏️</span>
        <span>Agregar manual</span>
      </button>
    </div>
    <div style="text-align:center;">
      <button id="add-cancel-btn" class="secondary" style="padding:8px 24px;">Cancelar</button>
    </div>
  `;
  
  console.log('Abriendo modal de agregar...');
  const modal = document.getElementById('modal');
  const slot = document.getElementById('modalBody');
  const x = document.getElementById('modalClose');
  
  if (!modal || !slot || !x) {
    console.error('Modal no encontrado:', { modal: !!modal, slot: !!slot, x: !!x });
    alert('Error: No se pudo abrir el modal. Por favor, recarga la página.');
    return;
  }
  
  slot.replaceChildren(node);
  modal.classList.remove('hidden');
  x.onclick = () => {
    modal.classList.add('hidden');
  };
  
  console.log('Modal de agregar abierto');
  
  // Estilos hover para los botones
  const qrBtn = node.querySelector('#add-qr-btn');
  const manualBtn = node.querySelector('#add-manual-btn');
  const cancelBtn = node.querySelector('#add-cancel-btn');
  
  if (!qrBtn || !manualBtn || !cancelBtn) {
    console.error('Botones no encontrados en el modal:', { qrBtn: !!qrBtn, manualBtn: !!manualBtn, cancelBtn: !!cancelBtn });
    return;
  }
  
  qrBtn.addEventListener('mouseenter', () => {
    qrBtn.style.transform = 'scale(1.05)';
    qrBtn.style.boxShadow = '0 4px 12px rgba(59, 130, 246, 0.3)';
  });
  qrBtn.addEventListener('mouseleave', () => {
    qrBtn.style.transform = 'scale(1)';
    qrBtn.style.boxShadow = '';
  });
  
  manualBtn.addEventListener('mouseenter', () => {
    manualBtn.style.transform = 'scale(1.05)';
    manualBtn.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.1)';
  });
  manualBtn.addEventListener('mouseleave', () => {
    manualBtn.style.transform = 'scale(1)';
    manualBtn.style.boxShadow = '';
  });
  
  // Si selecciona QR, abrir el modal de QR
  qrBtn.addEventListener('click', (e) => {
    console.log('Click en botón QR detectado');
    e.preventDefault();
    e.stopPropagation();
    const modal = document.getElementById('modal');
    if (modal) modal.classList.add('hidden');
    openQR();
  });
  
  // Si selecciona Manual, mostrar navegación entre Lista de precios e Inventario
  manualBtn.addEventListener('click', (e) => {
    console.log('Click en botón Manual detectado');
    e.preventDefault();
    e.stopPropagation();
    showManualView(node);
  });
  
  cancelBtn.addEventListener('click', (e) => {
    console.log('Click en botón Cancelar detectado');
    e.preventDefault();
    e.stopPropagation();
    const modal = document.getElementById('modal');
    if (modal) modal.classList.add('hidden');
  });
}

// Vista de agregar manual (navegación entre Lista de precios e Inventario)
function showManualView(parentNode) {
  const currentVehicleId = current?.vehicle?.vehicleId || null;
  let currentView = currentVehicleId ? 'prices' : 'inventory'; // Por defecto, mostrar inventario si no hay vehículo
  
  function renderView() {
    parentNode.innerHTML = `
      <div style="margin-bottom:16px;">
        <h3 style="margin-top:0;margin-bottom:16px;">Agregar manual</h3>
        <div style="display:flex;gap:8px;border-bottom:2px solid var(--border);padding-bottom:8px;">
          <button id="nav-prices" class="${currentView === 'prices' ? 'primary' : 'secondary'}" style="flex:1;padding:12px;border-radius:8px 8px 0 0;border:none;font-weight:600;cursor:pointer;transition:all 0.2s;">
            💰 Lista de precios
          </button>
          <button id="nav-inventory" class="${currentView === 'inventory' ? 'primary' : 'secondary'}" style="flex:1;padding:12px;border-radius:8px 8px 0 0;border:none;font-weight:600;cursor:pointer;transition:all 0.2s;">
            📦 Inventario
          </button>
        </div>
      </div>
      <div id="manual-content" style="min-height:400px;max-height:70vh;overflow-y:auto;"></div>
      <div style="margin-top:16px;text-align:center;">
        <button id="manual-back-btn" class="secondary" style="padding:8px 24px;">← Volver</button>
      </div>
    `;
    
    const navPrices = parentNode.querySelector('#nav-prices');
    const navInventory = parentNode.querySelector('#nav-inventory');
    const manualBack = parentNode.querySelector('#manual-back-btn');
    const content = parentNode.querySelector('#manual-content');
    
    navPrices.onclick = () => {
      currentView = 'prices';
      renderView();
    };
    
    navInventory.onclick = () => {
      currentView = 'inventory';
      renderView();
    };
    
    manualBack.onclick = () => {
      // Volver al menú inicial
      openAddUnified();
    };
    
    // Renderizar contenido según la vista actual
    if (currentView === 'prices') {
      renderPricesView(content, currentVehicleId);
    } else {
      renderInventoryView(content);
    }
  }
  
  renderView();
}

// Vista de Lista de precios
async function renderPricesView(container, vehicleId) {
  container.innerHTML = '<div style="text-align:center;padding:24px;color:var(--muted);">Cargando...</div>';
  
  if (!vehicleId) {
    container.innerHTML = `
      <div style="text-align:center;padding:48px;">
        <div style="font-size:48px;margin-bottom:16px;">🚗</div>
        <h4 style="margin-bottom:8px;">No hay vehículo vinculado</h4>
        <p style="color:var(--muted);margin-bottom:16px;">Vincula un vehículo a la venta para ver los precios disponibles.</p>
        <button id="edit-vehicle-btn" class="primary" style="padding:8px 16px;">Editar vehículo</button>
      </div>
    `;
    container.querySelector('#edit-vehicle-btn')?.addEventListener('click', () => {
      closeModal();
      openEditCV();
    });
    return;
  }
  
  try {
    // Obtener información del vehículo
    const vehicle = await API.vehicles.get(vehicleId);
    
    // Obtener precios del vehículo (filtrar por año si está disponible)
    const vehicleYear = current?.vehicle?.year || null;
    const pricesParams = { vehicleId, page: 1, limit: 10 };
    if (vehicleYear) {
      pricesParams.vehicleYear = vehicleYear;
    }
    const pricesData = await API.pricesList(pricesParams);
    const prices = Array.isArray(pricesData?.items) ? pricesData.items : (Array.isArray(pricesData) ? pricesData : []);
    
    container.innerHTML = `
      <div style="margin-bottom:16px;padding:12px;background:var(--card-alt);border-radius:8px;">
        <div style="font-weight:600;margin-bottom:4px;">${vehicle?.make || ''} ${vehicle?.line || ''}</div>
        <div style="font-size:12px;color:var(--muted);">Cilindraje: ${vehicle?.displacement || ''}${vehicle?.modelYear ? ` | Modelo: ${vehicle.modelYear}` : ''}</div>
      </div>
      <div style="margin-bottom:12px;display:flex;gap:8px;flex-wrap:wrap;">
        <button id="create-service-btn" class="secondary" style="flex:1;min-width:120px;padding:10px;border-radius:8px;font-weight:600;">
          ➕ Crear servicio
        </button>
        <button id="create-product-btn" class="secondary" style="flex:1;min-width:120px;padding:10px;border-radius:8px;font-weight:600;">
          ➕ Crear producto
        </button>
        <button id="create-combo-btn" class="secondary" style="flex:1;min-width:120px;padding:10px;border-radius:8px;font-weight:600;background:#9333ea;color:white;border:none;">
          🎁 Crear combo
        </button>
      </div>
      <div style="margin-bottom:12px;">
        <h4 style="margin-bottom:8px;">Precios disponibles (${prices.length})</h4>
        <div id="prices-list" style="display:grid;gap:8px;"></div>
      </div>
    `;
    
    const pricesList = container.querySelector('#prices-list');
    
    if (prices.length === 0) {
      pricesList.innerHTML = '<div style="text-align:center;padding:24px;color:var(--muted);">No hay precios registrados para este vehículo.</div>';
    } else {
      prices.forEach(pe => {
        const card = document.createElement('div');
        card.style.cssText = 'padding:12px;background:var(--card-alt);border:1px solid var(--border);border-radius:8px;display:flex;justify-content:space-between;align-items:center;';
        
        let typeBadge = '';
        if (pe.type === 'combo') {
          typeBadge = '<span style="background:#9333ea;color:white;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;margin-right:8px;">COMBO</span>';
        } else if (pe.type === 'product') {
          typeBadge = '<span style="background:var(--primary,#3b82f6);color:white;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;margin-right:8px;">PRODUCTO</span>';
        } else {
          typeBadge = '<span style="background:var(--success,#10b981);color:white;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;margin-right:8px;">SERVICIO</span>';
        }
        
        card.innerHTML = `
          <div style="flex:1;">
            ${typeBadge}
            <span style="font-weight:600;">${pe.name || 'Sin nombre'}</span>
          </div>
          <div style="margin:0 16px;font-weight:600;color:var(--primary);">${money(pe.total || pe.price || 0)}</div>
          <button class="add-price-btn primary" data-price-id="${pe._id}" style="padding:6px 16px;border-radius:6px;border:none;cursor:pointer;font-weight:600;">Agregar</button>
        `;
        
        card.querySelector('.add-price-btn').onclick = async () => {
          try {
            current = await API.sales.addItem(current._id, { source:'price', refId: pe._id, qty:1 });
            syncCurrentIntoOpenList();
            renderTabs();
            renderSale();
            renderWO();
            // Mostrar feedback
            const btn = card.querySelector('.add-price-btn');
            const originalText = btn.textContent;
            btn.textContent = '✓ Agregado';
            btn.disabled = true;
            btn.style.background = 'var(--success, #10b981)';
            setTimeout(() => {
              btn.textContent = originalText;
              btn.disabled = false;
              btn.style.background = '';
            }, 2000);
          } catch (err) {
            alert('Error: ' + (err?.message || 'No se pudo agregar'));
          }
        };
        
        pricesList.appendChild(card);
      });
    }
    
    // Botones de crear
    container.querySelector('#create-service-btn').onclick = () => {
      closeModal();
      createPriceFromSale('service', vehicleId, vehicle);
    };
    
    container.querySelector('#create-product-btn').onclick = () => {
      closeModal();
      createPriceFromSale('product', vehicleId, vehicle);
    };
    
    container.querySelector('#create-combo-btn').onclick = () => {
      closeModal();
      createPriceFromSale('combo', vehicleId, vehicle);
    };
    
  } catch (err) {
    console.error('Error al cargar precios:', err);
    container.innerHTML = `
      <div style="text-align:center;padding:24px;color:var(--danger);">
        <div style="font-size:48px;margin-bottom:16px;">❌</div>
        <p>Error al cargar precios: ${err?.message || 'Error desconocido'}</p>
      </div>
    `;
  }
}

// Vista de Inventario
async function renderInventoryView(container) {
  container.innerHTML = '<div style="text-align:center;padding:24px;color:var(--muted);">Cargando...</div>';
  
  let page = 1;
  const limit = 10;
  let searchSku = '';
  let searchName = '';
  
  async function loadItems(reset = false) {
    if (reset) {
      page = 1;
      container.querySelector('#inventory-list')?.replaceChildren();
    }
    
    try {
      const items = await API.inventory.itemsList({ 
        sku: searchSku || '', 
        name: searchName || '', 
        page, 
        limit 
      });
      
      const listContainer = container.querySelector('#inventory-list');
      if (!listContainer) return;
      
      if (reset) {
        listContainer.innerHTML = '';
      }
      
      if (items.length === 0 && page === 1) {
        listContainer.innerHTML = '<div style="text-align:center;padding:24px;color:var(--muted);">No se encontraron items.</div>';
        return;
      }
      
      items.forEach(item => {
        const card = document.createElement('div');
        card.style.cssText = 'padding:12px;background:var(--card-alt);border:1px solid var(--border);border-radius:8px;display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;';
        
        card.innerHTML = `
          <div style="flex:1;">
            <div style="font-weight:600;margin-bottom:4px;">${item.name || 'Sin nombre'}</div>
            <div style="font-size:13px;color:var(--text);"><strong style="font-weight:700;">SKU:</strong> <strong style="font-weight:700;">${item.sku || 'N/A'}</strong> | Stock: ${item.stock || 0} | ${money(item.salePrice || 0)}</div>
          </div>
          <button class="add-inventory-btn primary" data-item-id="${item._id}" style="padding:6px 16px;border-radius:6px;border:none;cursor:pointer;font-weight:600;margin-left:12px;">Agregar</button>
        `;
        
        card.querySelector('.add-inventory-btn').onclick = async () => {
          try {
            current = await API.sales.addItem(current._id, { source:'inventory', refId: item._id, qty:1 });
            syncCurrentIntoOpenList();
            renderTabs();
            renderSale();
            renderWO();
            // Mostrar feedback
            const btn = card.querySelector('.add-inventory-btn');
            const originalText = btn.textContent;
            btn.textContent = '✓ Agregado';
            btn.disabled = true;
            btn.style.background = 'var(--success, #10b981)';
            setTimeout(() => {
              btn.textContent = originalText;
              btn.disabled = false;
              btn.style.background = '';
            }, 2000);
          } catch (err) {
            alert('Error: ' + (err?.message || 'No se pudo agregar'));
          }
        };
        
        listContainer.appendChild(card);
      });
      
      // Mostrar botón "Cargar más" si hay más items
      const loadMoreBtn = container.querySelector('#load-more-inventory');
      if (loadMoreBtn) {
        loadMoreBtn.style.display = items.length >= limit ? 'block' : 'none';
      }
      
    } catch (err) {
      console.error('Error al cargar inventario:', err);
      container.querySelector('#inventory-list').innerHTML = `
        <div style="text-align:center;padding:24px;color:var(--danger);">
          <p>Error al cargar inventario: ${err?.message || 'Error desconocido'}</p>
        </div>
      `;
    }
  }
  
  container.innerHTML = `
    <div style="margin-bottom:16px;">
      <h4 style="margin-bottom:12px;">Filtrar inventario</h4>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px;">
        <input id="inventory-filter-sku" type="text" placeholder="Buscar por SKU..." style="padding:8px;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);" />
        <input id="inventory-filter-name" type="text" placeholder="Buscar por nombre..." style="padding:8px;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);" />
      </div>
      <button id="inventory-search-btn" class="primary" style="width:100%;padding:10px;border-radius:6px;border:none;font-weight:600;cursor:pointer;">🔍 Buscar</button>
    </div>
    <div id="inventory-list" style="max-height:50vh;overflow-y:auto;"></div>
    <div style="text-align:center;margin-top:12px;">
      <button id="load-more-inventory" class="secondary" style="padding:8px 16px;display:none;">Cargar más</button>
    </div>
  `;
  
  const filterSku = container.querySelector('#inventory-filter-sku');
  const filterName = container.querySelector('#inventory-filter-name');
  const searchBtn = container.querySelector('#inventory-search-btn');
  const loadMoreBtn = container.querySelector('#load-more-inventory');
  
  let searchTimeout = null;
  
  filterSku.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      searchSku = filterSku.value.trim();
      loadItems(true);
    }, 500);
  });
  
  filterName.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      searchName = filterName.value.trim();
      loadItems(true);
    }, 500);
  });
  
  searchBtn.onclick = () => {
    searchSku = filterSku.value.trim();
    searchName = filterName.value.trim();
    loadItems(true);
  };
  
  loadMoreBtn.onclick = () => {
    page++;
    loadItems(false);
  };
  
  // Cargar items iniciales
  loadItems(true);
}

// Crear precio desde venta (reutilizar lógica de prices.js)
async function createPriceFromSale(type, vehicleId, vehicle) {
  // Importar la función de prices.js o recrearla aquí
  // Por ahora, abrir un modal simple para crear el precio
  const node = document.createElement('div');
  node.className = 'card';
  node.style.cssText = 'max-width:600px;margin:0 auto;';
  
  const isCombo = type === 'combo';
  const isProduct = type === 'product';
  
  node.innerHTML = `
    <h3 style="margin-top:0;margin-bottom:16px;">Crear ${type === 'combo' ? 'Combo' : (type === 'service' ? 'Servicio' : 'Producto')}</h3>
    <p class="muted" style="margin-bottom:16px;font-size:13px;">
      Vehículo: <strong>${vehicle?.make || ''} ${vehicle?.line || ''}</strong>
    </p>
    <div style="margin-bottom:16px;">
      <label style="display:block;font-size:12px;color:var(--muted);margin-bottom:4px;font-weight:500;">Nombre</label>
      <input id="price-name" placeholder="${type === 'combo' ? 'Ej: Combo mantenimiento completo' : (type === 'service' ? 'Ej: Cambio de aceite' : 'Ej: Filtro de aire')}" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);" />
    </div>
    ${isProduct ? `
    <div style="margin-bottom:16px;">
      <label style="display:block;font-size:12px;color:var(--muted);margin-bottom:4px;font-weight:500;">Vincular con item del inventario (opcional)</label>
      <div class="row" style="gap:8px;margin-bottom:8px;">
        <input id="price-item-search" placeholder="Buscar por SKU o nombre..." style="flex:1;padding:8px;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);" />
        <button id="price-item-qr" class="secondary" style="padding:8px 16px;">📷 QR</button>
      </div>
      <div id="price-item-selected" style="margin-top:8px;padding:8px;background:var(--card-alt);border-radius:6px;font-size:12px;display:none;"></div>
      <input type="hidden" id="price-item-id" />
    </div>
    ` : ''}
    ${isCombo ? `
    <div style="margin-bottom:16px;">
      <label style="display:block;font-size:12px;color:var(--muted);margin-bottom:4px;font-weight:500;">Productos del combo</label>
      <div id="price-combo-products" style="margin-bottom:8px;"></div>
      <button id="price-add-combo-product" class="secondary" style="width:100%;padding:8px;margin-bottom:8px;">➕ Agregar producto</button>
    </div>
    ` : ''}
    ${!isCombo ? `
    <div style="margin-bottom:16px;">
      <label style="display:block;font-size:12px;color:var(--muted);margin-bottom:4px;font-weight:500;">Precio</label>
      <input id="price-total" type="number" step="0.01" placeholder="0" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);" />
    </div>
    ` : `
    <div style="margin-bottom:16px;">
      <label style="display:block;font-size:12px;color:var(--muted);margin-bottom:4px;font-weight:500;">Precio total del combo</label>
      <input id="price-total" type="number" step="0.01" placeholder="0 (se calcula automáticamente)" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);" />
      <p class="muted" style="margin-top:4px;font-size:11px;">El precio se calcula automáticamente desde los productos, o puedes establecerlo manualmente.</p>
    </div>
    `}
    <div style="margin-bottom:16px;padding:12px;background:var(--card-alt);border-radius:8px;border:1px solid var(--border);">
      <label style="display:block;font-size:12px;color:var(--muted);margin-bottom:8px;font-weight:500;">Rango de años (opcional)</label>
      <p class="muted" style="margin-bottom:8px;font-size:11px;">Solo aplicar este precio si el año del vehículo está en el rango especificado. Déjalo vacío para aplicar a todos los años.</p>
      <div class="row" style="gap:8px;">
        <div style="flex:1;">
          <label style="display:block;font-size:11px;color:var(--muted);margin-bottom:4px;">Desde</label>
          <input id="price-year-from" type="number" min="1900" max="2100" placeholder="Ej: 2018" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);" />
        </div>
        <div style="flex:1;">
          <label style="display:block;font-size:11px;color:var(--muted);margin-bottom:4px;">Hasta</label>
          <input id="price-year-to" type="number" min="1900" max="2100" placeholder="Ej: 2022" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);" />
        </div>
      </div>
    </div>
    <div id="price-msg" style="margin-bottom:16px;font-size:13px;"></div>
    <div class="row" style="gap:8px;">
      <button id="price-save" style="flex:1;padding:10px;">💾 Guardar</button>
      <button id="price-cancel" class="secondary" style="flex:1;padding:10px;">Cancelar</button>
    </div>
  `;
  
  openModal(node);
  
  const nameInput = node.querySelector('#price-name');
  const totalInput = node.querySelector('#price-total');
  const msgEl = node.querySelector('#price-msg');
  const saveBtn = node.querySelector('#price-save');
  const cancelBtn = node.querySelector('#price-cancel');
  let selectedItem = null;
  
  // Funcionalidad de búsqueda de items (solo para productos)
  if (isProduct) {
    const itemSearch = node.querySelector('#price-item-search');
    const itemSelected = node.querySelector('#price-item-selected');
    const itemIdInput = node.querySelector('#price-item-id');
    const itemQrBtn = node.querySelector('#price-item-qr');
    
    let searchTimeout = null;
    
    async function searchItems(query) {
      if (!query || query.length < 2) return;
      try {
        let items = [];
        try {
          items = await API.inventory.itemsList({ sku: query });
          if (items.length === 0) {
            items = await API.inventory.itemsList({ name: query });
          }
        } catch (err) {
          console.error('Error al buscar items:', err);
        }
        // Mostrar resultados en un dropdown (simplificado)
        if (items && items.length > 0) {
          const item = items[0]; // Tomar el primero
          selectedItem = { _id: item._id, sku: item.sku, name: item.name, stock: item.stock, salePrice: item.salePrice };
          itemIdInput.value = item._id;
          itemSearch.value = `${item.sku} - ${item.name}`;
          itemSelected.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;">
              <div>
                <strong>${item.name}</strong><br>
                <span style="font-size:12px;"><strong style="font-weight:700;">SKU:</strong> <strong style="font-weight:700;">${item.sku}</strong> | Stock: ${item.stock || 0}</span>
              </div>
              <button id="price-item-remove" class="danger" style="padding:4px 8px;font-size:11px;">✕</button>
            </div>
          `;
          itemSelected.style.display = 'block';
          if (!totalInput.value || totalInput.value === '0') {
            totalInput.value = item.salePrice || 0;
          }
        }
      } catch (err) {
        console.error('Error al buscar items:', err);
      }
    }
    
    itemSearch.addEventListener('input', (e) => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        searchItems(e.target.value);
      }, 300);
    });
    
    itemQrBtn.onclick = async () => {
      try {
        // Importar openQRForItem desde prices.js
        const { openQRForItem } = await import('./prices.js');
        const qrCode = await openQRForItem();
        if (!qrCode) return;
        
        if (qrCode.toUpperCase().startsWith('IT:')) {
          const parts = qrCode.split(':').map(p => p.trim()).filter(Boolean);
          const itemId = parts.length >= 3 ? parts[2] : null;
          if (itemId) {
            const items = await API.inventory.itemsList({});
            const item = items.find(i => String(i._id) === itemId);
            if (item) {
              selectedItem = { _id: item._id, sku: item.sku, name: item.name, stock: item.stock, salePrice: item.salePrice };
              itemIdInput.value = item._id;
              itemSearch.value = `${item.sku} - ${item.name}`;
              itemSelected.innerHTML = `
                <div style="display:flex;justify-content:space-between;align-items:center;">
                  <div>
                    <strong>${item.name}</strong><br>
                    <span class="muted">SKU: ${item.sku} | Stock: ${item.stock || 0}</span>
                  </div>
                  <button id="price-item-remove" class="danger" style="padding:4px 8px;font-size:11px;">✕</button>
                </div>
              `;
              itemSelected.style.display = 'block';
              if (!totalInput.value || totalInput.value === '0') {
                totalInput.value = item.salePrice || 0;
              }
              return;
            }
          }
        }
        
        const items = await API.inventory.itemsList({ sku: qrCode, limit: 1 });
        if (items && items.length > 0) {
          const item = items[0];
          selectedItem = { _id: item._id, sku: item.sku, name: item.name, stock: item.stock, salePrice: item.salePrice };
          itemIdInput.value = item._id;
          itemSearch.value = `${item.sku} - ${item.name}`;
          itemSelected.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;">
              <div>
                <strong>${item.name}</strong><br>
                <span style="font-size:12px;"><strong style="font-weight:700;">SKU:</strong> <strong style="font-weight:700;">${item.sku}</strong> | Stock: ${item.stock || 0}</span>
              </div>
              <button id="price-item-remove" class="danger" style="padding:4px 8px;font-size:11px;">✕</button>
            </div>
          `;
          itemSelected.style.display = 'block';
          if (!totalInput.value || totalInput.value === '0') {
            totalInput.value = item.salePrice || 0;
          }
        } else {
          alert('Item no encontrado');
        }
      } catch (err) {
        alert('Error al leer QR: ' + (err?.message || 'Error desconocido'));
      }
    };
    
    const removeBtn = itemSelected.querySelector('#price-item-remove');
    if (removeBtn) {
      removeBtn.onclick = () => {
        selectedItem = null;
        itemIdInput.value = '';
        itemSearch.value = '';
        itemSelected.style.display = 'none';
      };
    }
  }
  
  // Funcionalidad para combos
  if (isCombo) {
    const comboProductsContainer = node.querySelector('#price-combo-products');
    const addComboProductBtn = node.querySelector('#price-add-combo-product');
    
    function addComboProductRow(productData = {}) {
      const isOpenSlot = Boolean(productData.isOpenSlot);
      const row = document.createElement('div');
      row.className = 'combo-product-item';
      row.style.cssText = `padding:12px;background:var(--card-alt);border:1px solid var(--border);border-radius:6px;margin-bottom:8px;${isOpenSlot ? 'border-left:4px solid var(--warning, #f59e0b);' : ''}`;
      row.innerHTML = `
        <div class="row" style="gap:8px;margin-bottom:8px;">
          <input type="text" class="combo-product-name" placeholder="Nombre del producto" value="${productData.name || ''}" style="flex:2;padding:6px;border:1px solid var(--border);border-radius:4px;background:var(--bg);color:var(--text);" />
          <input type="number" class="combo-product-qty" placeholder="Cant." value="${productData.qty || 1}" min="1" style="width:80px;padding:6px;border:1px solid var(--border);border-radius:4px;background:var(--bg);color:var(--text);" />
          <input type="number" class="combo-product-price" placeholder="Precio" step="0.01" value="${productData.unitPrice || 0}" style="width:120px;padding:6px;border:1px solid var(--border);border-radius:4px;background:var(--bg);color:var(--text);" />
          <button class="combo-product-remove danger" style="padding:6px 12px;">✕</button>
        </div>
        <div class="row" style="gap:8px;margin-bottom:8px;align-items:center;">
          <label style="display:flex;align-items:center;gap:6px;font-size:12px;cursor:pointer;">
            <input type="checkbox" class="combo-product-open-slot" ${isOpenSlot ? 'checked' : ''} style="width:16px;height:16px;cursor:pointer;" />
            <span style="color:var(--text);">Slot abierto (se completa con QR al crear venta)</span>
          </label>
        </div>
        <div class="combo-product-item-section" style="${isOpenSlot ? 'display:none;' : ''}">
          <div class="row" style="gap:8px;">
            <input type="text" class="combo-product-item-search" placeholder="Buscar item del inventario (opcional)..." style="flex:1;padding:6px;border:1px solid var(--border);border-radius:4px;background:var(--bg);color:var(--text);" />
            <button class="combo-product-item-qr secondary" style="padding:6px 12px;">📷 QR</button>
          </div>
          <div class="combo-product-item-selected" style="margin-top:8px;padding:6px;background:var(--card);border-radius:4px;font-size:11px;display:none;"></div>
        </div>
        <input type="hidden" class="combo-product-item-id" value="${productData.itemId?._id || ''}" />
      `;
      
      const removeBtn = row.querySelector('.combo-product-remove');
      removeBtn.onclick = () => {
        row.remove();
        updateComboTotal();
      };
      
      const openSlotCheckbox = row.querySelector('.combo-product-open-slot');
      const itemSection = row.querySelector('.combo-product-item-section');
      
      openSlotCheckbox.addEventListener('change', (e) => {
        const isChecked = e.target.checked;
        if (isChecked) {
          itemSection.style.display = 'none';
          const itemIdInput = row.querySelector('.combo-product-item-id');
          const itemSearch = row.querySelector('.combo-product-item-search');
          const itemSelected = row.querySelector('.combo-product-item-selected');
          itemIdInput.value = '';
          itemSearch.value = '';
          itemSelected.style.display = 'none';
          row.style.borderLeft = '4px solid var(--warning, #f59e0b)';
        } else {
          itemSection.style.display = 'block';
          row.style.borderLeft = '';
        }
        updateComboTotal();
      });
      
      const itemSearch = row.querySelector('.combo-product-item-search');
      const itemSelected = row.querySelector('.combo-product-item-selected');
      const itemIdInput = row.querySelector('.combo-product-item-id');
      const itemQrBtn = row.querySelector('.combo-product-item-qr');
      let selectedComboItem = productData.itemId ? { _id: productData.itemId._id, sku: productData.itemId.sku, name: productData.itemId.name, stock: productData.itemId.stock, salePrice: productData.itemId.salePrice } : null;
      
      if (productData.itemId) {
        itemSearch.value = `${productData.itemId.sku || ''} - ${productData.itemId.name || ''}`;
        itemSelected.innerHTML = `
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <div><strong>${productData.itemId.name || productData.itemId.sku}</strong> <span style="font-size:12px;margin-left:8px;"><strong style="font-weight:700;">SKU:</strong> <strong style="font-weight:700;">${productData.itemId.sku}</strong> | Stock: ${productData.itemId.stock || 0}</span></div>
            <button class="combo-product-item-remove-btn danger" style="padding:2px 6px;font-size:10px;">✕</button>
          </div>
        `;
        itemSelected.style.display = 'block';
      }
      
      let searchTimeout = null;
      async function searchComboItems(query) {
        if (!query || query.length < 2) return;
        try {
          let items = [];
          try {
            items = await API.inventory.itemsList({ sku: query });
            if (items.length === 0) {
              items = await API.inventory.itemsList({ name: query });
            }
          } catch (err) {
            console.error('Error al buscar items:', err);
          }
          if (!items || items.length === 0) return;
          
          // Limpiar dropdown anterior si existe antes de crear uno nuevo
          const existingDropdown = itemSearch.parentElement.querySelector('div[style*="position:absolute"]');
          if (existingDropdown) existingDropdown.remove();
          
          const dropdown = document.createElement('div');
          dropdown.style.cssText = 'position:absolute;z-index:1000;background:var(--card);border:1px solid var(--border);border-radius:6px;max-height:200px;overflow-y:auto;box-shadow:0 4px 12px rgba(0,0,0,0.15);width:100%;margin-top:4px;';
          dropdown.replaceChildren(...items.map(item => {
            const div = document.createElement('div');
            div.style.cssText = 'padding:8px 12px;cursor:pointer;border-bottom:1px solid var(--border);';
            div.innerHTML = `
              <div style="font-weight:600;">${item.name || item.sku}</div>
              <div style="font-size:13px;color:var(--text);margin-top:4px;"><strong style="font-size:14px;font-weight:700;">SKU:</strong> <strong style="font-size:14px;font-weight:700;">${item.sku}</strong> | Stock: ${item.stock || 0}</div>
            `;
            div.addEventListener('click', () => {
              selectedComboItem = { _id: item._id, sku: item.sku, name: item.name, stock: item.stock, salePrice: item.salePrice };
              itemIdInput.value = item._id;
              itemSearch.value = `${item.sku} - ${item.name}`;
              itemSelected.innerHTML = `
                <div style="display:flex;justify-content:space-between;align-items:center;">
                  <div><strong>${item.name}</strong> <span style="font-size:12px;margin-left:8px;"><strong style="font-weight:700;">SKU:</strong> <strong style="font-weight:700;">${item.sku}</strong> | Stock: ${item.stock || 0}</span></div>
                  <button class="combo-product-item-remove-btn danger" style="padding:2px 6px;font-size:10px;">✕</button>
                </div>
              `;
              itemSelected.style.display = 'block';
              const removeBtn2 = itemSelected.querySelector('.combo-product-item-remove-btn');
              if (removeBtn2) {
                removeBtn2.onclick = () => {
                  selectedComboItem = null;
                  itemIdInput.value = '';
                  itemSearch.value = '';
                  itemSelected.style.display = 'none';
                };
              }
              dropdown.remove();
              const priceInput = row.querySelector('.combo-product-price');
              if (!priceInput.value || priceInput.value === '0') {
                priceInput.value = item.salePrice || 0;
              }
              updateComboTotal();
            });
            div.addEventListener('mouseenter', () => { div.style.background = 'var(--hover, rgba(0,0,0,0.05))'; });
            div.addEventListener('mouseleave', () => { div.style.background = ''; });
            return div;
          }));
          
          const searchContainer = itemSearch.parentElement;
          searchContainer.style.position = 'relative';
          searchContainer.appendChild(dropdown);
          
          setTimeout(() => {
            document.addEventListener('click', function removeDropdown(e) {
              if (!searchContainer.contains(e.target)) {
                dropdown.remove();
                document.removeEventListener('click', removeDropdown);
              }
            }, { once: true });
          }, 100);
        } catch (err) {
          console.error('Error al buscar items:', err);
        }
      }
      
      itemSearch.addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
          searchComboItems(e.target.value);
        }, 300);
      });
      
      itemQrBtn.onclick = async () => {
        try {
          const { openQRForItem } = await import('./prices.js');
          const qrCode = await openQRForItem();
          if (!qrCode) return;
          
          if (qrCode.toUpperCase().startsWith('IT:')) {
            const parts = qrCode.split(':').map(p => p.trim()).filter(Boolean);
            const itemId = parts.length >= 3 ? parts[2] : null;
            if (itemId) {
              const items = await API.inventory.itemsList({});
              const item = items.find(i => String(i._id) === itemId);
              if (item) {
                selectedComboItem = { _id: item._id, sku: item.sku, name: item.name, stock: item.stock, salePrice: item.salePrice };
                itemIdInput.value = item._id;
                itemSearch.value = `${item.sku} - ${item.name}`;
                itemSelected.innerHTML = `
                  <div style="display:flex;justify-content:space-between;align-items:center;">
                    <div><strong>${item.name}</strong> <span class="muted">SKU: ${item.sku} | Stock: ${item.stock || 0}</span></div>
                    <button class="combo-product-item-remove-btn danger" style="padding:2px 6px;font-size:10px;">✕</button>
                  </div>
                `;
                itemSelected.style.display = 'block';
                const removeBtn2 = itemSelected.querySelector('.combo-product-item-remove-btn');
                if (removeBtn2) {
                  removeBtn2.onclick = () => {
                    selectedComboItem = null;
                    itemIdInput.value = '';
                    itemSearch.value = '';
                    itemSelected.style.display = 'none';
                  };
                }
                const priceInput = row.querySelector('.combo-product-price');
                if (!priceInput.value || priceInput.value === '0') {
                  priceInput.value = item.salePrice || 0;
                }
                updateComboTotal();
                return;
              }
            }
          }
          
          const items = await API.inventory.itemsList({ sku: qrCode, limit: 1 });
          if (items && items.length > 0) {
            const item = items[0];
            selectedComboItem = { _id: item._id, sku: item.sku, name: item.name, stock: item.stock, salePrice: item.salePrice };
            itemIdInput.value = item._id;
            itemSearch.value = `${item.sku} - ${item.name}`;
            itemSelected.innerHTML = `
              <div style="display:flex;justify-content:space-between;align-items:center;">
                <div><strong>${item.name}</strong> <span class="muted">SKU: ${item.sku} | Stock: ${item.stock || 0}</span></div>
                <button class="combo-product-item-remove-btn danger" style="padding:2px 6px;font-size:10px;">✕</button>
              </div>
            `;
            itemSelected.style.display = 'block';
            const removeBtn2 = itemSelected.querySelector('.combo-product-item-remove-btn');
            if (removeBtn2) {
              removeBtn2.onclick = () => {
                selectedComboItem = null;
                itemIdInput.value = '';
                itemSearch.value = '';
                itemSelected.style.display = 'none';
              };
            }
            const priceInput = row.querySelector('.combo-product-price');
            if (!priceInput.value || priceInput.value === '0') {
              priceInput.value = item.salePrice || 0;
            }
            updateComboTotal();
          } else {
            alert('Item no encontrado');
          }
        } catch (err) {
          if (err?.message !== 'Cancelado por el usuario') {
            alert('Error al leer QR: ' + (err?.message || 'Error desconocido'));
          }
        }
      };
      
      row.querySelector('.combo-product-price').addEventListener('input', updateComboTotal);
      row.querySelector('.combo-product-qty').addEventListener('input', updateComboTotal);
      
      comboProductsContainer.appendChild(row);
    }
    
    function updateComboTotal() {
      const products = Array.from(comboProductsContainer.querySelectorAll('.combo-product-item'));
      let total = 0;
      products.forEach(prod => {
        const qty = Number(prod.querySelector('.combo-product-qty')?.value || 1);
        const price = Number(prod.querySelector('.combo-product-price')?.value || 0);
        total += qty * price;
      });
      if (totalInput && (!totalInput.value || totalInput.value === '0' || totalInput !== document.activeElement)) {
        if (totalInput !== document.activeElement) {
          totalInput.value = total;
        }
      }
    }
    
    addComboProductBtn.onclick = () => {
      addComboProductRow();
      updateComboTotal();
    };
    
    // Inicializar con un producto por defecto
    addComboProductRow();
  }
  
  saveBtn.onclick = async () => {
    const name = nameInput.value.trim();
    let total = Number(totalInput.value) || 0;
    
    if (!name) {
      msgEl.textContent = 'El nombre es requerido';
      msgEl.style.color = 'var(--danger, #ef4444)';
      return;
    }
    
    if (total < 0) {
      msgEl.textContent = 'El precio debe ser mayor o igual a 0';
      msgEl.style.color = 'var(--danger, #ef4444)';
      return;
    }
    
    // Validar combo
    if (isCombo) {
      const comboProductsContainer = node.querySelector('#price-combo-products');
      const products = Array.from(comboProductsContainer.querySelectorAll('.combo-product-item'));
      if (products.length === 0) {
        msgEl.textContent = 'Un combo debe incluir al menos un producto';
        msgEl.style.color = 'var(--danger, #ef4444)';
        return;
      }
      
      for (const prod of products) {
        const prodName = prod.querySelector('.combo-product-name')?.value.trim();
        if (!prodName) {
          msgEl.textContent = 'Todos los productos del combo deben tener nombre';
          msgEl.style.color = 'var(--danger, #ef4444)';
          return;
        }
      }
    }
    
    try {
      saveBtn.disabled = true;
      saveBtn.textContent = 'Guardando...';
      
      const yearFromInput = node.querySelector('#price-year-from');
      const yearToInput = node.querySelector('#price-year-to');
      const yearFrom = yearFromInput?.value?.trim() || null;
      const yearTo = yearToInput?.value?.trim() || null;
      
      const payload = {
        vehicleId: vehicleId,
        name: name,
        type: type,
        total: total,
        yearFrom: yearFrom || null,
        yearTo: yearTo || null
      };
      
      if (isProduct && selectedItem) {
        payload.itemId = selectedItem._id;
      }
      
      if (isCombo) {
        const comboProductsContainer = node.querySelector('#price-combo-products');
        const products = Array.from(comboProductsContainer.querySelectorAll('.combo-product-item'));
        payload.comboProducts = products.map(prod => {
          const isOpenSlot = prod.querySelector('.combo-product-open-slot')?.checked || false;
          return {
            name: prod.querySelector('.combo-product-name')?.value.trim() || '',
            qty: Number(prod.querySelector('.combo-product-qty')?.value || 1),
            unitPrice: Number(prod.querySelector('.combo-product-price')?.value || 0),
            itemId: isOpenSlot ? null : (prod.querySelector('.combo-product-item-id')?.value || null),
            isOpenSlot: isOpenSlot
          };
        }).filter(p => p.name);
      }
      
      await API.priceCreate(payload);
      
      // Agregar el precio recién creado a la venta
      const prices = await API.pricesList({ vehicleId, name, limit: 1 });
      if (prices && prices.length > 0) {
        const newPrice = prices[0];
        current = await API.sales.addItem(current._id, { source:'price', refId: newPrice._id, qty:1 });
        syncCurrentIntoOpenList();
        renderTabs();
        renderSale();
        renderWO();
      }
      
      closeModal();
    } catch(e) {
      msgEl.textContent = 'Error: ' + (e?.message || 'Error desconocido');
      msgEl.style.color = 'var(--danger, #ef4444)';
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = '💾 Guardar';
    }
  };
  
  cancelBtn.onclick = () => {
    closeModal();
  };
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
  head.innerHTML = '<th>Vehículo</th><th class="t-right">Precio</th><th></th>';
  try{
    const svcs = await API.servicesList();
    svc.replaceChildren(...(svcs||[]).map(s=>{ const o=document.createElement('option'); o.value=s._id; o.textContent=s.name||('Servicio '+s._id.slice(-6)); return o; }));
  }catch{}
  let page=1, limit=20;
  
  // Obtener vehicleId de la venta actual si existe
  const currentVehicleId = current?.vehicle?.vehicleId || null;
  
  async function load(reset=false){
    if(reset){ body.innerHTML=''; page=1; }
    const params = { serviceId: svc.value||'', page, limit };
    // Filtrar por vehículo de la venta si existe
    if (currentVehicleId) {
      params.vehicleId = currentVehicleId;
      // Filtrar por año del vehículo si está disponible
      const vehicleYear = current?.vehicle?.year || null;
      if (vehicleYear) {
        params.vehicleYear = vehicleYear;
      }
    }
    const rows = await API.pricesList(params);
    cnt.textContent = rows.length;
    body.innerHTML = '';
    for(const pe of rows){
      const tr = clone('tpl-price-row');
      const vehicleCell = tr.querySelector('[data-vehicle]') || tr.querySelector('td');
      if (vehicleCell) {
        if (pe.vehicleId && pe.vehicleId.make) {
          vehicleCell.innerHTML = `
            <div style="font-weight:600;">${pe.vehicleId.make} ${pe.vehicleId.line}</div>
            <div style="font-size:12px;color:var(--muted);">Cilindraje: ${pe.vehicleId.displacement}${pe.vehicleId.modelYear ? ` | Modelo: ${pe.vehicleId.modelYear}` : ''}</div>
          `;
        } else {
          vehicleCell.innerHTML = `
            <div>${pe.brand || ''} ${pe.line || ''}</div>
            <div style="font-size:12px;color:var(--muted);">${pe.engine || ''} ${pe.year || ''}</div>
          `;
        }
      }
      const priceCell = tr.querySelector('[data-price]');
      if (priceCell) priceCell.textContent = money(pe.total||pe.price||0);
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
  
  // Inicializar selector de vehículo
  const vehicleSearch = $('#v-vehicle-search', node);
  const vehicleIdInput = $('#v-vehicle-id', node);
  const vehicleDropdown = $('#v-vehicle-dropdown', node);
  const vehicleSelected = $('#v-vehicle-selected', node);
  const yearInput = $('#v-year', node);
  const yearWarning = $('#v-year-warning', node);
  let selectedVehicle = null;
  let vehicleSearchTimeout = null;
  
  // Si ya hay vehicleId, cargar datos del vehículo
  if (v.vehicleId) {
    vehicleIdInput.value = v.vehicleId;
    API.vehicles.get(v.vehicleId).then(vehicle => {
      if (vehicle) {
        selectedVehicle = vehicle;
        vehicleSearch.value = `${vehicle.make} ${vehicle.line} ${vehicle.displacement}`;
        vehicleSelected.innerHTML = `
          <span style="color:var(--success, #10b981);">✓</span> 
          <strong>${vehicle.make} ${vehicle.line}</strong> - Cilindraje: ${vehicle.displacement}${vehicle.modelYear ? ` | Modelo: ${vehicle.modelYear}` : ''}
        `;
        $('#v-brand', node).value = vehicle.make || '';
        $('#v-line', node).value = vehicle.line || '';
        $('#v-engine', node).value = vehicle.displacement || '';
      }
    }).catch(() => {});
  }
  
  // Búsqueda de vehículos
  async function searchVehicles(query) {
    if (!query || query.trim().length < 1) {
      vehicleDropdown.style.display = 'none';
      return;
    }
    try {
      const r = await API.vehicles.search({ q: query.trim(), limit: 30 });
      const vehicles = Array.isArray(r?.items) ? r.items : [];
      if (vehicles.length === 0) {
        vehicleDropdown.innerHTML = '<div style="padding:12px;text-align:center;color:var(--muted);font-size:12px;">No se encontraron vehículos</div>';
        vehicleDropdown.style.display = 'block';
        return;
      }
      vehicleDropdown.replaceChildren(...vehicles.map(v => {
        const div = document.createElement('div');
        div.style.cssText = 'padding:8px 12px;cursor:pointer;border-bottom:1px solid var(--border);';
        div.innerHTML = `
          <div style="font-weight:600;">${v.make} ${v.line}</div>
          <div style="font-size:12px;color:var(--muted);">Cilindraje: ${v.displacement}${v.modelYear ? ` | Modelo: ${v.modelYear}` : ''}</div>
        `;
        div.addEventListener('click', () => {
          selectedVehicle = v;
          vehicleIdInput.value = v._id;
          vehicleSearch.value = `${v.make} ${v.line} ${v.displacement}`;
          vehicleSelected.innerHTML = `
            <span style="color:var(--success, #10b981);">✓</span> 
            <strong>${v.make} ${v.line}</strong> - Cilindraje: ${v.displacement}${v.modelYear ? ` | Modelo: ${v.modelYear}` : ''}
          `;
          vehicleDropdown.style.display = 'none';
          $('#v-brand', node).value = v.make || '';
          $('#v-line', node).value = v.line || '';
          $('#v-engine', node).value = v.displacement || '';
          // Validar año si ya está ingresado
          if (yearInput.value) {
            validateYear();
          }
        });
        div.addEventListener('mouseenter', () => {
          div.style.background = 'var(--hover, rgba(0,0,0,0.05))';
        });
        div.addEventListener('mouseleave', () => {
          div.style.background = '';
        });
        return div;
      }));
      vehicleDropdown.style.display = 'block';
    } catch (err) {
      console.error('Error al buscar vehículos:', err);
    }
  }
  
  // Validar año contra rango del vehículo
  async function validateYear() {
    if (!selectedVehicle || !yearInput.value) {
      yearWarning.style.display = 'none';
      return;
    }
    const yearNum = Number(yearInput.value);
    if (!Number.isFinite(yearNum)) {
      yearWarning.style.display = 'none';
      return;
    }
    try {
      const validation = await API.vehicles.validateYear(selectedVehicle._id, yearNum);
      if (!validation.valid) {
        yearWarning.textContent = validation.message || 'Año fuera de rango';
        yearWarning.style.display = 'block';
      } else {
        yearWarning.style.display = 'none';
      }
    } catch (err) {
      console.error('Error al validar año:', err);
    }
  }
  
  if (vehicleSearch) {
    vehicleSearch.addEventListener('input', (e) => {
      clearTimeout(vehicleSearchTimeout);
      const query = e.target.value.trim();
      if (query.length >= 1) {
        vehicleSearchTimeout = setTimeout(() => {
          searchVehicles(query);
        }, 150);
      } else {
        if (vehicleDropdown) vehicleDropdown.style.display = 'none';
      }
    });
    vehicleSearch.addEventListener('focus', () => {
      if (vehicleSearch.value.trim().length >= 1) {
        searchVehicles(vehicleSearch.value.trim());
      }
    });
  }
  
  if (yearInput) {
    yearInput.addEventListener('input', () => {
      if (selectedVehicle) {
        validateYear();
      }
    });
  }
  
  // Cerrar dropdown al hacer click fuera
  document.addEventListener('click', (e) => {
    if (vehicleSearch && !vehicleSearch.contains(e.target) && vehicleDropdown && !vehicleDropdown.contains(e.target)) {
      vehicleDropdown.style.display = 'none';
    }
  });
  
  openModal(node);

  const plateInput = $('#v-plate', node);
  const idInput = $('#c-id', node);
  const mileageInput = $('#v-mile', node);
  const watchSelectors = ['#c-name','#c-id','#c-phone','#c-email','#c-address','#v-brand','#v-line','#v-engine','#v-year','#v-mile'];
  watchSelectors.forEach((sel)=>{ const input=$(sel,node); if(input) input.addEventListener('input',()=>{ input.dataset.dirty='1'; }); });

  let lastLookupPlate = '';
  let lastLookupId = '';
  let loadingProfile = false;

  const applyProfile = async (profile, plateCode) => {
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

    // Si el perfil tiene vehicleId, cargar y seleccionar el vehículo
    if (veh.vehicleId && vehicleIdInput) {
      try {
        const vehicle = await API.vehicles.get(veh.vehicleId);
        if (vehicle) {
          selectedVehicle = vehicle;
          vehicleIdInput.value = vehicle._id;
          if (vehicleSearch) vehicleSearch.value = `${vehicle.make} ${vehicle.line} ${vehicle.displacement}`;
          if (vehicleSelected) {
            vehicleSelected.innerHTML = `
              <span style="color:var(--success, #10b981);">✓</span> 
              <strong>${vehicle.make} ${vehicle.line}</strong> - Cilindraje: ${vehicle.displacement}${vehicle.modelYear ? ` | Modelo: ${vehicle.modelYear}` : ''}
            `;
          }
          // Asegurar que los campos estén sincronizados
          assign('#v-brand', vehicle.make || '');
          assign('#v-line', vehicle.line || '');
          assign('#v-engine', vehicle.displacement || '');
        }
      } catch (err) {
        console.warn('No se pudo cargar vehículo del perfil:', err);
      }
    } else if (veh.brand && veh.line && veh.engine) {
      // Si no tiene vehicleId pero tiene marca/línea/cilindraje, buscar en la BD
      try {
        const searchResult = await API.vehicles.search({ 
          q: `${veh.brand} ${veh.line} ${veh.engine}`, 
          limit: 1 
        });
        if (searchResult?.items?.length > 0) {
          const vehicle = searchResult.items[0];
          selectedVehicle = vehicle;
          vehicleIdInput.value = vehicle._id;
          if (vehicleSearch) vehicleSearch.value = `${vehicle.make} ${vehicle.line} ${vehicle.displacement}`;
          if (vehicleSelected) {
            vehicleSelected.innerHTML = `
              <span style="color:var(--success, #10b981);">✓</span> 
              <strong>${vehicle.make} ${vehicle.line}</strong> - Cilindraje: ${vehicle.displacement}${vehicle.modelYear ? ` | Modelo: ${vehicle.modelYear}` : ''}
            `;
          }
        }
      } catch (err) {
        console.warn('No se pudo buscar vehículo:', err);
      }
    }

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
        await applyProfile(profile, raw);
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
        await applyProfile(profile, plateCode);
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
        vehicleId: vehicleIdInput?.value || null,
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

  // ===== Nueva venta con placa (solo cámara OCR) =====
  async function openQRForNewSale(){
    if (starting) {
      console.log('Ya hay una venta iniciándose');
      return;
    }
    
    console.log('Abriendo lector de placa con cámara...');
    
    // Abrir directamente el modal de OCR
    async function openQRForNewSaleWithOCR(){
    const tpl = document.getElementById('tpl-qr-scanner');
    if (!tpl) {
      console.error('Template de QR no encontrado');
      alert('Template de QR no encontrado');
      return;
    }
    
    const nodeOCR = tpl.content.firstElementChild.cloneNode(true);
    
    const modalOCR = document.getElementById('modal');
    const slotOCR = document.getElementById('modalBody');
    const xOCR = document.getElementById('modalClose');
    
    if (!modalOCR || !slotOCR || !xOCR) {
      console.error('Modal no encontrado');
      return;
    }
    
    slotOCR.replaceChildren(nodeOCR);
    
    const video = nodeOCR.querySelector('#qr-video');
    const canvas = nodeOCR.querySelector('#qr-canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const sel = nodeOCR.querySelector('#qr-cam');
    const msg = nodeOCR.querySelector('#qr-msg');
    const manualInput = nodeOCR.querySelector('#qr-manual');
    const manualBtn = nodeOCR.querySelector('#qr-add-manual');
    
    // Ocultar controles de modo múltiple
    const singleModeBtn = nodeOCR.querySelector('#qr-single-mode');
    const multiModeBtn = nodeOCR.querySelector('#qr-multi-mode');
    const finishMultiBtn = nodeOCR.querySelector('#qr-finish-multi');
    if (singleModeBtn) singleModeBtn.style.display = 'none';
    if (multiModeBtn) multiModeBtn.style.display = 'none';
    if (finishMultiBtn) finishMultiBtn.style.display = 'none';
    
    if (msg) {
      msg.textContent = 'Escanea la placa del vehículo (formato: ABC123 o ABC-123)';
      msg.style.color = 'var(--text)';
    }
    
    let stream = null, running = false, detector = null, lastCode = '', lastTs = 0;
    let cameraDisabled = false;
    let lastValidPlate = null;
    let plateConfidenceCount = 0;
    let plateDetectionHistory = [];
    
    function stop(){ 
      try{ 
        if (video) {
          video.pause(); 
          video.srcObject = null;
        }
      }catch{}; 
      try{ 
        (stream?.getTracks()||[]).forEach(t=>t.stop()); 
      }catch{}; 
      running=false; 
      stream = null;
      
      // Terminar worker de OCR si existe
      if (ocrWorker) {
        try {
          ocrWorker.terminate().catch(() => {}); // Ignorar errores de terminación
          ocrWorker = null;
          console.log('OCR worker terminado');
        } catch (err) {
          console.warn('Error al terminar OCR worker:', err);
          ocrWorker = null; // Forzar a null incluso si hay error
        }
      }
      
      // Limpiar historial de detecciones
      plateDetectionHistory = [];
      lastValidPlate = null;
      plateConfidenceCount = 0;
      
      // Restaurar botón de iniciar
      const startBtn = nodeOCR.querySelector('#qr-start');
      if (startBtn) {
        startBtn.textContent = '📷 Iniciar cámara';
        startBtn.onclick = () => {
          start().catch(err => {
            console.error('Error al iniciar cámara:', err);
            if (msg) {
              msg.textContent = '❌ Error: ' + (err?.message || 'No se pudo iniciar la cámara');
              msg.style.color = 'var(--danger, #ef4444)';
            }
          });
        };
      }
    }
    
    // Configurar onclick después de definir stop
    xOCR.onclick = () => {
      stop();
      modalOCR.classList.add('hidden');
    };
    
    // Mostrar modal
    modalOCR.classList.remove('hidden');

    // Función para validar formato de placa: 3 letras - 3 números
    function isValidPlate(text) {
      const normalized = String(text || '').trim().toUpperCase();
      // Patrón: 3 letras, guion opcional, 3 números
      const platePattern = /^[A-Z]{3}[-]?[0-9]{3}$/;
      return platePattern.test(normalized);
    }

    // Función para normalizar placa (asegurar formato ABC-123)
    function normalizePlate(text) {
      const normalized = String(text || '').trim().toUpperCase().replace(/\s+/g, '');
      // Si tiene formato ABC123, convertirlo a ABC-123
      const match = normalized.match(/^([A-Z]{3})([0-9]{3})$/);
      if (match) {
        return `${match[1]}-${match[2]}`;
      }
      return normalized;
    }

    async function fillCams(){
      if (!sel) return Promise.resolve();
      try{
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        if (isMobile) {
          const defaultOpt = document.createElement('option');
          defaultOpt.value = '';
          defaultOpt.textContent = 'Cámara trasera (automática)';
          sel.replaceChildren(defaultOpt);
          sel.value = '';
          return Promise.resolve();
        }
        try {
          // Intentar enumerar sin permisos primero (puede que ya los tengamos)
          const devs = await navigator.mediaDevices.enumerateDevices();
          const cams = devs.filter(d=>d.kind==='videoinput');
          
          // Agregar opción "Predeterminada" al inicio
          const options = [document.createElement('option')];
          options[0].value = '';
          options[0].textContent = 'Cámara predeterminada';
          
          if (cams.length > 0) {
            // Si hay cámaras con labels, agregarlas
            const camsWithLabels = cams.filter(c => c.label);
            if (camsWithLabels.length > 0) {
              options.push(...camsWithLabels.map((c,i)=>{
                const o=document.createElement('option'); 
                o.value=c.deviceId; 
                o.textContent=c.label; 
                return o;
              }));
            } else {
              // Si no hay labels, agregar opciones genéricas
              options.push(...cams.map((c,i)=>{
                const o=document.createElement('option'); 
                o.value=c.deviceId; 
                o.textContent = 'Cámara ' + (i+1); 
                return o;
              }));
            }
          }
          
          sel.replaceChildren(...options);
          sel.value = ''; // Por defecto, usar cámara predeterminada
          return Promise.resolve();
        } catch (enumErr) {
          console.warn('Error al enumerar dispositivos:', enumErr);
          const defaultOpt = document.createElement('option');
          defaultOpt.value = '';
          defaultOpt.textContent = 'Cámara predeterminada';
          sel.replaceChildren(defaultOpt);
          sel.value = '';
          return Promise.resolve();
        }
      }catch(err){
        console.error('Error al cargar cámaras:', err);
        const defaultOpt = document.createElement('option');
        defaultOpt.value = '';
        defaultOpt.textContent = 'Cámara predeterminada';
        sel.replaceChildren(defaultOpt);
        sel.value = '';
        return Promise.resolve();
      }
    }

    async function start(){
      try{
        stop();
        
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        
        let videoConstraints;
        if (sel.value && sel.value.trim() !== '') {
          videoConstraints = { deviceId: { exact: sel.value } };
        } else if (isMobile) {
          videoConstraints = { 
            facingMode: 'environment',
            width: { ideal: 1280 },
            height: { ideal: 720 }
          };
        } else {
          videoConstraints = true;
        }
        
        const cs = { 
          video: videoConstraints, 
          audio: false 
        };
        
        msg.textContent = 'Solicitando acceso a la cámara...';
        msg.style.color = 'var(--text)';
        
        stream = await navigator.mediaDevices.getUserMedia(cs);
        
        video.setAttribute('playsinline', 'true');
        video.setAttribute('webkit-playsinline', 'true');
        video.muted = true;
        video.srcObject = stream; 
        
        await new Promise((resolve, reject) => {
          video.onloadedmetadata = () => {
            video.play().then(resolve).catch(reject);
          };
          video.onerror = reject;
          setTimeout(() => {
            if (video.readyState >= 2) {
              video.play().then(resolve).catch(reject);
            } else {
              reject(new Error('Timeout esperando video'));
            }
          }, 5000);
        });
        
        running = true;
        
        // Después de obtener permisos, actualizar lista de cámaras con labels completos
        if (!isMobile) {
          try {
            const devs = await navigator.mediaDevices.enumerateDevices();
            const cams = devs.filter(d=>d.kind==='videoinput');
            if (cams.length > 0) {
              // Agregar opción "Predeterminada" al inicio
              const options = [document.createElement('option')];
              options[0].value = '';
              options[0].textContent = 'Cámara predeterminada';
              
              // Agregar todas las cámaras con labels completos
              options.push(...cams.map((c,i)=>{
                const o=document.createElement('option'); 
                o.value=c.deviceId; 
                o.textContent=c.label || ('Cámara '+(i+1)); 
                return o;
              }));
              
              // Mantener la selección actual si existe
              const currentValue = sel.value;
              sel.replaceChildren(...options);
              
              // Restaurar selección si existe, sino usar predeterminada
              if (currentValue && Array.from(sel.options).some(opt => opt.value === currentValue)) {
                sel.value = currentValue;
              } else {
                sel.value = '';
              }
            }
          } catch (enumErr) {
            console.warn('No se pudieron actualizar las cámaras:', enumErr);
          }
        }
        
        // Inicializar OCR
        await initOCR();
        
        if (window.BarcodeDetector) { 
          detector = new BarcodeDetector({ formats: ['qr_code'] }); 
          tickNative(); 
        } else { 
          tickCanvas(); 
        }
        
        // Actualizar mensaje y botón
        if (msg) {
          msg.textContent = 'Escanea la placa del vehículo (formato: ABC123 o ABC-123)';
          msg.style.color = 'var(--text)';
        }
        
        // Cambiar texto del botón a "Detener cámara"
        const startBtn = nodeOCR.querySelector('#qr-start');
        if (startBtn) {
          startBtn.textContent = '⏹️ Detener cámara';
          startBtn.onclick = () => {
            stop();
            if (startBtn) {
              startBtn.textContent = '📷 Iniciar cámara';
              startBtn.onclick = () => {
                start().catch(err => {
                  console.error('Error al iniciar cámara:', err);
                  if (msg) {
                    msg.textContent = '❌ Error: ' + (err?.message || 'No se pudo iniciar la cámara');
                    msg.style.color = 'var(--danger, #ef4444)';
                  }
                });
              };
            }
            if (msg) {
              msg.textContent = 'Cámara detenida. Haz clic en "Iniciar cámara" para continuar';
              msg.style.color = 'var(--text)';
            }
          };
        }
      }catch(e){ 
        console.error('Error al iniciar cámara:', e);
        let errorMsg = '';
        if (e.name === 'NotAllowedError' || e.name === 'PermissionDeniedError') {
          errorMsg = '❌ Permisos de cámara denegados. Por favor, permite el acceso a la cámara.';
        } else if (e.name === 'NotFoundError' || e.name === 'DevicesNotFoundError') {
          errorMsg = '❌ No se encontró ninguna cámara.';
        } else if (e.name === 'NotReadableError' || e.name === 'TrackStartError') {
          errorMsg = '❌ La cámara está siendo usada por otra aplicación.';
        } else {
          errorMsg = '❌ No se pudo abrir cámara: ' + (e?.message||e?.name||'Error desconocido');
        }
        msg.textContent = errorMsg;
        msg.style.color = 'var(--danger, #ef4444)';
        running = false;
      }
    }

    // Función para validar formato de placa: 3 letras - 3 números (con o sin guion)
    function isValidPlate(text) {
      const normalized = String(text || '').trim().toUpperCase().replace(/[-]/g, '');
      // Patrón: 3 letras seguidas de 3 números (sin guion para validación)
      const platePattern = /^[A-Z]{3}[0-9]{3}$/;
      return platePattern.test(normalized);
    }

    // Función para normalizar placa (asegurar formato ABC123 sin guion)
    function normalizePlate(text) {
      const normalized = String(text || '').trim().toUpperCase().replace(/[\s-]/g, '');
      // Asegurar formato ABC123 (sin guion)
      const match = normalized.match(/^([A-Z]{3})([0-9]{3})$/);
      if (match) {
        return `${match[1]}${match[2]}`;
      }
      return normalized;
    }

    function accept(value){
      if (cameraDisabled) return false;
      
      // Solo aceptar si es una placa válida
      if (!isValidPlate(value)) {
        return false;
      }
      
      const normalized = normalizePlate(value);
      const t = Date.now();
      const delay = 1500;
      
      if (lastCode === normalized && t - lastTs < delay) {
        return false;
      }
      
      lastCode = normalized;
      lastTs = t;
      return true;
    }

    async function handlePlate(plateText){
      // Normalizar placa (sin guion: ABC123)
      const normalized = normalizePlate(plateText);
      if (!isValidPlate(normalized)) {
        if (msg) {
          msg.textContent = '❌ Formato de placa inválido. Debe ser: ABC123 o ABC-123';
          msg.style.color = 'var(--danger, #ef4444)';
        }
        setTimeout(() => {
          if (msg) {
            msg.textContent = 'Escanea la placa del vehículo (formato: ABC123 o ABC-123)';
            msg.style.color = 'var(--text)';
          }
          cameraDisabled = false;
        }, 2000);
        return;
      }
      
      console.log('Placa normalizada (sin guion):', normalized);

      cameraDisabled = true;
      // Mostrar placa detectada en el mensaje
      const displayPlate = normalized.length === 6 ? `${normalized.substring(0,3)}-${normalized.substring(3)}` : normalized;
      if (msg) {
        msg.textContent = `Placa detectada: ${displayPlate}`;
        msg.style.color = 'var(--accent, #2563eb)';
      }
      
      msg.textContent = 'Procesando placa...';
      msg.style.color = 'var(--text)';

      try {
        // Iniciar nueva venta
        starting = true;
        const s = await API.sales.start();
        current = s;
        syncCurrentIntoOpenList();
        
        // Buscar perfil por placa
        let profile = null;
        try {
          profile = await API.sales.profileByPlate(normalized, { fuzzy: true });
        } catch {}
        if (!profile) {
          try {
            profile = await API.sales.profileByPlate(normalized);
          } catch {}
        }

        // Aplicar perfil si existe
        if (profile) {
          // Actualizar venta con datos del cliente y vehículo
          const customerData = {
            name: profile.customer?.name || '',
            idNumber: profile.customer?.idNumber || '',
            phone: profile.customer?.phone || '',
            email: profile.customer?.email || '',
            address: profile.customer?.address || ''
          };
          
          const vehicleData = {
            plate: normalized,
            brand: profile.vehicle?.brand || '',
            line: profile.vehicle?.line || '',
            engine: profile.vehicle?.engine || '',
            year: profile.vehicle?.year || null,
            mileage: profile.vehicle?.mileage || null,
            vehicleId: profile.vehicle?.vehicleId || null
          };

          await API.sales.setCustomerVehicle(s._id, {
            customer: customerData,
            vehicle: vehicleData
          });

          // Recargar venta actualizada
          current = await API.sales.get(s._id);
        } else {
          // Si no hay perfil, al menos establecer la placa
          await API.sales.setCustomerVehicle(s._id, {
            vehicle: { plate: normalized }
          });
          current = await API.sales.get(s._id);
        }

        // Reproducir sonido de confirmación
        try {
          const audioContext = new (window.AudioContext || window.webkitAudioContext)();
          const oscillator = audioContext.createOscillator();
          const gainNode = audioContext.createGain();
          oscillator.connect(gainNode);
          gainNode.connect(audioContext.destination);
          oscillator.frequency.value = 800;
          oscillator.type = 'sine';
          gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
          gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);
          oscillator.start(audioContext.currentTime);
          oscillator.stop(audioContext.currentTime + 0.1);
        } catch (err) {
          console.warn('No se pudo reproducir sonido:', err);
        }

        // Cerrar modal y renderizar venta
        stop();
        if (modalOCR) modalOCR.classList.add('hidden');
        
        renderTabs();
        renderSale();
        renderWO();
        await renderQuoteForCurrentSale();
        await refreshOpenSales({ focusId: s._id, preferCurrent: current });

        // Si hay vehículo conectado, abrir automáticamente el modal de agregar items
        if (profile?.vehicle?.vehicleId) {
          setTimeout(() => {
            const addBtn = document.getElementById('sales-add-unified');
            if (addBtn) {
              addBtn.click();
            }
          }, 500);
        }

        starting = false;
      } catch(e) {
        console.error('Error al procesar placa:', e);
        msg.textContent = '❌ Error: ' + (e?.message || 'No se pudo crear la venta');
        msg.style.color = 'var(--danger, #ef4444)';
        starting = false;
        setTimeout(() => {
          cameraDisabled = false;
          msg.textContent = 'Escanea la placa del vehículo (formato: ABC123 o ABC-123)';
          msg.style.color = 'var(--text)';
        }, 3000);
      }
    }

    function onCode(code){
      if (!isValidPlate(code)) {
        // Ignorar códigos que no sean placas
        return;
      }
      handlePlate(code);
    }

    let ocrWorker = null;
    let lastOcrTime = 0;
    let lastApiTime = 0;
    const ocrInterval = 500; // Procesar OCR cada 500ms (más rápido)
    const apiInterval = 800; // Plate Recognizer API cada 800ms (evitar rate limits)
    // plateDetectionHistory ya está declarada en openQRForNewSale
    
    // Usar Plate Recognizer API (más confiable que OCR genérico)
    // Plan gratuito: 2000 requests/mes
    // Obtén tu API key en: https://platerecognizer.com/
    const PLATE_RECOGNIZER_API_KEY = (typeof window !== 'undefined' && window.PLATE_RECOGNIZER_API_KEY) || '';
    const USE_PLATE_RECOGNIZER = (typeof window !== 'undefined' && window.USE_PLATE_RECOGNIZER) || false;
    
    async function recognizePlateWithAPI(canvas) {
      if (!USE_PLATE_RECOGNIZER || !PLATE_RECOGNIZER_API_KEY || PLATE_RECOGNIZER_API_KEY === 'YOUR_API_KEY_HERE') {
        console.log('Plate Recognizer API no configurada o deshabilitada');
        return null;
      }
      
      try {
        console.log('🔍 Enviando imagen a Plate Recognizer API...');
        // Convertir canvas a blob optimizado (JPEG con calidad media para velocidad)
        const blob = await new Promise(resolve => {
          canvas.toBlob(resolve, 'image/jpeg', 0.7);
        });
        
        const formData = new FormData();
        formData.append('upload', blob, 'plate.jpg');
        formData.append('regions', 'co'); // Colombia
        
        console.log('📤 Request a Plate Recognizer API iniciada');
        const response = await fetch('https://api.platerecognizer.com/v1/plate-reader/', {
          method: 'POST',
          headers: {
            'Authorization': `Token ${PLATE_RECOGNIZER_API_KEY}`
          },
          body: formData
        });
        
        console.log('📥 Response recibida:', response.status, response.statusText);
        
        if (!response.ok) {
          if (response.status === 429) {
            console.warn('Plate Recognizer API: Rate limit alcanzado');
          } else {
            const errorText = await response.text();
            console.warn('Plate Recognizer API error:', response.status, errorText);
          }
          return null;
        }
        
        const data = await response.json();
        console.log('📊 Datos recibidos de API:', data);
        
        if (data.results && data.results.length > 0) {
          const plate = data.results[0].plate?.toUpperCase().replace(/[^A-Z0-9]/g, '');
          const confidence = data.results[0].score || 0;
          console.log(`🔍 Placa detectada por API: "${plate}", confianza: ${(confidence * 100).toFixed(1)}%`);
          
          // Aceptar con confianza más baja (0.6) para ser más permisivo
          if (plate && plate.length >= 5 && confidence > 0.6) {
            // Validar formato de placa colombiana
            const normalized = plate.replace(/[^A-Z0-9]/g, '');
            if (/^[A-Z]{3}[0-9]{3}$/.test(normalized)) {
              console.log(`✅ Placa válida detectada por Plate Recognizer API: ${normalized} (confianza: ${(confidence * 100).toFixed(1)}%)`);
              return { plate: normalized, confidence: confidence * 100 };
            } else {
              console.log(`⚠️ Placa detectada pero formato inválido: "${normalized}"`);
            }
          } else {
            console.log(`⚠️ Placa detectada pero confianza muy baja: ${(confidence * 100).toFixed(1)}%`);
          }
        } else {
          console.log('⚠️ No se detectaron placas en la imagen');
        }
      } catch (err) {
        console.error('❌ Error en Plate Recognizer API:', err);
      }
      return null;
    }
    
    // Inicializar worker de OCR optimizado para velocidad
    async function initOCR() {
      if (typeof Tesseract === 'undefined') {
        console.warn('Tesseract.js no está disponible');
        return null;
      }
      try {
        if (!ocrWorker) {
          console.log('Inicializando OCR worker optimizado...');
          // Usar solo inglés para mejor velocidad (las placas son alfanuméricas)
          // Los parámetros que solo se pueden establecer durante la inicialización
          // deben pasarse en createWorker, no después
          ocrWorker = await Tesseract.createWorker('eng', 1, {
            logger: () => {}, // Silenciar todos los logs para mejor rendimiento
            // Parámetros que solo se pueden establecer durante la inicialización
            load_system_dawg: '0',
            load_freq_dawg: '0',
            load_unambig_dawg: '0',
            load_punc_dawg: '0',
            load_number_dawg: '0',
          });
          // Solo establecer parámetros que se pueden cambiar después de la inicialización
          await ocrWorker.setParameters({
            tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
            tessedit_pageseg_mode: '8', // Single word (más rápido para placas)
            classify_bln_numeric_mode: '0',
          });
          console.log('OCR worker inicializado (optimizado para velocidad)');
        }
        return ocrWorker;
      } catch (err) {
        console.error('Error al inicializar OCR:', err);
        ocrWorker = null; // Resetear en caso de error
        return null;
      }
    }
    
    // Función optimizada para mejorar imagen antes del OCR (más rápida)
    function enhanceImageForOCR(canvas, ctx, imageData) {
      const width = imageData.width;
      const height = imageData.height;
      
      // Escalar solo 1.5x para mejor balance velocidad/precisión (antes era 2x)
      const scale = 1.5;
      const scaledWidth = Math.floor(width * scale);
      const scaledHeight = Math.floor(height * scale);
      
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = scaledWidth;
      tempCanvas.height = scaledHeight;
      const tempCtx = tempCanvas.getContext('2d');
      tempCtx.imageSmoothingEnabled = true;
      tempCtx.imageSmoothingQuality = 'medium'; // 'medium' en lugar de 'high' para velocidad
      
      tempCtx.drawImage(canvas, 0, 0, scaledWidth, scaledHeight);
      
      const scaledImageData = tempCtx.getImageData(0, 0, scaledWidth, scaledHeight);
      const scaledData = scaledImageData.data;
      
      // Binarización rápida con umbral fijo (más rápido que adaptativo)
      const threshold = 128;
      for (let i = 0; i < scaledData.length; i += 4) {
        const r = scaledData[i];
        const g = scaledData[i + 1];
        const b = scaledData[i + 2];
        const gray = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
        const final = gray > threshold ? 255 : 0;
        scaledData[i] = final;
        scaledData[i + 1] = final;
        scaledData[i + 2] = final;
      }
      
      tempCtx.putImageData(scaledImageData, 0, 0);
      return tempCanvas;
    }
    
    // Función para corregir errores comunes de OCR (solo fragmentos, NO corrección T->I)
    function correctOCRCommonMistakes(text) {
      if (!text) return text;
      
      let corrected = text.toUpperCase().trim();
      
      // Solo corregir fragmentos obvios, NO hacer corrección automática T->I
      // Si solo detecta "AM -650" o "AM-650", agregar "I" al inicio
      // Esto maneja cuando la I se pierde completamente (no es T->I, es I faltante)
      const amPattern = /^AM[\s-]?([0-9]{3})$/;
      const amMatch = corrected.match(amPattern);
      if (amMatch) {
        corrected = 'IAM-' + amMatch[1];
        console.log(`Corrección OCR aplicada: "${text}" -> "${corrected}" (agregando I faltante)`);
      }
      
      return corrected;
    }
    
    // Función para extraer placa del texto OCR
    // Acepta formato: 3 letras seguidas de 3 números (con o sin guion: ABC123 o ABC-123)
    // Retorna SIN guion: ABC123 (formato usado en la base de datos)
    // MÁS ESTRICTA: Solo acepta placas que tengan formato perfecto
    function extractPlateFromText(text) {
      if (!text) return null;
      
      console.log('Extrayendo placa del texto OCR completo:', text);
      
      // Corregir errores comunes de OCR antes de procesar
      const corrected = correctOCRCommonMistakes(text);
      
      // Limpiar el texto y convertir a mayúsculas
      const clean = corrected.replace(/[^A-Z0-9\s-]/g, ' ').trim();
      
      // Validación estricta: el texto debe ser principalmente la placa
      // Rechazar si hay demasiado texto adicional
      const words = clean.split(/\s+/).filter(w => w.length > 0);
      if (words.length > 4) {
        console.log('Rechazado: demasiado texto detectado (posible ruido)');
        return null;
      }
      
      // Buscar patrón EXACTO: 3 letras seguidas de 3 números (con o sin separador)
      // Priorizar patrones más estrictos primero
      const strictPatterns = [
        /^([A-Z]{3})[-]?([0-9]{3})$/g,  // Exactamente ABC123 o ABC-123 (sin nada más)
        /\b([A-Z]{3})[-]?([0-9]{3})\b/g,  // ABC123 o ABC-123 como palabra completa
      ];
      
      for (const pattern of strictPatterns) {
        const matches = [...clean.matchAll(pattern)];
        for (const match of matches) {
          let letters = match[1];
          const numbers = match[2];
          
          // NO hacer corrección automática T->I (el usuario indicó que no siempre es correcto)
          // Solo corregir si falta la I completamente (AM -> IAM)
          if (letters.length === 2 && /^[A-Z]{2}$/.test(letters) && numbers.length === 3) {
            // Verificar si podría ser AM -> IAM (I faltante, no T mal leída)
            if (letters === 'AM') {
              letters = 'IAM';
              console.log(`Corrección aplicada: agregando I faltante -> "${letters}"`);
            }
          }
          
          // Validación estricta adicional
          if (letters && letters.length === 3 && numbers && numbers.length === 3) {
            // Validar que las letras sean realmente letras (no números mal interpretados)
            if (!/^[A-Z]{3}$/.test(letters)) {
              console.log('Rechazado: letras inválidas:', letters);
              continue;
            }
            // Validar que los números sean realmente números
            if (!/^[0-9]{3}$/.test(numbers)) {
              console.log('Rechazado: números inválidos:', numbers);
              continue;
            }
            
            // Retornar SIN guion (formato de base de datos: ABC123)
            const plate = `${letters}${numbers}`;
            console.log('✅ Placa extraída encontrada (validada estrictamente):', plate);
            return plate;
          }
        }
      }
      
      // Si no encontró con patrones estrictos, buscar en palabras separadas
      // PERO solo si hay exactamente 2 palabras (3 letras + 3 números)
      if (words.length === 2) {
        let word1 = words[0];
        const word2 = words[1];
        
        // NO hacer corrección automática T->I
        // Solo corregir si falta la I completamente (AM -> IAM)
        if (word1 === 'AM' && word1.length === 2) {
          word1 = 'IAM';
          console.log(`Corrección aplicada en palabras separadas: "AM" -> "IAM" (I faltante)`);
        }
        
        // Patrón: primera palabra 3 letras, segunda palabra 3 números
        if (/^[A-Z]{3}$/.test(word1) && /^[0-9]{3}$/.test(word2)) {
          const plate = `${word1}${word2}`;
          console.log('✅ Placa extraída (palabras separadas, validada):', plate);
          return plate;
        }
      }
      
      // Si hay una sola palabra, verificar que sea exactamente ABC123
      if (words.length === 1) {
        let word = words[0];
        
        // NO hacer corrección automática T->I
        // Solo corregir si falta la I completamente (AM -> IAM)
        const amMatch = word.match(/^(AM)([0-9]{3})$/);
        if (amMatch) {
          word = 'IAM' + amMatch[2];
          console.log(`Corrección aplicada en palabra única: "AM" -> "IAM" (I faltante)`);
        }
        
        const finalMatch = word.match(/^([A-Z]{3})([0-9]{3})$/);
        if (finalMatch && finalMatch[1] && finalMatch[1].length === 3 && finalMatch[2] && finalMatch[2].length === 3) {
          const plate = `${finalMatch[1]}${finalMatch[2]}`;
          console.log('✅ Placa extraída (palabra única, validada):', plate);
          return plate;
        }
      }
      
      console.log('❌ No se encontró placa válida en el texto (validación estricta)');
      return null;
    }
    
    async function tickNative(){ 
      if(!running || cameraDisabled) {
        if (running && cameraDisabled) {
          requestAnimationFrame(tickNative);
        }
        return;
      }
      
      // Intentar primero con QR (por si acaso hay un código QR)
      try{ 
        if (detector) {
          const codes=await detector.detect(video); 
          if(codes && codes.length > 0 && codes[0]?.rawValue) {
            const code = codes[0].rawValue;
            if (isValidPlate(code)) {
              onCode(code);
              return;
            }
          }
        }
      }catch(e){
        // Ignorar errores de QR
      }
      
      const now = Date.now();
      
      // PRIORIDAD 1: Intentar con Plate Recognizer API (más rápido y preciso)
      if (USE_PLATE_RECOGNIZER && PLATE_RECOGNIZER_API_KEY && now - lastApiTime >= apiInterval && video.readyState >= 2) {
        lastApiTime = now;
        try {
          const w = video.videoWidth|0, h = video.videoHeight|0;
          if (w && h) {
            canvas.width = w;
            canvas.height = h;
            ctx.drawImage(video, 0, 0, w, h);
            
            // Procesar región central (donde suele estar la placa)
            const region = {
              x: Math.floor(w * 0.2),
              y: Math.floor(h * 0.3),
              w: Math.floor(w * 0.6),
              h: Math.floor(h * 0.4)
            };
            
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = region.w;
            tempCanvas.height = region.h;
            const tempCtx = tempCanvas.getContext('2d');
            tempCtx.drawImage(canvas, region.x, region.y, region.w, region.h, 0, 0, region.w, region.h);
            
            const result = await recognizePlateWithAPI(tempCanvas);
            if (result && result.plate && isValidPlate(result.plate)) {
              // Con Plate Recognizer API, aceptar inmediatamente si confianza > 70
              // O con 2 detecciones si confianza > 60
              plateDetectionHistory.push({
                plate: result.plate,
                timestamp: now,
                confidence: result.confidence
              });
              
              plateDetectionHistory = plateDetectionHistory.filter(
                entry => now - entry.timestamp < 3000
              );
              
              const plateCount = plateDetectionHistory.filter(e => e.plate === result.plate).length;
              const requiredDetections = result.confidence > 70 ? 1 : 2;
              
              if (plateCount >= requiredDetections) {
                console.log(`✅ Placa detectada por API (${plateCount} detecciones, confianza: ${result.confidence.toFixed(1)}):`, result.plate);
                plateDetectionHistory = [];
                onCode(result.plate);
                return;
              }
            }
          }
        } catch (apiErr) {
          console.warn('Error en Plate Recognizer API:', apiErr);
        }
      }
      
      // PRIORIDAD 2: Fallback a OCR Tesseract (más lento pero funciona sin API)
      if (now - lastOcrTime >= ocrInterval) {
        lastOcrTime = now;
        try {
          if (!ocrWorker) {
            await initOCR();
          }
          
          // Verificar que el worker no haya sido terminado
          if (!ocrWorker) {
            requestAnimationFrame(tickNative);
            return;
          }
          
          if (video.readyState >= 2) {
            const w = video.videoWidth|0, h = video.videoHeight|0;
            if (w && h) {
              canvas.width = w;
              canvas.height = h;
              ctx.drawImage(video, 0, 0, w, h);
              
              const region = {
                x: Math.floor(w * 0.2),
                y: Math.floor(h * 0.3),
                w: Math.floor(w * 0.6),
                h: Math.floor(h * 0.4)
              };
              
              const imageData = ctx.getImageData(region.x, region.y, region.w, region.h);
              const tempCanvas = document.createElement('canvas');
              tempCanvas.width = region.w;
              tempCanvas.height = region.h;
              const tempCtx = tempCanvas.getContext('2d');
              tempCtx.putImageData(imageData, 0, 0);
              
              const enhancedCanvas = enhanceImageForOCR(tempCanvas, tempCtx, imageData);
              
              try {
                // Verificar nuevamente que el worker existe antes de usar
                if (!ocrWorker) {
                  requestAnimationFrame(tickNative);
                  return;
                }
                const { data: { text, words } } = await ocrWorker.recognize(enhancedCanvas);
                
                if (text && text.trim()) {
                  let processedText = text;
                  let avgConfidence = 0;
                  
                  if (words && words.length > 0) {
                    const confidences = words.map(w => w.confidence || 0).filter(c => c > 0);
                    avgConfidence = confidences.length > 0 
                      ? confidences.reduce((a, b) => a + b, 0) / confidences.length 
                      : 0;
                    
                    if (avgConfidence > 0 && avgConfidence < 45) {
                      // Rechazar si confianza muy baja
                      requestAnimationFrame(tickNative);
                      return;
                    }
                    
                    const highConfWords = words.filter(w => (w.confidence || 0) > 55);
                    if (highConfWords.length > 0) {
                      processedText = highConfWords.map(w => w.text).join(' ').trim();
                    } else {
                      requestAnimationFrame(tickNative);
                      return;
                    }
                  }
                  
                  if (processedText && processedText.trim()) {
                    const plate = extractPlateFromText(processedText);
                    if (plate && isValidPlate(plate)) {
                      plateDetectionHistory.push({
                        plate,
                        timestamp: now,
                        confidence: avgConfidence
                      });
                      
                      plateDetectionHistory = plateDetectionHistory.filter(
                        entry => now - entry.timestamp < 3000
                      );
                      
                      const plateCount = plateDetectionHistory.filter(e => e.plate === plate).length;
                      // Aceptar más rápido: 1 detección si confianza > 70, 2 si > 55
                      const requiredDetections = avgConfidence > 70 ? 1 : (avgConfidence > 55 ? 2 : 2);
                      
                      if (plateCount >= requiredDetections) {
                        console.log(`✅ Placa detectada por OCR (${plateCount} detecciones, confianza: ${avgConfidence.toFixed(1)}):`, plate);
                        plateDetectionHistory = [];
                        onCode(plate);
                        return;
                      }
                    }
                  }
                }
              } catch (ocrErr) {
                // Continuar
              }
            }
          }
        } catch (ocrErr) {
          // Silenciar errores frecuentes
        }
      }
      
      requestAnimationFrame(tickNative); 
    }
    
    function tickCanvas(){
      if(!running || cameraDisabled) {
        if (running && cameraDisabled) {
          requestAnimationFrame(tickCanvas);
        }
        return;
      }
      try{
        const w = video.videoWidth|0, h = video.videoHeight|0;
        if(!w||!h){ 
          requestAnimationFrame(tickCanvas); 
          return; 
        }
        canvas.width=w; 
        canvas.height=h;
        ctx.drawImage(video,0,0,w,h);
        
        // Intentar primero con QR
        const imgData=ctx.getImageData(0,0,w,h);
        if (typeof jsQR !== 'undefined') {
          const code=jsQR(imgData.data, w, h);
          if(code && code.data && isValidPlate(code.data)) {
            onCode(code.data);
            return;
          }
        }
        
        const now = Date.now();
        
        // PRIORIDAD 1: Plate Recognizer API
        if (USE_PLATE_RECOGNIZER && PLATE_RECOGNIZER_API_KEY && now - lastApiTime >= apiInterval && video.readyState >= 2) {
          lastApiTime = now;
          (async () => {
            try {
              const region = {
                x: Math.floor(w * 0.2),
                y: Math.floor(h * 0.3),
                w: Math.floor(w * 0.6),
                h: Math.floor(h * 0.4)
              };
              
              const tempCanvas = document.createElement('canvas');
              tempCanvas.width = region.w;
              tempCanvas.height = region.h;
              const tempCtx = tempCanvas.getContext('2d');
              tempCtx.drawImage(canvas, region.x, region.y, region.w, region.h, 0, 0, region.w, region.h);
              
              const result = await recognizePlateWithAPI(tempCanvas);
              if (result && result.plate && isValidPlate(result.plate)) {
                plateDetectionHistory.push({
                  plate: result.plate,
                  timestamp: now,
                  confidence: result.confidence
                });
                
                plateDetectionHistory = plateDetectionHistory.filter(
                  entry => now - entry.timestamp < 3000
                );
                
                const plateCount = plateDetectionHistory.filter(e => e.plate === result.plate).length;
                const requiredDetections = result.confidence > 70 ? 1 : 2;
                
                if (plateCount >= requiredDetections) {
                  console.log(`✅ Placa detectada por API (${plateCount} detecciones):`, result.plate);
                  plateDetectionHistory = [];
                  onCode(result.plate);
                  return;
                }
              }
            } catch (apiErr) {
              console.warn('Error en Plate Recognizer API (tickCanvas):', apiErr);
            }
          })();
        }
        
        // PRIORIDAD 2: OCR Tesseract
        if (now - lastOcrTime >= ocrInterval) {
          lastOcrTime = now;
          (async () => {
            try {
              if (!ocrWorker) {
                await initOCR();
              }
              
              if (!ocrWorker) {
                requestAnimationFrame(tickCanvas);
                return;
              }
              
              const region = {
                x: Math.floor(w * 0.2),
                y: Math.floor(h * 0.3),
                w: Math.floor(w * 0.6),
                h: Math.floor(h * 0.4)
              };
              
              const imageData = ctx.getImageData(region.x, region.y, region.w, region.h);
              const tempCanvas = document.createElement('canvas');
              tempCanvas.width = region.w;
              tempCanvas.height = region.h;
              const tempCtx = tempCanvas.getContext('2d');
              tempCtx.putImageData(imageData, 0, 0);
              
              const enhancedCanvas = enhanceImageForOCR(tempCanvas, tempCtx, imageData);
              
              try {
                // Verificar nuevamente que el worker existe antes de usar
                if (!ocrWorker) {
                  requestAnimationFrame(tickCanvas);
                  return;
                }
                const { data: { text, words } } = await ocrWorker.recognize(enhancedCanvas);
                
                if (text && text.trim()) {
                  let processedText = text;
                  let avgConfidence = 0;
                  
                  if (words && words.length > 0) {
                    const confidences = words.map(w => w.confidence || 0).filter(c => c > 0);
                    avgConfidence = confidences.length > 0 
                      ? confidences.reduce((a, b) => a + b, 0) / confidences.length 
                      : 0;
                    
                    if (avgConfidence > 0 && avgConfidence < 45) {
                      requestAnimationFrame(tickCanvas);
                      return;
                    }
                    
                    const highConfWords = words.filter(w => (w.confidence || 0) > 55);
                    if (highConfWords.length > 0) {
                      processedText = highConfWords.map(w => w.text).join(' ').trim();
                    } else {
                      requestAnimationFrame(tickCanvas);
                      return;
                    }
                  }
                  
                  if (processedText && processedText.trim()) {
                    const plate = extractPlateFromText(processedText);
                    if (plate && isValidPlate(plate)) {
                      plateDetectionHistory.push({
                        plate,
                        timestamp: now,
                        confidence: avgConfidence
                      });
                      
                      plateDetectionHistory = plateDetectionHistory.filter(
                        entry => now - entry.timestamp < 3000
                      );
                      
                      const plateCount = plateDetectionHistory.filter(e => e.plate === plate).length;
                      const requiredDetections = avgConfidence > 70 ? 1 : (avgConfidence > 55 ? 2 : 2);
                      
                      if (plateCount >= requiredDetections) {
                        console.log(`✅ Placa detectada por OCR (${plateCount} detecciones):`, plate);
                        plateDetectionHistory = [];
                        onCode(plate);
                        return;
                      }
                    }
                  }
                }
              } catch (ocrErr) {
                // Continuar
              }
            } catch (ocrErr) {
              // Silenciar errores frecuentes
            }
          })();
        }
      }catch(e){
        console.warn('Error en tickCanvas:', e);
      }
      requestAnimationFrame(tickCanvas);
    }

    // Input manual
    if (manualBtn) {
      manualBtn.onclick = () => {
        const text = manualInput?.value?.trim() || '';
        if (text) {
          handlePlate(text);
        }
      };
    }

    // Crear botón de iniciar cámara si no existe
    let startBtn = nodeOCR.querySelector('#qr-start');
    if (!startBtn) {
      // Crear botón de iniciar cámara
      const qrbar = nodeOCR.querySelector('.qrbar');
      if (qrbar) {
        startBtn = document.createElement('button');
        startBtn.id = 'qr-start';
        startBtn.className = 'primary';
        startBtn.textContent = '📷 Iniciar cámara';
        startBtn.style.marginLeft = 'auto';
        startBtn.style.whiteSpace = 'nowrap';
        qrbar.appendChild(startBtn);
      }
    }

    // Función para actualizar selector de cámara cuando cambie
    if (sel) {
      sel.addEventListener('change', () => {
        // Si la cámara está corriendo, reiniciarla con la nueva cámara
        if (running) {
          stop();
          setTimeout(() => {
            start().catch(err => {
              console.error('Error al reiniciar cámara:', err);
              if (msg) {
                msg.textContent = '❌ Error al cambiar de cámara: ' + (err?.message || 'Error desconocido');
                msg.style.color = 'var(--danger, #ef4444)';
              }
            });
          }, 300);
        }
      });
    }

    // Botón de iniciar cámara
    if (startBtn) {
      startBtn.onclick = () => {
        start().catch(err => {
          console.error('Error al iniciar cámara:', err);
          if (msg) {
            msg.textContent = '❌ Error: ' + (err?.message || 'No se pudo iniciar la cámara');
            msg.style.color = 'var(--danger, #ef4444)';
          }
        });
      };
    }

    // Botón de cerrar
    const closeBtn = nodeOCR.querySelector('#qr-close');
    if (closeBtn) {
      closeBtn.onclick = () => {
        stop();
        if (modalOCR) modalOCR.classList.add('hidden');
      };
    }

    // Cargar lista de cámaras e iniciar automáticamente
    fillCams().then(() => {
      console.log('Lista de cámaras cargada');
      // Iniciar cámara automáticamente después de cargar
      setTimeout(() => {
        if (startBtn) {
          startBtn.click();
        } else {
          // Si no hay botón, iniciar directamente
          start().catch(err => {
            console.error('Error al iniciar cámara automáticamente:', err);
            if (msg) {
              msg.textContent = '❌ Error: ' + (err?.message || 'No se pudo iniciar la cámara');
              msg.style.color = 'var(--danger, #ef4444)';
            }
          });
        }
      }, 500);
    }).catch(err => {
      console.warn('Error al cargar cámaras:', err);
      // Intentar iniciar de todas formas
      setTimeout(() => {
        start().catch(startErr => {
          console.error('Error al iniciar cámara:', startErr);
          if (msg) {
            msg.textContent = '❌ Error: ' + (startErr?.message || 'No se pudo iniciar la cámara');
            msg.style.color = 'var(--danger, #ef4444)';
          }
        });
      }, 500);
    });
    
    // Actualizar mensaje inicial
    if (msg) {
      if (USE_PLATE_RECOGNIZER && PLATE_RECOGNIZER_API_KEY) {
        msg.textContent = '📷 Usando Plate Recognizer API (rápido y preciso) - Enfoca la placa...';
        msg.style.color = 'var(--text)';
      } else {
        msg.textContent = '📷 OCR optimizado activo - Enfoca la placa claramente. Para mejor precisión, configura Plate Recognizer API en config.js';
        msg.style.color = 'var(--text)';
      }
    }
    
    console.log('Modal QR abierto correctamente');
    } // Cerrar openQRForNewSaleWithOCR
    
    // Llamar a la función OCR directamente
    openQRForNewSaleWithOCR();
  } // Cerrar openQRForNewSale

  // Registrar event listeners DESPUÉS de definir las funciones
  // Función auxiliar para manejar eventos táctiles y de clic
  function setupMobileButton(buttonId, handler, buttonName) {
    const btn = document.getElementById(buttonId);
    if (!btn) {
      console.warn(`Botón ${buttonId} (${buttonName}) no encontrado en el DOM`);
      return;
    }
    
    console.log(`Registrando event listeners para ${buttonId} (${buttonName})`);
    
    // Función unificada para manejar tanto click como touch
    let touchStarted = false;
    const handleEvent = (e) => {
      console.log(`Evento ${e.type} detectado en ${buttonId}`);
      
      // Prevenir comportamiento por defecto solo en touchstart
      if (e.type === 'touchstart') {
        e.preventDefault();
        touchStarted = true;
      }
      
      // En touchend, solo procesar si hubo touchstart
      if (e.type === 'touchend') {
        if (!touchStarted) return;
        e.preventDefault();
        e.stopPropagation();
        touchStarted = false;
        handler();
        return;
      }
      
      // En click, solo procesar si no hubo touch (para evitar doble ejecución)
      if (e.type === 'click') {
        if (touchStarted) {
          touchStarted = false;
          return;
        }
        e.preventDefault();
        e.stopPropagation();
        handler();
        return;
      }
    };
    
    // Registrar todos los eventos necesarios
    btn.addEventListener('touchstart', handleEvent, { passive: false });
    btn.addEventListener('touchend', handleEvent, { passive: false });
    btn.addEventListener('click', handleEvent);
    
    // Asegurar que el botón sea clickeable y visible
    btn.style.cursor = 'pointer';
    btn.style.pointerEvents = 'auto';
    btn.style.touchAction = 'manipulation';
    btn.style.userSelect = 'none';
    btn.style.webkitUserSelect = 'none';
    btn.style.webkitTapHighlightColor = 'transparent';
    
    // Verificar que el botón esté visible
    const rect = btn.getBoundingClientRect();
    console.log(`Botón ${buttonId} posición:`, { 
      visible: rect.width > 0 && rect.height > 0,
      top: rect.top,
      left: rect.left,
      width: rect.width,
      height: rect.height,
      zIndex: window.getComputedStyle(btn).zIndex
    });
  }
  
  // Usar requestAnimationFrame para asegurar que el DOM esté renderizado
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      // Nueva venta con placa
      setupMobileButton('sales-start-qr', () => {
        console.log('Ejecutando openQRForNewSale...');
        openQRForNewSale().catch(err => {
          console.error('Error al abrir QR para nueva venta:', err);
          alert('Error: ' + (err?.message || 'No se pudo abrir el lector de placa'));
        });
      }, 'Nueva venta con placa');
      
      // Agregar items
      setupMobileButton('sales-add-unified', () => {
        console.log('Ejecutando openAddUnified...');
        openAddUnified();
      }, 'Agregar items');
    });
  });
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





