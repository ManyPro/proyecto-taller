// assets/js/pdf.js (completo, con columnas simples)
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

export async function buildInvoicePdf(sale){
  const { jsPDF } = window.jspdf||{}; if(!jsPDF) throw new Error('jsPDF no cargado');
  const doc=new jsPDF();
  const nro=sale?.number?String(sale.number).padStart(5,'0'):(sale?._id||'').slice(-6).toUpperCase();
  doc.setFontSize(14); doc.text('Factura de Venta',14,16);
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
