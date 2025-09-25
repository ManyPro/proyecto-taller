// ventas.js — parche seguro (scope y null-safety) + botones renombrados
import API from './api.js';
import { buildWorkOrderPdf, buildInvoicePdf } from './pdf.js';

const $ = (s)=>document.querySelector(s);
const money = (n)=> new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',maximumFractionDigits:0}).format(Number(n||0));
const clone = (id)=>{ const t=document.getElementById(id); return t?.content?.firstElementChild?.cloneNode(true); };

// ===== INIT (no tocar DOM si no es la pestaña de ventas) =====
export function initSales(){
  const tab = document.getElementById('tab-ventas');
  if(!tab) return; // <- evita errores en login u otras vistas

  // --- Estado (solo dentro de init) ---
  let current = null;
  const OPEN_KEY = `sales:openTabs:${API.getActiveCompany?.() || 'default'}`;
  let openTabs = []; try{ openTabs = JSON.parse(localStorage.getItem(OPEN_KEY)||'[]'); }catch{ openTabs=[]; }
  const saveTabs = ()=>{ try{ localStorage.setItem(OPEN_KEY, JSON.stringify(openTabs)); }catch{} };

  // --- Helpers modal (ya existen en tu app, fallback aquí) ---
  const openModal = ()=>{
    const m=$('#modal'); if(!m) return ()=>{};
    m.classList.remove('hidden'); document.body.style.overflow='hidden';
    const onKey=(e)=>{ if(e.key==='Escape') closeModal(); };
    document.addEventListener('keydown', onKey);
    return ()=>document.removeEventListener('keydown', onKey);
  };
  const closeModal = ()=>{ const m=$('#modal'); if(!m) return; m.classList.add('hidden'); document.body.style.overflow=''; };

  // --- Cápsulas ---
  function renderSaleTabs(){
    const wrap = document.getElementById('saleTabs'); if(!wrap) return;
    wrap.replaceChildren();
    for(const id of openTabs){
      const n = clone('tpl-sale-tab') || document.createElement('button');
      (n.querySelector?.('.label')||n).textContent = (current && current._id===id) ? `• ${id.slice(-6).toUpperCase()}` : id.slice(-6).toUpperCase();
      n.classList.toggle?.('active', !!(current && current._id===id));
      n.onclick = ()=>switchTo(id);
      const x = n.querySelector?.('.close');
      if(x){ x.onclick = (e)=>{ e.stopPropagation(); onCancelCapsule(id); }; }
      wrap.appendChild(n);
    }
  }
  function addOpen(id){ if(!openTabs.includes(id)){ openTabs.push(id); saveTabs(); } renderSaleTabs(); }
  function removeOpen(id){ openTabs = openTabs.filter(x=>x!==id); saveTabs(); renderSaleTabs(); }

  async function switchTo(id){
    try{
      current = await API.sales.get(id);
      addOpen(id);
      renderSale(); renderMiniCustomer(); renderWorkOrder();
    }catch{}
  }
  async function onCancelCapsule(id){
    const ok = confirm('¿Deseas cancelar la venta?');
    if(!ok) return;
    try{
      await API.sales.cancel(id);
      removeOpen(id);
      if(current && current._id===id){ current=null; renderSale(); renderMiniCustomer(); renderWorkOrder(); }
    }catch(e){ alert(e?.message||'No se pudo cancelar'); }
  }

  // --- Render principal ---
  const tableBody = $('#sales-body'); const totalEl = $('#sales-total');
  function renderSale(){
    if(!tableBody) return;
    tableBody.replaceChildren();
    const items = current?.items || [];
    for(const it of items){
      const row = clone('tpl-sale-row') || document.createElement('tr');
      const tdSku = row.querySelector?.('[data-sku]') || row.appendChild(document.createElement('td'));
      const tdName= row.querySelector?.('[data-name]')|| row.appendChild(document.createElement('td'));
      const tdQty = row.querySelector?.('.qty')      || (()=>{const i=document.createElement('input');i.type='number';i.className='qty';row.appendChild(document.createElement('td')).appendChild(i);return i;})();
      const tdUnit= row.querySelector?.('[data-unit]')|| row.appendChild(document.createElement('td'));
      const tdTot = row.querySelector?.('[data-total]')|| row.appendChild(document.createElement('td'));
      const tdAct = row.querySelector?.('.actions')|| row.appendChild(document.createElement('td'));

      tdSku.textContent = it.sku||'';
      tdName.textContent = it.name||'';
      tdQty.value = String(it.qty||1);
      tdUnit.textContent = money(it.unitPrice||0);
      tdTot.textContent  = money(it.total||0);

      tdQty.onchange = async ()=>{
        const v=Number(tdQty.value||1)||1;
        current = await API.sales.updateItem(current._id, it._id, { qty:v });
        renderSale(); renderWorkOrder();
      };

      // Botones editar precio y precio 0
      const bEdit = document.createElement('button'); bEdit.textContent='Editar';
      bEdit.onclick = async ()=>{
        const v = prompt('Nuevo precio unitario:', String(it.unitPrice||0));
        if(v==null) return;
        const up = Number(v)||0;
        current = await API.sales.updateItem(current._id, it._id, { unitPrice: up });
        renderSale(); renderWorkOrder();
      };
      const bZero = document.createElement('button'); bZero.textContent='Precio 0';
      bZero.onclick = async ()=>{
        current = await API.sales.updateItem(current._id, it._id, { unitPrice: 0 });
        renderSale(); renderWorkOrder();
      };
      const bDel = document.createElement('button'); bDel.textContent='Quitar';
      bDel.onclick = async ()=>{
        await API.sales.removeItem(current._id, it._id);
        current = await API.sales.get(current._id);
        renderSale(); renderWorkOrder();
      };
      tdAct.replaceChildren(bEdit,' ',bZero,' ',bDel);

      tableBody.appendChild(row);
    }
    if(totalEl) totalEl.textContent = money(current?.total || 0);
  }

  function renderMiniCustomer(){
    const c = current?.customer || {}, v=current?.vehicle||{};
    const lp=$('#sv-mini-plate'), ln=$('#sv-mini-name'), lr=$('#sv-mini-phone');
    if(lp) lp.textContent = v.plate || '—';
    if(ln) ln.textContent  = `Cliente: ${c.name||'—'}`;
    if(lr) lr.textContent  = `Cel: ${c.phone||'—'}`;
  }

  function renderWorkOrder(){
    const body = $('#sv-wo-body'); if(!body) return;
    body.replaceChildren();
    for(const it of (current?.items||[])){
      const tr = document.createElement('tr');
      const td1=document.createElement('td'); td1.textContent = it.name||'';
      const td2=document.createElement('td'); td2.className='t-center'; td2.textContent=String(it.qty||1);
      tr.append(td1, td2); body.appendChild(tr);
    }
  }

  // --- Botones de barra (renombrar / ocultar según plan) ---
  const bNew = $('#sales-start');
  const bQR  = $('#sales-scan-qr');
  const bWA  = $('#sales-share-wa'); if(bWA) bWA.parentElement?.remove(); // fuera del plan
  const bPdf = $('#sales-print'); if(bPdf){ bPdf.textContent='Imprimir factura'; }
  const bClose = $('#sales-close');

  // Nuevo: usar cotización (si existe el botón)
  const bQuote = $('#btn-use-quote');
  if (bQuote) {
    bQuote.onclick = async ()=>{
      alert('Abriré el modal de cotizaciones en el siguiente pase. Endpoint listo.');
    };
  }

  if(bNew) bNew.onclick = async ()=>{
    current = await API.sales.start();
    if(!current.name) current.name = `Venta · ${String(current._id).slice(-6).toUpperCase()}`;
    addOpen(current._id);
    renderSale(); renderMiniCustomer(); renderWorkOrder();
  };

  if(bPdf) bPdf.onclick = async ()=>{
    if(!current) return alert('Crea primero una venta');
    await buildInvoicePdf(current);
  };

  if(bClose) bClose.onclick = async ()=>{
    if(!current) return;
    try{
      current = await API.sales.close(current._id);
      alert('Venta cerrada');
      removeOpen(current._id);
      current=null;
      renderSale(); renderMiniCustomer(); renderWorkOrder();
    }catch(e){ alert(e?.message || 'No se pudo cerrar'); }
  };

  // Cambiar el texto del botón PDF en OT (ya existe)
  const bOT=$('#sv-print-wo'); if(bOT){ bOT.onclick = async ()=>{ if(!current) return; await buildWorkOrderPdf(current); }; }

  // Inicial
  renderSaleTabs();
}
