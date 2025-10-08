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
      ]
    },
    theme: 'snow'
  });

  document.getElementById('save-template').onclick = function() {
    const html = quill.root.innerHTML;
    // Aquí se debe guardar la plantilla en el backend por companyID
    alert('Plantilla guardada (simulado):\n' + html);
  };

  document.getElementById('load-template').onclick = function() {
    // Aquí se debe cargar la plantilla desde el backend por companyID
    quill.root.innerHTML = '<h2>Ejemplo de plantilla cargada</h2><p>Texto editable...</p>';
  };

  // Simulación de selección de empresa
  const companySelect = document.getElementById('company-select');
  companySelect.innerHTML = '<option value="1">Empresa 1</option><option value="2">Empresa 2</option>';

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
