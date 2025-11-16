import AccountReceivable from '../models/AccountReceivable.js';
import CompanyAccount from '../models/CompanyAccount.js';
import ClientCompanyLink from '../models/ClientCompanyLink.js';
import Sale from '../models/Sale.js';
import CashFlowEntry from '../models/CashFlowEntry.js';
import Account from '../models/Account.js';
import { computeBalance, ensureDefaultCashAccount } from './cashflow.controller.js';
import mongoose from 'mongoose';
import { createDateRange } from '../lib/dateTime.js';

// ===== Empresas de Cartera =====

export const listCompanyAccounts = async (req, res) => {
  const companyId = req.companyId || req.company?.id;
  if (!companyId) return res.status(400).json({ error: 'Falta companyId' });

  const { active } = req.query || {};
  const query = { companyId: String(companyId) };
  if (active !== undefined) {
    query.active = String(active).toLowerCase() === 'true';
  }

  const accounts = await CompanyAccount.find(query).sort({ name: 1 }).lean();
  res.json(accounts);
};

export const getCompanyAccount = async (req, res) => {
  const companyId = req.companyId || req.company?.id;
  if (!companyId) return res.status(400).json({ error: 'Falta companyId' });

  const { id } = req.params;
  const account = await CompanyAccount.findOne({
    _id: id,
    companyId: String(companyId)
  }).lean();

  if (!account) return res.status(404).json({ error: 'Empresa no encontrada' });
  res.json(account);
};

export const createCompanyAccount = async (req, res) => {
  const companyId = req.companyId || req.company?.id;
  if (!companyId) return res.status(400).json({ error: 'Falta companyId' });

  const { name, description, contact, plates, notes, type } = req.body || {};

  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'El nombre es requerido' });
  }

  // Validar tipo
  const accountType = type === 'particular' ? 'particular' : 'recurrente';

  // Normalizar placas (solo para empresas recurrentes)
  const normalizedPlates = (accountType === 'recurrente' && Array.isArray(plates))
    ? plates.map(p => String(p).trim().toUpperCase()).filter(p => p)
    : [];

  const account = await CompanyAccount.create({
    companyId: String(companyId),
    name: String(name).trim(),
    description: String(description || '').trim(),
    contact: {
      name: String(contact?.name || '').trim(),
      phone: String(contact?.phone || '').trim(),
      email: String(contact?.email || '').trim(),
      address: String(contact?.address || '').trim()
    },
    type: accountType,
    plates: normalizedPlates,
    notes: String(notes || '').trim(),
    active: true
  });

  res.status(201).json(account.toObject());
};

export const updateCompanyAccount = async (req, res) => {
  const companyId = req.companyId || req.company?.id;
  if (!companyId) return res.status(400).json({ error: 'Falta companyId' });

  const { id } = req.params;
  const { name, description, contact, plates, active, notes, type } = req.body || {};

  const account = await CompanyAccount.findOne({
    _id: id,
    companyId: String(companyId)
  });

  if (!account) return res.status(404).json({ error: 'Empresa no encontrada' });

  if (name !== undefined) account.name = String(name).trim();
  if (description !== undefined) account.description = String(description || '').trim();
  if (contact !== undefined) {
    account.contact = {
      name: String(contact?.name || '').trim(),
      phone: String(contact?.phone || '').trim(),
      email: String(contact?.email || '').trim(),
      address: String(contact?.address || '').trim()
    };
  }
  if (type !== undefined) {
    const accountType = type === 'particular' ? 'particular' : 'recurrente';
    account.type = accountType;
    // Si cambia a particular, limpiar placas manuales
    if (accountType === 'particular') {
      account.plates = [];
    }
  }
  if (plates !== undefined) {
    // Solo permitir placas si es recurrente
    if (account.type === 'recurrente') {
      account.plates = Array.isArray(plates)
        ? plates.map(p => String(p).trim().toUpperCase()).filter(p => p)
        : [];
    } else {
      account.plates = [];
    }
  }
  if (active !== undefined) account.active = String(active).toLowerCase() === 'true';
  if (notes !== undefined) account.notes = String(notes || '').trim();

  await account.save();
  res.json(account.toObject());
};

export const deleteCompanyAccount = async (req, res) => {
  const companyId = req.companyId || req.company?.id;
  if (!companyId) return res.status(400).json({ error: 'Falta companyId' });

  const { id } = req.params;

  // Verificar si hay cuentas por cobrar asociadas
  const hasReceivables = await AccountReceivable.countDocuments({
    companyId: String(companyId),
    companyAccountId: id,
    status: { $in: ['pending', 'partial'] }
  });

  if (hasReceivables > 0) {
    return res.status(400).json({
      error: 'No se puede eliminar la empresa porque tiene cuentas por cobrar pendientes'
    });
  }

  await CompanyAccount.deleteOne({
    _id: id,
    companyId: String(companyId)
  });

  res.json({ ok: true });
};

// ===== Cuentas por Cobrar =====

export const listReceivables = async (req, res) => {
  const companyId = req.companyId || req.company?.id;
  if (!companyId) return res.status(400).json({ error: 'Falta companyId' });

  const {
    status,
    plate,
    companyAccountId,
    customerIdNumber,
    from,
    to,
    limit = 1000
  } = req.query || {};

  const query = { companyId: String(companyId) };

  if (status) {
    query.status = String(status);
  }

  if (plate) {
    query['vehicle.plate'] = String(plate).trim().toUpperCase();
  }

  if (companyAccountId) {
    query.companyAccountId = new mongoose.Types.ObjectId(companyAccountId);
  }

  if (customerIdNumber) {
    query['customer.idNumber'] = String(customerIdNumber).trim();
  }

  // Filtro de fechas
  if (from || to) {
    const dateRange = createDateRange(from, to);
    query.createdAt = {};
    if (dateRange.from) {
      query.createdAt.$gte = dateRange.from;
    }
    if (dateRange.to) {
      query.createdAt.$lte = dateRange.to;
    }
  }

  const lim = Math.max(1, Math.min(5000, Number(limit)));

  const receivables = await AccountReceivable.find(query)
    .populate('saleId', 'number total')
    .populate('companyAccountId', 'name')
    .sort({ createdAt: -1 })
    .limit(lim)
    .lean();

  res.json(receivables);
};

export const getReceivable = async (req, res) => {
  const companyId = req.companyId || req.company?.id;
  if (!companyId) return res.status(400).json({ error: 'Falta companyId' });

  const { id } = req.params;

  const receivable = await AccountReceivable.findOne({
    _id: id,
    companyId: String(companyId)
  })
    .populate('saleId', 'number total items')
    .populate('companyAccountId', 'name contact')
    .lean();

  if (!receivable) return res.status(404).json({ error: 'Cuenta por cobrar no encontrada' });
  res.json(receivable);
};

export const createReceivable = async (req, res) => {
  const companyId = req.companyId || req.company?.id;
  if (!companyId) return res.status(400).json({ error: 'Falta companyId' });

  const {
    saleId,
    customer,
    vehicle,
    companyAccountId,
    totalAmount,
    dueDate,
    notes
  } = req.body || {};

  if (!saleId) {
    return res.status(400).json({ error: 'saleId es requerido' });
  }

  if (!totalAmount || Number(totalAmount) <= 0) {
    return res.status(400).json({ error: 'totalAmount debe ser mayor a 0' });
  }

  // Verificar que la venta existe
  const sale = await Sale.findOne({
    _id: saleId,
    companyId: String(companyId)
  });

  if (!sale) {
    return res.status(404).json({ error: 'Venta no encontrada' });
  }

  // Verificar que no existe ya una cuenta por cobrar para esta venta
  const existing = await AccountReceivable.findOne({
    companyId: String(companyId),
    saleId: sale._id
  });

  if (existing) {
    return res.status(400).json({ error: 'Ya existe una cuenta por cobrar para esta venta' });
  }

  // Si hay placa, buscar empresa asociada automáticamente
  let finalCompanyAccountId = companyAccountId || null;
  if (vehicle?.plate && !finalCompanyAccountId) {
    const companyAccount = await CompanyAccount.findOne({
      companyId: String(companyId),
      active: true,
      plates: String(vehicle.plate).trim().toUpperCase()
    });
    if (companyAccount) {
      finalCompanyAccountId = companyAccount._id;
    }
  }

  const receivable = await AccountReceivable.create({
    companyId: String(companyId),
    saleId: sale._id,
    saleNumber: String(sale.number || '').padStart(5, '0'),
    customer: customer || sale.customer || {},
    vehicle: vehicle || sale.vehicle || {},
    companyAccountId: finalCompanyAccountId,
    totalAmount: Number(totalAmount),
    paidAmount: 0,
    balance: Number(totalAmount),
    status: 'pending',
    dueDate: dueDate ? new Date(dueDate) : null,
    notes: String(notes || '').trim(),
    source: 'sale'
  });

  const populated = await AccountReceivable.findById(receivable._id)
    .populate('saleId', 'number total')
    .populate('companyAccountId', 'name')
    .lean();

  res.status(201).json(populated);
};

export const addPayment = async (req, res) => {
  const companyId = req.companyId || req.company?.id;
  if (!companyId) return res.status(400).json({ error: 'Falta companyId' });

  const { id } = req.params;
  const { amount, paymentMethod, notes } = req.body || {};

  if (!amount || Number(amount) <= 0) {
    return res.status(400).json({ error: 'El monto debe ser mayor a 0' });
  }

  const receivable = await AccountReceivable.findOne({
    _id: id,
    companyId: String(companyId)
  });

  if (!receivable) {
    return res.status(404).json({ error: 'Cuenta por cobrar no encontrada' });
  }

  if (receivable.status === 'paid') {
    return res.status(400).json({ error: 'Esta cuenta ya está pagada completamente' });
  }

  if (receivable.status === 'cancelled') {
    return res.status(400).json({ error: 'Esta cuenta está cancelada' });
  }

  const paymentAmount = Number(amount);
  const newPaidAmount = receivable.paidAmount + paymentAmount;

  // No permitir pagar más del total
  if (newPaidAmount > receivable.totalAmount) {
    return res.status(400).json({
      error: `El monto excede el saldo pendiente. Saldo pendiente: $${receivable.balance.toLocaleString()}`
    });
  }

  // Usar la fecha del pago (puede venir del frontend o usar la actual)
  // Si viene del frontend, usar esa fecha; si no, usar la actual pero guardarla para consistencia
  const paymentDate = req.body?.paymentDate ? new Date(req.body.paymentDate) : new Date();

  // Agregar pago al historial
  receivable.payments.push({
    amount: paymentAmount,
    paymentDate: paymentDate,
    paymentMethod: String(paymentMethod || '').trim(),
    notes: String(notes || '').trim(),
    createdBy: req.user?.name || req.user?.email || ''
  });

  receivable.paidAmount = newPaidAmount;
  receivable.balance = receivable.totalAmount - newPaidAmount;

  // Actualizar estado
  if (receivable.balance <= 0) {
    receivable.status = 'paid';
    receivable.paidAt = paymentDate;
  } else {
    receivable.status = 'partial';
  }

  await receivable.save();

  // Registrar el pago en el flujo de caja
  // Obtener la cuenta por defecto o la especificada
  const { accountId } = req.body || {};
  let cashAccountId = accountId;
  if (!cashAccountId) {
    const defaultAccount = await ensureDefaultCashAccount(companyId);
    cashAccountId = defaultAccount._id;
  }

  // Verificar que la cuenta existe
  const cashAccount = await Account.findOne({ _id: cashAccountId, companyId: String(companyId) });
  if (!cashAccount) {
    return res.status(400).json({ error: 'Cuenta de flujo de caja no encontrada' });
  }

  // Calcular balance actual de la cuenta
  const currentBalance = await computeBalance(cashAccountId, companyId);
  const newBalance = currentBalance + paymentAmount;

  // Crear entrada en flujo de caja
  const cashFlowEntry = await CashFlowEntry.create({
    companyId: String(companyId),
    accountId: cashAccountId,
    kind: 'IN',
    source: 'RECEIVABLE',
    sourceRef: receivable._id,
    description: `Pago de cartera: Venta #${receivable.saleNumber || 'N/A'} (${String(paymentMethod || '').trim() || 'Pago'})`,
    amount: paymentAmount,
    balanceAfter: newBalance,
    date: paymentDate, // Usar la misma fecha del pago, no la hora actual del servidor
    meta: {
      receivableId: receivable._id.toString(),
      saleNumber: receivable.saleNumber,
      paymentMethod: String(paymentMethod || '').trim(),
      plate: receivable.vehicle?.plate || ''
    }
  });

  const populated = await AccountReceivable.findById(receivable._id)
    .populate('saleId', 'number total')
    .populate('companyAccountId', 'name')
    .lean();

  res.json(populated);
};

export const cancelReceivable = async (req, res) => {
  const companyId = req.companyId || req.company?.id;
  if (!companyId) return res.status(400).json({ error: 'Falta companyId' });

  const { id } = req.params;
  const { notes } = req.body || {};

  const receivable = await AccountReceivable.findOne({
    _id: id,
    companyId: String(companyId)
  });

  if (!receivable) {
    return res.status(404).json({ error: 'Cuenta por cobrar no encontrada' });
  }

  if (receivable.status === 'paid') {
    return res.status(400).json({ error: 'No se puede cancelar una cuenta ya pagada' });
  }

  receivable.status = 'cancelled';
  if (notes) {
    receivable.notes = String(notes).trim();
  }

  await receivable.save();

  res.json(receivable.toObject());
};

export const getReceivablesStats = async (req, res) => {
  const companyId = req.companyId || req.company?.id;
  if (!companyId) return res.status(400).json({ error: 'Falta companyId' });

  const { companyAccountId } = req.query || {};

  const query = { companyId: String(companyId) };
  if (companyAccountId) {
    query.companyAccountId = new mongoose.Types.ObjectId(companyAccountId);
  }

  const [total, pending, partial, paid, cancelled] = await Promise.all([
    AccountReceivable.countDocuments(query),
    AccountReceivable.countDocuments({ ...query, status: 'pending' }),
    AccountReceivable.countDocuments({ ...query, status: 'partial' }),
    AccountReceivable.countDocuments({ ...query, status: 'paid' }),
    AccountReceivable.countDocuments({ ...query, status: 'cancelled' })
  ]);

  const receivables = await AccountReceivable.find({
    ...query,
    status: { $in: ['pending', 'partial'] }
  }).lean();

  const totalAmount = receivables.reduce((sum, r) => sum + (r.totalAmount || 0), 0);
  const paidAmount = receivables.reduce((sum, r) => sum + (r.paidAmount || 0), 0);
  const balance = totalAmount - paidAmount;

  res.json({
    total,
    pending,
    partial,
    paid,
    cancelled,
    totalAmount,
    paidAmount,
    balance
  });
};

// ===== Links Cliente-Empresa =====

// Crear link entre cliente/placa y empresa
export const createClientCompanyLink = async (req, res) => {
  const companyId = req.companyId || req.company?.id;
  if (!companyId) return res.status(400).json({ error: 'Falta companyId' });

  const { companyAccountId, plate, customerIdNumber, customerName, customerPhone, saleId, notes } = req.body || {};

  if (!companyAccountId || !plate) {
    return res.status(400).json({ error: 'companyAccountId y plate son requeridos' });
  }

  // Verificar que la empresa existe
  const companyAccount = await CompanyAccount.findOne({
    _id: companyAccountId,
    companyId: String(companyId)
  });

  if (!companyAccount) {
    return res.status(404).json({ error: 'Empresa no encontrada' });
  }

  // Determinar tipo de link según tipo de empresa
  const linkType = companyAccount.type === 'recurrente' ? 'permanent' : 'temporary';
  const normalizedPlate = String(plate).trim().toUpperCase();

  // Para empresas recurrentes, verificar si ya existe un link activo permanente
  if (linkType === 'permanent') {
    const existingLink = await ClientCompanyLink.findOne({
      companyId: String(companyId),
      plate: normalizedPlate,
      active: true,
      linkType: 'permanent'
    });

    if (existingLink) {
      // Si ya existe un link permanente para esta placa, no permitir crear otro
      return res.status(400).json({ 
        error: 'Esta placa ya está vinculada a otra empresa recurrente. Debes desvincularla primero.' 
      });
    }
    
    // Desactivar cualquier link temporal previo si existe
    await ClientCompanyLink.updateMany(
      {
        companyId: String(companyId),
        plate: normalizedPlate,
        active: true,
        linkType: 'temporary'
      },
      {
        $set: {
          active: false,
          unlinkedAt: new Date()
        }
      }
    );
  } else {
    // Para empresas particulares (temporary), desactivar links temporales previos de la misma placa
    // pero mantener los permanentes (si los hay, no se tocan)
    await ClientCompanyLink.updateMany(
      {
        companyId: String(companyId),
        plate: normalizedPlate,
        active: true,
        linkType: 'temporary'
      },
      {
        $set: {
          active: false,
          unlinkedAt: new Date()
        }
      }
    );
  }

  // Crear el link
  const link = await ClientCompanyLink.create({
    companyId: String(companyId),
    companyAccountId: new mongoose.Types.ObjectId(companyAccountId),
    plate: normalizedPlate,
    customerIdNumber: String(customerIdNumber || '').trim(),
    customerName: String(customerName || '').trim(),
    customerPhone: String(customerPhone || '').trim(),
    linkType,
    saleId: saleId ? new mongoose.Types.ObjectId(saleId) : null,
    notes: String(notes || '').trim(),
    active: true
  });

  res.status(201).json(link.toObject());
};

// Listar links activos
export const listClientCompanyLinks = async (req, res) => {
  const companyId = req.companyId || req.company?.id;
  if (!companyId) return res.status(400).json({ error: 'Falta companyId' });

  const { companyAccountId, plate, linkType, active } = req.query || {};

  const query = { companyId: String(companyId) };

  if (companyAccountId) {
    query.companyAccountId = new mongoose.Types.ObjectId(companyAccountId);
  }
  if (plate) {
    query.plate = String(plate).trim().toUpperCase();
  }
  if (linkType) {
    query.linkType = String(linkType);
  }
  if (active !== undefined) {
    query.active = String(active).toLowerCase() === 'true';
  } else {
    query.active = true; // Por defecto solo activos
  }

  const links = await ClientCompanyLink.find(query)
    .populate('companyAccountId', 'name type')
    .populate('saleId', 'number total')
    .sort({ linkedAt: -1 })
    .lean();

  res.json(links);
};

// Obtener link activo por placa
export const getClientCompanyLinkByPlate = async (req, res) => {
  const companyId = req.companyId || req.company?.id;
  if (!companyId) return res.status(400).json({ error: 'Falta companyId' });

  const { plate } = req.params;
  if (!plate) return res.status(400).json({ error: 'Falta placa' });

  const link = await ClientCompanyLink.findOne({
    companyId: String(companyId),
    plate: String(plate).trim().toUpperCase(),
    active: true,
    linkType: 'permanent' // Solo links permanentes para empresas recurrentes
  })
    .populate('companyAccountId', 'name type')
    .lean();

  res.json(link || null);
};

// Eliminar/desvincular link
export const deleteClientCompanyLink = async (req, res) => {
  const companyId = req.companyId || req.company?.id;
  if (!companyId) return res.status(400).json({ error: 'Falta companyId' });

  const { id } = req.params;

  const link = await ClientCompanyLink.findOne({
    _id: id,
    companyId: String(companyId)
  });

  if (!link) {
    return res.status(404).json({ error: 'Link no encontrado' });
  }

  // Marcar como inactivo en lugar de eliminar (para historial)
  link.active = false;
  link.unlinkedAt = new Date();
  await link.save();

  res.json({ ok: true });
};

