import CompanyPayrollConcept from '../models/CompanyPayrollConcept.js';
import TechnicianAssignment from '../models/TechnicianAssignment.js';
import PayrollPeriod from '../models/PayrollPeriod.js';
import PayrollSettlement from '../models/PayrollSettlement.js';
import CashFlowEntry from '../models/CashFlowEntry.js';
import Sale from '../models/Sale.js';
import PDFDocument from 'pdfkit';
import Template from '../models/Template.js';
import Handlebars from 'handlebars';
import Company from '../models/Company.js';

export const listConcepts = async (req, res) => {
  const concepts = await CompanyPayrollConcept.find({ companyId: req.companyId, isActive: true }).sort({ ordering: 1, name: 1 });
  res.json(concepts);
};

export const upsertConcept = async (req, res) => {
  const { id } = req.params;
  const data = { ...req.body, companyId: req.companyId };
  const doc = id
    ? await CompanyPayrollConcept.findOneAndUpdate({ _id: id, companyId: req.companyId }, data, { new: true })
    : await CompanyPayrollConcept.create(data);
  res.status(id ? 200 : 201).json(doc);
};

export const deleteConcept = async (req, res) => {
  const { id } = req.params;
  await CompanyPayrollConcept.deleteOne({ _id: id, companyId: req.companyId });
  res.status(204).end();
};

export const listAssignments = async (req, res) => {
  const { technicianId, technicianName } = req.query;
  const filter = { companyId: req.companyId };
  if (technicianId) filter.technicianId = technicianId;
  if (technicianName) filter.technicianName = String(technicianName).trim().toUpperCase();
  const items = await TechnicianAssignment.find(filter);
  res.json(items);
};

export const upsertAssignment = async (req, res) => {
  const { technicianId, technicianName, conceptId, valueOverride, isActive } = req.body;
  const query = { companyId: req.companyId, conceptId };
  if (technicianId) query.technicianId = technicianId;
  if (!technicianId && technicianName) query.technicianName = String(technicianName).trim().toUpperCase();
  const update = { valueOverride, isActive: isActive !== false };
  const doc = await TechnicianAssignment.findOneAndUpdate(query, update, { new: true, upsert: true });
  res.json(doc);
};

export const removeAssignment = async (req, res) => {
  const { technicianId, technicianName, conceptId } = req.body;
  const filter = { companyId: req.companyId, conceptId };
  if (technicianId) filter.technicianId = technicianId;
  if (!technicianId && technicianName) filter.technicianName = String(technicianName).trim().toUpperCase();
  await TechnicianAssignment.deleteOne(filter);
  res.status(204).end();
};

export const createPeriod = async (req, res) => {
  const { periodType, startDate, endDate } = req.body;
  const doc = await PayrollPeriod.create({ companyId: req.companyId, periodType, startDate, endDate });
  res.status(201).json(doc);
};

export const listOpenPeriods = async (req, res) => {
  const items = await PayrollPeriod.find({ companyId: req.companyId, status: 'open' }).sort({ startDate: -1 });
  res.json(items);
};

function computeSettlementItems({ baseSalary, concepts, assignments }){
  const items = [];
  for(const c of concepts){
    const override = assignments.find(a => String(a.conceptId) === String(c._id));
    const value = override?.valueOverride ?? c.defaultValue ?? 0;
    let amount = 0;
    if(c.amountType === 'fixed') amount = value;
    else amount = Math.round((baseSalary * value) ) / 100; // percent => baseSalary * value% (value expected as percent)
    items.push({ conceptId: c._id, name: c.name, type: c.type, base: baseSalary, value: amount, calcRule: c.amountType });
  }
  const grossTotal = items.filter(i => i.type !== 'deduction').reduce((a,b)=>a+b.value,0);
  const deductionsTotal = items.filter(i => i.type === 'deduction').reduce((a,b)=>a+b.value,0);
  const netTotal = grossTotal - deductionsTotal;
  return { items, grossTotal, deductionsTotal, netTotal };
}

export const previewSettlement = async (req, res) => {
  const { technicianId, technicianName, periodId, baseSalary = 0 } = req.body;
  const [concepts, assignments] = await Promise.all([
    CompanyPayrollConcept.find({ companyId: req.companyId, isActive: true }),
    TechnicianAssignment.find({ companyId: req.companyId, technicianId })
  ]);
  const computed = computeSettlementItems({ baseSalary, concepts, assignments });
  // Comisión por ventas cerradas en el período (si se provee technicianName)
  if (technicianName && periodId) {
    const period = await PayrollPeriod.findOne({ _id: periodId, companyId: req.companyId });
    if (period) {
      const sales = await Sale.find({
        companyId: req.companyId,
        status: 'closed',
        closedAt: { $gte: period.startDate, $lte: period.endDate },
        $or: [
          { 'laborCommissions.technician': technicianName },
          { closingTechnician: technicianName },
          { technician: technicianName }
        ]
      }).select({ laborCommissions: 1, closingTechnician: 1, technician: 1 });
      const commission = sales.reduce((acc, s) => {
        const fromBreakdown = (s.laborCommissions||[])
          .filter(lc => lc.technician === technicianName)
          .reduce((a,b)=> a + (Number(b.share)||0), 0);
        return acc + fromBreakdown;
      }, 0);
      if (commission > 0) {
        computed.items.unshift({
          conceptId: null,
          name: 'Comisión por ventas',
          type: 'earning',
          base: 0,
          value: Math.round(commission*100)/100,
          calcRule: 'sales.laborCommissions',
          notes: ''
        });
        computed.grossTotal += Math.round(commission*100)/100;
        computed.netTotal = computed.grossTotal - computed.deductionsTotal;
      }
    }
  }
  res.json({ technicianId, periodId, ...computed });
};

export const approveSettlement = async (req, res) => {
  const { technicianId, technicianName, periodId, baseSalary = 0 } = req.body;
  const [concepts, assignments] = await Promise.all([
    CompanyPayrollConcept.find({ companyId: req.companyId, isActive: true }),
    TechnicianAssignment.find({ companyId: req.companyId, technicianId })
  ]);
  const computed = computeSettlementItems({ baseSalary, concepts, assignments });
  if (technicianName && periodId) {
    const period = await PayrollPeriod.findOne({ _id: periodId, companyId: req.companyId });
    if (period) {
      const sales = await Sale.find({
        companyId: req.companyId,
        status: 'closed',
        closedAt: { $gte: period.startDate, $lte: period.endDate },
        $or: [
          { 'laborCommissions.technician': technicianName },
          { closingTechnician: technicianName },
          { technician: technicianName }
        ]
      }).select({ laborCommissions: 1 });
      const commission = sales.reduce((acc, s) => {
        const fromBreakdown = (s.laborCommissions||[])
          .filter(lc => lc.technician === technicianName)
          .reduce((a,b)=> a + (Number(b.share)||0), 0);
        return acc + fromBreakdown;
      }, 0);
      if (commission > 0) {
        computed.items.unshift({
          conceptId: null,
          name: 'Comisión por ventas',
          type: 'earning',
          base: 0,
          value: Math.round(commission*100)/100,
          calcRule: 'sales.laborCommissions',
          notes: ''
        });
        computed.grossTotal += Math.round(commission*100)/100;
        computed.netTotal = computed.grossTotal - computed.deductionsTotal;
      }
    }
  }
  const doc = await PayrollSettlement.findOneAndUpdate(
    { companyId: req.companyId, technicianId, periodId },
    { ...computed, status: 'approved', technicianName: (technicianName||'').toUpperCase() },
    { new: true, upsert: true }
  );
  res.json(doc);
};

export const paySettlement = async (req, res) => {
  const { settlementId, accountId, date, notes } = req.body;
  const st = await PayrollSettlement.findOne({ _id: settlementId, companyId: req.companyId });
  if(!st) return res.status(404).json({ error: 'Settlement not found' });
  if(st.status === 'paid') return res.status(400).json({ error: 'Already paid' });

  const entry = await CashFlowEntry.create({
    companyId: req.companyId,
    accountId,
    date: date ? new Date(date) : new Date(),
    kind: 'OUT',
    source: 'MANUAL',
    sourceRef: settlementId,
    description: `Pago a empleado (${st.technicianId})`,
    amount: Math.abs(st.netTotal),
    meta: { type: 'PAYROLL', technicianId: st.technicianId, settlementId }
  });

  st.status = 'paid';
  st.paidCashflowId = entry._id;
  await st.save();

  res.json({ ok: true, settlement: st, cashflow: entry });
};

export const listSettlements = async (req, res) => {
  const { periodId, technicianId, technicianName, status } = req.query;
  const filter = { companyId: req.companyId };
  if (periodId) filter.periodId = periodId;
  if (technicianId) filter.technicianId = technicianId;
  if (status) filter.status = status;
  // Nota: almacenamos por technicianId; si no hay, seguimos filtrando por periodId únicamente
  const items = await PayrollSettlement.find(filter).sort({ createdAt: -1 });
  // Agregar resumen simple
  const summary = items.reduce((acc, s) => {
    acc.grossTotal += (s.grossTotal || 0);
    acc.deductionsTotal += (s.deductionsTotal || 0);
    acc.netTotal += (s.netTotal || 0);
    return acc;
  }, { grossTotal: 0, deductionsTotal: 0, netTotal: 0 });
  res.json({ items, summary });
};

function ensureHB(){
  if (ensureHB._inited) return; ensureHB._inited = true;
  Handlebars.registerHelper('money', (v) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(Number(v||0)));
  Handlebars.registerHelper('date', (v, fmt) => { const d = v ? new Date(v) : new Date(); return fmt==='iso' ? d.toISOString().slice(0,10) : d.toLocaleString('es-CO'); });
}

export const printSettlementHtml = async (req, res) => {
  const { id } = req.params;
  const st = await PayrollSettlement.findOne({ _id: id, companyId: req.companyId });
  if(!st) return res.status(404).send('Not found');
  const [tpl, company] = await Promise.all([
    Template.findOne({ companyId: req.companyId, type: 'payroll', active: true }).sort({ updatedAt: -1 }),
    Company.findOne({ _id: req.companyId })
  ]);
  const context = {
    company: {
      name: company?.name || company?.email || '',
      email: company?.email || '',
      phone: company?.phone || '',
      address: company?.address || '',
      logoUrl: company?.logoUrl || ''
    },
    settlement: st.toObject(),
    now: new Date()
  };
  let html = '';
  let css = '';
  if (tpl) {
    ensureHB();
    try {
      html = Handlebars.compile(tpl.contentHtml||'')(context);
      css = tpl.contentCss || '';
    } catch(e){ html = `<!-- template error: ${e.message} -->`; }
  } else {
    // Fallback HTML simple
    const rows = (st.items||[]).map(i=>`<tr><td>${i.type}</td><td>${i.name}</td><td style="text-align:right">${i.value}</td></tr>`).join('');
    html = `
      <h2>Comprobante de pago</h2>
      <div><strong>Técnico:</strong> ${st.technicianName||''}</div>
      <div><strong>Período:</strong> ${String(st.periodId||'')}</div>
      <table style="width:100%;border-collapse:collapse;margin-top:10px">${rows}</table>
      <div style="margin-top:10px;text-align:right">
        <div>Total bruto: <strong>${st.grossTotal}</strong></div>
        <div>Total descuentos: <strong>${st.deductionsTotal}</strong></div>
        <div>Neto a pagar: <strong>${st.netTotal}</strong></div>
      </div>`;
    css = `table td{border-bottom:1px solid #ddd;padding:4px}`;
  }
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.end(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body>${html}</body></html>`);
};

export const generateSettlementPdf = async (req, res) => {
  const { id } = req.params;
  const st = await PayrollSettlement.findOne({ _id: id, companyId: req.companyId });
  if(!st) return res.status(404).json({ error: 'Settlement not found' });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="comprobante_${String(st._id)}.pdf"`);

  const doc = new PDFDocument({ size: 'A4', margin: 36 });
  doc.pipe(res);
  doc.fontSize(16).text('Comprobante de pago', { align: 'center' });
  doc.moveDown(0.5);
  doc.fontSize(10).text(`ID: ${String(st._id)}`);
  doc.text(`Técnico: ${String(st.technicianName || st.technicianId || '')}`);
  doc.text(`Periodo: ${String(st.periodId || '')}`);
  doc.text(`Estado: ${st.status}`);
  doc.moveDown();
  doc.fontSize(12).text('Detalle', { underline: true });
  doc.moveDown(0.5);
  doc.fontSize(10);
  (st.items||[]).forEach(i => {
    doc.text(`${i.type.toUpperCase()} · ${i.name}  |  ${i.value}`);
  });
  doc.moveDown();
  doc.fontSize(11).text(`Total bruto: ${st.grossTotal}`);
  doc.text(`Total descuentos: ${st.deductionsTotal}`);
  doc.text(`Neto a pagar: ${st.netTotal}`);
  doc.end();
};


