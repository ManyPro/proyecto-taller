import Account from '../../models/Account.js';
import CashFlowEntry from '../../models/CashFlowEntry.js';

export async function ensureDefaultCashAccount(companyId) {
  let account = await Account.findOne({ companyId, type: 'CASH', name: /caja/i });
  if (!account) {
    account = await Account.create({ companyId, name: 'Caja', type: 'CASH', initialBalance: 0 });
  }
  return account;
}

export async function computeBalance(companyId, accountId) {
  const last = await CashFlowEntry.findOne({ companyId, accountId }).sort({ date: -1, _id: -1 });
  if (last) return last.balanceAfter;
  const account = await Account.findOne({ _id: accountId, companyId });
  return account ? account.initialBalance : 0;
}

export async function recomputeAccountBalances(companyId, accountId) {
  if (!companyId || !accountId) return;
  const account = await Account.findOne({ _id: accountId, companyId });
  if (!account) return;
  const entries = await CashFlowEntry.find({ companyId, accountId }).sort({ date: 1, _id: 1 });
  let running = account.initialBalance || 0;
  for (const entry of entries) {
    if (entry.kind === 'IN') running += entry.amount;
    else if (entry.kind === 'OUT') running -= entry.amount;
    if (entry.balanceAfter !== running) {
      entry.balanceAfter = running;
      await entry.save();
    }
  }
}
