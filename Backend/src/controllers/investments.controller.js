import mongoose from "mongoose";
import InvestmentItem from "../models/InvestmentItem.js";
import StockEntry from "../models/StockEntry.js";
import Item from "../models/Item.js";
import Sale from "../models/Sale.js";
import CashFlowEntry from "../models/CashFlowEntry.js";
import Account from "../models/Account.js";
import { computeBalance } from "./cashflow.controller.js";
import { publish } from '../lib/live.js';

// ===== LISTAR INVERSIONES POR INVERSOR =====
export const getInvestorInvestments = async (req, res) => {
  try {
    const { investorId } = req.params;
    
    if (!mongoose.Types.ObjectId.isValid(investorId)) {
      return res.status(400).json({ error: 'ID de inversor inválido' });
    }
    
    // Obtener todos los InvestmentItems del inversor
    const investmentItems = await InvestmentItem.find({
      companyId: req.companyId,
      investorId: investorId
    })
      .populate('itemId', 'sku name salePrice')
      .populate('stockEntryId', 'qty entryPrice entryDate')
      .populate('saleId', 'number status closedAt')
      .sort({ createdAt: -1 })
      .lean();
    
    // Agrupar por status
    const available = investmentItems.filter(i => i.status === 'available');
    const sold = investmentItems.filter(i => i.status === 'sold');
    const paid = investmentItems.filter(i => i.status === 'paid');
    
    // Calcular totales
    const totalInvestment = investmentItems.reduce((sum, inv) => {
      return sum + (inv.purchasePrice * inv.qty);
    }, 0);
    
    const availableValue = available.reduce((sum, inv) => {
      return sum + (inv.purchasePrice * inv.qty);
    }, 0);
    
    const soldValue = sold.reduce((sum, inv) => {
      return sum + (inv.purchasePrice * inv.qty);
    }, 0);
    
    const paidValue = paid.reduce((sum, inv) => {
      return sum + (inv.purchasePrice * inv.qty);
    }, 0);
    
    const pendingPayment = Math.max(0, soldValue - paidValue);
    
    res.json({
      investorId,
      summary: {
        totalInvestment,
        availableValue,
        soldValue,
        paidValue,
        pendingPayment
      },
      items: {
        available,
        sold,
        paid
      }
    });
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener inversiones', message: err.message });
  }
};

// ===== LISTAR TODOS LOS INVERSORES CON RESUMEN =====
export const listInvestorsSummary = async (req, res) => {
  try {
    const Investor = (await import("../models/Investor.js")).default;
    
    const investors = await Investor.find({ 
      companyId: req.companyId, 
      active: true 
    }).lean();
    
    const summaries = await Promise.all(
      investors.map(async (investor) => {
        const items = await InvestmentItem.find({
          companyId: req.companyId,
          investorId: investor._id
        }).lean();
        
        const totalInvestment = items.reduce((sum, inv) => sum + (inv.purchasePrice * inv.qty), 0);
        const availableValue = items
          .filter(i => i.status === 'available')
          .reduce((sum, inv) => sum + (inv.purchasePrice * inv.qty), 0);
        const soldValue = items
          .filter(i => i.status === 'sold')
          .reduce((sum, inv) => sum + (inv.purchasePrice * inv.qty), 0);
        const paidValue = items
          .filter(i => i.status === 'paid')
          .reduce((sum, inv) => sum + (inv.purchasePrice * inv.qty), 0);
        
        return {
          investor: {
            _id: investor._id,
            name: investor.name,
            contactInfo: investor.contactInfo
          },
          summary: {
            totalInvestment,
            availableValue,
            soldValue,
            paidValue,
            pendingPayment: Math.max(0, soldValue - paidValue)
          }
        };
      })
    );
    
    res.json(summaries);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener resumen de inversores', message: err.message });
  }
};

// ===== COBRAR INVERSIÓN =====
export const payInvestment = async (req, res) => {
  try {
    const { investorId } = req.params;
    const { investmentItemIds, accountId, date, notes } = req.body || {};
    
    if (!Array.isArray(investmentItemIds) || investmentItemIds.length === 0) {
      return res.status(400).json({ error: 'Debe seleccionar al menos un item de inversión' });
    }
    
    if (!accountId || !mongoose.Types.ObjectId.isValid(accountId)) {
      return res.status(400).json({ error: 'Debe seleccionar una cuenta de flujo de caja' });
    }
    
    // Validar que la cuenta existe
    const account = await Account.findOne({ _id: accountId, companyId: req.companyId });
    if (!account) {
      return res.status(404).json({ error: 'Cuenta de flujo de caja no encontrada' });
    }
    
    // Obtener los InvestmentItems
    const investmentItems = await InvestmentItem.find({
      _id: { $in: investmentItemIds },
      companyId: req.companyId,
      investorId: investorId,
      status: 'sold' // Solo se pueden cobrar items vendidos
    });
    
    if (investmentItems.length !== investmentItemIds.length) {
      return res.status(400).json({ error: 'Algunos items no se encontraron o no están en estado vendido' });
    }
    
    // Calcular monto total a pagar
    const totalAmount = investmentItems.reduce((sum, inv) => {
      return sum + (inv.purchasePrice * inv.qty);
    }, 0);
    
    // Validar balance de cuenta
    const currentBalance = await computeBalance(accountId, req.companyId);
    if (currentBalance < totalAmount) {
      return res.status(400).json({ 
        error: 'Saldo insuficiente', 
        message: `La cuenta "${account.name}" no tiene saldo suficiente. Saldo disponible: ${currentBalance}, Monto requerido: ${totalAmount}` 
      });
    }
    
    // Calcular nuevo balance
    const newBalance = currentBalance - totalAmount;
    
    // Crear entrada en flujo de caja
    const paymentDate = date ? new Date(date) : new Date();
    const cashFlowEntry = await CashFlowEntry.create({
      companyId: req.companyId,
      accountId: accountId,
      kind: 'OUT',
      source: 'INVESTMENT',
      sourceRef: investorId,
      description: `Pago de inversión: ${investmentItems.length} item(s)`,
      amount: totalAmount,
      balanceAfter: newBalance,
      date: paymentDate,
      notes: (notes || '').trim(),
      meta: {
        investorId: investorId,
        investmentItemIds: investmentItemIds,
        itemCount: investmentItems.length
      }
    });
    
    // Actualizar InvestmentItems a estado 'paid'
    await InvestmentItem.updateMany(
      { _id: { $in: investmentItemIds } },
      {
        $set: {
          status: 'paid',
          paidAt: paymentDate,
          cashflowEntryId: cashFlowEntry._id
        }
      }
    );
    
    // Publicar evento de actualización en vivo
    try {
      await publish(req.companyId, 'cashflow:created', { id: cashFlowEntry._id, accountId: accountId });
    } catch (e) {
      // No fallar si no se puede publicar
    }
    
    // Obtener items actualizados
    const updatedItems = await InvestmentItem.find({
      _id: { $in: investmentItemIds }
    })
      .populate('itemId', 'sku name')
      .populate('saleId', 'number')
      .lean();
    
    res.json({
      ok: true,
      cashFlowEntry,
      investmentItems: updatedItems,
      totalPaid: totalAmount
    });
  } catch (err) {
    res.status(500).json({ error: 'Error al procesar pago de inversión', message: err.message });
  }
};
