// assets/js/pdf.js
export async function buildWorkOrderPdf(sale){
  const { jsPDF } = window.jspdf||{}; const doc=new jsPDF();
  doc.setFontSize(14); doc.text('Orden de Trabajo',14,16);
  doc.setFontSize(10); const p=sale?.vehicle?.plate||'—', c=sale?.customer?.name||'—';
  doc.text(`Placa: ${p}`,14,26); doc.text(`Cliente: ${c}`,100,26);
  let y=36; (sale.items||[]).forEach(it=>{ doc.text(`${it.name||it.sku||''} x${it.qty||1}`,14,y); y+=6; });
  doc.save(`OT_${p || (sale._id||'').slice(-6)}.pdf`);
}
export async function buildInvoicePdf(sale){
  const { jsPDF } = window.jspdf||{}; const doc=new jsPDF();
  const money=n=>new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',maximumFractionDigits:0}).format(Number(n||0));
  const nro=sale?.number?String(sale.number).padStart(5,'0'):(sale?._id||'').slice(-6).toUpperCase();
  const p=sale?.vehicle?.plate||''; doc.setFontSize(14); doc.text('Factura de Venta',14,16);
  doc.setFontSize(10); doc.text(`Venta No.: ${nro}`,14,26); if(p) doc.text(`Placa: ${p}`,100,26);
  let y=36; (sale.items||[]).forEach(it=>{ doc.text(`${(it.sku||'').padEnd(8)} ${(it.name||'').slice(0,60)} x${it.qty||1} ${money(it.unitPrice||0)}`,14,y); y+=6; });
  doc.setFontSize(12); doc.text(`TOTAL: ${money(sale?.total||0)}`,14,y+8); doc.save(`FAC_${nro}.pdf`);
}
