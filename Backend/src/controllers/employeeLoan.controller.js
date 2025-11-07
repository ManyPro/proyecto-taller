import EmployeeLoan from '../models/EmployeeLoan.js';
import CashFlowEntry from '../models/CashFlowEntry.js';
import Account from '../models/Account.js';
import { computeBalance } from './cashflow.controller.js';

// Crear préstamo y registrar salida en caja
export const createLoan = async (req, res) => {
  try {
    const { technicianId, technicianName, amount, description, loanDate, accountId, notes } = req.body;

    // Validaciones
    if (!technicianName || !technicianName.trim()) {
      return res.status(400).json({ error: 'El nombre del técnico es requerido' });
    }
    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'El monto debe ser mayor a 0' });
    }
    if (!accountId) {
      return res.status(400).json({ error: 'La cuenta es requerida' });
    }

    // Verificar que la cuenta existe y pertenece a la empresa
    const account = await Account.findOne({ _id: accountId, companyId: req.companyId });
    if (!account) {
      return res.status(404).json({ error: 'Cuenta no encontrada' });
    }

    const loanAmount = Math.round(Number(amount));
    const date = loanDate ? new Date(loanDate) : new Date();

    // Crear la salida en caja
    const prevBal = await computeBalance(account._id, req.companyId);
    const newBal = prevBal - loanAmount;

    const cashFlowEntry = await CashFlowEntry.create({
      companyId: req.companyId,
      accountId: account._id,
      kind: 'OUT',
      amount: loanAmount,
      description: `Préstamo a ${technicianName.trim()}${description ? ': ' + description : ''}`,
      source: 'MANUAL',
      date: date,
      balanceAfter: newBal,
      meta: { type: 'employee_loan', technicianName: technicianName.trim() }
    });

    // Crear el préstamo
    const loan = await EmployeeLoan.create({
      companyId: req.companyId,
      technicianId: technicianId || null,
      technicianName: technicianName.trim().toUpperCase(),
      amount: loanAmount,
      description: description || '',
      loanDate: date,
      accountId: account._id,
      cashFlowEntryId: cashFlowEntry._id,
      status: 'pending',
      paidAmount: 0,
      notes: notes || ''
    });

    res.status(201).json(loan);
  } catch (err) {
    console.error('Error creating loan:', err);
    res.status(500).json({ error: 'Error al crear préstamo', message: err.message });
  }
};

// Listar préstamos
export const listLoans = async (req, res) => {
  try {
    const { technicianName, status, page = 1, limit = 50 } = req.query;
    const query = { companyId: req.companyId };

    if (technicianName) {
      query.technicianName = { $regex: technicianName.trim().toUpperCase(), $options: 'i' };
    }
    if (status) {
      query.status = status;
    }

    const skip = (Number(page) - 1) * Number(limit);
    const loans = await EmployeeLoan.find(query)
      .sort({ loanDate: -1, createdAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .lean();

    const total = await EmployeeLoan.countDocuments(query);

    res.json({
      items: loans,
      page: Number(page),
      limit: Number(limit),
      total
    });
  } catch (err) {
    console.error('Error listing loans:', err);
    res.status(500).json({ error: 'Error al listar préstamos', message: err.message });
  }
};

// Obtener préstamos pendientes de un técnico
export const getPendingLoans = async (req, res) => {
  try {
    const { technicianName } = req.query;
    
    if (!technicianName) {
      return res.status(400).json({ error: 'El nombre del técnico es requerido' });
    }

    const loans = await EmployeeLoan.find({
      companyId: req.companyId,
      technicianName: technicianName.trim().toUpperCase(),
      status: { $in: ['pending', 'partially_paid'] }
    })
      .sort({ loanDate: 1 })
      .lean();

    res.json({ loans });
  } catch (err) {
    console.error('Error getting pending loans:', err);
    res.status(500).json({ error: 'Error al obtener préstamos pendientes', message: err.message });
  }
};

// Actualizar préstamo
export const updateLoan = async (req, res) => {
  try {
    const { id } = req.params;
    const { description, notes, status } = req.body;

    const loan = await EmployeeLoan.findOne({ _id: id, companyId: req.companyId });
    if (!loan) {
      return res.status(404).json({ error: 'Préstamo no encontrado' });
    }

    const update = {};
    if (description !== undefined) update.description = description;
    if (notes !== undefined) update.notes = notes;
    if (status && ['pending', 'partially_paid', 'paid', 'cancelled'].includes(status)) {
      update.status = status;
    }

    const updated = await EmployeeLoan.findByIdAndUpdate(id, update, { new: true });
    res.json(updated);
  } catch (err) {
    console.error('Error updating loan:', err);
    res.status(500).json({ error: 'Error al actualizar préstamo', message: err.message });
  }
};

// Eliminar préstamo (solo si está pendiente y no tiene liquidaciones asociadas)
export const deleteLoan = async (req, res) => {
  try {
    const { id } = req.params;

    const loan = await EmployeeLoan.findOne({ _id: id, companyId: req.companyId });
    if (!loan) {
      return res.status(404).json({ error: 'Préstamo no encontrado' });
    }

    // Solo se puede eliminar si está pendiente y no tiene liquidaciones
    if (loan.status !== 'pending' || (loan.settlementIds && loan.settlementIds.length > 0)) {
      return res.status(400).json({ 
        error: 'No se puede eliminar un préstamo que ya tiene pagos registrados' 
      });
    }

    // Eliminar la entrada de flujo de caja asociada
    if (loan.cashFlowEntryId) {
      await CashFlowEntry.findByIdAndDelete(loan.cashFlowEntryId);
    }

    await EmployeeLoan.findByIdAndDelete(id);
    res.json({ ok: true });
  } catch (err) {
    console.error('Error deleting loan:', err);
    res.status(500).json({ error: 'Error al eliminar préstamo', message: err.message });
  }
};

