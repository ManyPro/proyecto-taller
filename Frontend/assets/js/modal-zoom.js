// Enhanced image zoom functionality for modals
// This script provides improved zoom, pan, and touch support for image modals

// Function to detect modal content type and apply appropriate class
window.detectModalType = function() {
  const modalContent = document.querySelector('#modal .modal-content');
  const modalBody = document.getElementById('modalBody');
  
  if (!modalContent || !modalBody) return;
  
  // Remove existing type classes
  modalContent.classList.remove('image-modal', 'form-modal');
  
  // Check if it's an image modal
  const img = document.getElementById('modal-img');
  if (img && img.src) {
    modalContent.classList.add('image-modal');
    console.log('Modal type: Image');
    return 'image';
  }
  
  // Check if it's a form modal (look for form elements)
  const formElements = modalBody.querySelectorAll('form, input, textarea, select, button[type="submit"]');
  if (formElements.length > 0) {
    modalContent.classList.add('form-modal');
    console.log('Modal type: Form');
    return 'form';
  }
  
  console.log('Modal type: General');
  return 'general';
};

// Global function to setup modal (detects type and sets up accordingly)
window.setupModal = function() {
  console.log("Setting up modal...");
  // First detect the modal type
  const modalType = window.detectModalType();
  
  // If it's an image modal, setup zoom
  if (modalType === 'image') {
    console.log("Detected image modal, setting up zoom...");
    window.setupImageZoom();
  } else {
    console.log("Non-image modal detected, skipping zoom setup");
  }
};

// Global function to setup zoom when modal opens
window.setupImageZoom = function() {
  console.log("Setting up image zoom...");
  const img = document.getElementById("modal-img");
  const zoomIn = document.getElementById("zoom-in");
  const zoomOut = document.getElementById("zoom-out");
  const zoomReset = document.getElementById("zoom-reset");
  
  console.log("Image found:", !!img);
  console.log("Zoom controls found:", !!zoomIn, !!zoomOut, !!zoomReset);
  
  if (!img) {
    console.log("No image found, skipping zoom setup");
    return;
  }
  
  let scale = 1;
  let isDragging = false;
  let startX = 0;
  let startY = 0;
  let translateX = 0;
  let translateY = 0;
  
  // Función para aplicar transformaciones
  const applyTransform = () => {
    img.style.transform = `scale(${scale}) translate(${translateX}px, ${translateY}px)`;
    img.classList.toggle('zoomed', scale > 1);
  };
  
  // Función para resetear zoom
  const resetZoom = () => {
    scale = 1;
    translateX = 0;
    translateY = 0;
    applyTransform();
  };
  
  // Click para zoom in/out
  img.onclick = (e) => {
    e.preventDefault();
    if (scale === 1) {
      scale = 2;
      applyTransform();
    } else {
      resetZoom();
    }
  };
  
  // Controles de zoom
  if (zoomIn) zoomIn.onclick = () => {
    scale = Math.min(scale + 0.3, 5);
    applyTransform();
  };
  
  if (zoomOut) zoomOut.onclick = () => {
    scale = Math.max(scale - 0.3, 0.5);
    applyTransform();
  };
  
  if (zoomReset) zoomReset.onclick = resetZoom;
  
  // Zoom con rueda del mouse
  img.onwheel = (e) => {
    e.preventDefault();
    const rect = img.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const mouseX = e.clientX - centerX;
    const mouseY = e.clientY - centerY;
    
    const oldScale = scale;
    if (e.deltaY < 0) {
      scale = Math.min(scale + 0.2, 5);
    } else {
      scale = Math.max(scale - 0.2, 0.5);
    }
    
    // Ajustar posición para zoom hacia el mouse
    const scaleDiff = scale - oldScale;
    translateX -= (mouseX * scaleDiff) / oldScale;
    translateY -= (mouseY * scaleDiff) / oldScale;
    
    applyTransform();
  };
  
  // Pan con mouse drag
  img.onmousedown = (e) => {
    if (scale > 1) {
      isDragging = true;
      startX = e.clientX - translateX;
      startY = e.clientY - translateY;
      img.style.cursor = 'grabbing';
    }
  };
  
  const handleMouseMove = (e) => {
    if (isDragging && scale > 1) {
      translateX = e.clientX - startX;
      translateY = e.clientY - startY;
      applyTransform();
    }
  };
  
  const handleMouseUp = () => {
    if (isDragging) {
      isDragging = false;
      img.style.cursor = scale > 1 ? 'grab' : 'zoom-in';
    }
  };
  
  document.addEventListener('mousemove', handleMouseMove);
  document.addEventListener('mouseup', handleMouseUp);
  
  // Touch support para móviles
  let lastTouchDistance = 0;
  let initialScale = 1;
  
  img.ontouchstart = (e) => {
    if (e.touches.length === 2) {
      const touch1 = e.touches[0];
      const touch2 = e.touches[1];
      lastTouchDistance = Math.sqrt(
        Math.pow(touch2.clientX - touch1.clientX, 2) + 
        Math.pow(touch2.clientY - touch1.clientY, 2)
      );
      initialScale = scale;
    }
  };
  
  img.ontouchmove = (e) => {
    if (e.touches.length === 2) {
      e.preventDefault();
      const touch1 = e.touches[0];
      const touch2 = e.touches[1];
      const currentDistance = Math.sqrt(
        Math.pow(touch2.clientX - touch1.clientX, 2) + 
        Math.pow(touch2.clientY - touch1.clientY, 2)
      );
      
      if (lastTouchDistance > 0) {
        const scaleChange = currentDistance / lastTouchDistance;
        scale = Math.min(Math.max(initialScale * scaleChange, 0.5), 5);
        applyTransform();
      }
    }
  };
  
  // Inicializar
  applyTransform();
  
  // Añadir indicador visual de que el zoom está activo
  console.log("Image zoom setup completed successfully");
  
  // Asegurar que la imagen tenga el tamaño correcto
  setTimeout(() => {
    if (img) {
      img.style.width = '100%';
      img.style.height = '100%';
      img.style.maxWidth = '100%';
      img.style.maxHeight = '100%';
      console.log("Image dimensions set to 100%");
    }
  }, 100);
};
