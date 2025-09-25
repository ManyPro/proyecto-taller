// assets/js/pdf.js
export function money(n){ return new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',maximumFractionDigits:0}).format(Number(n||0)); }

export async function buildWorkOrderPdf(sale){
  const { jsPDF } = window.jspdf||{}; const doc=new jsPDF();
  const p=sale?.vehicle?.plate||'—', c=sale?.customer?.name||'—';
  doc.setFontSize(14); doc.text('Orden de Trabajo',14,16);
  doc.setFontSize(10); doc.text(`Placa: ${p}`,14,26); doc.text(`Cliente: ${c}`,100,26);
  let y=36; (sale.items||[]).forEach(it=>{ doc.text(`${it.name||it.sku||''}`,14,y); doc.text(`x${it.qty||1}`,180,y,{align:'right'}); y+=6; });
  doc.save(`OT_${p || (sale._id||'').slice(-6)}.pdf`);
}

export async function buildInvoicePdf(sale){
  const { jsPDF } = window.jspdf||{}; const doc=new jsPDF();
  const nro=sale?.number?String(sale.number).padStart(5,'0'):(sale?._id||'').slice(-6);
  doc.setFontSize(14); doc.text('Factura de Venta',14,16);
  doc.setFontSize(10);
  const p=sale?.vehicle?.plate||''; if(p) doc.text(`Placa: ${p}`,14,24);
  let y=34;
  (sale.items||[]).forEach(it=>{ const line=`${(it.sku||'').padEnd(8)} ${(it.name||'').slice(0,60)}  x${it.qty||1}`; doc.text(line,14,y); doc.text(money(it.total||0),190,y,{align:'right'}); y+=6; });
  y+=6; doc.text(`TOTAL: ${money(sale?.total||0)}`,14,y);
  doc.save(`FAC_${nro}.pdf`);
}
