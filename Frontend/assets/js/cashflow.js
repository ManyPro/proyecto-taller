import { API } from './api.esm.js';

const money = (n)=>'$'+Math.round(Number(n||0)).toString().replace(/\B(?=(\d{3})+(?!\d))/g,'.');
let cfState = { page:1, pages:1, limit:50 };
let cfBound = false;

export function initCashFlow(){
  const tab = document.getElementById('tab-cashflow');
  if(!tab) return;
  if(!cfBound){
    bind();
    cfBound = true;
  }
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
  document.getElementById('cf-new-loan')?.addEventListener('click', openNewLoanModal);
  document.getElementById('cf-refresh-loans')?.addEventListener('click', ()=> loadLoans(true));
  document.getElementById('cf-loan-filter-tech')?.addEventListener('change', ()=> loadLoans());
  document.getElementById('cf-loan-filter-status')?.addEventListener('change', ()=> loadLoans());
  loadLoans();
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
        const date = new Date(x.date||x.createdAt||Date.now()).toLocaleString('es-CO', { 
          year: 'numeric', 
          month: '2-digit', 
          day: '2-digit', 
          hour: '2-digit', 
          minute: '2-digit', 
          second: '2-digit' 
        });
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
          <td style='white-space:nowrap;'>${canEdit?`<button class='mini' data-act='edit' title='Editar'>Editar</button><button class='mini danger' data-act='del' title='Eliminar'>Eliminar</button>`:''}</td>
        </tr>`;
      }).join('');
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
  div.innerHTML = `<div class="space-y-4">
    <h3 class="text-lg font-semibold text-white dark:text-white theme-light:text-slate-900 mb-4">${defaultKind==='OUT'?'Nueva salida de caja':'Nueva entrada manual'}</h3>
    <div>
      <label class="block text-sm font-medium text-slate-300 dark:text-slate-300 theme-light:text-slate-700 mb-2">Cuenta</label>
      <select id='ncf-account' class="w-full p-3 border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300 rounded-lg bg-slate-700/50 dark:bg-slate-700/50 theme-light:bg-white text-white dark:text-white theme-light:text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"></select>
    </div>
    <div>
      <label class="block text-sm font-medium text-slate-300 dark:text-slate-300 theme-light:text-slate-700 mb-2">Monto</label>
      <input id='ncf-amount' type='number' min='1' step='1' class="w-full p-3 border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300 rounded-lg bg-slate-700/50 dark:bg-slate-700/50 theme-light:bg-white text-white dark:text-white theme-light:text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"/>
    </div>
    <div>
      <label class="block text-sm font-medium text-slate-300 dark:text-slate-300 theme-light:text-slate-700 mb-2">Descripción</label>
      <input id='ncf-desc' placeholder='Descripción' class="w-full p-3 border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300 rounded-lg bg-slate-700/50 dark:bg-slate-700/50 theme-light:bg-white text-white dark:text-white theme-light:text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"/>
    </div>
    <div class="flex gap-2 mt-4">
      <button id='ncf-save' class="px-4 py-2 bg-gradient-to-r from-blue-600 to-blue-700 dark:from-blue-600 dark:to-blue-700 theme-light:from-blue-500 theme-light:to-blue-600 hover:from-blue-700 hover:to-blue-800 dark:hover:from-blue-700 dark:hover:to-blue-800 theme-light:hover:from-blue-600 theme-light:hover:to-blue-700 text-white font-semibold rounded-lg shadow-md hover:shadow-lg transition-all duration-200">Guardar</button>
      <button id='ncf-cancel' class="px-4 py-2 bg-slate-700/50 dark:bg-slate-700/50 hover:bg-slate-700 dark:hover:bg-slate-700 text-white dark:text-white font-semibold rounded-lg transition-all duration-200 border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300 theme-light:bg-slate-200 theme-light:text-slate-700 theme-light:hover:bg-slate-300 theme-light:hover:text-slate-900">Cancelar</button>
    </div>
    <div id='ncf-msg' class="mt-2 text-xs text-slate-300 dark:text-slate-300 theme-light:text-slate-600"></div>
  </div>`;
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
      const kindSel = (defaultKind==='OUT') ? 'OUT' : 'IN';
      await API.cashflow.create({ accountId, kind: kindSel, amount, description });
      msg.textContent='OK';
      setTimeout(()=>{ modal.classList.add('hidden'); loadAccounts(); loadMovements(); },400);
    }catch(e){ msg.textContent=e?.message||'Error'; }
  };
}

function openNewLoanModal(){
  const modal = document.getElementById('modal');
  const body = document.getElementById('modalBody');
  if(!modal||!body) return;
  const div = document.createElement('div');
  div.innerHTML = `<div class="space-y-4">
    <h3 class="text-lg font-semibold text-white dark:text-white theme-light:text-slate-900 mb-4">Nuevo Préstamo a Empleado</h3>
    <div>
      <label class="block text-sm font-medium text-slate-300 dark:text-slate-300 theme-light:text-slate-700 mb-2">Técnico/Empleado</label>
      <select id='nloan-tech' class="w-full p-3 border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300 rounded-lg bg-slate-700/50 dark:bg-slate-700/50 theme-light:bg-white text-white dark:text-white theme-light:text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500">
        <option value=''>Cargando técnicos...</option>
      </select>
    </div>
    <div>
      <label class="block text-sm font-medium text-slate-300 dark:text-slate-300 theme-light:text-slate-700 mb-2">Cuenta</label>
      <select id='nloan-account' class="w-full p-3 border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300 rounded-lg bg-slate-700/50 dark:bg-slate-700/50 theme-light:bg-white text-white dark:text-white theme-light:text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"></select>
    </div>
    <div>
      <label class="block text-sm font-medium text-slate-300 dark:text-slate-300 theme-light:text-slate-700 mb-2">Monto</label>
      <input id='nloan-amount' type='number' min='1' step='1' class="w-full p-3 border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300 rounded-lg bg-slate-700/50 dark:bg-slate-700/50 theme-light:bg-white text-white dark:text-white theme-light:text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"/>
    </div>
    <label class="hidden">Fecha del Préstamo</label>
    <input id='nloan-date' type='datetime-local' class="hidden"/>
    <div>
      <label class="block text-sm font-medium text-slate-300 dark:text-slate-300 theme-light:text-slate-700 mb-2">Descripción (opcional)</label>
      <input id='nloan-desc' placeholder='Descripción del préstamo' class="w-full p-3 border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300 rounded-lg bg-slate-700/50 dark:bg-slate-700/50 theme-light:bg-white text-white dark:text-white theme-light:text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"/>
    </div>
    <div>
      <label class="block text-sm font-medium text-slate-300 dark:text-slate-300 theme-light:text-slate-700 mb-2">Notas (opcional)</label>
      <textarea id='nloan-notes' placeholder='Notas adicionales' class="w-full min-h-[60px] p-3 border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300 rounded-lg bg-slate-700/50 dark:bg-slate-700/50 theme-light:bg-white text-white dark:text-white theme-light:text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"></textarea>
    </div>
    <div class="flex gap-2 mt-4">
      <button id='nloan-save' class="px-4 py-2 bg-gradient-to-r from-blue-600 to-blue-700 dark:from-blue-600 dark:to-blue-700 theme-light:from-blue-500 theme-light:to-blue-600 hover:from-blue-700 hover:to-blue-800 dark:hover:from-blue-700 dark:hover:to-blue-800 theme-light:hover:from-blue-600 theme-light:hover:to-blue-700 text-white font-semibold rounded-lg shadow-md hover:shadow-lg transition-all duration-200">Guardar</button>
      <button id='nloan-cancel' class="px-4 py-2 bg-slate-700/50 dark:bg-slate-700/50 hover:bg-slate-700 dark:hover:bg-slate-700 text-white dark:text-white font-semibold rounded-lg transition-all duration-200 border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300 theme-light:bg-slate-200 theme-light:text-slate-700 theme-light:hover:bg-slate-300 theme-light:hover:text-slate-900">Cancelar</button>
    </div>
    <div id='nloan-msg' class="mt-2 text-xs text-slate-300 dark:text-slate-300 theme-light:text-slate-600"></div>
  </div>`;
  body.innerHTML=''; body.appendChild(div); modal.classList.remove('hidden');
  const sel = div.querySelector('#nloan-account');
  const techSel = div.querySelector('#nloan-tech');
  const dateInput = div.querySelector('#nloan-date');
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  dateInput.value = `${year}-${month}-${day}T${hours}:${minutes}`;
  
  API.accounts.list().then(list=>{ 
    sel.innerHTML=list.map(a=>`<option value='${a._id}'>${a.name}</option>`).join(''); 
  });
  
  API.company.getTechnicians().then(technicians=>{
    if(technicians && technicians.length > 0){
      techSel.innerHTML = '<option value="">-- Seleccione técnico --</option>' + 
        technicians.map(t=>`<option value="${t}">${t}</option>`).join('');
    } else {
      techSel.innerHTML = '<option value="">No hay técnicos registrados</option>';
    }
  }).catch(err=>{
    console.error('Error cargando técnicos:', err);
    techSel.innerHTML = '<option value="">Error al cargar técnicos</option>';
  });
  
  div.querySelector('#nloan-cancel').onclick=()=> modal.classList.add('hidden');
  div.querySelector('#nloan-save').onclick=async()=>{
    const msg = div.querySelector('#nloan-msg');
    msg.textContent='Guardando...';
    try{
      const technicianName = techSel.value?.trim();
      if(!technicianName){
        msg.textContent='⚠️ Selecciona un técnico/empleado';
        techSel.focus();
        return;
      }
      const amount = Number(div.querySelector('#nloan-amount').value||0)||0;
      if(amount<=0){
        msg.textContent='⚠️ El monto debe ser mayor a 0';
        return;
      }
      const accountId = sel.value;
      if(!accountId){
        msg.textContent='⚠️ Selecciona una cuenta';
        return;
      }
      const description = div.querySelector('#nloan-desc').value||'';
      const loanDateInput = div.querySelector('#nloan-date').value;
      let loanDate = null;
      if (loanDateInput) {
        const dateObj = new Date(loanDateInput);
        if (!isNaN(dateObj.getTime())) {
          loanDate = dateObj.toISOString();
        }
      }
      if (!loanDate) {
        loanDate = new Date().toISOString();
      }
      const notes = div.querySelector('#nloan-notes').value||'';
      
      await API.cashflow.loans.create({ 
        technicianName, 
        accountId, 
        amount, 
        description, 
        loanDate,
        notes 
      });
      msg.textContent='✅ Préstamo creado exitosamente';
      setTimeout(()=>{ 
        modal.classList.add('hidden'); 
        loadAccounts(); 
        loadMovements(); 
        loadLoans(); 
      },800);
    }catch(e){ msg.textContent='❌ '+(e?.message||'Error'); }
  };
}

async function loadLoans(reset=false){
  const techFilter = document.getElementById('cf-loan-filter-tech')?.value||'';
  const statusFilter = document.getElementById('cf-loan-filter-status')?.value||'';
  const body = document.getElementById('cf-loans-body');
  const summary = document.getElementById('cf-loans-summary');
  
  try{
    if(body) body.innerHTML='<tr><td colspan="8">Cargando...</td></tr>';
    const params = {};
    if(techFilter) params.technicianName = techFilter;
    if(statusFilter) params.status = statusFilter;
    
    const data = await API.cashflow.loans.list(params);
    const loans = data.items || [];
    
    if(body){
      body.innerHTML = loans.map(loan=>{
        const date = new Date(loan.loanDate||loan.createdAt).toLocaleDateString('es-CO');
        const pending = loan.amount - (loan.paidAmount||0);
        const statusLabels = {
          pending: '<span style="color:#f59e0b;">Pendiente</span>',
          partially_paid: '<span style="color:#3b82f6;">Parcial</span>',
          paid: '<span style="color:#10b981;">Pagado</span>',
          cancelled: '<span style="color:#6b7280;">Cancelado</span>'
        };
        const canDelete = loan.status === 'pending' && (!loan.settlementIds || loan.settlementIds.length === 0);
        return `<tr data-id='${loan._id}'>
          <td>${date}</td>
          <td>${loan.technicianName}</td>
          <td class='t-right'>${money(loan.amount)}</td>
          <td class='t-right'>${money(loan.paidAmount||0)}</td>
          <td class='t-right' style='font-weight:600;'>${money(pending)}</td>
          <td>${statusLabels[loan.status]||loan.status}</td>
          <td>${loan.description||'-'}</td>
          <td style='white-space:nowrap;'>
            ${canDelete?`<button class='mini danger' data-act='del' title='Eliminar'>Eliminar</button>`:''}
          </td>
        </tr>`;
      }).join('');
      
      // Bind acciones
      body.querySelectorAll('tr[data-id]').forEach(tr=>{
        const id = tr.getAttribute('data-id');
        tr.querySelectorAll('button[data-act]').forEach(btn=>{
          btn.addEventListener('click', async (e)=>{
            const act = btn.getAttribute('data-act');
            if(act==='del'){
              if(!confirm('¿Eliminar préstamo? Esto también eliminará la salida de caja asociada.')) return;
              try{ 
                await API.cashflow.loans.delete(id); 
                loadAccounts(); 
                loadMovements(); 
                loadLoans(); 
              }catch(err){ alert(err?.message||'Error'); }
            }
          });
        });
      });
      
      if(!loans.length) body.innerHTML='<tr><td colspan="8" class="muted">Sin préstamos</td></tr>';
    }
    
    const totalPending = loans
      .filter(l => l.status === 'pending' || l.status === 'partially_paid')
      .reduce((sum, l) => sum + (l.amount - (l.paidAmount||0)), 0);
    const totalAmount = loans.reduce((sum, l) => sum + l.amount, 0);
    const totalPaid = loans.reduce((sum, l) => sum + (l.paidAmount||0), 0);
    
    if(summary) summary.textContent = `Total préstamos: ${money(totalAmount)} | Pagado: ${money(totalPaid)} | Pendiente: ${money(totalPending)}`;
    
    const techSel = document.getElementById('cf-loan-filter-tech');
    if(techSel && loans.length > 0){
      const techs = [...new Set(loans.map(l => l.technicianName))].sort();
      const currentVal = techSel.value;
      techSel.innerHTML = '<option value="">-- Todos los empleados --</option>' + 
        techs.map(t => `<option value="${t}">${t}</option>`).join('');
      if(currentVal) techSel.value = currentVal;
    }
  }catch(e){ 
    if(body) body.innerHTML='<tr><td colspan="8" class="muted">Error al cargar préstamos</td></tr>';
    if(summary) summary.textContent = e?.message||'Error';
  }
}

if(typeof document!=='undefined'){
  document.addEventListener('DOMContentLoaded', ()=>{
    if(document.getElementById('tab-cashflow')){
      initCashFlow();
    }
  });
}

