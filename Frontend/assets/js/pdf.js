// assets/js/pdf.js
// Genera PDF de Orden de Trabajo e Invoice usando jsPDF (incluido por CDN en index.html)
export async function buildWorkOrderPdf(sale) {
  const doc = new window.jspdf.jsPDF();
  const pad = 10;
  let y = 15;
  doc.setFontSize(16); doc.text('ORDEN DE TRABAJO', pad, y); y+=8;
  doc.setFontSize(11);
  const plate = (sale?.vehicle?.plate || '').toUpperCase() || '—';
  doc.text(`Venta: ${sale?.name || ''}`, pad, y); y+=6;
  doc.text(`Placa: ${plate}`, pad, y); y+=6;
  const cust = sale?.customer || {};
  doc.text(`Cliente: ${cust.name||'—'}  Tel: ${cust.phone||'—'}`, pad, y); y+=8;
  doc.text('Ítems', pad, y); y+=6;
  doc.line(pad, y, 200, y); y+=4;
  (sale?.items||[]).forEach(it=>{
    doc.text(`${(it.sku||'').padEnd(8)}  ${it.name||''}  x${it.qty||1}`, pad, y);
    y+=6; if (y>280){ doc.addPage(); y=15; }
  });
  return doc;
}

export async function buildInvoicePdf(sale) {
  const doc = new window.jspdf.jsPDF();
  const pad = 10;
  let y = 15;
  doc.setFontSize(16); doc.text('FACTURA DE VENTA', pad, y); y+=8;
  doc.setFontSize(11);
  const plate = (sale?.vehicle?.plate || '').toUpperCase() || '—';
  const nro = sale?.number ? String(sale.number).padStart(6,'0') : (sale?._id||'').slice(-6).toUpperCase();
  doc.text(`Factura No.: ${nro}`, pad, y); y+=6;
  doc.text(`Venta: ${sale?.name || ''}`, pad, y); y+=6;
  doc.text(`Placa: ${plate}`, pad, y); y+=6;
  const cust = sale?.customer || {};
  doc.text(`Cliente: ${cust.name||'—'}  Tel: ${cust.phone||'—'}`, pad, y); y+=8;
  doc.text('Ítems', pad, y); y+=6;
  doc.line(pad, y, 200, y); y+=4;
  let subtotal=0;
  (sale?.items||[]).forEach(it=>{
    const q=Number(it.qty||1), up=Number(it.unitPrice||0), tot=q*up; subtotal+=tot;
    doc.text(`${(it.sku||'').padEnd(8)}  ${it.name||''}`, pad, y);
    doc.text(`x${q}`, 150, y, {align:'right'});
    doc.text(`$${Math.round(up).toLocaleString()}`, 170, y, {align:'right'});
    doc.text(`$${Math.round(tot).toLocaleString()}`, 200, y, {align:'right'});
    y+=6; if (y>280){ doc.addPage(); y=15; }
  });
  y+=6; doc.line(pad, y, 200, y); y+=8;
  doc.setFontSize(12);
  doc.text(`Subtotal: $${Math.round(subtotal).toLocaleString()}`, 200, y, {align:'right'}); y+=6;
  const tax = 0; const total = subtotal + tax;
  doc.text(`Total: $${Math.round(total).toLocaleString()}`, 200, y, {align:'right'}); y+=10;
  doc.setFontSize(9); doc.text('Gracias por su compra.', pad, y);
  return doc;
}
