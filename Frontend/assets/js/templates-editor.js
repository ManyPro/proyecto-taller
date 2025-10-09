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
    { icon:'T', title:'Texto libre', action:insertTextBlock },
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
    // Selector de color
    const colorInput = document.createElement('input');
    colorInput.type = 'color';
    colorInput.id = 'ce-color';
    colorInput.title = 'Color de texto';
    colorInput.value = '#222222';
    colorInput.style.marginLeft = '12px';
    bar.appendChild(colorInput);
    // Selector de fuente
    const fontSelect = document.createElement('select');
    fontSelect.id = 'ce-font';
    fontSelect.title = 'Fuente';
    ['Arial','Verdana','Times New Roman','Courier New','Georgia'].forEach(f=>{
      const opt = document.createElement('option');
      opt.value = f; opt.textContent = f;
      fontSelect.appendChild(opt);
    });
    fontSelect.style.marginLeft = '8px';
    bar.appendChild(fontSelect);
    // Selector de tamaño
    const sizeInput = document.createElement('input');
    sizeInput.type = 'number';
    sizeInput.id = 'ce-size';
    sizeInput.title = 'Tamaño de texto';
    sizeInput.value = 18;
    sizeInput.min = 8;
    sizeInput.max = 72;
    sizeInput.style.width = '60px';
    sizeInput.style.marginLeft = '8px';
    bar.appendChild(sizeInput);
    // Input para adjuntar imagen local
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.style.display = 'none';
    fileInput.id = 'ce-img-file';
    bar.appendChild(fileInput);
    const imgBtn = document.createElement('button');
    imgBtn.type = 'button';
    imgBtn.className = 'ce-btn';
    imgBtn.textContent = 'Adjuntar Img';
    imgBtn.title = 'Adjuntar imagen desde tu equipo';
    imgBtn.onclick = () => fileInput.click();
    bar.appendChild(imgBtn);
    fileInput.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = function(ev) {
        insertImageFromData(ev.target.result);
      };
      reader.readAsDataURL(file);
      fileInput.value = '';
    };
  }
  // Bloque de texto movible y editable
  function insertTextBlock(){
    const canvasEl = canvas();
    const color = document.getElementById('ce-color')?.value || '#222';
    const font = document.getElementById('ce-font')?.value || 'Arial';
    const size = document.getElementById('ce-size')?.value || 18;
    const textWrap = document.createElement('div');
    textWrap.className = 'ce-text-wrap';
    textWrap.contentEditable = 'true';
    textWrap.innerText = 'Texto editable';
    textWrap.style.position = 'absolute';
    textWrap.style.top = '60px';
    textWrap.style.left = '60px';
    textWrap.style.color = color;
    textWrap.style.fontFamily = font;
    textWrap.style.fontSize = size+'px';
    textWrap.style.minWidth = '80px';
    textWrap.style.minHeight = '32px';
    textWrap.style.background = 'rgba(255,255,255,0.01)';
    textWrap.style.padding = '2px 8px';
    textWrap.style.borderRadius = '6px';
    textWrap.style.border = '1px dashed #bbb';
    textWrap.style.zIndex = 10;
    canvasEl.appendChild(textWrap);
    attachDrag(textWrap);
    attachResize(textWrap, createTextResizer(textWrap));
    // Actualizar estilos al editar
    textWrap.addEventListener('focus',()=>{
      document.getElementById('ce-color').value = rgbToHex(textWrap.style.color);
      document.getElementById('ce-font').value = textWrap.style.fontFamily;
      document.getElementById('ce-size').value = parseInt(textWrap.style.fontSize)||18;
    });
    document.getElementById('ce-color').oninput = e => {
      if(document.activeElement===textWrap) textWrap.style.color = e.target.value;
    };
    document.getElementById('ce-font').onchange = e => {
      if(document.activeElement===textWrap) textWrap.style.fontFamily = e.target.value;
    };
    document.getElementById('ce-size').oninput = e => {
      if(document.activeElement===textWrap) textWrap.style.fontSize = e.target.value+'px';
    };
  }

  function createTextResizer(textWrap){
    const handle = document.createElement('div');
    handle.className = 'ce-resizer';
    textWrap.appendChild(handle);
    return handle;
  }

  function rgbToHex(rgb){
    if(!rgb) return '#222222';
    const result = rgb.match(/\d+/g);
    if(!result) return '#222222';
    return '#' + result.slice(0,3).map(x=>('0'+parseInt(x).toString(16)).slice(-2)).join('');
  }

  function insertImageFromData(dataUrl){
    const imgWrap = document.createElement('div');
    imgWrap.className='ce-img-wrap';
    imgWrap.contentEditable='false';
    const img = document.createElement('img');
    img.src=dataUrl; img.draggable=false; img.className='ce-img';
    const handle = document.createElement('div');
    handle.className='ce-resizer';
    imgWrap.appendChild(img);
    imgWrap.appendChild(handle);
    canvas().appendChild(imgWrap);
    attachDrag(imgWrap); attachResize(imgWrap, handle);
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
  .ce-text-wrap { position:absolute; min-width:80px; min-height:32px; background:rgba(255,255,255,0.01); border-radius:6px; border:1px dashed #bbb; padding:2px 8px; z-index:10; cursor:text; }
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
    const previewBtn = document.getElementById('preview-template');
    const overlay = document.getElementById('preview-overlay');
    const closeBtn = document.getElementById('preview-close');
    const frame = document.getElementById('preview-frame');
    if(previewBtn && overlay && frame){
      previewBtn.addEventListener('click', async ()=>{
        const companyId = document.getElementById('company-select').value;
        const type = prompt('Tipo para vista previa (invoice, quote, workOrder, sticker):');
        if(!companyId || !type) return alert('Faltan datos');
        const html = canvas().innerHTML;
        const pdfSize = document.getElementById('pdf-size').value;
        const meta = { pdfSize };
        if(pdfSize==='custom') { meta.customW=document.getElementById('custom-width').value; meta.customH=document.getElementById('custom-height').value; }
        try {
          const resp = await API.templates.preview({ companyId, type, contentHtml: html, contentCss:'', meta });
          const docHtml = resp?.html || html;
          const blob = new Blob([docHtml], { type:'text/html' });
          const url = URL.createObjectURL(blob);
          frame.src = url;
          overlay.style.display='flex';
        } catch(e){
          alert('Error en vista previa: '+(e.message||e));
        }
      });
      closeBtn && closeBtn.addEventListener('click', ()=>{ overlay.style.display='none'; frame.src='about:blank'; });
      overlay.addEventListener('click', e=>{ if(e.target===overlay){ overlay.style.display='none'; frame.src='about:blank'; }});
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
