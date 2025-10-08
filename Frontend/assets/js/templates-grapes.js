// templates-grapes.js
// Editor visual de plantillas con GrapesJS

document.addEventListener('DOMContentLoaded', function() {
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
    varPanel.innerHTML = window.VAR_CATALOG.map(v => `<button class="var-btn" style="margin:2px 0;display:block;width:100%;" title="${v.value}">${v.label}</button>`).join('');
    varPanel.querySelectorAll('.var-btn').forEach((btn, i) => {
      btn.onclick = () => {
        editor.runCommand('core:canvas-api', {
          method: 'insertHTML',
          args: window.VAR_CATALOG[i].value
        });
      };
    });
  }

  // Guardar plantilla
  document.getElementById('save-template').onclick = async function() {
    const html = editor.getHtml();
    const css = editor.getCss();
    const companyId = document.getElementById('company-select').value;
    const name = prompt('Nombre de la plantilla:');
    const type = prompt('Tipo de documento (invoice, quote, workOrder, sticker):');
    const pdfSize = document.getElementById('pdf-size').value;
    let customW = '', customH = '';
    if (pdfSize === 'custom') {
      customW = prompt('Ancho en cm:');
      customH = prompt('Alto en cm:');
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
