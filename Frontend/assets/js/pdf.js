// assets/js/pdf.js (igual a v1 con contenido)
import { API } from './api.esm.js'; // asegurar que usamos la base correcta del backend
export function money(n){ return new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',maximumFractionDigits:0}).format(Number(n||0)); }

export async function buildWorkOrderPdf(sale){
  const { jsPDF } = window.jspdf||{}; if(!jsPDF) throw new Error('jsPDF no cargado');
  const doc=new jsPDF();
  const p=sale?.vehicle?.plate||'—', c=sale?.customer?.name||'—';
  doc.setFontSize(14); doc.text('Orden de Trabajo',14,16);
  doc.setFontSize(10); doc.text(`Placa: ${p}`,14,26); doc.text(`Cliente: ${c}`,100,26);
  let y=36; (sale.items||[]).forEach(it=>{ doc.text(`${it.name||it.sku||''}`,14,y); doc.text(`x${it.qty||1}`,190,y,{align:'right'}); y+=6; if(y>275){ doc.addPage(); y=20; }});
  doc.save(`OT_${p || (sale._id||'').slice(-6)}.pdf`);
}

export async function buildRemissionPdf(sale){
  const { jsPDF } = window.jspdf||{}; if(!jsPDF) throw new Error('jsPDF no cargado');
  const doc=new jsPDF();
  const nro=sale?.number?String(sale.number).padStart(5,'0'):(sale?._id||'').slice(-6).toUpperCase();
  doc.setFontSize(14); doc.text('Remisión de Venta',14,16);
  doc.setFontSize(10);
  const p=sale?.vehicle?.plate||''; const c=sale?.customer?.name||'';
  if(p) doc.text(`Placa: ${p}`,14,24);
  if(c) doc.text(`Cliente: ${c}`,100,24);

  let y=34;
  doc.text('SKU',14,y); doc.text('Descripción',34,y); doc.text('Cant.',140,y,{align:'right'}); doc.text('Unit',160,y,{align:'right'}); doc.text('Total',190,y,{align:'right'});
  y+=4; doc.line(14,y,196,y); y+=6;
  (sale.items||[]).forEach(it=>{
    const sku=(it.sku||'').slice(0,10), name=(it.name||'').slice(0,60);
    doc.text(sku,14,y);
    doc.text(name,34,y);
    doc.text(String(it.qty||1),140,y,{align:'right'});
    doc.text(money(it.unitPrice||0),160,y,{align:'right'});
    doc.text(money(it.total||0),190,y,{align:'right'});
    y+=6; if(y>275){ doc.addPage(); y=20; }
  });
  y+=4; doc.line(14,y,196,y); y+=6;
  doc.setFontSize(12); doc.text(`TOTAL: ${money(sale?.total||0)}`,190,y,{align:'right'});
  doc.save(`FAC_${nro}.pdf`);
}

// Nueva función: descargar PDF de stickers generado por el backend
export async function downloadStickersPdf(items = [], filename = 'stickers.pdf', opts = {}){
  if(!Array.isArray(items)) throw new Error('items debe ser un array');
  try {
    const headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
    // si no hay Authorization en headers, tomar token desde API.token
    if (!headers.Authorization) {
      try {
        const tok = API?.token?.get?.();
        if (tok) headers.Authorization = `Bearer ${tok}`;
      } catch {}
    }
    // construir base: opts.base tiene prioridad, luego API.base, si ninguno -> ruta relativa
    const rawBase = opts.base ?? (API && API.base) ?? '';
    const base = String(rawBase).replace(/\/$/, '');
    const endpoint = base ? `${base}/api/v1/media/stickers/pdf` : '/api/v1/media/stickers/pdf';
    const resp = await fetch(endpoint, {
      method: 'POST',
      headers,
      // usar 'omit' por defecto (coincide con http.coreRequest)
      credentials: opts.credentials ?? 'omit',
      body: JSON.stringify({ items })
    });
    if(!resp.ok) {
      const text = await resp.text().catch(()=>null);
      throw new Error(`Error al generar stickers: ${resp.status} ${text||resp.statusText}`);
    }
    const blob = await resp.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (err) {
    // Propagar error para que el caller lo gestione
    throw err;
  }
}

// Nueva función: enlaza un botón con la generación de stickers
export function bindStickersButton(buttonOrSelector, getItemsFn, opts = {}) {
  // buttonOrSelector: DOM element o selector string
  // getItemsFn: función que devuelve el array de items (o el propio array)
  // opts: { token, headers, filename, credentials }
  const button = typeof buttonOrSelector === 'string' ? document.querySelector(buttonOrSelector) : buttonOrSelector;
  if (!button) throw new Error('bindStickersButton: button no encontrado');

  button.addEventListener('click', async (e) => {
    try {
      button.disabled = true;
      // obtener items
      const items = typeof getItemsFn === 'function' ? await getItemsFn() : (getItemsFn || []);
      // preparar headers (añadir Authorization si se pasa token)
      const headers = Object.assign({}, opts.headers || {});
      if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
      await downloadStickersPdf(items, opts.filename || 'stickers.pdf', { headers, credentials: opts.credentials });
    } catch (err) {
      console.error('Error generando stickers:', err);
      // feedback mínimo: alert (puedes reemplazar por tu propio UI)
      alert(err.message || 'Error al generar stickers');
    } finally {
      button.disabled = false;
    }
  });

  return button;
}
