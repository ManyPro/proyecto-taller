/* assets/js/techreport.js
  Inicializa la pestaña "Reporte Técnico" con filtros de fecha, técnico y tabla paginada.
*/
import { API } from './api.esm.js';
import { authToken } from './api.esm.js';

const money = (n)=> new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',maximumFractionDigits:0}).format(Number(n||0));
const padSaleNumber = (n)=> String(n ?? '').toString().padStart(5,'0');

let rtState = { page:1, pages:1, limit:100 };

export async function initTechReport(){
  const tab = document.getElementById('tab-reporte-tecnico');
  if(!tab) return;
  // Poblar técnicos al entrar en la pestaña
  const techSel = document.getElementById('rt-tech');
  if(techSel && !techSel.dataset.loaded){
    try {
      const list = await API.company.getTechnicians();
      techSel.innerHTML = '<option value="">-- Todos --</option>' + (list||[]).map(t=>`<option value="${t}">${t}</option>`).join('');
      techSel.dataset.loaded = '1';
    }catch{ techSel.innerHTML='<option value="">-- Todos --</option>'; }
  }
  // Filtros
  const from = document.getElementById('rt-from');
  const to = document.getElementById('rt-to');
  const summary = document.getElementById('rt-summary');
  const body = document.getElementById('rt-body');
  const pag = document.getElementById('rt-pag');
  const btnApply = document.getElementById('rt-apply');
  const prevBtn = document.getElementById('rt-prev');
  const nextBtn = document.getElementById('rt-next');

  async function load(reset=false){
    if(reset) rtState.page=1;
    if(summary) summary.textContent='Cargando...';
    if(body) body.innerHTML='';
    const params = { page: rtState.page, limit: rtState.limit };
    if(from?.value) params.from = from.value;
    if(to?.value) params.to = to.value;
    if(techSel?.value) params.technician = techSel.value;
    try{
  const data = await API.sales.techReport(params);
  const items = data.items || [];
      const agg = data.aggregate || { laborShareTotal:0, salesTotal:0, count:0 };
      if(summary){
  summary.textContent = `Ventas: ${agg.count} | Total ventas: ${money(agg.salesTotal)} | Participación total técnico: ${money(agg.laborShareTotal)}${data.filters?.technician? ' | Técnico: '+data.filters.technician:''}`;
      }
      if(body){
        items.forEach(s=>{
          const tr=document.createElement('tr');
          const techs=[s.initialTechnician,s.closingTechnician].filter(Boolean);
          const dateRef = s.closedAt || s._reportDate || s.createdAt;
          tr.innerHTML = `
            <td>${padSaleNumber(s.number||s._id||'')}</td>
            <td>${dateRef ? new Date(dateRef).toLocaleDateString() : ''}</td>
            <td>${s.vehicle?.plate||''}</td>
            <td>${(s.customer?.name||'')}</td>
            <td>${techs.length? techs.join(' — '): (s.technician||'')}</td>
            <td class="t-right">${money(s.total||0)}</td>
            <td class="t-right">${money(s.laborValue||0)}</td>
            <td class="t-right">${s.laborPercent||0}%</td>
            <td class="t-right">${money(s.laborShare||0)}</td>`;
          body.appendChild(tr);
        });
        if(!items.length){
          const tr=document.createElement('tr');
          const td=document.createElement('td'); td.colSpan=9; td.style.opacity=.7; td.textContent='Sin resultados'; tr.appendChild(td); body.appendChild(tr);
        }
      }
      rtState.page = data.pagination?.page || 1;
      rtState.pages = data.pagination?.pages || 1;
  if(pag) pag.textContent = `Página ${rtState.page} de ${rtState.pages}`;
      if(prevBtn) prevBtn.disabled = rtState.page<=1;
      if(nextBtn) nextBtn.disabled = rtState.page>=rtState.pages;
    }catch(e){
      if(summary) summary.textContent = e?.message||'Error cargando reporte';
    }
  }

  btnApply?.addEventListener('click', ()=> load(true));
  prevBtn?.addEventListener('click', ()=>{ if(rtState.page>1){ rtState.page--; load(); } });
  nextBtn?.addEventListener('click', ()=>{ if(rtState.page<rtState.pages){ rtState.page++; load(); } });

  // Carga inicial cuando se muestra la pestaña
  load(true);
}

// Auto init when report markup is present
if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    if(document.getElementById('tab-reporte-tecnico')){
      initTechReport();
    }
  });
}
