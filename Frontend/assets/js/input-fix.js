// Fix para inputs después de adjuntar imágenes en editor de templates
// Este script soluciona el problema donde no se puede escribir texto después de adjuntar una imagen

(function() {
    'use strict';

    // Función para restaurar funcionalidad de inputs
    function restoreInputFunctionality() {
        console.log('Restaurando funcionalidad de inputs...');
        
        // Seleccionar todos los inputs de texto, textareas y selects
        const inputs = document.querySelectorAll('input:not([type="file"]):not([type="checkbox"]):not([type="radio"]), textarea, select');
        
        inputs.forEach(element => {
            // Forzar propiedades CSS importantes
            element.style.setProperty('pointer-events', 'auto', 'important');
            element.style.setProperty('user-select', 'text', 'important');
            element.style.setProperty('z-index', '10', 'important');
            element.style.position = 'relative';
            element.style.touchAction = 'manipulation';
            
            // Remover eventos previos si existen
            element.removeEventListener('mousedown', handleMouseDown);
            element.removeEventListener('focus', handleFocus);
            element.removeEventListener('blur', handleBlur);
            
            // Añadir nuevos eventos
            element.addEventListener('mousedown', handleMouseDown);
            element.addEventListener('focus', handleFocus);
            element.addEventListener('blur', handleBlur);
        });
        
        // Fix específico para elementos después de galerías de imágenes
        document.querySelectorAll('.item-media, .it-gallery').forEach(mediaContainer => {
            let nextElement = mediaContainer.nextElementSibling;
            while (nextElement) {
                if (nextElement.matches('input, textarea, select')) {
                    nextElement.style.setProperty('pointer-events', 'auto', 'important');
                    nextElement.style.setProperty('user-select', 'text', 'important');
                    nextElement.style.setProperty('z-index', '20', 'important');
                    break;
                }
                nextElement = nextElement.nextElementSibling;
            }
        });
        
        // Fix específico para el editor de templates
        if (document.getElementById('tab-formatos')) {
            const templateInputs = document.querySelectorAll('#tab-formatos input, #tab-formatos textarea, #tab-formatos select');
            templateInputs.forEach(element => {
                element.style.setProperty('pointer-events', 'auto', 'important');
                element.style.setProperty('user-select', 'text', 'important');
                element.style.setProperty('z-index', '50', 'important');
            });
        }
    }
    
    function handleMouseDown(e) {
        e.stopPropagation();
        this.style.setProperty('z-index', '100', 'important');
        this.style.setProperty('pointer-events', 'auto', 'important');
    }
    
    function handleFocus(e) {
        e.stopPropagation();
        this.style.setProperty('z-index', '100', 'important');
        this.style.setProperty('pointer-events', 'auto', 'important');
        this.style.setProperty('user-select', 'text', 'important');
    }
    
    function handleBlur() {
        this.style.setProperty('z-index', '10', 'important');
    }
    
    // Ejecutar al cargar la página
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', restoreInputFunctionality);
    } else {
        restoreInputFunctionality();
    }
    
    // Observer para detectar cambios en el DOM
    const observer = new MutationObserver(function(mutations) {
        let needsRestore = false;
        
        mutations.forEach(function(mutation) {
            if (mutation.type === 'childList') {
                mutation.addedNodes.forEach(function(node) {
                    if (node.nodeType === 1) { // Element node
                        if (node.matches && (node.matches('input, textarea, select') || 
                            node.querySelector && node.querySelector('input, textarea, select'))) {
                            needsRestore = true;
                        }
                    }
                });
            }
        });
        
        if (needsRestore) {
            setTimeout(restoreInputFunctionality, 100);
        }
    });
    
    // Observar cambios en todo el documento
    observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['style', 'class', 'draggable']
    });
    
    // Listener para cambios de tab que podrían afectar el editor de templates
    document.addEventListener('click', function(e) {
        if (e.target.matches('.tab-button, .tabs button') || 
            e.target.closest('.tab-button, .tabs button')) {
            setTimeout(restoreInputFunctionality, 200);
        }
    });
    
    // Listener específico para cuando se agregan imágenes
    document.addEventListener('change', function(e) {
        if (e.target.type === 'file' && e.target.accept && e.target.accept.includes('image')) {
            setTimeout(restoreInputFunctionality, 500);
        }
    });
    
    // Exponer función globalmente para uso manual
    window.restoreInputFunctionality = restoreInputFunctionality;
    
    console.log('Input fix script cargado correctamente');
})();