/* assets/js/cashflow.js - UI Flujo de Caja */
import { API } from './api.js';

const money = (n)=>'$'+Math.round(Number(n||0)).toString().replace(/\B(?=(\d{3})+(?!\d))/g,'.');
let cfState = { page:1, pages:1, limit:50 };

export function initCashFlow(){
  const tab = document.getElementById('tab-cashflow');
  if(!tab) return;
  bind();
  loadAccounts();
  loadMovements(true);
}

function bind(){
  document.getElementById('cf-refresh')?.addEventListener('click', ()=>{ loadAccounts(); });
  document.getElementById('cf-add-account')?.addEventListener('click', async ()=>{
    const name = prompt('Nombre de la cuenta:'); if(!name) return;
    const type = confirm('¿Cuenta bancaria? Aceptar=Banco, Cancelar=Caja') ? 'BANK':'CASH';
    try { await API.accounts.create({ name, type }); loadAccounts(); } catch(e){ alert(e?.message||'Error'); }
  });
  document.getElementById('cf-apply')?.addEventListener('click', ()=> loadMovements(true));
  document.getElementById('cf-prev')?.addEventListener('click', ()=>{ if(cfState.page>1){ cfState.page--; loadMovements(); } });
  document.getElementById('cf-next')?.addEventListener('click', ()=>{ if(cfState.page<cfState.pages){ cfState.page++; loadMovements(); } });
  document.getElementById('cf-new-entry')?.addEventListener('click', openNewEntryModal);
  document.getElementById('cf-new-expense')?.addEventListener('click', ()=> openNewEntryModal('OUT'));
  // Lazy reload when tab activated
  const btn = document.querySelector('.tabs button[data-tab="cashflow"]');
  if(btn && !btn.dataset.cfBound){
    btn.dataset.cfBound='1';
    btn.addEventListener('click', ()=> setTimeout(()=>{ initCashFlow(); },50));
  }
}

async function loadAccounts(){
  try{
    const list = await API.accounts.balances();
    const body = document.getElementById('cf-acc-body');
    const totalLbl = document.getElementById('cf-acc-total');
    const filterSel = document.getElementById('cf-filter-account');
    if(body){
      body.innerHTML = (list.balances||[]).map(a=>`<tr><td>${a.name}</td><td>${a.type}</td><td class="t-right">${money(a.balance)}</td><td></td></tr>`).join('');
      if(!(list.balances||[]).length) body.innerHTML='<tr><td colspan="4" class="muted">Sin cuentas</td></tr>';
    }
    if(totalLbl) totalLbl.textContent = 'Total: '+money(list.total||0);
    if(filterSel){
      const selVal = filterSel.value;
      filterSel.innerHTML='<option value="">-- Cuenta --</option>' + (list.balances||[]).map(a=>`<option value="${a.accountId}">${a.name}</option>`).join('');
      if(selVal) filterSel.value=selVal;
    }
  }catch(e){ console.warn('loadAccounts', e); }
}

async function loadMovements(reset=false){
  if(reset) cfState.page=1;
  const params = { page: cfState.page, limit: cfState.limit };
  const acc = document.getElementById('cf-filter-account')?.value; if(acc) params.accountId = acc;
  const from = document.getElementById('cf-from')?.value; if(from) params.from = from;
  const to = document.getElementById('cf-to')?.value; if(to) params.to = to;
  const kind = document.getElementById('cf-kind')?.value; if(kind) params.kind = kind;
  const source = document.getElementById('cf-source')?.value; if(source) params.source = source;
  const rowsBody = document.getElementById('cf-rows');
  const summary = document.getElementById('cf-mov-summary');
  const pag = document.getElementById('cf-pag');
  try {
    if(rowsBody) rowsBody.innerHTML='<tr><td colspan="7">Cargando...</td></tr>';
    const data = await API.cashflow.list(params);
    const items = data.items || [];
    if(rowsBody){
      rowsBody.innerHTML = items.map(x=>{
        const inAmt = x.kind==='IN'? money(x.amount):'';
        const outAmt = x.kind==='OUT'? money(x.amount):'';
        const date = new Date(x.date||x.createdAt||Date.now()).toLocaleString();
        const accName = x.accountId?.name||x.accountName||'';
        const desc = x.description||'';
        const canEdit = true; // se podría restringir según x.source
        return `<tr data-id='${x._id}'>
          <td data-label="Fecha">${date}</td>
          <td data-label="Cuenta">${accName}</td>
          <td data-label="Descripción">${desc}</td>
          <td data-label="Fuente">${x.source||''}</td>
          <td data-label="IN" class='t-right ${x.kind==='IN'?'pos':''}'>${inAmt}</td>
          <td data-label="OUT" class='t-right ${x.kind==='OUT'?'neg':''}'>${outAmt}</td>
          <td data-label="Saldo" class='t-right'>${money(x.balanceAfter||0)}</td>
          <td style='white-space:nowrap;'>${canEdit?`<button class='mini' data-act='edit'>✎</button><button class='mini danger' data-act='del'>🗑</button>`:''}</td>
        </tr>`;
      }).join('');
      // Bind acciones
      rowsBody.querySelectorAll('tr[data-id]').forEach(tr=>{
        const id = tr.getAttribute('data-id');
        tr.querySelectorAll('button[data-act]').forEach(btn=>{
          btn.addEventListener('click', async (e)=>{
            const act = btn.getAttribute('data-act');
            if(act==='del'){
              if(!confirm('¿Eliminar movimiento?')) return;
              try{ await API.cashflow.delete(id); loadAccounts(); loadMovements(); }catch(err){ alert(err?.message||'Error'); }
            } else if(act==='edit') {
              const currentDesc = tr.children[2]?.textContent||'';
              const currentAmount = (tr.children[4]?.textContent||'').replace(/[^\d]/g,'') || (tr.children[5]?.textContent||'').replace(/[^\d]/g,'');
              const newAmountStr = prompt('Nuevo monto (solo número):', currentAmount);
              if(!newAmountStr) return;
              const newAmount = Number(newAmountStr)||0; if(newAmount<=0){ alert('Monto inválido'); return; }
              const newDesc = prompt('Nueva descripción:', currentDesc) ?? currentDesc;
              try{ await API.cashflow.update(id, { amount: newAmount, description: newDesc }); loadAccounts(); loadMovements(); }catch(err){ alert(err?.message||'Error'); }
            }
          });
        });
      });
      if(!items.length) rowsBody.innerHTML='<tr><td colspan="7" class="muted">Sin movimientos</td></tr>';
    }
    const IN = data.totals?.in||0; const OUT = data.totals?.out||0;
    if(summary) summary.textContent = `Entradas: ${money(IN)} | Salidas: ${money(OUT)} | Neto: ${money(IN-OUT)}`;
    cfState.page = data.page||1; cfState.pages = Math.max(1, Math.ceil((data.total||0)/cfState.limit));
    if(pag) pag.textContent = `Página ${cfState.page} de ${cfState.pages}`;
    document.getElementById('cf-prev').disabled = cfState.page<=1;
    document.getElementById('cf-next').disabled = cfState.page>=cfState.pages;
  }catch(e){ if(summary) summary.textContent = e?.message||'Error'; }
}

function openNewEntryModal(defaultKind='IN'){
  const modal = document.getElementById('modal');
  const body = document.getElementById('modalBody');
  if(!modal||!body) return;
  const div = document.createElement('div');
  div.innerHTML = `<h3>${defaultKind==='OUT'?'Nueva salida de caja':'Nueva entrada manual'}</h3>
    <label>Cuenta</label><select id='ncf-account'></select>
    <label>Tipo</label><select id='ncf-kind'>
      <option value='IN' ${defaultKind==='IN'?'selected':''}>Entrada</option>
      <option value='OUT' ${defaultKind==='OUT'?'selected':''}>Salida</option>
    </select>
    <label>Monto</label><input id='ncf-amount' type='number' min='1' step='1'/>
    <label>Descripción</label><input id='ncf-desc' placeholder='Descripción'/>
    <div style='margin-top:8px;display:flex;gap:8px;'>
      <button id='ncf-save'>Guardar</button>
      <button id='ncf-cancel' class='secondary'>Cancelar</button>
    </div>
    <div id='ncf-msg' class='muted' style='margin-top:6px;font-size:12px;'></div>`;
  body.innerHTML=''; body.appendChild(div); modal.classList.remove('hidden');
  const sel = div.querySelector('#ncf-account');
  API.accounts.list().then(list=>{ sel.innerHTML=list.map(a=>`<option value='${a._id}'>${a.name}</option>`).join(''); });
  div.querySelector('#ncf-cancel').onclick=()=> modal.classList.add('hidden');
  div.querySelector('#ncf-save').onclick=async()=>{
    const msg = div.querySelector('#ncf-msg');
    msg.textContent='Guardando...';
    try{
      const amount = Number(div.querySelector('#ncf-amount').value||0)||0;
      const accountId = sel.value;
      const description = div.querySelector('#ncf-desc').value||'';
      const kindSel = div.querySelector('#ncf-kind').value === 'OUT' ? 'OUT' : 'IN';
      await API.cashflow.create({ accountId, kind: kindSel, amount, description });
      msg.textContent='OK';
      setTimeout(()=>{ modal.classList.add('hidden'); loadAccounts(); loadMovements(); },400);
    }catch(e){ msg.textContent=e?.message||'Error'; }
  };
}

// Auto init if tab is active on load
if(typeof document!=='undefined'){
  document.addEventListener('DOMContentLoaded', ()=>{
    if(document.querySelector('.tabs button[data-tab="cashflow"]')?.classList.contains('active')){
      initCashFlow();
    }
  });
}
