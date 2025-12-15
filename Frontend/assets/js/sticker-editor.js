// Editor dedicado para stickers 5cm x 3cm (drag + resize)
(function () {
  'use strict';

  const PX_PER_CM = 37.795275591;
  const state = {
    session: null,
    layout: null,
    selectedId: null,
    sample: {
      sku: 'SKU-0001',
      name: 'Producto de ejemplo',
      qr: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="140" height="140" viewBox="0 0 140 140"><rect width="140" height="140" fill="white"/><rect x="10" y="10" width="120" height="120" fill="black"/><rect x="20" y="20" width="100" height="100" fill="white"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-size="16" font-family="Arial">QR</text></svg>'
    }
  };

  function cmToPx(cm) {
    return Math.round(cm * PX_PER_CM);
  }

  function defaultLayout() {
    return {
      widthCm: 5,
      heightCm: 3,
      elements: [
        { id: 'sku', type: 'text', source: 'sku', x: 8, y: 8, w: 120, h: 22, fontSize: 14, fontWeight: '700', wrap: false, align: 'flex-start', vAlign: 'center' },
        { id: 'name', type: 'text', source: 'name', x: 8, y: 34, w: 120, h: 42, fontSize: 11, fontWeight: '600', wrap: true, align: 'flex-start', vAlign: 'flex-start', lineHeight: 1.1 },
        { id: 'qr', type: 'image', source: 'qr', x: 135, y: 6, w: 90, h: 90, fit: 'contain' },
        { id: 'img', type: 'image', source: 'item-image', x: 8, y: 80, w: 120, h: 40, fit: 'cover' }
      ]
    };
  }

  function notify(msg, type = 'info') {
    const el = document.createElement('div');
    el.className = `fixed top-5 right-5 px-4 py-2 rounded-lg shadow-lg text-white text-sm z-[4000] ${type === 'error' ? 'bg-red-600' : 'bg-blue-600'}`;
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => {
      el.style.opacity = '0';
      setTimeout(() => el.remove(), 250);
    }, 1800);
  }

  function getCanvas() {
    return document.getElementById('ce-canvas');
  }

  function renderToolbar() {
    const bar = document.getElementById('ce-toolbar');
    if (!bar) return;
    bar.innerHTML = `
      <div class="flex flex-wrap gap-2 items-center">
        <span class="text-sm font-semibold text-white dark:text-white theme-light:text-slate-900">Elementos:</span>
        <button data-add="sku" class="px-3 py-2 rounded bg-blue-600 text-white text-sm">SKU</button>
        <button data-add="name" class="px-3 py-2 rounded bg-blue-600 text-white text-sm">Nombre</button>
        <button data-add="qr" class="px-3 py-2 rounded bg-blue-600 text-white text-sm">QR</button>
        <button data-add="image" class="px-3 py-2 rounded bg-blue-600 text-white text-sm">Imagen externa</button>
        <button data-add="text" class="px-3 py-2 rounded bg-slate-700 text-white text-sm">Texto libre</button>
        <span class="ml-3 text-xs text-slate-300 theme-light:text-slate-700">Canvas fijo: 5cm x 3cm</span>
      </div>
    `;
    bar.addEventListener('click', (e) => {
      const type = e.target?.dataset?.add;
      if (!type) return;
      addElement(type);
    });
  }

  function renderSidebar() {
    const varsBox = document.getElementById('var-list');
    const presetBox = document.getElementById('preset-list');
    if (varsBox) varsBox.innerHTML = '<p class="text-sm text-slate-300 theme-light:text-slate-700 mb-2">Selecciona un elemento para ajustar sus propiedades. Todo es arrastrable y redimensionable.</p><div id="sticker-props"></div>';
    if (presetBox) presetBox.innerHTML = '<p class="text-sm text-slate-400 theme-light:text-slate-600">Formato único de sticker 5cm x 3cm</p>';
  }

  function ensureLayout() {
    if (!state.layout) state.layout = defaultLayout();
  }

  function sampleValue(el) {
    const src = el.source || el.type;
    if (src === 'sku') return state.sample.sku;
    if (src === 'name') return state.sample.name;
    if (src === 'qr-text') return state.sample.sku;
    if (src === 'custom') return el.text || 'Texto';
    return el.text || '';
  }

  function sampleImage(el) {
    const src = el.source || el.type;
    if (src === 'qr') return state.sample.qr;
    if (src === 'item-image') return 'https://via.placeholder.com/150x90.png?text=Img';
    return el.url || 'https://via.placeholder.com/140.png?text=Img';
  }

  function selectElement(id) {
    state.selectedId = id;
    renderCanvas();
    renderProperties();
  }

  function addElement(kind) {
    ensureLayout();
    const nextId = `el-${Date.now()}`;
    const base = { id: nextId, x: 12, y: 12, w: 80, h: 22, fontSize: 12, fontWeight: '600', wrap: true, align: 'flex-start', vAlign: 'center' };
    if (kind === 'sku') state.layout.elements.push({ ...base, type: 'text', source: 'sku', fontWeight: '700', w: 110 });
    else if (kind === 'name') state.layout.elements.push({ ...base, type: 'text', source: 'name', h: 36, wrap: true, lineHeight: 1.1 });
    else if (kind === 'qr') state.layout.elements.push({ ...base, type: 'image', source: 'qr', w: 90, h: 90, fit: 'contain', x: cmToPx(5) - 100, y: 10 });
    else if (kind === 'image') state.layout.elements.push({ ...base, type: 'image', source: 'item-image', w: 110, h: 50, fit: 'cover' });
    else if (kind === 'text') state.layout.elements.push({ ...base, type: 'text', source: 'custom', text: 'Texto', wrap: true });
    selectElement(nextId);
  }

  function applyNodeStyle(node, el) {
    node.style.left = `${el.x}px`;
    node.style.top = `${el.y}px`;
    node.style.width = `${el.w}px`;
    node.style.height = `${el.h}px`;
  }

  function renderCanvas() {
    ensureLayout();
    const canvas = getCanvas();
    if (!canvas) return;
    const widthPx = cmToPx(state.layout.widthCm || state.layout.width || 5);
    const heightPx = cmToPx(state.layout.heightCm || state.layout.height || 3);
    // Centrar y limpiar padding heredado del editor general
    canvas.style.margin = '24px auto 32px';
    canvas.style.display = 'block';
    canvas.style.padding = '0';
    canvas.innerHTML = '';
    canvas.style.width = `${widthPx}px`;
    canvas.style.height = `${heightPx}px`;
    canvas.style.margin = '0 auto';
    canvas.style.position = 'relative';
    canvas.style.background = '#ffffff';
    canvas.style.border = '1px dashed #64748b';
    canvas.style.boxSizing = 'border-box';

    state.layout.elements.forEach((el) => {
      const wrapper = document.createElement('div');
      wrapper.className = 'st-el';
      wrapper.dataset.id = el.id;
      wrapper.style.position = 'absolute';
      wrapper.style.boxSizing = 'border-box';
      wrapper.style.overflow = 'hidden';
      wrapper.style.border = state.selectedId === el.id ? '1px solid #3b82f6' : '1px dashed #cbd5e1';
      wrapper.style.background = 'transparent';
      applyNodeStyle(wrapper, el);

      if (el.type === 'image') {
        const img = document.createElement('img');
        img.src = sampleImage(el);
        img.alt = el.source || '';
        img.style.width = '100%';
        img.style.height = '100%';
        img.style.objectFit = el.fit || 'contain';
        wrapper.appendChild(img);
      } else {
        wrapper.textContent = sampleValue(el);
        wrapper.style.display = 'flex';
        wrapper.style.alignItems = el.vAlign || 'center';
        wrapper.style.justifyContent = el.align || 'flex-start';
        wrapper.style.fontSize = `${el.fontSize || 12}px`;
        wrapper.style.fontWeight = el.fontWeight || '600';
        wrapper.style.lineHeight = `${el.lineHeight || 1.1}`;
        wrapper.style.color = el.color || '#000';
        wrapper.style.whiteSpace = el.wrap === false ? 'nowrap' : 'normal';
        wrapper.style.wordBreak = 'break-word';
      }

      const handle = document.createElement('div');
      handle.className = 'st-resize';
      handle.style.position = 'absolute';
      handle.style.width = '12px';
      handle.style.height = '12px';
      handle.style.right = '-6px';
      handle.style.bottom = '-6px';
      handle.style.background = '#3b82f6';
      handle.style.borderRadius = '4px';
      handle.style.cursor = 'nwse-resize';
      wrapper.appendChild(handle);

      wrapper.addEventListener('pointerdown', (e) => {
        if (e.target === handle) return;
        selectElement(el.id);
      });

      handle.addEventListener('pointerdown', (e) => startResize(e, el, wrapper));
      wrapper.addEventListener('pointerdown', (e) => startDrag(e, el, wrapper));
      canvas.appendChild(wrapper);
    });
  }

  function startDrag(ev, el, node) {
    if (ev.target.classList.contains('st-resize')) return;
    ev.preventDefault();
    selectElement(el.id);
    const startX = ev.clientX;
    const startY = ev.clientY;
    const origin = { x: el.x, y: el.y };
    function move(e) {
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      el.x = Math.max(0, origin.x + dx);
      el.y = Math.max(0, origin.y + dy);
      applyNodeStyle(node, el);
      renderProperties(true);
    }
    function end() {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      renderProperties();
    }
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
  }

  function startResize(ev, el, node) {
    ev.preventDefault();
    selectElement(el.id);
    const startX = ev.clientX;
    const startY = ev.clientY;
    const origin = { w: el.w, h: el.h };
    function move(e) {
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      el.w = Math.max(10, origin.w + dx);
      el.h = Math.max(10, origin.h + dy);
      applyNodeStyle(node, el);
      renderProperties(true);
    }
    function end() {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      renderProperties();
    }
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
  }

  function renderProperties(skipSelectSync = false) {
    const box = document.getElementById('sticker-props');
    if (!box) return;
    const el = state.layout.elements.find((e) => e.id === state.selectedId);
    if (!el) {
      box.innerHTML = '<p class="text-sm text-slate-400 theme-light:text-slate-600">Selecciona un elemento.</p>';
      return;
    }
    box.innerHTML = `
      <div class="space-y-2 text-sm text-slate-200 theme-light:text-slate-800">
        <div class="flex justify-between items-center">
          <span class="font-semibold">Propiedades</span>
          <button id="st-del" class="text-red-500 hover:text-red-400">Eliminar</button>
        </div>
        <div class="grid grid-cols-2 gap-2">
          <label class="flex flex-col gap-1">X (px)<input id="st-x" type="number" value="${el.x}" class="input-lite"/></label>
          <label class="flex flex-col gap-1">Y (px)<input id="st-y" type="number" value="${el.y}" class="input-lite"/></label>
          <label class="flex flex-col gap-1">Ancho (px)<input id="st-w" type="number" value="${el.w}" class="input-lite"/></label>
          <label class="flex flex-col gap-1">Alto (px)<input id="st-h" type="number" value="${el.h}" class="input-lite"/></label>
        </div>
        ${el.type === 'text' ? `
          <label class="flex flex-col gap-1">Tamaño fuente (px)<input id="st-fs" type="number" value="${el.fontSize || 12}" class="input-lite"/></label>
          <label class="flex flex-col gap-1">Peso (400-800)<input id="st-fw" type="number" value="${parseInt(el.fontWeight || 600, 10)}" class="input-lite"/></label>
          <label class="flex flex-col gap-1">Color<input id="st-color" type="color" value="${el.color || '#000000'}" class="input-lite"/></label>
          ${el.source === 'custom' ? `<label class="flex flex-col gap-1">Texto<input id="st-text" type="text" value="${el.text || ''}" class="input-lite"/></label>` : ''}
        ` : `
          <label class="flex flex-col gap-1">Modo ajuste
            <select id="st-fit" class="input-lite">
              <option value="contain" ${el.fit === 'contain' ? 'selected' : ''}>Contain</option>
              <option value="cover" ${el.fit === 'cover' ? 'selected' : ''}>Cover</option>
            </select>
          </label>
          <label class="flex flex-col gap-1">URL imagen (opcional)
            <input id="st-url" type="text" value="${el.url || ''}" class="input-lite" placeholder="https://..."/>
          </label>
        `}
      </div>
    `;

    if (skipSelectSync) return;
    const bind = (id, fn) => { const elDom = document.getElementById(id); if (elDom) elDom.oninput = fn; };
    bind('st-x', (e) => { el.x = Number(e.target.value) || 0; renderCanvas(); });
    bind('st-y', (e) => { el.y = Number(e.target.value) || 0; renderCanvas(); });
    bind('st-w', (e) => { el.w = Math.max(10, Number(e.target.value) || 0); renderCanvas(); });
    bind('st-h', (e) => { el.h = Math.max(10, Number(e.target.value) || 0); renderCanvas(); });
    bind('st-fs', (e) => { el.fontSize = Math.max(6, Number(e.target.value) || 0); renderCanvas(); });
    bind('st-fw', (e) => { el.fontWeight = String(e.target.value || '600'); renderCanvas(); });
    bind('st-color', (e) => { el.color = e.target.value || '#000000'; renderCanvas(); });
    bind('st-text', (e) => { el.text = e.target.value || ''; renderCanvas(); });
    bind('st-fit', (e) => { el.fit = e.target.value || 'contain'; renderCanvas(); });
    bind('st-url', (e) => { el.url = e.target.value || ''; renderCanvas(); });
    const del = document.getElementById('st-del');
    if (del) del.onclick = () => {
      state.layout.elements = state.layout.elements.filter((x) => x.id !== el.id);
      state.selectedId = null;
      renderCanvas();
      renderProperties();
    };
  }

  async function loadExisting(session) {
    // Si no hay formato previo, usar layout default sin fallar
    if (session.action !== 'edit' || !session.formatId) {
      state.layout = defaultLayout();
      renderCanvas();
      renderProperties();
      return;
    }
    try {
      const tpl = await (window.API?.templates?.get
        ? API.templates.get(session.formatId)
        : Promise.reject(new Error('API.templates.get no disponible')));
      const meta = tpl?.meta || {};
      state.layout = meta.layout || defaultLayout();
      if (!state.layout.widthCm && meta.width) state.layout.widthCm = meta.width;
      if (!state.layout.heightCm && meta.height) state.layout.heightCm = meta.height;
    } catch (e) {
      console.error('⚠️ No se pudo cargar el formato, usando layout por defecto', e);
      state.layout = defaultLayout();
    }
    renderCanvas();
    renderProperties();
  }

  function buildPayload() {
    ensureLayout();
    const meta = {
      width: state.layout.widthCm || 5,
      height: state.layout.heightCm || 3,
      layout: state.layout
    };
    return {
      type: state.session.type,
      name: state.session.name || 'Sticker',
      contentHtml: '',
      contentCss: '',
      activate: true,
      meta,
      layout: state.layout
    };
  }

  async function saveTemplate() {
    const payload = buildPayload();
    try {
      if (state.session.action === 'edit' && state.session.formatId) {
        await API.templates.update(state.session.formatId, payload);
      } else {
        const created = await API.templates.create(payload);
        state.session.formatId = created?._id;
        state.session.action = 'edit';
      }
      notify('Plantilla de sticker guardada');
    } catch (err) {
      console.error(err);
      notify('No se pudo guardar la plantilla', 'error');
    }
  }

  async function previewTemplate() {
    const payload = {
      type: state.session.type,
      layout: state.layout,
      meta: { width: state.layout.widthCm || 5, height: state.layout.heightCm || 3 }
    };
    try {
      const pv = await API.templates.preview(payload);
      const overlay = document.getElementById('preview-overlay');
      const frame = document.getElementById('preview-frame');
      if (frame && pv?.rendered) {
        const doc = frame.contentDocument || frame.contentWindow?.document;
        if (doc) {
          doc.open();
          doc.write(`<html><head><style>body{margin:0;padding:20px;display:flex;justify-content:center;align-items:center;background:#f8fafc;} .sticker-wrapper{box-shadow:0 0 0 1px #e2e8f0;}</style></head><body>${pv.rendered}</body></html>`);
          doc.close();
        }
      }
      if (overlay) overlay.classList.remove('hidden');
    } catch (err) {
      console.error(err);
      notify('No se pudo generar la vista previa', 'error');
    }
  }

  function bindActions() {
    const saveBtn = document.getElementById('save-template');
    const prevBtn = document.getElementById('preview-template');
    if (saveBtn) saveBtn.onclick = saveTemplate;
    if (prevBtn) prevBtn.onclick = previewTemplate;

    const closePrev = document.getElementById('preview-close');
    const overlay = document.getElementById('preview-overlay');
    if (closePrev && overlay) {
      closePrev.onclick = () => overlay.classList.add('hidden');
    }
  }

  async function init() {
    try {
      const params = new URLSearchParams(window.location.search);
      const type = params.get('type') || 'sticker-qr';
      const action = params.get('action') || 'create';
      const formatId = params.get('formatId');
      const formatName = params.get('formatName') || 'Sticker';
      if (!type.includes('sticker')) {
        // Si no es sticker, no bloquear otros formatos: dejar que el loader cargue templates-visual
        return;
      }

      state.session = { type, action, formatId, name: formatName };
      window.currentTemplateSession = state.session;

      const appSection = document.getElementById('appSection');
      if (appSection) appSection.classList.remove('hidden');

      renderToolbar();
      renderSidebar();
      bindActions();
      await loadExisting(state.session);
    } catch (err) {
      console.error('Sticker editor init failed, usando canvas vacío', err);
      try {
        const appSection = document.getElementById('appSection');
        if (appSection) appSection.classList.remove('hidden');
        state.layout = defaultLayout();
        renderToolbar();
        renderSidebar();
        bindActions();
        renderCanvas();
        renderProperties();
      } catch (_) {
        // último recurso: no hacer nada más
      }
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();

