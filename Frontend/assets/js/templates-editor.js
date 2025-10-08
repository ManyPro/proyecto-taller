// templates-editor.js
// Editor personalizado ligero (sin GrapesJS) con:
// - Barra de formato
// - Inserción de variables
// - Imágenes arrastrables y redimensionables (handlers propios)
// - Guardado / carga vía API existente
// - Tamaño PDF (incluye personalizado)

(function(){
  const canvas = () => document.getElementById('ce-canvas');
  const toolbar = () => document.getElementById('ce-toolbar');

  const COMMANDS = [
    { icon:'B', title:'Negrita', cmd:'bold' },
    { icon:'I', title:'Cursiva', cmd:'italic' },
    { icon:'U', title:'Subrayado', cmd:'underline' },
    { icon:'H1', title:'Título 1', action:()=> execFormatBlock('h1') },
    { icon:'H2', title:'Título 2', action:()=> execFormatBlock('h2') },
    { icon:'P', title:'Párrafo', action:()=> execFormatBlock('p') },
    { icon:'•', title:'Lista', cmd:'insertUnorderedList' },
    { icon:'#', title:'Lista numerada', cmd:'insertOrderedList' },
    { icon:'Img', title:'Imagen', action:insertImage },
  ];

  function buildToolbar(){
    const bar = toolbar();
    bar.innerHTML = '';
    COMMANDS.forEach(c=>{
      const btn = document.createElement('button');
      btn.type='button';
      btn.className='ce-btn';
      btn.textContent=c.icon;
      btn.title=c.title;
      btn.onclick = () => {
        if(c.cmd) document.execCommand(c.cmd,false,null); else if(c.action) c.action();
        canvas().focus();
      };
      bar.appendChild(btn);
    });
  }

  function execFormatBlock(block){ document.execCommand('formatBlock', false, block); }

  // Imagen con drag + resize
  function insertImage(){
    const url = prompt('URL de la imagen (puede ser base64 o http)');
    if(!url) return;
    const imgWrap = document.createElement('div');
    imgWrap.className='ce-img-wrap';
    imgWrap.contentEditable='false';
    const img = document.createElement('img');
    img.src=url; img.draggable=false; img.className='ce-img';
    const handle = document.createElement('div');
    handle.className='ce-resizer';
    imgWrap.appendChild(img);
    imgWrap.appendChild(handle);
    canvas().appendChild(imgWrap);
    attachDrag(imgWrap); attachResize(imgWrap, handle);
  }

  function attachDrag(el){
    let sx=0, sy=0, ox=0, oy=0, dragging=false;
    el.addEventListener('mousedown', e=>{
      if(e.target.classList.contains('ce-resizer')) return;
      dragging=true; sx=e.clientX; sy=e.clientY; const r=el.getBoundingClientRect(); ox=r.left+window.scrollX; oy=r.top+window.scrollY; el.classList.add('ce-dragging');
      e.preventDefault();
    });
    window.addEventListener('mousemove', e=>{
      if(!dragging) return; const dx=e.clientX-sx; const dy=e.clientY-sy; el.style.position='absolute'; el.style.left=(ox+dx)+'px'; el.style.top=(oy+dy)+'px';
    });
    window.addEventListener('mouseup', ()=>{ if(dragging){ dragging=false; el.classList.remove('ce-dragging'); }});
  }

  function attachResize(wrapper, handle){
    let startX=0,startY=0,startW=0,startH=0,resizing=false;
    handle.addEventListener('mousedown', e=>{
      resizing=true; const r=wrapper.getBoundingClientRect(); startX=e.clientX; startY=e.clientY; startW=r.width; startH=r.height; e.stopPropagation(); e.preventDefault();
    });
    window.addEventListener('mousemove', e=>{
      if(!resizing) return; const dx=e.clientX-startX; const dy=e.clientY-startY; wrapper.style.width=(startW+dx)+'px'; wrapper.style.height=(startH+dy)+'px';
    });
    window.addEventListener('mouseup', ()=>{ resizing=false; });
  }

  // Variables
  function renderVariables(){
    const list = document.getElementById('var-list');
    if(!list) return;
    const vars = (window.VAR_CATALOG||[]).slice(0,150);
    list.innerHTML = vars.map(v=>`<button class="var-btn" data-val="${v.value}" title="${v.value}">${v.label}</button>`).join('');
    list.querySelectorAll('.var-btn').forEach(btn=>{
      btn.onclick=()=>{ insertHtmlAtCursor(btn.dataset.val); };
    });
  }

  function insertHtmlAtCursor(html){
    canvas().focus();
    document.execCommand('insertHTML', false, html);
  }

  // Guardar / Cargar
  async function saveTemplate(){
    const html = canvas().innerHTML;
    const companyId = document.getElementById('company-select').value;
    const pdfSize = document.getElementById('pdf-size').value;
    const name = prompt('Nombre de la plantilla:');
    const type = prompt('Tipo de documento (invoice, quote, workOrder, sticker):');
    let cw='', ch='';
    if(pdfSize==='custom') { cw=document.getElementById('custom-width').value; ch=document.getElementById('custom-height').value; if(!cw||!ch) return alert('Ingresa dimensiones'); }
    if(!companyId||!name||!type) return alert('Faltan datos');
    try {
      await API.templates.create({ companyId, name, type, contentHtml: html, contentCss:'', active:false, meta:{ pdfSize, customW:cw, customH:ch } });
      alert('Plantilla guardada');
    } catch(e){ alert('Error: '+(e.message||e)); }
  }

  async function loadTemplate(){
    const companyId = document.getElementById('company-select').value;
    const type = prompt('Tipo de documento a cargar (invoice, quote, workOrder, sticker):');
    if(!companyId||!type) return alert('Faltan datos');
    try {
      const list = await API.templates.list({ companyId, type });
      if(!list.length) return alert('No hay plantillas');
      const tpl = list[0];
      canvas().innerHTML = tpl.contentHtml || '';
      alert('Plantilla cargada: '+tpl.name);
    } catch(e){ alert('Error cargando: '+(e.message||e)); }
  }

  function setupPdfSizeWatcher(){
    const sel = document.getElementById('pdf-size');
    const custom = document.getElementById('custom-size-fields');
    sel.addEventListener('change', ()=>{ custom.style.display = (sel.value==='custom')? 'inline-block':'none'; });
  }

  function applyBaseStyles(){
    const style = document.createElement('style');
    style.textContent = `
      #custom-editor { display:flex; flex-direction:column; gap:8px; }
      .ce-toolbar { display:flex; flex-wrap:wrap; gap:6px; background:var(--bg-alt,#0a0f18); padding:8px; border-radius:8px; }
      .ce-btn { background:#1d4ed8; color:#fff; border:none; padding:6px 10px; border-radius:6px; font-size:12px; cursor:pointer; }
      .ce-btn:hover { background:#2563eb; }
      .ce-canvas { min-height:600px; background:#fff; border:2px solid #0a1320; border-radius:8px; padding:24px; position:relative; font-size:14px; line-height:1.5; }
      .ce-canvas:focus { outline:2px solid #3b82f6; }
      .ce-img-wrap { position:absolute; top:40px; left:40px; width:240px; height:auto; display:inline-block; box-shadow:0 2px 6px rgba(0,0,0,.25); }
      .ce-img-wrap img.ce-img { width:100%; height:auto; display:block; border-radius:4px; }
      .ce-img-wrap:hover .ce-resizer { opacity:1; }
      .ce-resizer { position:absolute; bottom:-6px; right:-6px; width:14px; height:14px; background:#1d4ed8; border:2px solid #fff; border-radius:50%; cursor:nwse-resize; box-shadow:0 0 0 1px #1d4ed8; opacity:0; transition:.15s; }
      .var-btn { background:#111827; color:#f1f5f9; border:1px solid #1f2937; padding:6px 8px; width:100%; text-align:left; border-radius:6px; font-size:12px; margin:2px 0; cursor:pointer; }
      .var-btn:hover { background:#1f2937; }
      .ce-dragging { opacity:.85; }
    `;
    document.head.appendChild(style);
  }

  async function initCompany(){
    const sel = document.getElementById('company-select');
    try { const me = await API.companyMe(); sel.innerHTML = `<option value="${me.company._id}">${me.company.name||me.company.email}</option>`; }
    catch { sel.innerHTML = '<option value="">(sin empresa)</option>'; }
  }

  function init(){
    applyBaseStyles();
    buildToolbar();
    renderVariables();
    setupPdfSizeWatcher();
    initCompany();
    document.getElementById('save-template').addEventListener('click', saveTemplate);
    document.getElementById('load-template').addEventListener('click', loadTemplate);
  }

  document.addEventListener('DOMContentLoaded', init);
})();
