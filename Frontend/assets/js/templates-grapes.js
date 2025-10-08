// templates-grapes.js
// Editor visual de plantillas con GrapesJS

document.addEventListener('DOMContentLoaded', function() {
  // Configurar idioma español
  grapesjs.l10n.setLang('es', {
    styleManager: {
      empty: 'Sin clases',
      add: 'Agregar',
      selected: 'Seleccionado',
    },
    traitManager: {
      empty: 'Sin atributos',
    },
    deviceManager: {
      deviceDesktop: 'Escritorio',
      deviceTablet: 'Tablet',
      deviceMobile: 'Móvil',
    },
    panels: {
      buttons: {
        showLayers: 'Capas',
        showStyles: 'Estilos',
        showTraits: 'Atributos',
        showBlocks: 'Bloques',
      }
    }
  });
  grapesjs.l10n.setCurrentLang('es');

  const editor = grapesjs.init({
    container: '#editor-grapes',
    height: '600px',
    fromElement: false,
    storageManager: false,
    plugins: [],
    canvas: {
      styles: [
        'https://cdn.jsdelivr.net/npm/grapesjs/dist/css/grapes.min.css',
        'assets/styles.css'
      ]
    }
  });

  // Variables amigables
  if (window.VAR_CATALOG) {
    const varPanel = document.getElementById('var-list');
    varPanel.innerHTML = window.VAR_CATALOG.map(v => `<button class="var-btn" style="margin:2px 0;display:block;width:100%;background:#eaf2ff;border:none;padding:6px 8px;border-radius:6px;font-size:14px;margin-bottom:4px;cursor:pointer;" title="${v.value}">${v.label}</button>`).join('');
    varPanel.querySelectorAll('.var-btn').forEach((btn, i) => {
      btn.onclick = () => {
        editor.insertHTML(window.VAR_CATALOG[i].value);
      };
    });
  }

  // Mostrar/ocultar inputs de tamaño personalizado
  const pdfSizeSelect = document.getElementById('pdf-size');
  const customFields = document.getElementById('custom-size-fields');
  pdfSizeSelect.addEventListener('change', function() {
    customFields.style.display = (pdfSizeSelect.value === 'custom') ? 'inline-block' : 'none';
  });

  // Guardar plantilla
  document.getElementById('save-template').onclick = async function() {
    const html = editor.getHtml();
    const css = editor.getCss();
    const companyId = document.getElementById('company-select').value;
    const name = prompt('Nombre de la plantilla:');
    const type = prompt('Tipo de documento (invoice, quote, workOrder, sticker):');
    const pdfSize = pdfSizeSelect.value;
    let customW = '', customH = '';
    if (pdfSize === 'custom') {
      customW = document.getElementById('custom-width').value;
      customH = document.getElementById('custom-height').value;
      if (!customW || !customH) return alert('Debes ingresar ancho y alto en cm.');
    }
    if (!companyId || !name || !type) return alert('Faltan datos.');
    try {
      await API.templates.create({ companyId, name, type, contentHtml: html, contentCss: css, active: false, meta: { pdfSize, customW, customH } });
      alert('Plantilla guardada correctamente.');
    } catch(e) {
      alert('Error al guardar: ' + (e.message || e));
    }
  };

  // Cargar plantilla
  document.getElementById('load-template').onclick = async function() {
    const companyId = document.getElementById('company-select').value;
    const type = prompt('Tipo de documento a cargar (invoice, quote, workOrder, sticker):');
    if (!companyId || !type) return alert('Faltan datos.');
    try {
      const list = await API.templates.list({ companyId, type });
      if (!list.length) return alert('No hay plantillas para ese tipo.');
      const tpl = list[0];
      editor.setComponents(tpl.contentHtml || '');
      editor.setStyle(tpl.contentCss || '');
      alert('Plantilla cargada: ' + tpl.name);
    } catch(e) {
      alert('Error al cargar: ' + (e.message || e));
    }
  };
});
