// assets/js/sales.js
// Módulo de Ventas (frontend). No usa paquetes de Node.
// - Conecta SSE si está disponible en API.live.connect
// - Lector QR con fallback a jsQR (solo activa si existen los nodos en el DOM)

import { API } from './api.js';

let es; // EventSource
let started = false;

// ====== Lector QR (opcional, depende de nodos en el DOM) ======
let scanning = false, rafId = 0;
let video, canvas, ctx;

function setupQR(){
  video  = document.getElementById('qr-video');
  canvas = document.getElementById('qr-canvas');
  if (!video || !canvas) return; // no hay UI de QR en esta vista
  ctx = canvas.getContext('2d', { willReadFrequently: true });

  const btnStart = document.getElementById('qr-start');
  const btnStop  = document.getElementById('qr-stop');
  btnStart?.addEventListener('click', startQR);
  btnStop?.addEventListener('click', stopQR);
}

async function startQR(){
  if (scanning) return;
  try{
    const isDesktop = !/Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    const constraints = isDesktop
      ? { video: { width: { ideal: 1280 }, height: { ideal: 720 } } }
      : { video: { facingMode: { ideal: 'environment' } } };
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    video.srcObject = stream; await video.play();
    scanning = true; tickCanvas();
  }catch(e){ alert('No se pudo abrir la cámara: '+(e?.message||e)); }
}

function stopQR(){
  scanning = false;
  try{ video?.srcObject?.getTracks()?.forEach(t=>t.stop()); }catch{}
  if (rafId) cancelAnimationFrame(rafId);
}

function tickCanvas(){
  if(!scanning) return;
  try{
    const w = video.videoWidth|0, h = video.videoHeight|0;
    if(!w||!h){ rafId = requestAnimationFrame(tickCanvas); return; }
    canvas.width = w; canvas.height = h;
    ctx.drawImage(video, 0, 0, w, h);
    const img = ctx.getImageData(0,0,w,h);

    // Preferimos jsQR si está presente (incluido por CDN en index.html)
    if (window.jsQR) {
      const qr = window.jsQR(img.data, w, h);
      if (qr && qr.data) { onCode(qr.data); }
    }
  }catch{}
  rafId = requestAnimationFrame(tickCanvas);
}

function onCode(text){
  // Detén el escaneo para evitar lecturas repetidas
  stopQR();
  console.log('QR leído:', text);
  // Opcional: notificar a otros módulos
  document.dispatchEvent(new CustomEvent('qr:read', { detail: { text } }));
}

// ====== Tiempo real (SSE) ======
function connectLive(){
  if (es || !API?.live?.connect) return;
  try{
    es = API.live.connect((event, data)=>{
      // Hook mínimo: refresca lista/venta si tu UI lo implementa
      document.dispatchEvent(new CustomEvent('sales:event', { detail: { event, data } }));
    });
  }catch(e){ console.warn('No se pudo conectar a SSE:', e?.message||e); }
}

export function initSales(){
  if (started) return; started = true;
  connectLive();
  setupQR();
}
