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
  try {
    const concepts = await CompanyPayrollConcept.find({ companyId: req.companyId, isActive: true }).sort({ ordering: 1, name: 1 });
    res.json(concepts);
  } catch (err) {
    res.status(500).json({ error: 'Error al listar conceptos', message: err.message });
  }
};

export const upsertConcept = async (req, res) => {
  try {
    const { id } = req.params;
    const { type, amountType, code, name, defaultValue, isActive, ordering } = req.body;
    
    // Validaciones
    if (!type || !['earning', 'deduction', 'surcharge'].includes(type)) {
      return res.status(400).json({ error: 'Tipo inválido. Debe ser: earning, deduction o surcharge' });
    }
    if (!amountType || !['fixed', 'percent'].includes(amountType)) {
      return res.status(400).json({ error: 'Tipo de monto inválido. Debe ser: fixed o percent' });
    }
    if (!code || typeof code !== 'string' || code.trim().length === 0) {
      return res.status(400).json({ error: 'Código requerido' });
    }
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ error: 'Nombre requerido' });
    }
    if (typeof defaultValue !== 'number' || defaultValue < 0) {
      return res.status(400).json({ error: 'Valor por defecto debe ser un número positivo' });
    }
    if (amountType === 'percent' && defaultValue > 100 && !req.body.allowOver100) {
      // Permitir porcentajes > 100 solo si se solicita explícitamente
      return res.status(400).json({ error: 'Porcentaje no puede ser mayor a 100%' });
    }
    
    const data = {
      companyId: req.companyId,
      type,
      amountType,
      code: code.trim().toUpperCase(),
      name: name.trim(),
      defaultValue,
      isActive: isActive !== false,
      ordering: ordering || 0
    };
    
    let doc;
    if (id) {
      // Actualizar: verificar que existe y pertenece a la empresa
      const existing = await CompanyPayrollConcept.findOne({ _id: id, companyId: req.companyId });
      if (!existing) {
        return res.status(404).json({ error: 'Concepto no encontrado' });
      }
      // Verificar duplicado de código (si cambió)
      if (data.code !== existing.code) {
        const duplicate = await CompanyPayrollConcept.findOne({ 
          companyId: req.companyId, 
          code: data.code,
          _id: { $ne: id }
        });
        if (duplicate) {
          return res.status(409).json({ error: 'Ya existe un concepto con ese código en esta empresa' });
        }
      }
      doc = await CompanyPayrollConcept.findOneAndUpdate(
        { _id: id, companyId: req.companyId },
        data,
        { new: true, runValidators: true }
      );
    } else {
      // Crear: verificar que no exista código duplicado
      const duplicate = await CompanyPayrollConcept.findOne({ 
        companyId: req.companyId, 
        code: data.code 
      });
      if (duplicate) {
        return res.status(409).json({ error: 'Ya existe un concepto con ese código en esta empresa' });
      }
      doc = await CompanyPayrollConcept.create(data);
    }
    
    res.status(id ? 200 : 201).json(doc);
  } catch (err) {
    if (err.name === 'ValidationError') {
      return res.status(400).json({ error: 'Error de validación', message: err.message });
    }
    if (err.code === 11000) {
      return res.status(409).json({ error: 'Ya existe un concepto con ese código en esta empresa' });
    }
    res.status(500).json({ error: 'Error al guardar concepto', message: err.message });
  }
};

export const deleteConcept = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await CompanyPayrollConcept.deleteOne({ _id: id, companyId: req.companyId });
    if (result.deletedCount === 0) {
      return res.status(404).json({ error: 'Concepto no encontrado' });
    }
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: 'Error al eliminar concepto', message: err.message });
  }
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
  try {
    const { technicianId, technicianName, conceptId } = req.body;
    if (!conceptId) {
      return res.status(400).json({ error: 'conceptId requerido' });
    }
    
    const filter = { companyId: req.companyId, conceptId };
    if (technicianId) filter.technicianId = technicianId;
    if (!technicianId && technicianName) {
      filter.technicianName = String(technicianName).trim().toUpperCase();
    } else if (!technicianId && !technicianName) {
      return res.status(400).json({ error: 'technicianId o technicianName requerido' });
    }
    
    const result = await TechnicianAssignment.deleteOne(filter);
    if (result.deletedCount === 0) {
      return res.status(404).json({ error: 'Asignación no encontrada' });
    }
    
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: 'Error al eliminar asignación', message: err.message });
  }
};

export const createPeriod = async (req, res) => {
  try {
    const { periodType, startDate, endDate } = req.body;
    
    // Validaciones
    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'startDate y endDate son requeridos' });
    }
    
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({ error: 'Fechas inválidas' });
    }
    
    if (end <= start) {
      return res.status(400).json({ error: 'La fecha de fin debe ser posterior a la fecha de inicio' });
    }
    
    // Verificar que no haya solapamiento con períodos existentes
    const overlapping = await PayrollPeriod.findOne({
      companyId: req.companyId,
      $or: [
        { startDate: { $lte: end }, endDate: { $gte: start } }
      ]
    });
    
    if (overlapping) {
      return res.status(409).json({ 
        error: 'Ya existe un período que se solapa con estas fechas',
        existing: {
          startDate: overlapping.startDate,
          endDate: overlapping.endDate,
          status: overlapping.status
        }
      });
    }
    
    const validTypes = ['monthly', 'biweekly', 'weekly'];
    const type = validTypes.includes(periodType) ? periodType : 'monthly';
    
    const doc = await PayrollPeriod.create({ 
      companyId: req.companyId, 
      periodType: type, 
      startDate: start, 
      endDate: end 
    });
    
    res.status(201).json(doc);
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ error: 'Ya existe un período con estas fechas exactas' });
    }
    res.status(500).json({ error: 'Error al crear período', message: err.message });
  }
};

export const listOpenPeriods = async (req, res) => {
  try {
    const items = await PayrollPeriod.find({ companyId: req.companyId, status: 'open' }).sort({ startDate: -1 });
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: 'Error al listar períodos abiertos', message: err.message });
  }
};

export const listAllPeriods = async (req, res) => {
  try {
    const { status } = req.query;
    const filter = { companyId: req.companyId };
    if (status === 'open' || status === 'closed') {
      filter.status = status;
    }
    const items = await PayrollPeriod.find(filter).sort({ startDate: -1 });
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: 'Error al listar períodos', message: err.message });
  }
};

export const closePeriod = async (req, res) => {
  try {
    const { id } = req.params;
    const period = await PayrollPeriod.findOne({ _id: id, companyId: req.companyId });
    
    if (!period) {
      return res.status(404).json({ error: 'Período no encontrado' });
    }
    
    if (period.status === 'closed') {
      return res.status(400).json({ error: 'El período ya está cerrado' });
    }
    
    period.status = 'closed';
    await period.save();
    
    res.json(period);
  } catch (err) {
    res.status(500).json({ error: 'Error al cerrar período', message: err.message });
  }
};

function computeSettlementItems({ selectedConcepts, assignments, technicianName }){
  const items = [];
  // Solo aplicar conceptos seleccionados
  for(const c of selectedConcepts){
    const override = assignments.find(a => {
      const techMatch = technicianName ? 
        (String(a.technicianName || '').toUpperCase() === String(technicianName).toUpperCase()) : 
        true;
      return techMatch && String(a.conceptId) === String(c._id);
    });
    const value = override?.valueOverride ?? c.defaultValue ?? 0;
    let amount = 0;
    if(c.amountType === 'fixed') {
      amount = value;
    } else {
      // Para porcentajes, necesitamos una base (usaremos comisión si existe, sino 0)
      // El porcentaje se aplicará sobre la comisión total del técnico
      amount = 0; // Se calculará después con la comisión
    }
    items.push({ 
      conceptId: c._id, 
      name: c.name, 
      type: c.type, 
      base: 0, 
      value: amount, 
      calcRule: c.amountType,
      isPercent: c.amountType === 'percent',
      percentValue: c.amountType === 'percent' ? value : null
    });
  }
  return items;
}

function calculateTotals(items){
  const grossTotal = items.filter(i => i.type !== 'deduction').reduce((a,b)=>a+b.value,0);
  const deductionsTotal = items.filter(i => i.type === 'deduction').reduce((a,b)=>a+b.value,0);
  const netTotal = grossTotal - deductionsTotal;
  return { grossTotal, deductionsTotal, netTotal };
}

export const previewSettlement = async (req, res) => {
  try {
    const { periodId, selectedConceptIds = [] } = req.body;
    
    // Validaciones
    if (!periodId) {
      return res.status(400).json({ error: 'periodId requerido' });
    }
    
    // Buscar período
    const period = await PayrollPeriod.findOne({ _id: periodId, companyId: req.companyId });
    if (!period) {
      return res.status(404).json({ error: 'Período no encontrado' });
    }
    
    // Buscar conceptos seleccionados (solo los que el usuario eligió)
    const selectedConcepts = await CompanyPayrollConcept.find({ 
      companyId: req.companyId, 
      _id: { $in: selectedConceptIds },
      isActive: true 
    });
    
    // Buscar todas las ventas cerradas del período para calcular comisiones
    const sales = await Sale.find({
      companyId: req.companyId,
      status: 'closed',
      closedAt: { $gte: period.startDate, $lte: period.endDate }
    }).select({ laborCommissions: 1, closingTechnician: 1, technician: 1 });
    
    // Agrupar comisiones por técnico
    const technicianCommissions = {};
    sales.forEach(sale => {
      (sale.laborCommissions || []).forEach(lc => {
        const techName = String(lc.technician || lc.technicianName || '').toUpperCase().trim();
        if (techName) {
          if (!technicianCommissions[techName]) {
            technicianCommissions[techName] = 0;
          }
          technicianCommissions[techName] += Number(lc.share || 0);
        }
      });
    });
    
    // Obtener lista de técnicos de la empresa
    const Company = (await import('../models/Company.js')).default;
    const company = await Company.findById(req.companyId);
    const allTechnicians = (company?.technicians || []).map(t => String(t).toUpperCase());
    
    // Crear liquidaciones para cada técnico con comisiones
    const technicians = [];
    const allTechNames = new Set([...Object.keys(technicianCommissions), ...allTechnicians]);
    
    for (const techName of allTechNames) {
      const commission = Math.round((technicianCommissions[techName] || 0) * 100) / 100;
      
      // Solo incluir técnicos con comisiones > 0
      if (commission > 0 || allTechnicians.includes(techName)) {
        // Buscar asignaciones para este técnico
        const assignments = await TechnicianAssignment.find({
          companyId: req.companyId,
          technicianName: techName,
          isActive: true
        });
        
        // Calcular items con la comisión como base para porcentajes
        const items = computeSettlementItems({ 
          selectedConcepts, 
          assignments, 
          technicianName: techName 
        });
        
        // Agregar comisión como primer item
        if (commission > 0) {
          items.unshift({
            conceptId: null,
            name: 'Comisión por ventas',
            type: 'earning',
            base: 0,
            value: commission,
            calcRule: 'sales.laborCommissions',
            notes: ''
          });
        }
        
        // Calcular valores de porcentajes sobre la comisión
        items.forEach(item => {
          if (item.isPercent && item.percentValue) {
            item.value = Math.round((commission * item.percentValue) / 100);
            item.base = commission;
          }
        });
        
        const { grossTotal, deductionsTotal, netTotal } = calculateTotals(items);
        
        technicians.push({
          technicianId: null,
          technicianName: techName,
          items,
          grossTotal,
          deductionsTotal,
          netTotal
        });
      }
    }
    
    // Calcular totales generales
    const totalGrossTotal = technicians.reduce((sum, t) => sum + t.grossTotal, 0);
    const totalDeductionsTotal = technicians.reduce((sum, t) => sum + t.deductionsTotal, 0);
    const totalNetTotal = technicians.reduce((sum, t) => sum + t.netTotal, 0);
    
    res.json({
      periodId,
      selectedConceptIds,
      technicians,
      totalGrossTotal,
      totalDeductionsTotal,
      totalNetTotal
    });
  } catch (err) {
    console.error('Error in previewSettlement:', err);
    res.status(500).json({ error: 'Error al previsualizar liquidación', message: err.message });
  }
};

export const approveSettlement = async (req, res) => {
  try {
    const { periodId, selectedConceptIds = [] } = req.body;
    
    // Validaciones
    if (!periodId) {
      return res.status(400).json({ error: 'periodId requerido' });
    }
    
    // Usar la misma lógica que previewSettlement para calcular
    const period = await PayrollPeriod.findOne({ _id: periodId, companyId: req.companyId });
    if (!period) {
      return res.status(404).json({ error: 'Período no encontrado' });
    }
    
    const selectedConcepts = await CompanyPayrollConcept.find({ 
      companyId: req.companyId, 
      _id: { $in: selectedConceptIds },
      isActive: true 
    });
    
    const sales = await Sale.find({
      companyId: req.companyId,
      status: 'closed',
      closedAt: { $gte: period.startDate, $lte: period.endDate }
    }).select({ laborCommissions: 1 });
    
    const technicianCommissions = {};
    sales.forEach(sale => {
      (sale.laborCommissions || []).forEach(lc => {
        const techName = String(lc.technician || lc.technicianName || '').toUpperCase().trim();
        if (techName) {
          if (!technicianCommissions[techName]) {
            technicianCommissions[techName] = 0;
          }
          technicianCommissions[techName] += Number(lc.share || 0);
        }
      });
    });
    
    const Company = (await import('../models/Company.js')).default;
    const company = await Company.findById(req.companyId);
    const allTechnicians = (company?.technicians || []).map(t => String(t).toUpperCase());
    
    const technicians = [];
    const allTechNames = new Set([...Object.keys(technicianCommissions), ...allTechnicians]);
    
    for (const techName of allTechNames) {
      const commission = Math.round((technicianCommissions[techName] || 0) * 100) / 100;
      
      if (commission > 0 || allTechnicians.includes(techName)) {
        const assignments = await TechnicianAssignment.find({
          companyId: req.companyId,
          technicianName: techName,
          isActive: true
        });
        
        const items = computeSettlementItems({ 
          selectedConcepts, 
          assignments, 
          technicianName: techName 
        });
        
        if (commission > 0) {
          items.unshift({
            conceptId: null,
            name: 'Comisión por ventas',
            type: 'earning',
            base: 0,
            value: commission,
            calcRule: 'sales.laborCommissions',
            notes: ''
          });
        }
        
        items.forEach(item => {
          if (item.isPercent && item.percentValue) {
            item.value = Math.round((commission * item.percentValue) / 100);
            item.base = commission;
          }
        });
        
        const { grossTotal, deductionsTotal, netTotal } = calculateTotals(items);
        
        technicians.push({
          technicianId: null,
          technicianName: techName,
          items,
          grossTotal,
          deductionsTotal,
          netTotal
        });
      }
    }
    
    const totalGrossTotal = technicians.reduce((sum, t) => sum + t.grossTotal, 0);
    const totalDeductionsTotal = technicians.reduce((sum, t) => sum + t.deductionsTotal, 0);
    const totalNetTotal = technicians.reduce((sum, t) => sum + t.netTotal, 0);
    
    // Guardar liquidación (una por período)
    const doc = await PayrollSettlement.findOneAndUpdate(
      { companyId: req.companyId, periodId },
      { 
        selectedConceptIds,
        technicians,
        totalGrossTotal,
        totalDeductionsTotal,
        totalNetTotal,
        status: 'approved',
        approvedBy: req.user?.id || null,
        approvedAt: new Date()
      },
      { new: true, upsert: true }
    );
    
    res.json(doc);
  } catch (err) {
    console.error('Error in approveSettlement:', err);
    res.status(500).json({ error: 'Error al aprobar liquidación', message: err.message });
  }
};

export const paySettlement = async (req, res) => {
  try {
    const { settlementId, accountId, date, technicianIndex } = req.body;
    
    // Validaciones
    if (!settlementId) {
      return res.status(400).json({ error: 'settlementId requerido' });
    }
    if (!accountId) {
      return res.status(400).json({ error: 'accountId requerido' });
    }
    
    // Verificar que la cuenta existe
    const Account = (await import('../models/Account.js')).default;
    const account = await Account.findOne({ _id: accountId, companyId: req.companyId });
    if (!account) {
      return res.status(404).json({ error: 'Cuenta no encontrada' });
    }
    
    const st = await PayrollSettlement.findOne({ _id: settlementId, companyId: req.companyId });
    if(!st) return res.status(404).json({ error: 'Liquidación no encontrada' });
    if(st.status === 'paid') return res.status(400).json({ error: 'Esta liquidación ya fue pagada' });
    if(st.status !== 'approved') return res.status(400).json({ error: 'Solo se pueden pagar liquidaciones aprobadas' });

    // Si se especifica technicianIndex, pagar solo ese técnico; si no, pagar todos
    let techniciansToPay = [];
    if (technicianIndex !== undefined && technicianIndex !== null) {
      const tech = st.technicians?.[technicianIndex];
      if (!tech) return res.status(404).json({ error: 'Técnico no encontrado en la liquidación' });
      techniciansToPay = [tech];
    } else {
      techniciansToPay = st.technicians || [];
    }

    // Crear una entrada de CashFlow por cada técnico (o una sola si se paga todo)
    const cashflowEntries = [];
    for (const tech of techniciansToPay) {
      const entry = await CashFlowEntry.create({
        companyId: req.companyId,
        accountId,
        date: date ? new Date(date) : new Date(),
        kind: 'OUT',
        source: 'MANUAL',
        sourceRef: settlementId,
        description: `Pago de nómina: ${tech.technicianName || 'Sin nombre'}`,
        amount: Math.abs(tech.netTotal),
        meta: { 
          type: 'PAYROLL', 
          technicianId: tech.technicianId, 
          technicianName: tech.technicianName,
          settlementId 
        }
      });
      cashflowEntries.push(entry._id);
    }

    // Actualizar liquidación
    if (technicianIndex === undefined || technicianIndex === null) {
      // Si se pagaron todos, marcar como pagada
      st.status = 'paid';
    }
    st.paidCashflowIds = [...(st.paidCashflowIds || []), ...cashflowEntries];
    await st.save();

    res.json({ ok: true, settlement: st, cashflow: cashflowEntries.length === 1 ? { _id: cashflowEntries[0] } : cashflowEntries });
  } catch (err) {
    res.status(500).json({ error: 'Error al procesar pago', message: err.message });
  }
};

export const listSettlements = async (req, res) => {
  try {
    const { periodId, status } = req.query;
    const filter = { companyId: req.companyId };
    if (periodId) filter.periodId = periodId;
    if (status) filter.status = status;
    
    const items = await PayrollSettlement.find(filter).sort({ createdAt: -1 });
    
    // Agregar resumen simple usando los nuevos campos
    const summary = items.reduce((acc, s) => {
      acc.grossTotal += (s.totalGrossTotal || 0);
      acc.deductionsTotal += (s.totalDeductionsTotal || 0);
      acc.netTotal += (s.totalNetTotal || 0);
      return acc;
    }, { grossTotal: 0, deductionsTotal: 0, netTotal: 0 });
    
    res.json({ items, summary });
  } catch (err) {
    res.status(500).json({ error: 'Error al listar liquidaciones', message: err.message });
  }
};

function ensureHB(){
  if (ensureHB._inited) return; ensureHB._inited = true;
  Handlebars.registerHelper('money', (v) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(Number(v||0)));
  Handlebars.registerHelper('date', (v, fmt) => { 
    const d = v ? new Date(v) : new Date(); 
    if (fmt === 'iso') return d.toISOString().slice(0, 10);
    if (fmt === 'short') return d.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' });
    return d.toLocaleString('es-CO'); 
  });
  Handlebars.registerHelper('pad', (v, len = 5) => String(v ?? '').toString().padStart(len, '0'));
  Handlebars.registerHelper('uppercase', (v) => String(v || '').toUpperCase());
  Handlebars.registerHelper('lowercase', (v) => String(v || '').toLowerCase());
}

export const printSettlementHtml = async (req, res) => {
  try {
    const { id } = req.params;
    const st = await PayrollSettlement.findOne({ _id: id, companyId: req.companyId }).populate('periodId');
    if(!st) return res.status(404).send('Not found');
    
    const [tpl, company, period] = await Promise.all([
      Template.findOne({ companyId: req.companyId, type: 'payroll', active: true }).sort({ updatedAt: -1 }),
      Company.findOne({ _id: req.companyId }),
      PayrollPeriod.findOne({ _id: st.periodId, companyId: req.companyId })
    ]);
    
    // Preparar contexto completo para el template
    const settlementObj = st.toObject();
    const periodObj = period ? period.toObject() : null;
    
    // Preparar técnicos con items agrupados por tipo
    const techniciansWithItems = (settlementObj.technicians || []).map(tech => ({
      ...tech,
      itemsByType: {
        earnings: (tech.items || []).filter(i => i.type === 'earning'),
        deductions: (tech.items || []).filter(i => i.type === 'deduction'),
        surcharges: (tech.items || []).filter(i => i.type === 'surcharge')
      },
      formattedGrossTotal: new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(tech.grossTotal || 0),
      formattedDeductionsTotal: new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(tech.deductionsTotal || 0),
      formattedNetTotal: new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(tech.netTotal || 0)
    }));
    
    const context = {
      company: {
        name: company?.name || company?.email || '',
        email: company?.email || '',
        phone: company?.phone || '',
        address: company?.address || '',
        logoUrl: company?.logoUrl || ''
      },
      settlement: {
        ...settlementObj,
        technicians: techniciansWithItems, // Técnicos con items agrupados
        formattedTotalGrossTotal: new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(settlementObj.totalGrossTotal || 0),
        formattedTotalDeductionsTotal: new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(settlementObj.totalDeductionsTotal || 0),
        formattedTotalNetTotal: new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(settlementObj.totalNetTotal || 0)
      },
      period: periodObj ? {
        ...periodObj,
        formattedStartDate: period.startDate ? new Date(period.startDate).toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '',
        formattedEndDate: period.endDate ? new Date(period.endDate).toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '',
        periodTypeLabel: periodObj.periodType === 'monthly' ? 'Mensual' : periodObj.periodType === 'biweekly' ? 'Quincenal' : periodObj.periodType === 'weekly' ? 'Semanal' : periodObj.periodType
      } : null,
      now: new Date(),
      formattedNow: new Date().toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    };
    
    let html = '';
    let css = '';
    if (tpl) {
      ensureHB();
      try {
        html = Handlebars.compile(tpl.contentHtml||'')(context);
        css = tpl.contentCss || '';
      } catch(e){ 
        console.error('Template error:', e);
        html = `<!-- template error: ${e.message} --><div style="padding:20px;color:red;">Error al renderizar template: ${e.message}</div>`; 
      }
    } else {
      // Fallback HTML simple con mejor formato para múltiples técnicos
      const formatMoney = (val) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(val || 0);
      const periodRange = periodObj ? `${new Date(periodObj.startDate).toLocaleDateString('es-CO')} → ${new Date(periodObj.endDate).toLocaleDateString('es-CO')}` : '';
      
      const renderTechnician = (tech) => {
        const earnings = (tech.items || []).filter(i => i.type === 'earning');
        const deductions = (tech.items || []).filter(i => i.type === 'deduction');
        const earningsRows = earnings.map(i => `<tr><td>${i.name}</td><td style="text-align:right">${formatMoney(i.value)}</td></tr>`).join('');
        const deductionsRows = deductions.map(i => `<tr><td>${i.name}</td><td style="text-align:right">${formatMoney(i.value)}</td></tr>`).join('');
        
        return `
          <div style="margin-bottom:30px;padding:20px;border:1px solid #ddd;border-radius:8px;">
            <h3 style="margin-top:0;margin-bottom:15px;color:#333;">Técnico: ${tech.technicianName || 'Sin nombre'}</h3>
            ${earningsRows ? `
              <h4 style="margin-top:15px;margin-bottom:8px;font-size:14px;color:#666;">Ingresos</h4>
              <table style="width:100%;border-collapse:collapse;margin-bottom:15px;">
                <thead>
                  <tr style="background:#f0f0f0;">
                    <th style="text-align:left;padding:8px;border-bottom:2px solid #ddd;">Concepto</th>
                    <th style="text-align:right;padding:8px;border-bottom:2px solid #ddd;">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  ${earningsRows}
                </tbody>
              </table>
            ` : ''}
            ${deductionsRows ? `
              <h4 style="margin-top:15px;margin-bottom:8px;font-size:14px;color:#666;">Descuentos</h4>
              <table style="width:100%;border-collapse:collapse;margin-bottom:15px;">
                <thead>
                  <tr style="background:#f0f0f0;">
                    <th style="text-align:left;padding:8px;border-bottom:2px solid #ddd;">Concepto</th>
                    <th style="text-align:right;padding:8px;border-bottom:2px solid #ddd;">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  ${deductionsRows}
                </tbody>
              </table>
            ` : ''}
            <div style="margin-top:15px;padding-top:15px;border-top:1px solid #ddd;">
              <div style="display:flex;justify-content:space-between;margin-bottom:6px;">
                <strong>Total bruto:</strong>
                <strong>${formatMoney(tech.grossTotal)}</strong>
              </div>
              <div style="display:flex;justify-content:space-between;margin-bottom:6px;">
                <strong>Total descuentos:</strong>
                <strong>${formatMoney(tech.deductionsTotal)}</strong>
              </div>
              <div style="display:flex;justify-content:space-between;padding-top:8px;border-top:1px solid #ddd;font-size:16px;">
                <strong>Neto a pagar:</strong>
                <strong style="color:#10b981;">${formatMoney(tech.netTotal)}</strong>
              </div>
            </div>
          </div>`;
      };
      
      html = `
        <div style="max-width:800px;margin:0 auto;padding:20px;font-family:Arial,sans-serif;">
          <h2 style="text-align:center;margin-bottom:20px;">Comprobante de Pago de Nómina</h2>
          <div style="margin-bottom:20px;padding-bottom:15px;border-bottom:2px solid #333;">
            <div><strong>Empresa:</strong> ${context.company.name}</div>
            ${periodRange ? `<div><strong>Período:</strong> ${periodRange}</div>` : ''}
            <div><strong>Fecha de liquidación:</strong> ${context.formattedNow}</div>
            <div><strong>Técnicos incluidos:</strong> ${techniciansWithItems.length}</div>
          </div>
          ${techniciansWithItems.map(tech => renderTechnician(tech)).join('')}
          <div style="margin-top:30px;padding-top:20px;border-top:3px solid #333;">
            <div style="display:flex;justify-content:space-between;margin-bottom:8px;font-size:16px;">
              <strong>Total bruto general:</strong>
              <strong>${formatMoney(settlementObj.totalGrossTotal)}</strong>
            </div>
            <div style="display:flex;justify-content:space-between;margin-bottom:8px;font-size:16px;">
              <strong>Total descuentos general:</strong>
              <strong>${formatMoney(settlementObj.totalDeductionsTotal)}</strong>
            </div>
            <div style="display:flex;justify-content:space-between;padding-top:10px;border-top:2px solid #ddd;font-size:20px;">
              <strong>Total neto a pagar:</strong>
              <strong style="color:#10b981;">${formatMoney(settlementObj.totalNetTotal)}</strong>
            </div>
          </div>
        </div>`;
      css = `table td{border-bottom:1px solid #ddd;padding:8px}`;
    }
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body>${html}</body></html>`);
  } catch (err) {
    console.error('Error in printSettlementHtml:', err);
    res.status(500).send(`<html><body><h1>Error</h1><p>${err.message}</p></body></html>`);
  }
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


