// templates-visual.js
// Editor visual de plantillas con Quill

// Importar variables y presets si existen
let VAR_CATALOG = window.VAR_CATALOG || [];
let PRESETS = window.PRESETS || {};

let quill;
document.addEventListener('DOMContentLoaded', function() {
  quill = new Quill('#editor-container', {
    modules: {
      toolbar: [
        [{ header: [1, 2, 3, false] }],
        ['bold', 'italic', 'underline', 'strike'],
        [{ color: [] }, { background: [] }],
        [{ list: 'ordered' }, { list: 'bullet' }],
        ['link', 'image'],
        ['clean']
      ],
      imageResize: {
        parchment: Quill.import('parchment'),
        modules: [ 'Resize', 'DisplaySize', 'Toolbar' ]
      }
    },
    theme: 'snow'
  });

  // Obtener empresa activa
  const companySelect = document.getElementById('company-select');
  async function loadCompanies() {
    try {
      const me = await API.companyMe();
      // Simulación: solo una empresa activa
      companySelect.innerHTML = `<option value="${me.company._id}">${me.company.name || me.company.email}</option>`;
    } catch(e) {
      companySelect.innerHTML = '<option value="">Empresa no disponible</option>';
    }
  }
  loadCompanies();

  // Guardar plantilla
  document.getElementById('save-template').onclick = async function() {
    const html = quill.root.innerHTML;
    const companyId = companySelect.value;
    const name = prompt('Nombre de la plantilla:');
    const type = prompt('Tipo de documento (invoice, quote, workOrder, sticker):');
    const pdfSize = document.getElementById('pdf-size').value;
    if (!companyId || !name || !type) return alert('Faltan datos.');
    try {
      await API.templates.create({ companyId, name, type, contentHtml: html, contentCss: '', active: false, meta: { pdfSize } });
      alert('Plantilla guardada correctamente.');
    } catch(e) {
      alert('Error al guardar: ' + (e.message || e));
    }
  };

  // Cargar plantilla
  document.getElementById('load-template').onclick = async function() {
    const companyId = companySelect.value;
    const type = prompt('Tipo de documento a cargar (invoice, quote, workOrder, sticker):');
    if (!companyId || !type) return alert('Faltan datos.');
    try {
      const list = await API.templates.list({ companyId, type });
      if (!list.length) return alert('No hay plantillas para ese tipo.');
      // Seleccionar la última versión
      const tpl = list[0];
      quill.root.innerHTML = tpl.contentHtml || '';
      alert('Plantilla cargada: ' + tpl.name);
    } catch(e) {
      alert('Error al cargar: ' + (e.message || e));
    }
  };

  // Mostrar variables
  const varList = document.getElementById('var-list');
  if (VAR_CATALOG.length && varList) {
    varList.innerHTML = VAR_CATALOG.map(v => `<button class="var-btn" style="margin:2px 0;display:block;width:100%;" title="${v.value}">${v.label}</button>`).join('');
    varList.querySelectorAll('.var-btn').forEach((btn, i) => {
      btn.onclick = () => {
        const range = quill.getSelection(true);
        quill.insertText(range.index, VAR_CATALOG[i].value, 'user');
      };
    });
  }

  // Mostrar presets
  const presetList = document.getElementById('preset-list');
  if (PRESETS && presetList) {
    presetList.innerHTML = Object.keys(PRESETS).map(k => `<button class="preset-btn" style="margin:2px 0;display:block;width:100%;" title="${PRESETS[k].name}">${PRESETS[k].name}</button>`).join('');
    presetList.querySelectorAll('.preset-btn').forEach((btn, i) => {
      btn.onclick = () => {
        const key = Object.keys(PRESETS)[i];
        quill.root.innerHTML = PRESETS[key].html;
      };
    });
  }
});
