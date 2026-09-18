import mongoose from 'mongoose';
import Account from '../models/Account.js';
import CashFlowEntry from '../models/CashFlowEntry.js';
import CashSession from '../models/CashSession.js';
import Company from '../models/Company.js';
import { computeBalance } from './cashflow.controller.js';
import { htmlToPdfBuffer } from '../lib/htmlToPdf.js';

const TAG_LABELS = {
  CAMBIO_ACEITE: 'Cambio de aceite',
  OTROS_SERVICIOS: 'Otros servicios',
  REPUESTOS: 'Repuestos',
  SERVICIOS_TALLER: 'Servicios Taller',
  INSUMOS_TALLER: 'Insumos Taller',
  SUELDOS: 'Sueldos'
};

const IN_DETAIL_TAGS = ['CAMBIO_ACEITE', 'OTROS_SERVICIOS'];
const OUT_DETAIL_TAGS = ['REPUESTOS', 'SERVICIOS_TALLER', 'INSUMOS_TALLER'];

async function snapshotBalances(companyId) {
  const accounts = await Account.find({ companyId }).sort({ createdAt: 1 });
  const snapshot = [];
  for (const acc of accounts) {
    const balance = await computeBalance(acc._id, companyId);
    snapshot.push({ accountId: acc._id, name: acc.name, balance });
  }
  return snapshot;
}

// GET /cashflow/cash-sessions/current
export async function getCurrentSession(req, res) {
  const session = await CashSession.findOne({ companyId: req.companyId, status: 'OPEN' }).lean();
  res.json({ session: session || null });
}

// POST /cashflow/cash-sessions/open
export async function openSession(req, res) {
  const existing = await CashSession.findOne({ companyId: req.companyId, status: 'OPEN' });
  if (existing) return res.status(400).json({ error: 'Ya hay una caja abierta. Debes cerrarla antes de abrir otra.' });
  const openingBalances = await snapshotBalances(req.companyId);
  const session = await CashSession.create({
    companyId: req.companyId,
    status: 'OPEN',
    openedAt: new Date(),
    openingBalances
  });
  res.json({ ok: true, session });
}

// POST /cashflow/cash-sessions/close
export async function closeSession(req, res) {
  const session = await CashSession.findOne({ companyId: req.companyId, status: 'OPEN' });
  if (!session) return res.status(400).json({ error: 'No hay una caja abierta para cerrar.' });
  session.closingBalances = await snapshotBalances(req.companyId);
  session.closedAt = new Date();
  session.status = 'CLOSED';
  await session.save();
  res.json({ ok: true, session });
}

// GET /cashflow/cash-sessions
export async function listSessions(req, res) {
  const limit = Math.min(200, Math.max(1, parseInt(req.query?.limit) || 60));
  const sessions = await CashSession.find({ companyId: req.companyId, status: 'CLOSED' })
    .sort({ closedAt: -1 })
    .limit(limit)
    .select('openedAt closedAt status')
    .lean();
  res.json({ sessions });
}

// ===== Reporte PDF =====

function money(n) {
  const v = Math.round(Number(n) || 0);
  return `$ ${v.toLocaleString('es-CO')}`;
}

function fmtDateTime(d) {
  if (!d) return '';
  return new Date(d).toLocaleString('es-CO', {
    timeZone: 'America/Bogota',
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true
  });
}

function fmtDateLong(d) {
  if (!d) return '';
  const s = new Date(d).toLocaleDateString('es-CO', {
    timeZone: 'America/Bogota',
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildReportData(session, entries) {
  // Índices de saldos por cuenta
  const openingMap = new Map(session.openingBalances.map(b => [String(b.accountId), b]));
  const closingMap = new Map(session.closingBalances.map(b => [String(b.accountId), b]));

  // Resumen por cuenta (unión de cuentas en apertura y cierre)
  const accountIds = new Set([...openingMap.keys(), ...closingMap.keys()]);
  const accountName = (id) => closingMap.get(id)?.name || openingMap.get(id)?.name || 'Cuenta';

  const perAccount = new Map();
  for (const id of accountIds) {
    perAccount.set(id, {
      accountId: id,
      name: accountName(id),
      initial: openingMap.get(id)?.balance ?? 0,
      totalIn: 0,
      totalOut: 0,
      final: closingMap.get(id)?.balance ?? 0
    });
  }

  // Detalle por etiqueta
  const makeBucket = () => ({ total: 0, byAccount: new Map() });
  const inBuckets = new Map(IN_DETAIL_TAGS.map(t => [t, makeBucket()]));
  inBuckets.set('OTROS', makeBucket());
  const outBuckets = new Map(OUT_DETAIL_TAGS.map(t => [t, makeBucket()]));
  outBuckets.set('OTROS', makeBucket());

  const sueldos = [];

  for (const e of entries) {
    const accId = String(e.accountId?._id || e.accountId);
    const accName = e.accountId?.name || accountName(accId);
    const amount = Number(e.amount) || 0;

    // Cuenta puede haber sido creada durante la sesión (no estaba en apertura)
    if (!perAccount.has(accId)) {
      perAccount.set(accId, { accountId: accId, name: accName, initial: 0, totalIn: 0, totalOut: 0, final: 0 });
    }
    const acc = perAccount.get(accId);

    if (e.kind === 'IN') {
      acc.totalIn += amount;
      const bucket = inBuckets.get(e.tag) || inBuckets.get('OTROS');
      bucket.total += amount;
      bucket.byAccount.set(accName, (bucket.byAccount.get(accName) || 0) + amount);
    } else if (e.kind === 'OUT') {
      acc.totalOut += amount;
      if (e.tag === 'SUELDOS') {
        sueldos.push({
          technicianName: e.meta?.technicianName || e.description || 'Sin nombre',
          accountName: accName,
          date: e.date,
          amount
        });
      } else {
        const bucket = outBuckets.get(e.tag) || outBuckets.get('OTROS');
        bucket.total += amount;
        bucket.byAccount.set(accName, (bucket.byAccount.get(accName) || 0) + amount);
      }
    }
  }

  const accounts = Array.from(perAccount.values());
  const totals = accounts.reduce((t, a) => ({
    initial: t.initial + a.initial,
    totalIn: t.totalIn + a.totalIn,
    totalOut: t.totalOut + a.totalOut,
    final: t.final + a.final
  }), { initial: 0, totalIn: 0, totalOut: 0, final: 0 });

  const sueldosTotal = sueldos.reduce((s, x) => s + x.amount, 0);

  return { accounts, totals, inBuckets, outBuckets, sueldos, sueldosTotal };
}

function renderDetailSection({ title, buckets, tagOrder, color, extraRows = '' }) {
  const blocks = [];
  for (const tag of [...tagOrder, 'OTROS']) {
    const bucket = buckets.get(tag);
    if (!bucket || bucket.total <= 0) continue;
    const label = tag === 'OTROS' ? 'Otros' : TAG_LABELS[tag];
    const rows = Array.from(bucket.byAccount.entries())
      .map(([accName, amt]) => `
        <div class="detail-row">
          <span class="detail-account">${escapeHtml(accName)}</span>
          <span class="detail-amount ${color}-text">${money(amt)}</span>
        </div>`)
      .join('');
    blocks.push(`
      <div class="detail-block ${color}-block">
        <div class="detail-head">
          <span class="detail-tag">${escapeHtml(label)}</span>
          <span class="detail-total ${color}-text">${money(bucket.total)}</span>
        </div>
        ${rows}
      </div>`);
  }
  if (!blocks.length && !extraRows) {
    blocks.push('<p class="empty-note">Sin movimientos en este periodo.</p>');
  }
  return `
    <section class="detail-section">
      <h2 class="section-title ${color}-title">${escapeHtml(title)}</h2>
      ${blocks.join('')}
      ${extraRows}
    </section>`;
}

function buildReportHtml({ companyName, session, data }) {
  const { accounts, totals, inBuckets, outBuckets, sueldos, sueldosTotal } = data;

  const accountRows = accounts.map(a => `
    <tr>
      <td class="acc-name">${escapeHtml(a.name)}</td>
      <td class="num">${money(a.initial)}</td>
      <td class="num green-text">${money(a.totalIn)}</td>
      <td class="num red-text">${money(a.totalOut)}</td>
      <td class="num strong">${money(a.final)}</td>
    </tr>`).join('');

  const sueldosResumen = sueldosTotal > 0 ? `
      <div class="detail-block red-block">
        <div class="detail-head">
          <span class="detail-tag">Sueldos</span>
          <span class="detail-total red-text">${money(sueldosTotal)}</span>
        </div>
        <div class="detail-row">
          <span class="detail-account">Ver detalle en la página de sueldos</span>
          <span></span>
        </div>
      </div>` : '';

  const sueldosPage = sueldos.length ? `
  <div class="page-break"></div>
  <section>
    <h2 class="section-title red-title">Sueldos</h2>
    <table class="main-table">
      <thead>
        <tr>
          <th>Técnico</th>
          <th>Cuenta</th>
          <th>Fecha</th>
          <th class="num">Valor</th>
        </tr>
      </thead>
      <tbody>
        ${sueldos.map(s => `
        <tr>
          <td class="acc-name">${escapeHtml(s.technicianName)}</td>
          <td>${escapeHtml(s.accountName)}</td>
          <td>${fmtDateTime(s.date)}</td>
          <td class="num red-text">${money(s.amount)}</td>
        </tr>`).join('')}
      </tbody>
      <tfoot>
        <tr class="totals-row">
          <td colspan="3">TOTAL SUELDOS</td>
          <td class="num red-text">${money(sueldosTotal)}</td>
        </tr>
      </tfoot>
    </table>
  </section>` : '';

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<style>
  @page { size: letter; margin: 9mm 9mm 11mm 9mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Segoe UI', Arial, Helvetica, sans-serif;
    color: #0f172a;
    background: #ffffff;
    font-size: 15px;
  }
  .page-break { page-break-before: always; }

  header.report-header {
    background: linear-gradient(135deg, #1d4ed8, #1e40af);
    color: #ffffff;
    border-radius: 12px;
    padding: 14px 20px;
    margin-bottom: 12px;
  }
  .report-header h1 { font-size: 26px; letter-spacing: 1px; }
  .report-header .company { font-size: 15px; font-weight: 600; opacity: .92; margin-bottom: 2px; text-transform: uppercase; }
  .report-header .period { font-size: 13px; margin-top: 6px; display: flex; gap: 18px; flex-wrap: wrap; }
  .report-header .period strong { font-weight: 700; }

  .date-line { font-size: 16px; font-weight: 700; color: #1e3a8a; margin-bottom: 10px; }

  .section-title {
    font-size: 19px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: .5px;
    padding: 8px 14px;
    border-radius: 8px;
    margin: 12px 0 8px;
  }
  .blue-title { background: #dbeafe; color: #1e40af; }
  .green-title { background: #dcfce7; color: #15803d; }
  .red-title { background: #fee2e2; color: #b91c1c; }

  table.main-table { width: 100%; border-collapse: collapse; }
  table.main-table th {
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: .5px;
    color: #475569;
    background: #f1f5f9;
    padding: 8px 10px;
    text-align: left;
    border-bottom: 2px solid #cbd5e1;
  }
  table.main-table td {
    padding: 9px 10px;
    border-bottom: 1px solid #e2e8f0;
    font-size: 16px;
  }
  table.main-table .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  table.main-table th.num { text-align: right; }
  .acc-name { font-weight: 700; }
  .strong { font-weight: 800; }
  .green-text { color: #15803d; font-weight: 700; }
  .red-text { color: #b91c1c; font-weight: 700; }
  .totals-row td {
    background: #eff6ff;
    border-top: 2px solid #93c5fd;
    border-bottom: none;
    font-size: 17px;
    font-weight: 800;
    color: #1e3a8a;
  }

  .detail-block {
    border: 1px solid #e2e8f0;
    border-left-width: 6px;
    border-radius: 8px;
    padding: 8px 14px;
    margin-bottom: 8px;
  }
  .green-block { border-left-color: #22c55e; background: #f6fef8; }
  .red-block { border-left-color: #ef4444; background: #fff7f7; }
  .detail-head {
    display: flex; justify-content: space-between; align-items: center;
    padding-bottom: 5px; margin-bottom: 5px;
    border-bottom: 1px dashed #cbd5e1;
  }
  .detail-tag { font-size: 17px; font-weight: 800; }
  .detail-total { font-size: 18px; font-variant-numeric: tabular-nums; }
  .detail-row {
    display: flex; justify-content: space-between;
    padding: 3px 0;
    font-size: 15px;
  }
  .detail-account { color: #334155; font-weight: 600; }
  .detail-amount { font-variant-numeric: tabular-nums; }
  .empty-note { color: #64748b; font-size: 14px; padding: 6px 2px; }
</style>
</head>
<body>
  <header class="report-header">
    <div class="company">${escapeHtml(companyName)}</div>
    <h1>REPORTE DE CAJA</h1>
    <div class="period">
      <span>Apertura: <strong>${fmtDateTime(session.openedAt)}</strong></span>
      <span>Cierre: <strong>${fmtDateTime(session.closedAt)}</strong></span>
    </div>
  </header>

  <div class="date-line">${fmtDateLong(session.closedAt)}</div>

  <section>
    <h2 class="section-title blue-title">Resumen por cuenta</h2>
    <table class="main-table">
      <thead>
        <tr>
          <th>Cuenta</th>
          <th class="num">Saldo inicial</th>
          <th class="num">Ingresos</th>
          <th class="num">Salidas</th>
          <th class="num">Saldo final</th>
        </tr>
      </thead>
      <tbody>
        ${accountRows}
      </tbody>
      <tfoot>
        <tr class="totals-row">
          <td>TOTAL</td>
          <td class="num">${money(totals.initial)}</td>
          <td class="num green-text">${money(totals.totalIn)}</td>
          <td class="num red-text">${money(totals.totalOut)}</td>
          <td class="num">${money(totals.final)}</td>
        </tr>
      </tfoot>
    </table>
  </section>

  <div class="page-break"></div>

  ${renderDetailSection({ title: 'Detalle de ingresos', buckets: inBuckets, tagOrder: IN_DETAIL_TAGS, color: 'green' })}
  ${renderDetailSection({ title: 'Detalle de salidas', buckets: outBuckets, tagOrder: OUT_DETAIL_TAGS, color: 'red', extraRows: sueldosResumen })}

  ${sueldosPage}
</body>
</html>`;
}

// GET /cashflow/cash-sessions/:id/report.pdf
export async function generateSessionReportPdf(req, res) {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ error: 'id inválido' });
    const session = await CashSession.findOne({ _id: id, companyId: req.companyId }).lean();
    if (!session) return res.status(404).json({ error: 'Cierre de caja no encontrado' });
    if (session.status !== 'CLOSED') return res.status(400).json({ error: 'La caja debe estar cerrada para generar el reporte' });

    const [company, entries] = await Promise.all([
      Company.findById(req.companyId).select('name').lean(),
      CashFlowEntry.find({
        companyId: req.companyId,
        date: { $gte: session.openedAt, $lte: session.closedAt }
      }).populate('accountId', 'name').lean()
    ]);

    const data = buildReportData(session, entries);
    const html = buildReportHtml({ companyName: company?.name || 'Taller', session, data });

    const pdfBuffer = await htmlToPdfBuffer(html, {
      format: 'Letter',
      margin: { top: '8mm', right: '8mm', bottom: '10mm', left: '8mm' },
      displayHeaderFooter: false
    });

    const closedDate = new Date(session.closedAt).toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="reporte_caja_${closedDate}.pdf"`);
    return res.status(200).end(pdfBuffer);
  } catch (e) {
    return res.status(500).json({ error: e?.message || 'No se pudo generar el reporte' });
  }
}
