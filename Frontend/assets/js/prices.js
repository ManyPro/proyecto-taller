/* Lista de precios (sin HTML en JS) */
import { API } from './api.esm.js';

const $ = (s)=>document.querySelector(s);
const money = (n)=> new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',maximumFractionDigits:0}).format(Number(n||0));
function openModal(){ const m=$('#modal'); if(!m) return; m.classList.remove('hidden'); document.body.style.overflow='hidden'; const onKey=(e)=>{ if(e.key==='Escape') closeModal(); }; document.addEventListener('keydown', onKey); return ()=>document.removeEventListener('keydown', onKey); }
function closeModal(){ const m=$('#modal'); if(!m) return; m.classList.add('hidden'); document.body.style.overflow=''; }
const clone=(id)=>document.getElementById(id)?.content?.firstElementChild?.cloneNode(true);

function normalizeNumber(v){ if(v==null || v==='') return 0; if(typeof v==='number') return v; const s=String(v).replace(/\s+/g,'').replace(/\$/g,'').replace(/\./g,'').replace(/,/g,'.'); const n=Number(s); return Number.isFinite(n)?n:0; }
function safeEvalFront(expr, vars={}){ const cleaned=String(expr||'').trim().toUpperCase(); if(!cleaned) return 0; if(!/^[\d+\-*/().\sA-Z0-9_]+$/.test(cleaned)) return 0; const replaced=cleaned.replace(/[A-Z_][A-Z0-9_]*/g,(k)=>{ const v=Number(vars[k]??0); return Number.isFinite(v)?String(v):'0'; }); try{ return Function('\"use strict\"; return ('+replaced+')')(); }catch{ return 0; } }

export function initPrices(){
  const tab = $('#tab-precios'); if(!tab) return;

  const svcSelect=$('#svc-select'), svcVarsBtn=$('#svc-vars'), svcNewBtn=$('#svc-new');
  const fBrand=$('#pf-brand'), fLine=$('#pf-line'), fEngine=$('#pf-engine'), fYear=$('#pf-year');
  const fSearch=$('#pf-search'), fClear=$('#pf-clear'), btnNew=$('#pe-new');
  const head=$('#pe-head'), body=$('#pe-body');

  // Acciones adicionales (import/export/rename/clear) – mantenemos usando DOM APIs
  const filtersBar=document.getElementById('filters-bar')||tab;
  const addBtn=(id, cls, text)=>{ const b=document.createElement('button'); b.id=id; b.className=cls; b.textContent=text; filtersBar?.appendChild(b); return b; };
  const btnImport=addBtn('pe-import','secondary','Importar XLSX');
  const btnExport=addBtn('pe-export','secondary','Exportar CSV');
  const btnRename=addBtn('svc-rename','secondary','Renombrar servicio');
  const btnClearAll=addBtn('svc-clear','danger','Vaciar servicio');

  let services=[]; let currentService=null;

  function renderSvcOptions(){
    if(!svcSelect) return;
    svcSelect.replaceChildren(...(services||[]).map(s=>{ const o=document.createElement('option'); o.value=s._id; o.textContent=s.name; return o; }));
  }

  function renderTableHeader(){
    head.replaceChildren();
    if(!currentService) return;
    const tr=document.createElement('tr');
    ['Marca','Línea','Motor','Año', ...(currentService.variables||[]).map(v=>v.label||v.key), 'Precio', 'Acciones'].forEach(txt=>{
      const th=document.createElement('th'); th.textContent=txt; tr.appendChild(th);
    });
    head.appendChild(tr);
  }

  const rowTemplateId='tpl-price-edit-row';

  function rowToNode(r){
    const tr=clone(rowTemplateId);
    const inBrand=tr.querySelector('input[data-brand]'); inBrand.value=r.brand||'';
    const inLine =tr.querySelector('input[data-line]');  inLine.value =r.line||'';
    const inEngine=tr.querySelector('input[data-engine]');inEngine.value=r.engine||'';
    const inYear=tr.querySelector('input[data-year]');   inYear.value =r.year||'';
    const inPrice=tr.querySelector('input[data-price]'); inPrice.value =r.price ?? r.values?.PRICE ?? 0;

    tr.querySelector('button.save').onclick = async ()=>{
      const payload={
        brand:inBrand.value, line:inLine.value, engine:inEngine.value, year:inYear.value,
        price: normalizeNumber(inPrice.value)
      };
      await API.priceUpdate(r._id, payload); loadPrices();
    };
    tr.querySelector('button.delete').onclick = async ()=>{ if(confirm('¿Borrar fila?')){ await API.priceDelete(r._id); loadPrices(); } };
    return tr;
  }

  async function loadServices(){
    const r = await API.servicesList();
    services = Array.isArray(r?.data) ? r.data : (Array.isArray(r) ? r : []);
    renderSvcOptions();
    if(services[0]){ currentService = services[0]; svcSelect.value = currentService._id; renderTableHeader(); await loadPrices(); }
  }

  async function loadPrices(params={}){
    params = { ...(params||{}), serviceId: currentService?._id };
    const r = await API.pricesList(params);
    const rows = Array.isArray(r?.items) ? r.items : (Array.isArray(r) ? r : []);
    body.replaceChildren(...rows.map(rowToNode));
  }

  function clearFilters(){ [fBrand,fLine,fEngine,fYear].forEach(el=>el && (el.value='')); }

  // Eventos UI
  fSearch.onclick = ()=> loadPrices({ brand:fBrand.value, line:fLine.value, engine:fEngine.value, year:fYear.value });
  fClear.onclick  = ()=> { clearFilters(); loadPrices(); };
  svcSelect.onchange = ()=>{ currentService = services.find(s=>s._id===svcSelect.value) || null; renderTableHeader(); loadPrices(); };
  btnNew.onclick = async ()=>{
    if(!currentService) return alert('Selecciona un servicio');
    const payload={ brand:'', line:'', engine:'', year:'', values:{}, price:0, serviceId: currentService._id };
    await API.priceCreate(payload); loadPrices();
  };

  // Import / Export / Rename / Clear
  btnExport.onclick = async ()=>{
    if(!currentService) return alert('Selecciona un servicio');
    const blob = await API.pricesExport({ serviceId: currentService._id });
    const a=document.createElement('a'); const ts=new Date().toISOString().slice(0,10).replace(/-/g,'');
    a.href=URL.createObjectURL(blob); a.download=`precios_${currentService.key||currentService._id}_${ts}.csv`; a.click(); URL.revokeObjectURL(a.href);
  };

  btnImport.onclick = ()=>{
    const body=$('#modalBody'), closeBtn=$('#modalClose'); body.replaceChildren();
    const node=clone('tpl-import-prices'); body.appendChild(node);
    const cleanup=openModal(); closeBtn.onclick=()=>{ cleanup?.(); closeModal(); };
    body.querySelector('#imp-title').textContent = `Importar XLSX a ${currentService?.name||''}`;
    const example={ brand:'marca', line:'linea', engine:'motor', year:'año', values:Object.fromEntries((currentService?.variables||[]).map(v=>[v.key, v.key.toLowerCase()])) };
    body.querySelector('#imp-map').value = JSON.stringify(example, null, 2);
    body.querySelector('#imp-cancel').onclick = ()=>{ cleanup?.(); closeModal(); };
    body.querySelector('#imp-run').onclick = async ()=>{
      const f = body.querySelector('#imp-file').files[0]; if(!f) return alert('Selecciona un archivo .xlsx');
      let mapping; try{ mapping = JSON.parse(body.querySelector('#imp-map').value || '{}'); }catch{ return alert('JSON de mapeo inválido'); }
      const mode = body.querySelector('#imp-mode').value || 'upsert';
      const fd=new FormData(); fd.append('file', f); fd.append('serviceId', currentService._id); fd.append('mode', mode); fd.append('mapping', JSON.stringify(mapping));
      const res = await API.pricesImport(fd);
      const resDiv = body.querySelector('#imp-res'); resDiv.textContent = `Insertados: ${res.inserted||0} — Actualizados: ${res.updated||0} — Errores: ${(res.errors||[]).length}`;
      await loadPrices();
    };
  };

  btnRename.onclick = async ()=>{
    const newName = prompt('Nuevo nombre del servicio:', currentService?.name||''); if(!newName) return;
    await API.serviceUpdate(currentService._id, { name:newName }); await loadServices();
  };
  btnClearAll.onclick = async ()=>{
    if(!currentService) return; if(!confirm('¿Vaciar todo el servicio?')) return;
    await API.serviceDelete(currentService._id); await loadServices();
  };

  loadServices();
}
