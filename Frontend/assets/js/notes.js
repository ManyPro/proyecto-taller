/* Notas (sin HTML en JS) */
import API from './api.js';

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));
const fmt = (d) => (window.dayjs ? dayjs(d).format('DD/MM/YYYY HH:mm') : new Date(d).toLocaleString());

function openModal(){ const m=$('#modal'); if(!m) return; m.classList.remove('hidden'); document.body.style.overflow='hidden'; const onKey=(e)=>{ if(e.key==='Escape') closeModal(); }; document.addEventListener('keydown', onKey); return ()=>document.removeEventListener('keydown', onKey); }
function closeModal(){ const m=$('#modal'); if(!m) return; m.classList.add('hidden'); document.body.style.overflow=''; }
function useTemplate(id){
  const t = document.getElementById(id);
  return t && t.content ? t.content.cloneNode(true) : document.createDocumentFragment();
}
function openModalFromTemplate(tplId, setup){
  const modal = $('#modal'), body = $('#modalBody'), closeBtn = $('#modalClose');
  if(!modal || !body) return alert('No se encontró el modal');
  body.replaceChildren(); // sin innerHTML
  const frag = useTemplate(tplId);
  body.appendChild(frag);
  const cleanup = openModal();
  if(closeBtn) closeBtn.onclick = () => { cleanup?.(); closeModal(); };
  if(typeof setup==='function') setup(body);
}

export function initNotes(){
  const tab = $('#tab-notas'); if(!tab) return;
  const list = $('#notesList');
  const iPlate = $('#n-plate');
  const iType = $('#n-type');
  const iResp = $('#n-responsible');
  const iText = $('#n-content');
  const iWhen = $('#n-when');
  const iFiles = $('#n-files');

  iWhen.value = fmt(new Date());

  async function loadNotes(){
    try{
      const params = {};
      const plate = ($('#f-plate')?.value||'').trim(); if(plate) params.plate = plate.toUpperCase();
      if($('#f-from')?.value) params.from = $('#f-from').value;
      if($('#f-to')?.value)   params.to   = $('#f-to').value;
      const res = await API.notesList?.(params);
      const rows = Array.isArray(res?.data) ? res.data : (Array.isArray(res) ? res : []);
      renderList(rows);
    }catch(e){ alert(e?.message||'No se pudo cargar'); }
  }

  function renderList(rows){
    list.replaceChildren();
    for(const row of rows){
      const card = document.createElement('div');
      card.className = 'list-item';
      const content = document.createElement('div');
      // header: <b>tipo</b> — fecha
      const header = document.createElement('div');
      const b = document.createElement('b'); b.textContent = row.type || '';
      header.appendChild(b);
      header.append(` — ${fmt(row.createdAt)}`);
      if(row.responsible){ header.append(` — ${row.responsible}`); }
      const text = document.createElement('div'); text.textContent = row.text || '';
      content.append(header, text);

      // media thumbs
      const mediaWrap = document.createElement('div');
      if(Array.isArray(row.media)){
        for(const m of row.media){
          const isVideo = /\.mp4$|video\//i.test(m.contentType||'') || String(m.url||'').match(/\.mp4$/i);
          if(isVideo){
            const btn = document.createElement('button');
            btn.className='secondary'; btn.textContent='Ver video';
            btn.onclick = ()=> openModalFromTemplate('tpl-lightbox-video', (root)=>{
              const v = root.querySelector('#lb-video'); if(v){ v.src = m.url; v.play?.(); }
            });
            mediaWrap.appendChild(btn);
          }else{
            const img = document.createElement('img');
            img.src = m.url; img.alt = 'thumb'; img.className = 'thumb';
            img.onclick = ()=> openModalFromTemplate('tpl-lightbox-img', (root)=>{
              const im = root.querySelector('#lb-img'); if(im) im.src = m.url;
            });
            mediaWrap.appendChild(img);
          }
        }
      }

      // actions
      const actions = document.createElement('div'); actions.className='row';
      const btnEdit = document.createElement('button'); btnEdit.className='secondary'; btnEdit.textContent='Editar';
      const btnDel  = document.createElement('button'); btnDel.className='danger'; btnDel.textContent='Borrar';
      btnEdit.onclick = ()=> openEdit(row);
      btnDel.onclick  = async ()=>{ if(!confirm('¿Eliminar la nota?')) return; await API.noteDelete?.(row._id); loadNotes(); };
      actions.append(btnEdit, btnDel);

      card.append(content, mediaWrap, actions);
      list.appendChild(card);
    }
  }

  async function onSave(){
    try{
      const fd = new FormData();
      fd.append('plate', (iPlate.value||'').trim().toUpperCase());
      fd.append('type', iType.value||'');
      fd.append('responsible', iResp.value||'');
      fd.append('text', iText.value||'');
      const files = Array.from(iFiles.files||[]); for(const f of files) fd.append('files', f);
      await API.noteCreate?.(fd);
      iText.value=''; iFiles.value=''; iPlate.value=''; iResp.value='';
      loadNotes();
    }catch(e){ alert(e?.message||'No se pudo guardar'); }
  }

  function openEdit(row){
    openModalFromTemplate('tpl-note-edit', (root)=>{
      const p = root.querySelector('#en-plate'); p.value = row.plate||'';
      const t = root.querySelector('#en-type'); t.value = row.type||'GENERICA';
      const r = root.querySelector('#en-responsible'); r.value = row.responsible||'';
      const c = root.querySelector('#en-content'); c.value = row.text||'';
      root.querySelector('#en-cancel').onclick = () => { closeModal(); };
      root.querySelector('#en-save').onclick = async ()=>{
        try{
          await API.noteUpdate?.(row._id, { plate:p.value, type:t.value, responsible:r.value, text:c.value });
          closeModal(); loadNotes();
        }catch(e){ alert(e?.message||'No se pudo actualizar'); }
      };
    });
  }

  $('#n-save').onclick = onSave;
  $('#f-apply').onclick = loadNotes;
  loadNotes();
}
