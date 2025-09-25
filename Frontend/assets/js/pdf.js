// assets/js/pdf.js — helpers PDF
export async function buildWorkOrderPdf(sale){
  const { jsPDF } = window.jspdf || window.jspdf || {};
  const doc = new jsPDF();
  doc.setFontSize(14);
  doc.text('Orden de Trabajo', 14, 16);
  doc.setFontSize(10);
  const plate = sale?.vehicle?.plate || '—';
  doc.text(`Placa: ${plate}`, 14, 26);
  let y=36;
  (sale.items||[]).forEach(it=>{
    doc.text(`${it.name || it.sku || ''}  x${it.qty||1}`, 14, y);
    y+=6;
  });
  doc.save(`OT_${plate || (sale._id||'').slice(-6)}.pdf`);
}

export async function buildInvoicePdf(sale){
  const { jsPDF } = window.jspdf || window.jspdf || {};
  const doc = new jsPDF();
  doc.setFontSize(14);
  doc.text('Factura de Venta', 14, 16);
  doc.setFontSize(10);
  const plate = sale?.vehicle?.plate || '';
  const nro = sale?.number ? String(sale.number).padStart(5,'0') : (sale?._id||'').slice(-6).toUpperCase();
  doc.text(`Venta No.: ${nro}`, 14, 26);
  if(plate) doc.text(`Placa: ${plate}`, 100, 26);
  let y=36;
  (sale.items||[]).forEach(it=>{
    doc.text(`${(it.sku||'').padEnd(8)} ${(it.name||'').slice(0,50)}  x${it.qty||1}`, 14, y);
    y+=6;
  });
  const total = sale?.total || 0;
  doc.setFontSize(12);
  doc.text(`TOTAL: ${new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',maximumFractionDigits:0}).format(total)}`, 14, y+6);
  doc.save(`FAC_${nro}.pdf`);
}
