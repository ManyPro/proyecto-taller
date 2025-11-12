import CompanyPayrollConcept from '../models/CompanyPayrollConcept.js';
import TechnicianAssignment from '../models/TechnicianAssignment.js';
import PayrollPeriod from '../models/PayrollPeriod.js';
import PayrollSettlement from '../models/PayrollSettlement.js';
import CashFlowEntry from '../models/CashFlowEntry.js';
import Sale from '../models/Sale.js';
import EmployeeLoan from '../models/EmployeeLoan.js';
import PDFDocument from 'pdfkit';
import Template from '../models/Template.js';
import Handlebars from 'handlebars';
import Company from '../models/Company.js';
import { computeBalance } from './cashflow.controller.js';
import mongoose from 'mongoose';

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
    const { 
      type, amountType, code, name, defaultValue, isActive, ordering, 
      isVariable, variableFixedAmount,
      percentBaseType, percentBaseConceptId, percentBaseFixedValue 
    } = req.body;
    
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
    
    // Validar concepto variable
    if (isVariable && (!variableFixedAmount || variableFixedAmount <= 0)) {
      return res.status(400).json({ error: 'Si el concepto es variable, debe tener un monto fijo mayor a 0' });
    }
    
    // Validar base de porcentaje
    if (amountType === 'percent') {
      if (!percentBaseType || !['total_gross', 'specific_concept', 'fixed_value'].includes(percentBaseType)) {
        return res.status(400).json({ error: 'Tipo de base de porcentaje inválido. Debe ser: total_gross, specific_concept o fixed_value' });
      }
      if (percentBaseType === 'specific_concept' && !percentBaseConceptId) {
        return res.status(400).json({ error: 'Si la base es un concepto específico, debe proporcionar el ID del concepto' });
      }
      if (percentBaseType === 'fixed_value' && (!percentBaseFixedValue || percentBaseFixedValue <= 0)) {
        return res.status(400).json({ error: 'Si la base es un valor fijo, debe ser mayor a 0' });
      }
    }
    
    const data = {
      companyId: req.companyId,
      type,
      amountType,
      code: code.trim().toUpperCase(),
      name: name.trim(),
      defaultValue,
      isActive: isActive !== false,
      ordering: ordering || 0,
      isVariable: isVariable === true,
      variableFixedAmount: isVariable ? (Number(variableFixedAmount) || 0) : 0,
      // Base para porcentajes
      percentBaseType: amountType === 'percent' ? (percentBaseType || 'total_gross') : 'total_gross',
      percentBaseConceptId: amountType === 'percent' && percentBaseType === 'specific_concept' ? percentBaseConceptId : null,
      percentBaseFixedValue: amountType === 'percent' && percentBaseType === 'fixed_value' ? (Number(percentBaseFixedValue) || 0) : 0
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
    
    // NOTA: Se permiten períodos que se solapen para soportar diferentes frecuencias de pago
    // (ej: algunos empleados quincenal, otros semanal)
    // Solo se previene crear un período con las mismas fechas exactas si ya existe uno ABIERTO
    
    // Verificar si ya existe un período ABIERTO con las mismas fechas exactas
    const existingOpen = await PayrollPeriod.findOne({
      companyId: req.companyId,
      startDate: start,
      endDate: end,
      status: 'open'
    });
    
    if (existingOpen) {
      return res.status(409).json({ 
        error: 'Ya existe un período ABIERTO con estas fechas exactas',
        existing: {
          id: existingOpen._id,
          startDate: existingOpen.startDate,
          endDate: existingOpen.endDate,
          periodType: existingOpen.periodType
        }
      });
    }
    
    const validTypes = ['monthly', 'biweekly', 'weekly'];
    const type = validTypes.includes(periodType) ? periodType : 'monthly';
    
    try {
    const doc = await PayrollPeriod.create({ 
      companyId: req.companyId, 
      periodType: type, 
      startDate: start, 
      endDate: end 
    });
    
    res.status(201).json(doc);
    } catch (createErr) {
      // Si el error es por índice único (11000), verificar si es un período abierto
      if (createErr.code === 11000) {
        // El índice único todavía existe en la BD, verificar manualmente
        const existing = await PayrollPeriod.findOne({
          companyId: req.companyId,
          startDate: start,
          endDate: end
        });
        
        if (existing && existing.status === 'open') {
          return res.status(409).json({ 
            error: 'Ya existe un período ABIERTO con estas fechas exactas',
            existing: {
              id: existing._id,
              startDate: existing.startDate,
              endDate: existing.endDate,
              periodType: existing.periodType
            }
          });
        }
        
        // Si está cerrado, intentar crear de nuevo (puede haber un race condition)
        // O informar que necesita eliminar el índice único
        return res.status(500).json({ 
          error: 'Error: El índice único de la base de datos necesita ser eliminado. Contacta al administrador.',
          message: 'El sistema permite períodos duplicados si están cerrados, pero el índice único de MongoDB está bloqueando la operación.'
        });
      }
      throw createErr;
    }
  } catch (err) {
    console.error('Error en createPeriod:', err);
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
      percentValue: c.amountType === 'percent' ? value : null,
      // Información de base para porcentajes
      percentBaseType: c.percentBaseType || 'total_gross',
      percentBaseConceptId: c.percentBaseConceptId || null,
      percentBaseFixedValue: c.percentBaseFixedValue || 0
    });
  }
  return items;
}

// Asegurar que el concepto PAGO_PRESTAMOS existe
async function ensureLoanConcept(companyId) {
  let concept = await CompanyPayrollConcept.findOne({ 
    companyId, 
    code: 'PAGO_PRESTAMOS' 
  });
  
  if (!concept) {
    concept = await CompanyPayrollConcept.create({
      companyId,
      code: 'PAGO_PRESTAMOS',
      name: 'Pago préstamos',
      type: 'deduction',
      amountType: 'fixed',
      defaultValue: 0,
      ordering: 200,
      isActive: true
    });
  }
  
  return concept;
}

function calculateTotals(items){
  const grossTotal = items.filter(i => i.type !== 'deduction').reduce((a,b)=>a+b.value,0);
  const deductionsTotal = items.filter(i => i.type === 'deduction').reduce((a,b)=>a+b.value,0);
  const netTotal = grossTotal - deductionsTotal;
  return { grossTotal, deductionsTotal, netTotal };
}

export const previewSettlement = async (req, res) => {
  try {
    const { periodId, technicianId, technicianName, selectedConceptIds = [] } = req.body;
    
    // Validaciones
    if (!periodId) {
      return res.status(400).json({ error: 'periodId requerido' });
    }
    if (!technicianName && !technicianId) {
      return res.status(400).json({ error: 'technicianId o technicianName requerido' });
    }
    
    // Buscar período
    const period = await PayrollPeriod.findOne({ _id: periodId, companyId: req.companyId });
    if (!period) {
      return res.status(404).json({ error: 'Período no encontrado' });
    }
    
    const techNameUpper = technicianName ? String(technicianName).toUpperCase() : null;
    
    // Buscar asignaciones de conceptos para este técnico específico
    const assignmentFilter = { companyId: req.companyId, isActive: true };
    if (technicianId && technicianId.trim() !== '') {
      assignmentFilter.technicianId = technicianId;
    } else if (techNameUpper) {
      assignmentFilter.technicianName = techNameUpper;
    }
    
    const assignments = await TechnicianAssignment.find(assignmentFilter);
    
    // Obtener los conceptos asignados a este técnico
    const assignedConceptIds = assignments.map(a => a.conceptId);
    
    // Separar conceptos normales de conceptos especiales (COMMISSION, LOAN_PAYMENT)
    const specialConcepts = selectedConceptIds.filter(id => id === 'COMMISSION' || id === 'LOAN_PAYMENT');
    const normalConceptIds = selectedConceptIds.filter(id => id !== 'COMMISSION' && id !== 'LOAN_PAYMENT');
    
    // Buscar conceptos asignados que el usuario seleccionó (debe estar en ambos arrays)
    const validConceptIds = normalConceptIds.filter(id => assignedConceptIds.some(aid => String(aid) === String(id)));
    const selectedConcepts = await CompanyPayrollConcept.find({ 
      companyId: req.companyId, 
      _id: { $in: validConceptIds },
      isActive: true 
    });
    
    // Buscar concepto variable entre los conceptos seleccionados (si hay alguno marcado como variable)
    const includeVariable = selectedConcepts.some(c => c.isVariable);
    let variableConcept = null;
    if (includeVariable) {
      variableConcept = selectedConcepts.find(c => c.isVariable);
    }
    
    // Calcular comisión del técnico en el período
    const sales = await Sale.find({
      companyId: req.companyId,
      status: 'closed',
      closedAt: { $gte: period.startDate, $lte: period.endDate },
      $or: [
        { 'laborCommissions.technician': techNameUpper },
        { 'laborCommissions.technicianName': techNameUpper },
        { closingTechnician: techNameUpper },
        { technician: techNameUpper }
      ]
    }).select({ laborCommissions: 1 });
    
    // Recolectar detalles de comisiones con porcentajes
    const commissionDetails = [];
    const commission = sales.reduce((acc, s) => {
      const fromBreakdown = (s.laborCommissions||[])
        .filter(lc => {
          const techMatch = String(lc.technician || lc.technicianName || '').toUpperCase();
          return techMatch === techNameUpper;
        });
      fromBreakdown.forEach(lc => {
        commissionDetails.push({
          kind: lc.kind || '',
          laborValue: Number(lc.laborValue || 0),
          percent: Number(lc.percent || 0),
          share: Number(lc.share || 0)
        });
      });
      return acc + fromBreakdown.reduce((a,b)=> a + (Number(b.share)||0), 0);
    }, 0);
    
    const commissionRounded = Math.round(commission * 100) / 100;
    
    // Construir notas con detalles de porcentajes
    let commissionNotes = '';
    if (commissionDetails.length > 0) {
      const details = commissionDetails.map(d => {
        if (d.kind) {
          return `${d.kind}: ${d.percent}% sobre ${Math.round(d.laborValue).toLocaleString('es-CO')} = ${Math.round(d.share).toLocaleString('es-CO')}`;
        }
        return `${d.percent}% sobre ${Math.round(d.laborValue).toLocaleString('es-CO')} = ${Math.round(d.share).toLocaleString('es-CO')}`;
      }).join('; ');
      commissionNotes = details;
    }
    
    // PRIMERO agregar las comisiones de ventas (siempre se agregan automáticamente)
    const items = [];
    
    // Agregar items individuales para cada porcentaje de participación de las ventas
    if (commissionDetails.length > 0) {
      // Agregar un item por cada línea de comisión con su porcentaje
      commissionDetails.forEach(detail => {
        const itemName = detail.kind 
          ? `Participación ${detail.kind} (${detail.percent}%)`
          : `Participación técnico (${detail.percent}%)`;
        items.push({
          conceptId: null,
          name: itemName,
          type: 'earning',
          base: Math.round(detail.laborValue),
          value: Math.round(detail.share),
          calcRule: `laborPercent:${detail.percent}`,
          notes: `${detail.percent}% sobre ${Math.round(detail.laborValue).toLocaleString('es-CO')}`,
          // Guardar información de porcentaje para liquidación
          isPercent: true,
          percentValue: detail.percent,
          percentBaseType: 'total_gross',
          percentBaseConceptId: null,
          percentBaseFixedValue: 0
        });
      });
    } else if (commissionRounded > 0) {
      // Fallback: si no hay detalles pero hay comisión, agregar item genérico
      items.push({
        conceptId: null,
        name: 'Comisión por ventas',
        type: 'earning',
        base: 0,
        value: commissionRounded,
        calcRule: 'sales.laborCommissions',
        notes: commissionNotes
      });
    }
    
    // DESPUÉS agregar los conceptos seleccionados (excluyendo variables)
    const normalConcepts = selectedConcepts.filter(c => !c.isVariable);
    const conceptItems = computeSettlementItems({ 
      selectedConcepts: normalConcepts, 
      assignments, 
      technicianName: techNameUpper 
    });
    items.push(...conceptItems);
    
    // Calcular valores de porcentajes antes de aplicar concepto variable
    const tempGross = items.filter(i => i.type !== 'deduction').reduce((sum, i) => sum + (i.value || 0), 0);
    items.forEach(item => {
      if (item.isPercent && item.percentValue) {
        let baseAmount = 0;
        
        // Determinar la base según la configuración
        if (item.percentBaseType === 'fixed_value') {
          // Base es un valor fijo
          baseAmount = item.percentBaseFixedValue || 0;
        } else if (item.percentBaseType === 'specific_concept' && item.percentBaseConceptId) {
          // Base es un concepto específico (buscar el item con ese conceptId)
          const baseConceptItem = items.find(i => String(i.conceptId) === String(item.percentBaseConceptId));
          if (baseConceptItem) {
            baseAmount = baseConceptItem.value || 0;
          }
        } else {
          // Base es el total bruto (comportamiento por defecto)
          if (item.type === 'earning') {
            baseAmount = commissionRounded;
          } else {
            baseAmount = tempGross;
          }
        }
        
        item.value = Math.round((baseAmount * item.percentValue) / 100);
        item.base = baseAmount;
      }
    });
    
    // APLICAR CONCEPTO VARIABLE (antes de préstamos)
    // Calcular total SIN préstamos para verificar si necesita completar
    // IMPORTANTE: Incluir TODOS los descuentos, excluir SOLO préstamos (identificados por calcRule único)
    if (includeVariable && variableConcept && variableConcept.variableFixedAmount > 0) {
      // Filtrar items excluyendo préstamos (usando ID único LOAN_PAYMENT_DEDUCTION)
      // También excluir el concepto variable mismo si ya existe
      const itemsWithoutLoans = items.filter(item => {
        const calcRule = item.calcRule || '';
        // Excluir préstamos (usando ID único) y el concepto variable mismo
        return calcRule !== 'LOAN_PAYMENT_DEDUCTION' && 
               calcRule !== 'employee_loans' && 
               calcRule !== 'employee_loan' && 
               !calcRule.startsWith('variable:');
      });
      
      const tempTotals = calculateTotals(itemsWithoutLoans);
      const netBeforeVariable = tempTotals.netTotal;
      const fixedAmount = variableConcept.variableFixedAmount;
      
      // Si el neto (sin préstamos, pero CON todos los descuentos) es menor que el monto fijo, agregar diferencia como ingreso
      if (netBeforeVariable < fixedAmount) {
        const variableAmount = fixedAmount - netBeforeVariable;
        items.push({
          conceptId: variableConcept._id,
          name: variableConcept.name || 'Comisión ocasional',
          type: 'earning',
          base: netBeforeVariable,
          value: variableAmount,
          calcRule: `variable:${fixedAmount}`,
          notes: `Completa monto fijo de ${Math.round(fixedAmount).toLocaleString('es-CO')} (faltaban ${Math.round(variableAmount).toLocaleString('es-CO')})`
        });
        
        // NO recalcular porcentajes después de agregar el concepto variable
        // Los descuentos ya fueron calculados correctamente antes del concepto variable
        // El concepto variable completa el monto fijo, pero no debe afectar los descuentos ya calculados
      }
    }
    
    // AGREGAR PRÉSTAMOS PENDIENTES del empleado (solo si están seleccionados)
    const includeLoans = specialConcepts.includes('LOAN_PAYMENT');
    const { loanPayments = [] } = req.body;
    let loansInfo = []; // Inicializar loansInfo
    
    if (includeLoans) {
      const pendingLoans = await EmployeeLoan.find({
        companyId: req.companyId,
        technicianName: techNameUpper,
        status: { $in: ['pending', 'partially_paid'] }
      }).sort({ loanDate: 1 });
      
      if (pendingLoans.length > 0) {
        // Asegurar que el concepto PAGO_PRESTAMOS existe
        const loanConcept = await ensureLoanConcept(req.companyId);
        
        // Obtener monto total a pagar (desde configuración inicial o desde loanPayments)
        let totalLoanPayment = 0;
        if (loanPayments.length > 0 && loanPayments[0].totalAmount) {
          totalLoanPayment = Math.max(0, Number(loanPayments[0].totalAmount) || 0);
        } else {
          // Si no hay monto específico, usar el total pendiente
          totalLoanPayment = pendingLoans.reduce((sum, l) => sum + (l.amount - (l.paidAmount || 0)), 0);
        }
        
        // Construir información detallada de préstamos
        loansInfo = pendingLoans.map(loan => ({
          loanId: String(loan._id),
          amount: loan.amount,
          paidAmount: loan.paidAmount || 0,
          pending: loan.amount - (loan.paidAmount || 0),
          description: loan.description || '',
          loanDate: loan.loanDate
        }));
        
        if (totalLoanPayment > 0) {
          // Agregar como un solo item de préstamos (no individual)
          // Usar un ID único para identificar préstamos y excluirlos del cálculo del concepto variable
          items.push({
            conceptId: loanConcept._id,
            name: 'Pago préstamos',
            type: 'deduction',
            base: pendingLoans.reduce((sum, l) => sum + (l.amount - (l.paidAmount || 0)), 0),
            value: totalLoanPayment,
            calcRule: 'LOAN_PAYMENT_DEDUCTION', // ID único para préstamos
            notes: `${pendingLoans.length} préstamo(s) pendiente(s)`
          });
        }
      }
    }
    
    const { grossTotal, deductionsTotal, netTotal } = calculateTotals(items);
    
    res.json({
      periodId,
      technicianId,
      technicianName: techNameUpper,
      selectedConceptIds,
      assignedConceptIds, // Devolver también los conceptos asignados disponibles
      items,
      grossTotal,
      deductionsTotal,
      netTotal,
      loansInfo // Información detallada de préstamos para pagos parciales
    });
  } catch (err) {
    console.error('Error in previewSettlement:', err);
    res.status(500).json({ error: 'Error al previsualizar liquidación', message: err.message });
  }
};

export const approveSettlement = async (req, res) => {
  try {
    const { periodId, technicianId, technicianName, selectedConceptIds = [], loanPayments = [], commissionAmount = null } = req.body;
    // loanPayments: array de { technicianName, totalAmount } o { loanId, amount } con montos personalizados
    // commissionAmount: monto editado de comisiones (opcional)
    
    // Validaciones
    if (!periodId) {
      return res.status(400).json({ error: 'periodId requerido' });
    }
    if (!technicianName && !technicianId) {
      return res.status(400).json({ error: 'technicianId o technicianName requerido' });
    }
    
    // Usar la misma lógica que previewSettlement para calcular
    const period = await PayrollPeriod.findOne({ _id: periodId, companyId: req.companyId });
    if (!period) {
      return res.status(404).json({ error: 'Período no encontrado' });
    }
    
    const techNameUpper = technicianName ? String(technicianName).toUpperCase() : null;
    
    // Buscar asignaciones de conceptos para este técnico
    const assignmentFilter = { companyId: req.companyId, isActive: true };
    if (technicianId && technicianId.trim() !== '') {
      assignmentFilter.technicianId = technicianId;
    } else if (techNameUpper) {
      assignmentFilter.technicianName = techNameUpper;
    }
    
    const assignments = await TechnicianAssignment.find(assignmentFilter);
    const assignedConceptIds = assignments.map(a => a.conceptId);
    
    // Separar conceptos normales de conceptos especiales (COMMISSION, LOAN_PAYMENT)
    const specialConcepts = selectedConceptIds.filter(id => id === 'COMMISSION' || id === 'LOAN_PAYMENT');
    const normalConceptIds = selectedConceptIds.filter(id => id !== 'COMMISSION' && id !== 'LOAN_PAYMENT');
    
    // Buscar conceptos seleccionados que están asignados al técnico
    const validConceptIds = normalConceptIds.filter(id => assignedConceptIds.some(aid => String(aid) === String(id)));
    const selectedConcepts = await CompanyPayrollConcept.find({ 
      companyId: req.companyId, 
      _id: { $in: validConceptIds },
      isActive: true 
    });
    
    // Buscar concepto variable entre los conceptos seleccionados (si hay alguno marcado como variable)
    const includeVariable = selectedConcepts.some(c => c.isVariable);
    let variableConcept = null;
    if (includeVariable) {
      variableConcept = selectedConcepts.find(c => c.isVariable);
    }
    
    // Calcular comisión
    const sales = await Sale.find({
      companyId: req.companyId,
      status: 'closed',
      closedAt: { $gte: period.startDate, $lte: period.endDate },
      $or: [
        { 'laborCommissions.technician': techNameUpper },
        { 'laborCommissions.technicianName': techNameUpper },
        { closingTechnician: techNameUpper },
        { technician: techNameUpper }
      ]
    }).select({ laborCommissions: 1 });
    
    // Recolectar detalles de comisiones con porcentajes
    const commissionDetails = [];
    const commission = sales.reduce((acc, s) => {
      const fromBreakdown = (s.laborCommissions||[])
        .filter(lc => {
          const techMatch = String(lc.technician || lc.technicianName || '').toUpperCase();
          return techMatch === techNameUpper;
        });
      fromBreakdown.forEach(lc => {
        commissionDetails.push({
          kind: lc.kind || '',
          laborValue: Number(lc.laborValue || 0),
          percent: Number(lc.percent || 0),
          share: Number(lc.share || 0)
        });
      });
      return acc + fromBreakdown.reduce((a,b)=> a + (Number(b.share)||0), 0);
    }, 0);
    
    const commissionRounded = Math.round(commission * 100) / 100;
    
    // Construir notas con detalles de porcentajes
    let commissionNotes = '';
    if (commissionDetails.length > 0) {
      const details = commissionDetails.map(d => {
        if (d.kind) {
          return `${d.kind}: ${d.percent}% sobre ${Math.round(d.laborValue).toLocaleString('es-CO')} = ${Math.round(d.share).toLocaleString('es-CO')}`;
        }
        return `${d.percent}% sobre ${Math.round(d.laborValue).toLocaleString('es-CO')} = ${Math.round(d.share).toLocaleString('es-CO')}`;
      }).join('; ');
      commissionNotes = details;
    }
    
    // PRIMERO agregar las comisiones de ventas (solo si están seleccionadas)
    const items = [];
    const includeCommission = specialConcepts.includes('COMMISSION');
    
    if (includeCommission && commissionRounded > 0) {
      // Usar monto editado si existe, sino usar el calculado
      const finalCommissionAmount = commissionAmount !== undefined && commissionAmount !== null 
        ? Math.min(Number(commissionAmount) || 0, commissionRounded)
        : commissionRounded;
      
      if (commissionDetails.length > 0) {
        // Agregar un item por cada línea de comisión con su porcentaje
        // Distribuir el monto total proporcionalmente si fue editado
        const totalOriginal = commissionDetails.reduce((sum, d) => sum + d.share, 0);
        const ratio = totalOriginal > 0 ? finalCommissionAmount / totalOriginal : 1;
        
        commissionDetails.forEach(detail => {
          const itemName = detail.kind 
            ? `Participación ${detail.kind} (${detail.percent}%)`
            : `Participación técnico (${detail.percent}%)`;
          const adjustedValue = Math.round(detail.share * ratio);
          items.push({
            conceptId: null,
            name: itemName,
            type: 'earning',
            base: Math.round(detail.laborValue),
            value: adjustedValue,
            calcRule: `laborPercent:${detail.percent}`,
            notes: `${detail.percent}% sobre ${Math.round(detail.laborValue).toLocaleString('es-CO')}`,
            // Guardar información de porcentaje para liquidación
            isPercent: true,
            percentValue: detail.percent,
            percentBaseType: 'total_gross',
            percentBaseConceptId: null,
            percentBaseFixedValue: 0
          });
        });
      } else if (finalCommissionAmount > 0) {
        // Fallback: si no hay detalles pero hay comisión, agregar item genérico
        items.push({
        conceptId: null,
        name: 'Comisión por ventas',
        type: 'earning',
        base: 0,
          value: finalCommissionAmount,
        calcRule: 'sales.laborCommissions',
          notes: commissionNotes
        });
      }
    }
    
    // DESPUÉS agregar los conceptos seleccionados (excluyendo variables)
    const normalConcepts = selectedConcepts.filter(c => !c.isVariable);
    const conceptItems = computeSettlementItems({ 
      selectedConcepts: normalConcepts, 
      assignments, 
      technicianName: techNameUpper 
    });
    items.push(...conceptItems);
    
    // Calcular valores de porcentajes antes de aplicar concepto variable
    const tempGross = items.filter(i => i.type !== 'deduction').reduce((sum, i) => sum + (i.value || 0), 0);
    items.forEach(item => {
      if (item.isPercent && item.percentValue) {
        let baseAmount = 0;
        
        // Determinar la base según la configuración
        if (item.percentBaseType === 'fixed_value') {
          // Base es un valor fijo
          baseAmount = item.percentBaseFixedValue || 0;
        } else if (item.percentBaseType === 'specific_concept' && item.percentBaseConceptId) {
          // Base es un concepto específico (buscar el item con ese conceptId)
          const baseConceptItem = items.find(i => String(i.conceptId) === String(item.percentBaseConceptId));
          if (baseConceptItem) {
            baseAmount = baseConceptItem.value || 0;
          }
        } else {
          // Base es el total bruto (comportamiento por defecto)
          if (item.type === 'earning') {
            baseAmount = commissionRounded;
          } else {
            baseAmount = tempGross;
          }
        }
        
        item.value = Math.round((baseAmount * item.percentValue) / 100);
        item.base = baseAmount;
      }
    });
    
    // APLICAR CONCEPTO VARIABLE (antes de préstamos)
    // Calcular total SIN préstamos para verificar si necesita completar
    // IMPORTANTE: Incluir TODOS los descuentos, excluir SOLO préstamos (identificados por calcRule único)
    if (includeVariable && variableConcept && variableConcept.variableFixedAmount > 0) {
      // Filtrar items excluyendo préstamos (usando ID único LOAN_PAYMENT_DEDUCTION)
      // También excluir el concepto variable mismo si ya existe
      const itemsWithoutLoans = items.filter(item => {
        const calcRule = item.calcRule || '';
        // Excluir préstamos (usando ID único) y el concepto variable mismo
        return calcRule !== 'LOAN_PAYMENT_DEDUCTION' && 
               calcRule !== 'employee_loans' && 
               calcRule !== 'employee_loan' && 
               !calcRule.startsWith('variable:');
      });
      
      const tempTotals = calculateTotals(itemsWithoutLoans);
      const netBeforeVariable = tempTotals.netTotal;
      const fixedAmount = variableConcept.variableFixedAmount;
      
      // Si el neto (sin préstamos, pero CON todos los descuentos) es menor que el monto fijo, agregar diferencia como ingreso
      if (netBeforeVariable < fixedAmount) {
        const variableAmount = fixedAmount - netBeforeVariable;
        items.push({
          conceptId: variableConcept._id,
          name: variableConcept.name || 'Comisión ocasional',
          type: 'earning',
          base: netBeforeVariable,
          value: variableAmount,
          calcRule: `variable:${fixedAmount}`,
          notes: `Completa monto fijo de ${Math.round(fixedAmount).toLocaleString('es-CO')} (faltaban ${Math.round(variableAmount).toLocaleString('es-CO')})`
        });
      }
    }
    
    // AGREGAR PRÉSTAMOS PENDIENTES del empleado (solo si están seleccionados)
    const includeLoans = specialConcepts.includes('LOAN_PAYMENT');
    let loanUpdates = [];
    
    if (includeLoans) {
      const pendingLoans = await EmployeeLoan.find({
        companyId: req.companyId,
        technicianName: techNameUpper,
        status: { $in: ['pending', 'partially_paid'] }
      }).sort({ loanDate: 1 });
      
      if (pendingLoans.length > 0) {
        // Asegurar que el concepto PAGO_PRESTAMOS existe
        const loanConcept = await ensureLoanConcept(req.companyId);
        
        // Obtener monto total a pagar (desde configuración inicial)
        let totalLoanPayment = 0;
        if (loanPayments.length > 0 && loanPayments[0].totalAmount) {
          totalLoanPayment = Math.max(0, Number(loanPayments[0].totalAmount) || 0);
        } else {
          // Si no hay monto específico, usar el total pendiente
          totalLoanPayment = pendingLoans.reduce((sum, l) => sum + (l.amount - (l.paidAmount || 0)), 0);
        }
        
        if (totalLoanPayment > 0) {
          // Distribuir el monto total proporcionalmente entre los préstamos
          const totalPending = pendingLoans.reduce((sum, l) => sum + (l.amount - (l.paidAmount || 0)), 0);
          let remaining = Math.min(totalLoanPayment, totalPending);
          
          pendingLoans.forEach((loan, idx) => {
            if (remaining <= 0) return;
            const pending = loan.amount - (loan.paidAmount || 0);
            if (pending > 0) {
              const paymentAmount = idx === pendingLoans.length - 1 
                ? remaining // El último préstamo recibe el resto
                : Math.min(remaining, Math.round((totalLoanPayment * pending / totalPending)));
              
              if (paymentAmount > 0) {
                // Agregar item individual para este préstamo
                items.push({
                  conceptId: loanConcept._id,
                  name: `Préstamo ${loan.description ? `(${loan.description})` : ''} - ${new Date(loan.loanDate).toLocaleDateString('es-CO')}`,
                  type: 'deduction',
                  base: pending,
                  value: paymentAmount,
                  calcRule: 'LOAN_PAYMENT_DEDUCTION', // ID único para préstamos
                  loanId: String(loan._id),
                  notes: `Pago: ${paymentAmount.toLocaleString('es-CO')} de ${pending.toLocaleString('es-CO')} pendiente`
                });
                
                // Preparar actualización del préstamo
                const newPaidAmount = (loan.paidAmount || 0) + paymentAmount;
                const newStatus = newPaidAmount >= loan.amount ? 'paid' : 'partially_paid';
                
                loanUpdates.push({
                  loanId: loan._id,
                  paymentAmount,
                  newPaidAmount,
                  newStatus
                });
                
                remaining -= paymentAmount;
              }
            }
          });
        }
      }
    }
    
    // NO recalcular porcentajes después de agregar concepto variable
    // Los descuentos ya fueron calculados correctamente antes del concepto variable
    // El concepto variable completa el monto fijo, pero no debe afectar los descuentos ya calculados
    
    const { grossTotal, deductionsTotal, netTotal } = calculateTotals(items);
    
    // Guardar liquidación por técnico
    // Filtrar selectedConceptIds para solo incluir ObjectIds válidos (excluir 'COMMISSION', 'LOAN_PAYMENT')
    // Usar la variable validConceptIds que ya se filtró anteriormente (solo conceptos asignados válidos)
    const validConceptIdsForSave = (validConceptIds || []).filter(id => {
      // Verificar si es un ObjectId válido (manejar strings y ObjectIds)
      if (!id) return false;
      return mongoose.Types.ObjectId.isValid(String(id));
    });
    
    const updateFilter = { companyId: req.companyId, periodId };
    if (technicianId && technicianId.trim() !== '') {
      updateFilter.technicianId = technicianId;
    } else if (techNameUpper) {
      updateFilter.technicianName = techNameUpper;
    }
    
    const doc = await PayrollSettlement.findOneAndUpdate(
      updateFilter,
      { 
        selectedConceptIds: validConceptIdsForSave, // Solo ObjectIds válidos
        items,
        grossTotal,
        deductionsTotal,
        netTotal,
        technicianName: techNameUpper,
        technicianId: technicianId || null,
        status: 'approved',
        approvedBy: req.user?.id || null,
        approvedAt: new Date()
      },
      { new: true, upsert: true }
    );
    
    // Actualizar estado de préstamos si se pagaron (parcial o completo)
    if (loanUpdates.length > 0) {
      for (const update of loanUpdates) {
        await EmployeeLoan.findByIdAndUpdate(update.loanId, {
          paidAmount: update.newPaidAmount,
          status: update.newStatus,
          $addToSet: { settlementIds: doc._id }
        });
      }
    }
    
    res.json(doc);
  } catch (err) {
    console.error('Error in approveSettlement:', err);
    res.status(500).json({ error: 'Error al aprobar liquidación', message: err.message });
  }
};

export const paySettlement = async (req, res) => {
  try {
    // Soporte para pagos parciales: payments es un array de { accountId, amount, date?, notes? }
    // O formato legacy: { settlementId, accountId, date, notes } para un solo pago completo
    const { settlementId, accountId, date, notes, payments } = req.body;
    
    // Validaciones
    if (!settlementId) {
      return res.status(400).json({ error: 'settlementId requerido' });
    }
    
    const st = await PayrollSettlement.findOne({ _id: settlementId, companyId: req.companyId });
    if(!st) return res.status(404).json({ error: 'Liquidación no encontrada' });
    if(st.status === 'paid') return res.status(400).json({ error: 'Esta liquidación ya fue pagada completamente' });
    if(st.status !== 'approved' && st.status !== 'partially_paid') return res.status(400).json({ error: 'Solo se pueden pagar liquidaciones aprobadas' });

    const Account = (await import('../models/Account.js')).default;
    const netTotal = Math.abs(st.netTotal);
    const currentPaidAmount = st.paidAmount || 0;
    const remainingAmount = netTotal - currentPaidAmount;
    
    let paymentsToProcess = [];
    
    // Si viene payments (array de pagos parciales), usar ese formato
    if (Array.isArray(payments) && payments.length > 0) {
      paymentsToProcess = payments;
    } 
    // Si viene accountId (formato legacy), convertir a formato de pagos parciales
    else if (accountId) {
      const paymentAmount = remainingAmount; // Por defecto, pagar todo lo restante
      paymentsToProcess = [{ accountId, amount: paymentAmount, date, notes }];
    } else {
      return res.status(400).json({ error: 'Debes proporcionar accountId o payments' });
    }
    
    // Validar que la suma de los pagos no exceda el monto restante
    const totalPaymentAmount = paymentsToProcess.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
    if (totalPaymentAmount > remainingAmount) {
      const formatMoney = (val) => new Intl.NumberFormat('es-CO', { 
        style: 'currency', 
        currency: 'COP', 
        minimumFractionDigits: 0 
      }).format(val || 0);
      
      return res.status(400).json({ 
        error: 'Monto excedido', 
        message: `El total de los pagos (${formatMoney(totalPaymentAmount)}) excede el monto restante a pagar (${formatMoney(remainingAmount)})` 
      });
    }
    
    // Procesar cada pago
    const createdEntries = [];
    const paymentDate = date ? new Date(date) : new Date();
    // Rastrear balances por cuenta para pagos múltiples a la misma cuenta
    const accountBalances = new Map();
    
    for (const payment of paymentsToProcess) {
      const { accountId: payAccountId, amount: payAmount, date: payDate, notes: payNotes } = payment;
      
      if (!payAccountId) {
        return res.status(400).json({ error: 'accountId requerido en cada pago' });
      }
      
      const paymentAmount = Math.abs(Number(payAmount) || 0);
      if (paymentAmount <= 0) {
        continue; // Saltar pagos con monto 0
    }
    
    // Verificar que la cuenta existe
      const account = await Account.findOne({ _id: payAccountId, companyId: req.companyId });
    if (!account) {
        return res.status(404).json({ error: `Cuenta no encontrada: ${payAccountId}` });
      }
      
      // Calcular el balance actual de la cuenta
      // Si ya procesamos un pago a esta cuenta en este batch, usar el balance actualizado
      let currentBalance;
      if (accountBalances.has(payAccountId)) {
        // Usar el balance actualizado del pago anterior a esta cuenta
        currentBalance = accountBalances.get(payAccountId);
      } else {
        // Primera vez que procesamos esta cuenta, calcular balance desde la BD
        currentBalance = await computeBalance(payAccountId, req.companyId);
      }
      
      // Validar que haya balance suficiente
      if (currentBalance < paymentAmount) {
        const formatMoney = (val) => new Intl.NumberFormat('es-CO', { 
          style: 'currency', 
          currency: 'COP', 
          minimumFractionDigits: 0 
        }).format(val || 0);
        
        return res.status(400).json({ 
          error: 'Saldo insuficiente', 
          message: `La cuenta "${account.name}" no tiene saldo suficiente. Saldo disponible: ${formatMoney(currentBalance)}, Monto requerido: ${formatMoney(paymentAmount)}` 
        });
      }
      
      // Calcular el nuevo balance después del pago
      const newBalance = currentBalance - paymentAmount;
      
      // Actualizar el balance rastreado para esta cuenta
      accountBalances.set(payAccountId, newBalance);
      
      // Crear entrada de CashFlow para este pago parcial
    const entry = await CashFlowEntry.create({
      companyId: req.companyId,
        accountId: payAccountId,
        date: payDate ? new Date(payDate) : paymentDate,
      kind: 'OUT',
      source: 'MANUAL',
      sourceRef: settlementId,
        description: `Pago de nómina: ${st.technicianName || 'Sin nombre'}${paymentsToProcess.length > 1 ? ` (Pago parcial ${createdEntries.length + 1}/${paymentsToProcess.length})` : ''}`,
        amount: paymentAmount,
        balanceAfter: newBalance,
        notes: payNotes || notes || '',
      meta: { 
        type: 'PAYROLL', 
        technicianId: st.technicianId, 
        technicianName: st.technicianName,
          settlementId,
          paymentIndex: createdEntries.length + 1,
          totalPayments: paymentsToProcess.length
        }
      });
      
      createdEntries.push(entry);
    }
    
    // Actualizar liquidación con los nuevos pagos
    const newPaidAmount = currentPaidAmount + totalPaymentAmount;
    const isFullyPaid = newPaidAmount >= netTotal;
    
    // Actualizar arrays de cashflow IDs
    const existingCashflowIds = st.paidCashflowIds || [];
    const newCashflowIds = createdEntries.map(e => e._id);
    const allCashflowIds = [...existingCashflowIds, ...newCashflowIds];
    
    st.paidAmount = newPaidAmount;
    st.paidCashflowIds = allCashflowIds;
    st.status = isFullyPaid ? 'paid' : 'partially_paid';
    
    // Mantener compatibilidad: si es el primer pago y es completo, guardar en paidCashflowId
    if (createdEntries.length === 1 && isFullyPaid && !st.paidCashflowId) {
      st.paidCashflowId = createdEntries[0]._id;
    }
    
    await st.save();

    res.json({ 
      ok: true, 
      settlement: st, 
      cashflow: createdEntries.length === 1 ? createdEntries[0] : createdEntries,
      payments: createdEntries.map(e => ({ entryId: e._id, accountId: e.accountId, amount: e.amount })),
      totalPaid: newPaidAmount,
      remaining: netTotal - newPaidAmount,
      isFullyPaid
    });
  } catch (err) {
    res.status(500).json({ error: 'Error al procesar pago', message: err.message });
  }
};

export const listSettlements = async (req, res) => {
  try {
    const { periodId, technicianId, technicianName, status } = req.query;
    const filter = { companyId: req.companyId };
    if (periodId) filter.periodId = periodId;
    if (technicianId) filter.technicianId = technicianId;
    if (technicianName) filter.technicianName = String(technicianName).toUpperCase();
    if (status) filter.status = status;
    
    const items = await PayrollSettlement.find(filter).sort({ createdAt: -1 });
    
    // Agregar resumen simple
    const summary = items.reduce((acc, s) => {
      acc.grossTotal += (s.grossTotal || 0);
      acc.deductionsTotal += (s.deductionsTotal || 0);
      acc.netTotal += (s.netTotal || 0);
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
    
    // Separar items por tipo para facilitar el template
    const itemsByType = {
      earnings: (settlementObj.items || []).filter(i => i.type === 'earning'),
      deductions: (settlementObj.items || []).filter(i => i.type === 'deduction'),
      surcharges: (settlementObj.items || []).filter(i => i.type === 'surcharge')
    };
    
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
        itemsByType, // Agregar items agrupados por tipo
        formattedGrossTotal: new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(settlementObj.grossTotal || 0),
        formattedDeductionsTotal: new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(settlementObj.deductionsTotal || 0),
        formattedNetTotal: new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(settlementObj.netTotal || 0)
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
      // Fallback HTML simple con mejor formato
      const formatMoney = (val) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(val || 0);
      const earningsRows = itemsByType.earnings.map(i => `<tr><td>${i.name}</td><td style="text-align:right">${formatMoney(i.value)}</td></tr>`).join('');
      const deductionsRows = itemsByType.deductions.map(i => `<tr><td>${i.name}</td><td style="text-align:right">${formatMoney(i.value)}</td></tr>`).join('');
      const surchargesRows = itemsByType.surcharges.map(i => `<tr><td>${i.name}</td><td style="text-align:right">${formatMoney(i.value)}</td></tr>`).join('');
      const periodRange = periodObj ? `${new Date(periodObj.startDate).toLocaleDateString('es-CO')} → ${new Date(periodObj.endDate).toLocaleDateString('es-CO')}` : '';
      
      html = `
        <div style="max-width:800px;margin:0 auto;padding:20px;font-family:Arial,sans-serif;">
          <h2 style="text-align:center;margin-bottom:20px;">Comprobante de Pago de Nómina</h2>
          <div style="margin-bottom:20px;">
            <div><strong>Empresa:</strong> ${context.company.name}</div>
            <div><strong>Técnico:</strong> ${settlementObj.technicianName||''}</div>
            ${periodRange ? `<div><strong>Período:</strong> ${periodRange}</div>` : ''}
            <div><strong>Fecha de liquidación:</strong> ${context.formattedNow}</div>
          </div>
          ${earningsRows ? `
            <h3 style="margin-top:20px;margin-bottom:10px;">Ingresos</h3>
            <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
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
          ${surchargesRows ? `
            <h3 style="margin-top:20px;margin-bottom:10px;">Recargos</h3>
            <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
              <thead>
                <tr style="background:#f0f0f0;">
                  <th style="text-align:left;padding:8px;border-bottom:2px solid #ddd;">Concepto</th>
                  <th style="text-align:right;padding:8px;border-bottom:2px solid #ddd;">Valor</th>
                </tr>
              </thead>
              <tbody>
                ${surchargesRows}
              </tbody>
            </table>
          ` : ''}
          ${deductionsRows ? `
            <h3 style="margin-top:20px;margin-bottom:10px;">Descuentos</h3>
            <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
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
          <div style="margin-top:30px;padding-top:20px;border-top:2px solid #333;">
            <div style="display:flex;justify-content:space-between;margin-bottom:8px;">
              <strong>Total bruto:</strong>
              <strong>${formatMoney(settlementObj.grossTotal)}</strong>
            </div>
            <div style="display:flex;justify-content:space-between;margin-bottom:8px;">
              <strong>Total descuentos:</strong>
              <strong>${formatMoney(settlementObj.deductionsTotal)}</strong>
            </div>
            <div style="display:flex;justify-content:space-between;padding-top:10px;border-top:1px solid #ddd;font-size:18px;">
              <strong>Neto a pagar:</strong>
              <strong style="color:#10b981;">${formatMoney(settlementObj.netTotal)}</strong>
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
  try {
    const { id } = req.params;
    const st = await PayrollSettlement.findOne({ _id: id, companyId: req.companyId }).populate('periodId');
    if(!st) return res.status(404).json({ error: 'Settlement not found' });
    
    // Reutilizar la misma lógica de printSettlementHtml para obtener HTML
    const [tpl, company, period] = await Promise.all([
      Template.findOne({ companyId: req.companyId, type: 'payroll', active: true }).sort({ updatedAt: -1 }),
      Company.findOne({ _id: req.companyId }),
      PayrollPeriod.findOne({ _id: st.periodId, companyId: req.companyId })
    ]);
    
    const settlementObj = st.toObject();
    const periodObj = period ? period.toObject() : null;
    
    const itemsByType = {
      earnings: (settlementObj.items || []).filter(i => i.type === 'earning'),
      deductions: (settlementObj.items || []).filter(i => i.type === 'deduction'),
      surcharges: (settlementObj.items || []).filter(i => i.type === 'surcharge')
    };
    
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
        itemsByType,
        formattedGrossTotal: new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(settlementObj.grossTotal || 0),
        formattedDeductionsTotal: new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(settlementObj.deductionsTotal || 0),
        formattedNetTotal: new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(settlementObj.netTotal || 0)
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
        // Fallback si hay error en template
      }
    }
    
    // Si no hay template o hubo error, usar fallback
    if (!html) {
      const formatMoney = (val) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(val || 0);
      const earningsRows = itemsByType.earnings.map(i => `<tr><td>${i.name}</td><td style="text-align:right">${formatMoney(i.value)}</td></tr>`).join('');
      const deductionsRows = itemsByType.deductions.map(i => `<tr><td>${i.name}</td><td style="text-align:right">${formatMoney(i.value)}</td></tr>`).join('');
      const surchargesRows = itemsByType.surcharges.map(i => `<tr><td>${i.name}</td><td style="text-align:right">${formatMoney(i.value)}</td></tr>`).join('');
      const periodRange = periodObj ? `${new Date(periodObj.startDate).toLocaleDateString('es-CO')} → ${new Date(periodObj.endDate).toLocaleDateString('es-CO')}` : '';
      
      html = `
        <div style="max-width:800px;margin:0 auto;padding:20px;font-family:Arial,sans-serif;">
          <h2 style="text-align:center;margin-bottom:20px;">Comprobante de Pago de Nómina</h2>
          <div style="margin-bottom:20px;">
            <div><strong>Empresa:</strong> ${context.company.name}</div>
            <div><strong>Técnico:</strong> ${settlementObj.technicianName||''}</div>
            ${periodRange ? `<div><strong>Período:</strong> ${periodRange}</div>` : ''}
            <div><strong>Fecha de liquidación:</strong> ${context.formattedNow}</div>
          </div>
          ${earningsRows ? `
            <h3 style="margin-top:20px;margin-bottom:10px;">Ingresos</h3>
            <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
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
          ${surchargesRows ? `
            <h3 style="margin-top:20px;margin-bottom:10px;">Recargos</h3>
            <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
              <thead>
                <tr style="background:#f0f0f0;">
                  <th style="text-align:left;padding:8px;border-bottom:2px solid #ddd;">Concepto</th>
                  <th style="text-align:right;padding:8px;border-bottom:2px solid #ddd;">Valor</th>
                </tr>
              </thead>
              <tbody>
                ${surchargesRows}
              </tbody>
            </table>
          ` : ''}
          ${deductionsRows ? `
            <h3 style="margin-top:20px;margin-bottom:10px;">Descuentos</h3>
            <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
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
          <div style="margin-top:30px;padding-top:20px;border-top:2px solid #333;">
            <div style="display:flex;justify-content:space-between;margin-bottom:8px;">
              <strong>Total bruto:</strong>
              <strong>${formatMoney(settlementObj.grossTotal)}</strong>
            </div>
            <div style="display:flex;justify-content:space-between;margin-bottom:8px;">
              <strong>Total descuentos:</strong>
              <strong>${formatMoney(settlementObj.deductionsTotal)}</strong>
            </div>
            <div style="display:flex;justify-content:space-between;padding-top:10px;border-top:1px solid #ddd;font-size:18px;">
              <strong>Neto a pagar:</strong>
              <strong style="color:#10b981;">${formatMoney(settlementObj.netTotal)}</strong>
            </div>
          </div>
        </div>`;
      css = `table td{border-bottom:1px solid #ddd;padding:8px}`;
    }
    
    // Generar PDF usando PDFKit con HTML renderizado
    // Por ahora, redirigir al HTML print con parámetro para descarga PDF
    // TODO: Implementar conversión HTML a PDF con puppeteer si es necesario
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="comprobante_nomina_${String(st._id)}.pdf"`);
    
    // Por ahora usar PDFKit básico mejorado
    const doc = new PDFDocument({ size: 'A4', margin: 36 });
    doc.pipe(res);
    
    // Título
    doc.fontSize(18).font('Helvetica-Bold').text('COMPROBANTE DE PAGO DE NÓMINA', { align: 'center' });
    doc.moveDown(1);
    
    // Información de empresa y técnico
    doc.fontSize(10).font('Helvetica');
    doc.text(`Empresa: ${context.company.name}`, { align: 'left' });
    doc.text(`Técnico: ${settlementObj.technicianName||''}`, { align: 'left' });
    if (periodObj) {
      doc.text(`Período: ${context.period.formattedStartDate} → ${context.period.formattedEndDate}`, { align: 'left' });
    }
    doc.text(`Fecha de liquidación: ${context.formattedNow}`, { align: 'left' });
    doc.moveDown(1);
    
    // Items
    if (itemsByType.earnings.length > 0) {
      doc.fontSize(12).font('Helvetica-Bold').text('INGRESOS', { underline: true });
      doc.moveDown(0.3);
      doc.fontSize(10).font('Helvetica');
      itemsByType.earnings.forEach(i => {
        doc.text(`${i.name.padEnd(40)} ${new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(i.value)}`, { align: 'left' });
      });
      doc.moveDown(0.5);
    }
    
    if (itemsByType.surcharges.length > 0) {
      doc.fontSize(12).font('Helvetica-Bold').text('RECARGOS', { underline: true });
      doc.moveDown(0.3);
      doc.fontSize(10).font('Helvetica');
      itemsByType.surcharges.forEach(i => {
        doc.text(`${i.name.padEnd(40)} ${new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(i.value)}`, { align: 'left' });
      });
      doc.moveDown(0.5);
    }
    
    if (itemsByType.deductions.length > 0) {
      doc.fontSize(12).font('Helvetica-Bold').text('DESCUENTOS', { underline: true });
      doc.moveDown(0.3);
      doc.fontSize(10).font('Helvetica');
      itemsByType.deductions.forEach(i => {
        doc.text(`${i.name.padEnd(40)} ${new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(i.value)}`, { align: 'left' });
      });
      doc.moveDown(1);
    }
    
    // Totales
    doc.moveDown(0.5);
    doc.fontSize(11).font('Helvetica');
    doc.text(`Total bruto: ${context.settlement.formattedGrossTotal}`, { align: 'right' });
    doc.text(`Total descuentos: ${context.settlement.formattedDeductionsTotal}`, { align: 'right' });
    doc.moveDown(0.3);
    doc.fontSize(14).font('Helvetica-Bold');
    doc.text(`Neto a pagar: ${context.settlement.formattedNetTotal}`, { align: 'right' });
    
    doc.end();
  } catch (err) {
    console.error('Error in generateSettlementPdf:', err);
    res.status(500).json({ error: 'Error al generar PDF', message: err.message });
  }
};


