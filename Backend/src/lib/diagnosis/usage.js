import DiagnosisCase from '../../models/DiagnosisCase.js';

function startOfUtcDay(d = new Date()) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export function usageLimitsFromEnv() {
  return {
    maxTokensPerCase: Number(process.env.DIAGNOSIS_MAX_TOKENS_PER_CASE || 180000),
    maxTurnsPerCase: Number(process.env.DIAGNOSIS_MAX_TURNS_PER_CASE || 40),
    maxTurnsPerCompanyDay: Number(process.env.DIAGNOSIS_MAX_TURNS_PER_COMPANY_DAY || 80)
  };
}

export class DiagnosisLimitError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'DiagnosisLimitError';
    this.code = code;
    this.httpStatus = 429;
  }
}

export async function assertUsageAllowed(caseDoc, companyId) {
  const limits = usageLimitsFromEnv();
  const usedTokens = Number(caseDoc.usage?.totalTokens || 0);
  const usedTurns = Number(caseDoc.usage?.turns || 0);
  if (usedTokens >= limits.maxTokensPerCase) {
    throw new DiagnosisLimitError('case_token_limit', 'Este caso alcanzó el límite de tokens de IA configurado en el backend.');
  }
  if (usedTurns >= limits.maxTurnsPerCase) {
    throw new DiagnosisLimitError('case_turn_limit', 'Este caso alcanzó el máximo de turnos de IA permitidos.');
  }

  const from = startOfUtcDay();
  const companyTurns = await DiagnosisCase.aggregate([
    { $match: { companyId, 'usage.lastTurnAt': { $gte: from } } },
    { $group: { _id: null, turns: { $sum: { $ifNull: ['$usage.dayTurns', 0] } } } }
  ]);
  const turnsToday = companyTurns[0]?.turns || 0;
  if (turnsToday >= limits.maxTurnsPerCompanyDay) {
    throw new DiagnosisLimitError('company_day_limit', 'La empresa alcanzó el límite diario de consultas de diagnóstico IA.');
  }
}

export function applyUsage(caseDoc, usage) {
  const now = new Date();
  const last = caseDoc.usage?.lastTurnAt ? new Date(caseDoc.usage.lastTurnAt) : null;
  const sameDay = last && startOfUtcDay(last).getTime() === startOfUtcDay(now).getTime();
  caseDoc.usage = {
    inputTokens: Number(caseDoc.usage?.inputTokens || 0) + Number(usage.inputTokens || 0),
    outputTokens: Number(caseDoc.usage?.outputTokens || 0) + Number(usage.outputTokens || 0),
    totalTokens: Number(caseDoc.usage?.totalTokens || 0) + Number(usage.totalTokens || 0),
    turns: Number(caseDoc.usage?.turns || 0) + 1,
    dayTurns: sameDay ? Number(caseDoc.usage?.dayTurns || 0) + 1 : 1,
    lastModel: usage.model || '',
    lastResponseId: usage.responseId || '',
    lastTurnAt: now
  };
}
