import { API } from './api.esm.js';

const money = (n)=>'$'+Math.round(Number(n||0)).toString().replace(/\B(?=(\d{3})+(?!\d))/g,'.');
let cfState = { page:1, pages:1, limit:50 };
let cfBound = false;

// Helper para escapar HTML (reutilizable)
function escapeHtml(str) {
  if(!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

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
  document.getElementById('cf-add-account')?.addEventListener('click', openAddAccountModal);
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
    let balances = list.balances || [];
    
    // Filtrar cuentas según restrictions.cashflow.hiddenAccounts
    try {
      const restrictions = await API.company.getRestrictions();
      const hiddenAccounts = restrictions?.cashflow?.hiddenAccounts || [];
      if(Array.isArray(hiddenAccounts) && hiddenAccounts.length > 0){
        const hiddenIds = hiddenAccounts.map(id => String(id));
        balances = balances.filter(acc => {
          const accountId = String(acc.accountId || acc._id || acc.id || '');
          return !hiddenIds.includes(accountId);
        });
      }
    } catch(e) {
      console.warn('Error obteniendo restrictions para filtrar cuentas:', e);
    }
    
    const body = document.getElementById('cf-acc-body');
    const totalLbl = document.getElementById('cf-acc-total');
    const filterSel = document.getElementById('cf-filter-account');
    
    // Recalcular total solo con cuentas visibles
    const visibleTotal = balances.reduce((sum, acc) => sum + (Number(acc.balance) || 0), 0);
    
    if(body){
      body.innerHTML = balances.map(a=>`<tr class="border-b border-slate-700/30 dark:border-slate-700/30 theme-light:border-slate-200 hover:bg-slate-700/20 dark:hover:bg-slate-700/20 theme-light:hover:bg-slate-50 transition-colors"><td data-label="Nombre" class="px-4 py-3 text-xs text-white dark:text-white theme-light:text-slate-900 border-r border-slate-700/30 dark:border-slate-700/30 theme-light:border-slate-200">${escapeHtml(a.name)}</td><td data-label="Tipo" class="px-4 py-3 text-xs text-white dark:text-white theme-light:text-slate-900 border-r border-slate-700/30 dark:border-slate-700/30 theme-light:border-slate-200">${escapeHtml(a.type)}</td><td data-label="Saldo" class="px-4 py-3 text-right text-xs font-semibold text-white dark:text-white theme-light:text-slate-900 border-r border-slate-700/30 dark:border-slate-700/30 theme-light:border-slate-200">${money(a.balance)}</td><td class="px-4 py-3"></td></tr>`).join('');
      if(!balances.length) body.innerHTML='<tr><td colspan="4" class="px-4 py-3 text-center text-xs text-slate-400 dark:text-slate-400 theme-light:text-slate-600">Sin cuentas</td></tr>';
    }
    if(totalLbl) totalLbl.textContent = 'Total: '+money(visibleTotal);
    if(filterSel){
      const selVal = filterSel.value;
      filterSel.innerHTML='<option value="">-- Cuenta --</option>' + balances.map(a=>`<option value="${a.accountId || a._id || a.id}">${escapeHtml(a.name)}</option>`).join('');
      if(selVal) filterSel.value=selVal;
    }
  }catch(e){ 
    const body = document.getElementById('cf-acc-body');
    if(body) body.innerHTML='<tr><td colspan="4" class="px-4 py-3 text-center text-xs text-red-400">Error al cargar cuentas</td></tr>';
  }
}

async function loadMovements(reset=false){
  if(reset) cfState.page=1;
  
  // Recopilar parámetros de filtro de forma eficiente
  const filterAccount = document.getElementById('cf-filter-account');
  const filterFrom = document.getElementById('cf-from');
  const filterTo = document.getElementById('cf-to');
  const filterKind = document.getElementById('cf-kind');
  const filterSource = document.getElementById('cf-source');
  
  const params = { page: cfState.page, limit: cfState.limit };
  if(filterAccount?.value) params.accountId = filterAccount.value;
  if(filterFrom?.value) params.from = filterFrom.value;
  if(filterTo?.value) params.to = filterTo.value;
  if(filterKind?.value) params.kind = filterKind.value;
  if(filterSource?.value) params.source = filterSource.value;
  
  const rowsBody = document.getElementById('cf-rows');
  const summary = document.getElementById('cf-mov-summary');
  const pag = document.getElementById('cf-pag');
  const prevBtn = document.getElementById('cf-prev');
  const nextBtn = document.getElementById('cf-next');
  
  try {
    if(rowsBody) rowsBody.innerHTML='<tr><td colspan="8" class="px-4 py-6 text-center text-xs text-slate-400 dark:text-slate-400 theme-light:text-slate-600">Cargando...</td></tr>';
    const data = await API.cashflow.list(params);
    let items = data.items || [];
    
    // Filtrar movimientos según restrictions.cashflow.hiddenAccounts
    try {
      const restrictions = await API.company.getRestrictions();
      const hiddenAccounts = restrictions?.cashflow?.hiddenAccounts || [];
      if(Array.isArray(hiddenAccounts) && hiddenAccounts.length > 0){
        const hiddenIds = hiddenAccounts.map(id => String(id));
        items = items.filter(item => {
          const accountId = String(item.accountId?._id || item.accountId?.id || item.accountId || '');
          return !hiddenIds.includes(accountId);
        });
      }
    } catch(e) {
      console.warn('Error obteniendo restrictions para filtrar movimientos:', e);
    }
    
    if(rowsBody){
      // Función helper para formatear fecha
      const formatDate = (dateValue) => {
        return new Date(dateValue||Date.now()).toLocaleString('es-CO', { 
          year: 'numeric', 
          month: '2-digit', 
          day: '2-digit', 
          hour: '2-digit', 
          minute: '2-digit', 
          second: '2-digit' 
        });
      };
      
      rowsBody.innerHTML = items.map(x=>{
        const inAmt = x.kind==='IN'? money(x.amount):'';
        const outAmt = x.kind==='OUT'? money(x.amount):'';
        const date = formatDate(x.date||x.createdAt);
        const accName = escapeHtml(x.accountId?.name||x.accountName||'');
        const desc = escapeHtml(x.description||'');
        const source = escapeHtml(x.source||'');
        const canEdit = true;
        const rowId = escapeHtml(x._id);
        
        return `<tr data-id='${rowId}' class="border-b border-slate-700/30 dark:border-slate-700/30 theme-light:border-slate-200 hover:bg-slate-700/20 dark:hover:bg-slate-700/20 theme-light:hover:bg-slate-50 transition-colors">
          <td data-label="Fecha" class="px-4 py-3 text-xs text-white dark:text-white theme-light:text-slate-900 border-r border-slate-700/30 dark:border-slate-700/30 theme-light:border-slate-200">${date}</td>
          <td data-label="Cuenta" class="px-4 py-3 text-xs text-white dark:text-white theme-light:text-slate-900 border-r border-slate-700/30 dark:border-slate-700/30 theme-light:border-slate-200">${accName}</td>
          <td data-label="Descripción" class="px-4 py-3 text-xs text-white dark:text-white theme-light:text-slate-900 border-r border-slate-700/30 dark:border-slate-700/30 theme-light:border-slate-200">${desc}</td>
          <td data-label="Fuente" class="px-4 py-3 text-xs text-white dark:text-white theme-light:text-slate-900 border-r border-slate-700/30 dark:border-slate-700/30 theme-light:border-slate-200">${source}</td>
          <td data-label="IN" class='px-4 py-3 text-right text-xs font-semibold text-green-400 dark:text-green-400 theme-light:text-green-600 border-r border-slate-700/30 dark:border-slate-700/30 theme-light:border-slate-200 ${x.kind==='IN'?'':'text-slate-500 dark:text-slate-500 theme-light:text-slate-400'}'>${inAmt}</td>
          <td data-label="OUT" class='px-4 py-3 text-right text-xs font-semibold text-red-400 dark:text-red-400 theme-light:text-red-600 border-r border-slate-700/30 dark:border-slate-700/30 theme-light:border-slate-200 ${x.kind==='OUT'?'':'text-slate-500 dark:text-slate-500 theme-light:text-slate-400'}'>${outAmt}</td>
          <td data-label="Saldo" class='px-4 py-3 text-right text-xs font-medium text-white dark:text-white theme-light:text-slate-900 border-r border-slate-700/30 dark:border-slate-700/30 theme-light:border-slate-200'>${money(x.balanceAfter||0)}</td>
          <td class="px-4 py-3" style='white-space:nowrap;'>${canEdit?`<button class='px-3 py-1.5 text-xs bg-blue-600/20 dark:bg-blue-600/20 hover:bg-blue-600/40 dark:hover:bg-blue-600/40 text-blue-400 dark:text-blue-400 hover:text-blue-300 dark:hover:text-blue-300 font-medium rounded-lg transition-all duration-200 border border-blue-600/30 dark:border-blue-600/30 theme-light:bg-blue-50 theme-light:text-blue-600 theme-light:hover:bg-blue-100 theme-light:border-blue-300 mr-1' data-act='edit' title='Editar'>Editar</button><button class='px-3 py-1.5 text-xs bg-red-600/20 dark:bg-red-600/20 hover:bg-red-600/40 dark:hover:bg-red-600/40 text-red-400 dark:text-red-400 hover:text-red-300 dark:hover:text-red-300 font-medium rounded-lg transition-all duration-200 border border-red-600/30 dark:border-red-600/30 theme-light:bg-red-50 theme-light:text-red-600 theme-light:hover:bg-red-100 theme-light:border-red-300' data-act='del' title='Eliminar'>Eliminar</button>`:''}</td>
        </tr>`;
      }).join('');
      rowsBody.querySelectorAll('tr[data-id]').forEach(tr=>{
        const id = tr.getAttribute('data-id');
        tr.querySelectorAll('button[data-act]').forEach(btn=>{
          btn.addEventListener('click', async (e)=>{
            const act = btn.getAttribute('data-act');
            if(act==='del'){
              if(!confirm('¿Eliminar movimiento?')) return;
              try{ 
                await API.cashflow.delete(id); 
                loadAccounts(); 
                loadMovements(); 
              }catch(err){ 
                alert(err?.message||'Error'); 
              }
            } else if(act==='edit') {
              openEditMovementModal(id, tr);
            }
          });
        });
      });
      if(!items.length) rowsBody.innerHTML='<tr><td colspan="8" class="px-4 py-6 text-center text-xs text-slate-400 dark:text-slate-400 theme-light:text-slate-600">Sin movimientos</td></tr>';
    }
    
    // Actualizar controles de paginación
    const IN = data.totals?.in||0; 
    const OUT = data.totals?.out||0;
    if(summary) summary.textContent = `Entradas: ${money(IN)} | Salidas: ${money(OUT)} | Neto: ${money(IN-OUT)}`;
    cfState.page = data.page||1; 
    cfState.pages = Math.max(1, Math.ceil((data.total||0)/cfState.limit));
    if(pag) pag.textContent = `Página ${cfState.page} de ${cfState.pages}`;
    if(prevBtn) prevBtn.disabled = cfState.page<=1;
    if(nextBtn) nextBtn.disabled = cfState.page>=cfState.pages;
  }catch(e){ 
    if(summary) summary.textContent = e?.message||'Error';
    if(rowsBody) rowsBody.innerHTML='<tr><td colspan="8" class="px-4 py-6 text-center text-xs text-red-400">Error al cargar movimientos</td></tr>';
  }
}

function openAddAccountModal(){
  const modal = document.getElementById('modal');
  const body = document.getElementById('modalBody');
  if(!modal||!body) return;
  const div = document.createElement('div');
  div.innerHTML = `<div class="space-y-4">
    <h3 class="text-xl font-bold text-white dark:text-white theme-light:text-slate-900 mb-4">➕ Nueva Cuenta</h3>
    <div>
      <label class="block text-sm font-medium text-slate-300 dark:text-slate-300 theme-light:text-slate-700 mb-2">Nombre de la cuenta</label>
      <input id='nacc-name' type='text' placeholder='Ej: Caja Principal, Banco BBVA...' class="w-full p-3 border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300 rounded-lg bg-slate-700/50 dark:bg-slate-700/50 theme-light:bg-white text-white dark:text-white theme-light:text-slate-900 placeholder-slate-400 dark:placeholder-slate-400 theme-light:placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"/>
    </div>
    <div>
      <label class="block text-sm font-medium text-slate-300 dark:text-slate-300 theme-light:text-slate-700 mb-2">Tipo de cuenta</label>
      <div class="flex gap-3">
        <label class="flex items-center gap-2 p-3 border-2 border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300 rounded-lg bg-slate-700/30 dark:bg-slate-700/30 theme-light:bg-sky-50 cursor-pointer hover:border-blue-500 dark:hover:border-blue-500 theme-light:hover:border-blue-400 transition-all duration-200 flex-1">
          <input type="radio" name="nacc-type" value="CASH" checked class="w-4 h-4 text-blue-600 focus:ring-blue-500"/>
          <div>
            <div class="font-semibold text-white dark:text-white theme-light:text-slate-900">💵 Caja</div>
            <div class="text-xs text-slate-400 dark:text-slate-400 theme-light:text-slate-600">Efectivo físico</div>
          </div>
        </label>
        <label class="flex items-center gap-2 p-3 border-2 border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300 rounded-lg bg-slate-700/30 dark:bg-slate-700/30 theme-light:bg-sky-50 cursor-pointer hover:border-blue-500 dark:hover:border-blue-500 theme-light:hover:border-blue-400 transition-all duration-200 flex-1">
          <input type="radio" name="nacc-type" value="BANK" class="w-4 h-4 text-blue-600 focus:ring-blue-500"/>
          <div>
            <div class="font-semibold text-white dark:text-white theme-light:text-slate-900">🏦 Banco</div>
            <div class="text-xs text-slate-400 dark:text-slate-400 theme-light:text-slate-600">Cuenta bancaria</div>
          </div>
        </label>
      </div>
    </div>
    <div>
      <label class="block text-sm font-medium text-slate-300 dark:text-slate-300 theme-light:text-slate-700 mb-2">Saldo inicial (opcional)</label>
      <input id='nacc-balance' type='number' step='0.01' min='0' placeholder='0' class="w-full p-3 border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300 rounded-lg bg-slate-700/50 dark:bg-slate-700/50 theme-light:bg-white text-white dark:text-white theme-light:text-slate-900 placeholder-slate-400 dark:placeholder-slate-400 theme-light:placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"/>
    </div>
    <div>
      <label class="block text-sm font-medium text-slate-300 dark:text-slate-300 theme-light:text-slate-700 mb-2">Notas (opcional)</label>
      <textarea id='nacc-notes' placeholder='Notas adicionales sobre la cuenta...' rows="3" class="w-full p-3 border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300 rounded-lg bg-slate-700/50 dark:bg-slate-700/50 theme-light:bg-white text-white dark:text-white theme-light:text-slate-900 placeholder-slate-400 dark:placeholder-slate-400 theme-light:placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 resize-y"></textarea>
    </div>
    <div class="flex gap-2 mt-6">
      <button id='nacc-save' class="flex-1 px-4 py-2.5 bg-gradient-to-r from-blue-600 to-blue-700 dark:from-blue-600 dark:to-blue-700 theme-light:from-blue-500 theme-light:to-blue-600 hover:from-blue-700 hover:to-blue-800 dark:hover:from-blue-700 dark:hover:to-blue-800 theme-light:hover:from-blue-600 theme-light:hover:to-blue-700 text-white font-semibold rounded-lg shadow-md hover:shadow-lg transition-all duration-200">💾 Guardar</button>
      <button id='nacc-cancel' class="px-4 py-2.5 bg-slate-700/50 dark:bg-slate-700/50 hover:bg-slate-700 dark:hover:bg-slate-700 text-white dark:text-white font-semibold rounded-lg transition-all duration-200 border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300 theme-light:bg-slate-200 theme-light:text-slate-700 theme-light:hover:bg-slate-300 theme-light:hover:text-slate-900">Cancelar</button>
    </div>
    <div id='nacc-msg' class="mt-2 text-xs text-slate-300 dark:text-slate-300 theme-light:text-slate-600"></div>
  </div>`;
  body.innerHTML=''; body.appendChild(div); modal.classList.remove('hidden');
  
  const nameInput = div.querySelector('#nacc-name');
  const typeRadios = div.querySelectorAll('input[name="nacc-type"]');
  const balanceInput = div.querySelector('#nacc-balance');
  const notesInput = div.querySelector('#nacc-notes');
  const msgEl = div.querySelector('#nacc-msg');
  const saveBtn = div.querySelector('#nacc-save');
  const cancelBtn = div.querySelector('#nacc-cancel');
  
  // Focus en el input de nombre
  setTimeout(() => nameInput?.focus(), 100);
  
  // Enter en nombre para guardar
  nameInput?.addEventListener('keypress', (e) => {
    if(e.key === 'Enter') saveBtn?.click();
  });
  
  cancelBtn.onclick = () => modal.classList.add('hidden');
  
  saveBtn.onclick = async () => {
    const name = nameInput?.value?.trim() || '';
    if(!name){
      msgEl.textContent = '⚠️ El nombre de la cuenta es requerido';
      msgEl.style.color = 'var(--danger, #ef4444)';
      nameInput?.focus();
      return;
    }
    
    const type = Array.from(typeRadios).find(r => r.checked)?.value || 'CASH';
    const initialBalance = Number(balanceInput?.value || 0) || 0;
    const notes = notesInput?.value?.trim() || '';
    
    msgEl.textContent = 'Guardando...';
    msgEl.style.color = 'var(--muted)';
    saveBtn.disabled = true;
    
    try {
      await API.accounts.create({ name, type, initialBalance, notes });
      msgEl.textContent = '✅ Cuenta creada exitosamente';
      msgEl.style.color = 'var(--success, #10b981)';
      setTimeout(() => {
        modal.classList.add('hidden');
        loadAccounts();
      }, 800);
    } catch(e) {
      msgEl.textContent = '❌ ' + (e?.message || 'Error al crear la cuenta');
      msgEl.style.color = 'var(--danger, #ef4444)';
      saveBtn.disabled = false;
    }
  };
}

function openEditMovementModal(id, trRow){
  const modal = document.getElementById('modal');
  const body = document.getElementById('modalBody');
  if(!modal||!body) return;
  
  const currentDesc = trRow.children[2]?.textContent||'';
  const currentAmount = (trRow.children[4]?.textContent||'').replace(/[^\d]/g,'') || (trRow.children[5]?.textContent||'').replace(/[^\d]/g,'');
  
  const div = document.createElement('div');
  div.innerHTML = `<div class="space-y-4">
    <h3 class="text-xl font-bold text-white dark:text-white theme-light:text-slate-900 mb-4">✏️ Editar Movimiento</h3>
    <div>
      <label class="block text-sm font-medium text-slate-300 dark:text-slate-300 theme-light:text-slate-700 mb-2">Monto</label>
      <input id='edit-mov-amount' type='number' min='1' step='0.01' class="w-full p-3 border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300 rounded-lg bg-slate-700/50 dark:bg-slate-700/50 theme-light:bg-white text-white dark:text-white theme-light:text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"/>
    </div>
    <div>
      <label class="block text-sm font-medium text-slate-300 dark:text-slate-300 theme-light:text-slate-700 mb-2">Descripción</label>
      <input id='edit-mov-desc' type='text' placeholder='Descripción' class="w-full p-3 border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300 rounded-lg bg-slate-700/50 dark:bg-slate-700/50 theme-light:bg-white text-white dark:text-white theme-light:text-slate-900 placeholder-slate-400 dark:placeholder-slate-400 theme-light:placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"/>
    </div>
    <div class="flex gap-2 mt-6">
      <button id='edit-mov-save' class="flex-1 px-4 py-2.5 bg-gradient-to-r from-blue-600 to-blue-700 dark:from-blue-600 dark:to-blue-700 theme-light:from-blue-500 theme-light:to-blue-600 hover:from-blue-700 hover:to-blue-800 dark:hover:from-blue-700 dark:hover:to-blue-800 theme-light:hover:from-blue-600 theme-light:hover:to-blue-700 text-white font-semibold rounded-lg shadow-md hover:shadow-lg transition-all duration-200">💾 Guardar</button>
      <button id='edit-mov-cancel' class="px-4 py-2.5 bg-slate-700/50 dark:bg-slate-700/50 hover:bg-slate-700 dark:hover:bg-slate-700 text-white dark:text-white font-semibold rounded-lg transition-all duration-200 border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300 theme-light:bg-slate-200 theme-light:text-slate-700 theme-light:hover:bg-slate-300 theme-light:hover:text-slate-900">Cancelar</button>
    </div>
    <div id='edit-mov-msg' class="mt-2 text-xs text-slate-300 dark:text-slate-300 theme-light:text-slate-600"></div>
  </div>`;
  body.innerHTML=''; body.appendChild(div); modal.classList.remove('hidden');
  
  const amountInput = div.querySelector('#edit-mov-amount');
  const descInput = div.querySelector('#edit-mov-desc');
  const msgEl = div.querySelector('#edit-mov-msg');
  const saveBtn = div.querySelector('#edit-mov-save');
  const cancelBtn = div.querySelector('#edit-mov-cancel');
  
  // Establecer valores de forma segura
  if(amountInput) amountInput.value = currentAmount;
  if(descInput) descInput.value = currentDesc;
  
  setTimeout(() => amountInput?.focus(), 100);
  
  amountInput?.addEventListener('keypress', (e) => {
    if(e.key === 'Enter') saveBtn?.click();
  });
  
  descInput?.addEventListener('keypress', (e) => {
    if(e.key === 'Enter') saveBtn?.click();
  });
  
  cancelBtn.onclick = () => modal.classList.add('hidden');
  
  saveBtn.onclick = async () => {
    const newAmount = Number(amountInput?.value || 0) || 0;
    if(newAmount <= 0){
      msgEl.textContent = '⚠️ El monto debe ser mayor a 0';
      msgEl.style.color = 'var(--danger, #ef4444)';
      amountInput?.focus();
      return;
    }
    
    const newDesc = descInput?.value?.trim() || '';
    
    msgEl.textContent = 'Guardando...';
    msgEl.style.color = 'var(--muted)';
    saveBtn.disabled = true;
    
    try {
      await API.cashflow.update(id, { amount: newAmount, description: newDesc });
      msgEl.textContent = '✅ Movimiento actualizado exitosamente';
      msgEl.style.color = 'var(--success, #10b981)';
      setTimeout(() => {
        modal.classList.add('hidden');
        loadAccounts();
        loadMovements();
      }, 800);
    } catch(err) {
      msgEl.textContent = '❌ ' + (err?.message || 'Error al actualizar');
      msgEl.style.color = 'var(--danger, #ef4444)';
      saveBtn.disabled = false;
    }
  };
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
    if(body) body.innerHTML='<tr><td colspan="8" class="px-4 py-6 text-center text-xs text-slate-400 dark:text-slate-400 theme-light:text-slate-600">Cargando...</td></tr>';
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
        return `<tr data-id='${loan._id}' class="border-b border-slate-700/30 dark:border-slate-700/30 theme-light:border-slate-200 hover:bg-slate-700/20 dark:hover:bg-slate-700/20 theme-light:hover:bg-slate-50 transition-colors">
          <td data-label="Fecha" class="px-4 py-3 text-xs text-white dark:text-white theme-light:text-slate-900 border-r border-slate-700/30 dark:border-slate-700/30 theme-light:border-slate-200">${date}</td>
          <td data-label="Técnico" class="px-4 py-3 text-xs text-white dark:text-white theme-light:text-slate-900 border-r border-slate-700/30 dark:border-slate-700/30 theme-light:border-slate-200">${loan.technicianName}</td>
          <td data-label="Monto" class="px-4 py-3 text-right text-xs text-white dark:text-white theme-light:text-slate-900 border-r border-slate-700/30 dark:border-slate-700/30 theme-light:border-slate-200">${money(loan.amount)}</td>
          <td data-label="Pagado" class="px-4 py-3 text-right text-xs text-white dark:text-white theme-light:text-slate-900 border-r border-slate-700/30 dark:border-slate-700/30 theme-light:border-slate-200">${money(loan.paidAmount||0)}</td>
          <td data-label="Pendiente" class="px-4 py-3 text-right text-xs font-semibold text-white dark:text-white theme-light:text-slate-900 border-r border-slate-700/30 dark:border-slate-700/30 theme-light:border-slate-200">${money(pending)}</td>
          <td data-label="Estado" class="px-4 py-3 text-xs text-white dark:text-white theme-light:text-slate-900 border-r border-slate-700/30 dark:border-slate-700/30 theme-light:border-slate-200">${statusLabels[loan.status]||loan.status}</td>
          <td data-label="Descripción" class="px-4 py-3 text-xs text-white dark:text-white theme-light:text-slate-900 border-r border-slate-700/30 dark:border-slate-700/30 theme-light:border-slate-200">${loan.description||'-'}</td>
          <td class="px-4 py-3" style='white-space:nowrap;'>
            ${canDelete?`<button class='px-3 py-1.5 text-xs bg-red-600/20 dark:bg-red-600/20 hover:bg-red-600/40 dark:hover:bg-red-600/40 text-red-400 dark:text-red-400 hover:text-red-300 dark:hover:text-red-300 font-medium rounded-lg transition-all duration-200 border border-red-600/30 dark:border-red-600/30 theme-light:bg-red-50 theme-light:text-red-600 theme-light:hover:bg-red-100 theme-light:border-red-300' data-act='del' title='Eliminar'>Eliminar</button>`:''}
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
      
      if(!loans.length) body.innerHTML='<tr><td colspan="8" class="px-4 py-6 text-center text-xs text-slate-400 dark:text-slate-400 theme-light:text-slate-600">Sin préstamos</td></tr>';
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
    if(body) body.innerHTML='<tr><td colspan="8" class="px-4 py-6 text-center text-xs text-slate-400 dark:text-slate-400 theme-light:text-slate-600">Error al cargar préstamos</td></tr>';
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

