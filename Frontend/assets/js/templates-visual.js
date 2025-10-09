// Script específico para templates.html
// Este archivo maneja el editor visual de templates.html

(function() {
    console.log('Templates-visual.js: Inicializando editor visual de templates.html');
    
    // Función para cargar variables disponibles
    function loadVariables() {
        const varList = document.getElementById('var-list');
        if (!varList) return;
        
        const variables = [
            { label: 'Nombre del cliente', value: '{{sale.customerName}}' },
            { label: 'Número de factura', value: '{{sale.number}}' },
            { label: 'Total a cobrar', value: '{{money sale.total}}' },
            { label: 'Fecha', value: '{{date sale.date}}' },
            { label: 'Nombre empresa', value: '{{company.name}}' },
            { label: 'Dirección empresa', value: '{{company.address}}' },
            { label: 'Teléfono empresa', value: '{{company.phone}}' },
            { label: 'Placa vehículo', value: '{{sale.vehicle.plate}}' },
            { label: 'Marca vehículo', value: '{{sale.vehicle.brand}}' }
        ];
        
        varList.innerHTML = variables.map(v => 
            `<div class="var-item" style="padding:4px 8px;margin:2px 0;background:#f0f0f0;border-radius:4px;cursor:pointer;font-size:12px;" onclick="insertVariable('${v.value}')">
                ${v.label}<br><code style="font-size:10px;color:#666;">${v.value}</code>
            </div>`
        ).join('');
    }
    
    // Función para insertar variable en el editor
    window.insertVariable = function(variable) {
        const canvas = document.getElementById('ce-canvas');
        if (canvas) {
            const selection = window.getSelection();
            if (selection.rangeCount > 0) {
                const range = selection.getRangeAt(0);
                range.deleteContents();
                range.insertNode(document.createTextNode(variable));
                range.collapse(false);
            } else {
                canvas.innerHTML += variable;
            }
        }
    };
    
    // Funciones para los botones
    document.addEventListener('DOMContentLoaded', function() {
        loadVariables();
        
        // Botón Guardar
        const saveBtn = document.getElementById('save-template');
        if (saveBtn) {
            saveBtn.addEventListener('click', function() {
                const canvas = document.getElementById('ce-canvas');
                const content = canvas ? canvas.innerHTML : '';
                console.log('Guardando template:', content);
                alert('Función de guardado en desarrollo');
            });
        }
        
        // Botón Vista Previa
        const previewBtn = document.getElementById('preview-template');
        if (previewBtn) {
            previewBtn.addEventListener('click', function() {
                const canvas = document.getElementById('ce-canvas');
                const content = canvas ? canvas.innerHTML : '';
                const frame = document.getElementById('preview-frame');
                const overlay = document.getElementById('preview-overlay');
                
                if (frame && overlay) {
                    frame.srcdoc = `<html><head><style>body{font-family:Arial;padding:20px;}</style></head><body>${content}</body></html>`;
                    overlay.style.display = 'flex';
                }
            });
        }
        
        // Cerrar vista previa
        const closeBtn = document.getElementById('preview-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', function() {
                const overlay = document.getElementById('preview-overlay');
                if (overlay) overlay.style.display = 'none';
            });
        }
        
        console.log('Templates-visual.js: Editor inicializado correctamente');
    });
})();