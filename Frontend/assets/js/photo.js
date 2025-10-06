// photo.js - módulo para adjuntar o capturar fotos
// API principal:
// initPhotoAttachment(triggerElement, {
//   multiple: false,
//   accept: 'image/*',
//   onFiles: (FileList|File[]) => {}, // callback tras seleccionar o capturar
//   captureLabel: 'Tomar foto',
//   selectLabel: 'Elegir archivo',
//   title: 'Adjuntar imagen',
//   maxSize: 1024*1024, // bytes para compresión opcional
//   compressQuality: 0.85,
//   preferFrontCamera: false
// })
// 
// Uso básico:
//   initPhotoAttachment(document.getElementById('it-files-btn'), { onFiles: files => API.mediaUpload(files) });
//
(function(){
  if (typeof window === 'undefined') return;

  function ensureModalRoot(){
    let root = document.getElementById('photo-modal-root');
    if(!root){
      root = document.createElement('div');
      root.id = 'photo-modal-root';
      root.style.position='fixed';
      root.style.inset='0';
      root.style.zIndex='9999';
      root.style.display='none';
      document.body.appendChild(root);
    }
    return root;
  }

  function buildModal(opts){
    const root = ensureModalRoot();
    root.innerHTML = '';
    const overlay = document.createElement('div');
    overlay.style.position='absolute';
    overlay.style.inset='0';
    overlay.style.background='rgba(0,0,0,0.5)';
    overlay.addEventListener('click', ()=>close());

    const box = document.createElement('div');
    box.style.position='absolute';
    box.style.top='50%';
    box.style.left='50%';
    box.style.transform='translate(-50%, -50%)';
    box.style.background='#fff';
    box.style.padding='16px';
    box.style.width='min(420px, 90vw)';
    box.style.maxHeight='90vh';
    box.style.borderRadius='8px';
    box.style.display='flex';
    box.style.flexDirection='column';
    box.style.gap='12px';
    box.style.fontFamily='sans-serif';
    box.innerHTML = `<h3 style="margin:0 0 4px 0; font-size:16px;">${opts.title||'Adjuntar imagen'}</h3>`;

    const actions = document.createElement('div');
    actions.style.display='flex';
    actions.style.gap='8px';
    actions.style.flexWrap='wrap';

    const btnSelect = document.createElement('button');
    btnSelect.textContent = opts.selectLabel || 'Elegir archivo';
    styleBtn(btnSelect);

    const btnCapture = document.createElement('button');
    btnCapture.textContent = opts.captureLabel || 'Tomar foto';
    styleBtn(btnCapture);

    const previewWrap = document.createElement('div');
    previewWrap.style.display='none';
    previewWrap.style.flexDirection='column';
    previewWrap.style.alignItems='center';
    previewWrap.style.gap='8px';

    const video = document.createElement('video');
    video.autoplay = true; video.playsInline = true; video.style.maxWidth='100%';
    const canvas = document.createElement('canvas');
    canvas.style.maxWidth='100%';
    const captureBar = document.createElement('div');
    captureBar.style.display='flex';
    captureBar.style.gap='8px';

    const btnShot = document.createElement('button'); btnShot.textContent='Capturar'; styleBtn(btnShot, '#0d6efd');
    const btnRetake = document.createElement('button'); btnRetake.textContent='Repetir'; styleBtn(btnRetake, '#6c757d');
    const btnUse = document.createElement('button'); btnUse.textContent='Usar foto'; styleBtn(btnUse, '#198754');
    captureBar.append(btnShot, btnRetake, btnUse);
    previewWrap.append(video, canvas, captureBar);

    const footer = document.createElement('div');
    footer.style.display='flex'; footer.style.justifyContent='flex-end'; footer.style.gap='8px';
    const btnClose = document.createElement('button'); btnClose.textContent='Cerrar'; styleBtn(btnClose, '#dc3545');
    footer.append(btnClose);

    actions.append(btnSelect, btnCapture);
    box.append(actions, previewWrap, footer);
    root.append(overlay, box);

    let stream = null; let shotTaken=false;

    function stopStream(){
      if(stream){ stream.getTracks().forEach(t=>t.stop()); stream=null; }
    }

    function startCamera(){
      console.log('[photo] startCamera invoked');
      if(!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)){
        console.warn('[photo] getUserMedia no soportado');
        alert('Tu navegador no soporta captura directa o necesita HTTPS. Se usará selección de archivo.');
        previewWrap.style.display='none';
        return;
      }
      if(!window.isSecureContext){
        console.warn('[photo] Contexto no seguro (probablemente http no-local)');
        // En muchos navegadores se requiere https salvo localhost
      }
      previewWrap.style.display='flex';
      navigator.mediaDevices.getUserMedia({ video: { facingMode: opts.preferFrontCamera ? 'user' : 'environment' } })
        .then(s=>{ console.log('[photo] stream ok'); stream=s; video.srcObject=s; shotTaken=false; canvas.style.display='none'; video.style.display='block'; })
        .catch(err=>{ console.warn('[photo] No camera access', err); alert('No se pudo acceder a la cámara (permiso denegado o bloqueado). Usa "Elegir archivo".'); previewWrap.style.display='none'; });
    }

    btnCapture.addEventListener('click', ()=> startCamera());

    btnShot.addEventListener('click', ()=>{
      if(!stream) return;
      const vw = video.videoWidth || 640, vh= video.videoHeight || 480;
      canvas.width=vw; canvas.height=vh;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video,0,0,vw,vh);
      shotTaken=true;
      video.style.display='none';
      canvas.style.display='block';
    });

    btnRetake.addEventListener('click', ()=>{
      if(!stream) return;
      shotTaken=false;
      video.style.display='block';
      canvas.style.display='none';
    });

    function blobToFile(blob, filename){
      return new File([blob], filename, { type: blob.type || 'image/jpeg' });
    }

    btnUse.addEventListener('click', ()=>{
      if(!shotTaken){ alert('Primero captura la foto'); return; }
      canvas.toBlob(async (blob)=>{
        if(!blob) return;
        const file = blobToFile(blob, `captura_${Date.now()}.jpg`);
        close([file]);
      }, 'image/jpeg', opts.compressQuality || 0.85);
    });

    btnSelect.addEventListener('click', ()=>{
      const inp = document.createElement('input');
      inp.type='file';
      inp.accept= opts.accept || 'image/*';
      if(opts.multiple) inp.multiple = true;
      // para móviles se podría usar capture="environment" pero lo dejamos opcional
      if(opts.forceCapture) inp.setAttribute('capture', opts.preferFrontCamera? 'user':'environment');
      inp.addEventListener('change', ()=>{
        if(inp.files && inp.files.length){ close(Array.from(inp.files)); }
      });
      inp.click();
    });

    function close(files){
      stopStream();
      root.style.display='none';
      if(files && files.length){
        processFiles(files).then(finalFiles => {
          try { opts.onFiles && opts.onFiles(finalFiles); } catch(e){ console.error(e); }
        });
      }
    }

    btnClose.addEventListener('click', ()=> close());

    root.style.display='block';

    return { close };
  }

  function styleBtn(btn, color){
    btn.style.background = color || '#0d6efd';
    btn.style.color = '#fff';
    btn.style.border = 'none';
    btn.style.padding='8px 12px';
    btn.style.borderRadius='4px';
    btn.style.cursor='pointer';
    btn.style.fontSize='13px';
    btn.addEventListener('mouseover', ()=> btn.style.opacity='0.9');
    btn.addEventListener('mouseout', ()=> btn.style.opacity='1');
  }

  async function processFiles(files){
    // compresión opcional si excede tamaño
    const processed = [];
    for(const f of files){
      if(/image\//.test(f.type) && f.size > (1024*1024) ){ // >1MB -> compress
        try {
          const cf = await compressImageFile(f, 0.85);
            if(cf) { processed.push(cf); continue; }
        } catch(e){ console.warn('Compression failed', e); }
      }
      processed.push(f);
    }
    return processed;
  }

  function compressImageFile(file, quality=0.85){
    return new Promise((resolve, reject)=>{
      const img = new Image();
      img.onload = ()=>{
        const canvas = document.createElement('canvas');
        const MAX_W = 1920, MAX_H = 1920; // bound
        let { width, height } = img;
        if(width>MAX_W || height>MAX_H){
          const ratio = Math.min(MAX_W/width, MAX_H/height);
          width = Math.round(width*ratio); height = Math.round(height*ratio);
        }
        canvas.width=width; canvas.height=height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img,0,0,width,height);
        canvas.toBlob(blob=>{
          if(!blob) return resolve(file);
          const nf = new File([blob], file.name.replace(/(\.[a-z0-9]+)?$/i, '_compressed$1') , { type: blob.type });
          resolve(nf);
        }, 'image/jpeg', quality);
      };
      img.onerror = reject;
      const fr = new FileReader();
      fr.onload = e => { img.src = e.target.result; };
      fr.onerror = reject;
      fr.readAsDataURL(file);
    });
  }

  function initPhotoAttachment(el, options={}){
    if(!el) return;
    el.addEventListener('click', (e)=>{
      e.preventDefault();
      console.log('[photo] trigger click');
      buildModal(options);
    });
  }

  // Expose
  window.initPhotoAttachment = initPhotoAttachment;
  try { window.dispatchEvent(new Event('photo:ready')); } catch {}
  // Herramienta de diagnóstico manual
  window.photoDiag = function(){
    return {
      secureContext: window.isSecureContext,
      mediaDevices: !!(navigator.mediaDevices),
      getUserMedia: !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia),
      userAgent: navigator.userAgent,
      permission: (navigator.permissions && navigator.permissions.query ? 'check navigator.permissions in console' : 'no permissions API')
    };
  };
})();
