import { API } from './api.esm.js';

let cfg = { laborKinds: [], technicians: [] };

function $(s, r=document){ return r.querySelector(s); }

function renderKinds(){
  const cont = $('#tk-kinds'); if(!cont) return;
  cont.innerHTML='';
  (cfg.laborKinds||[]).forEach(k=>{
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.textContent = k;
    chip.style.cursor='pointer';
    chip.title='Click para eliminar';
    chip.onclick = ()=>{ if(confirm('Eliminar tipo '+k+'?')){ cfg.laborKinds = cfg.laborKinds.filter(x=>x!==k); renderKinds(); } };
    cont.appendChild(chip);
  });
}

function renderTechList(){
  const list = $('#tk-list'); if(!list) return;
  list.innerHTML='';
  (cfg.technicians||[]).forEach((t,i)=>{
    const card = document.createElement('div'); card.className='card'; card.style.marginTop='8px';
    card.innerHTML = `
      <div class="row between" style="align-items:center;">
        <div class="row" style="gap:6px;align-items:center;">
          <strong>${t.name}</strong>
          <label class="row" style="gap:4px;align-items:center;"><input type="checkbox" data-role="active" ${t.active?'checked':''}/> Activo</label>
        </div>
        <button class="secondary" data-role="add-rate">+ Tasa</button>
      </div>
      <table class="table small" style="width:100%;margin-top:6px;">
        <thead><tr><th>Tipo</th><th class="t-right">% Tec</th><th></th></tr></thead>
        <tbody data-role="rates"></tbody>
      </table>`;
    const ratesBody = card.querySelector('[data-role=rates]');
    const activeChk = card.querySelector('[data-role=active]');
    activeChk.addEventListener('change', ()=>{ t.active = activeChk.checked; });
    function renderRates(){
      ratesBody.innerHTML='';
      (t.rates||[]).forEach((r,idx)=>{
        const tr = document.createElement('tr');
        const kindOpts = [''].concat(cfg.laborKinds||[]).map(k=>`<option value="${k}" ${k===r.kind?'selected':''}>${k}</option>`).join('');
        tr.innerHTML = `<td><select data-role="kind">${kindOpts}</select></td><td class="t-right"><input data-role="pc" type="number" min="0" max="100" step="1" value="${Number(r.percent||0)||0}" style="width:80px;"></td><td class="t-center"><button data-role="del" class="small danger">×</button></td>`;
        const kindSel = tr.querySelector('[data-role=kind]');
        const pcInp = tr.querySelector('[data-role=pc]');
        const del = tr.querySelector('[data-role=del]');
        kindSel.addEventListener('change', ()=>{ r.kind = kindSel.value; });
        pcInp.addEventListener('input', ()=>{ r.percent = Number(pcInp.value||0)||0; });
        del.addEventListener('click', ()=>{ t.rates.splice(idx,1); renderRates(); });
        ratesBody.appendChild(tr);
      });
    }
    renderRates();
    card.querySelector('[data-role=add-rate]').addEventListener('click', ()=>{ (t.rates=t.rates||[]).push({ kind:'', percent:0 }); renderRates(); });
    list.appendChild(card);
  });
}

async function init(){
  try{ cfg = await API.company.getTechConfig(); } catch{ cfg = { laborKinds: [], technicians: [] }; }
  renderKinds(); renderTechList();
  $('#tk-add-kind').onclick = ()=>{ const v = String($('#tk-new-kind').value||'').trim().toUpperCase(); if(!v) return; if(!(cfg.laborKinds||[]).includes(v)){ cfg.laborKinds.push(v); renderKinds(); } $('#tk-new-kind').value=''; };
  $('#tk-add-tech').onclick = ()=>{ const v = String($('#tk-new-name').value||'').trim().toUpperCase(); if(!v) return; if(!(cfg.technicians||[]).find(x=>x.name===v)){ (cfg.technicians=cfg.technicians||[]).push({ name:v, active:true, rates:[] }); renderTechList(); } $('#tk-new-name').value=''; };
  $('#tk-save').onclick = async ()=>{
    $('#tk-msg').textContent = 'Guardando...';
    try{ const saved = await API.company.setTechConfig(cfg); cfg = saved; $('#tk-msg').textContent = 'Guardado'; }
    catch(e){ $('#tk-msg').textContent = e?.message||'Error'; }
  };
}

document.addEventListener('DOMContentLoaded', init);

