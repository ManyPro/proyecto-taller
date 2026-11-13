import test from 'node:test';
import assert from 'node:assert/strict';
import { applyUsage } from './usage.js';

test('acumula tokens y turnos por caso', () => {
  const caseDoc = { usage: {} };
  applyUsage(caseDoc, { inputTokens: 10, outputTokens: 5, totalTokens: 15, model: 'gpt-4o-mini', responseId: 'r1' });
  applyUsage(caseDoc, { inputTokens: 7, outputTokens: 3, totalTokens: 10, model: 'gpt-4o-mini', responseId: 'r2' });
  assert.equal(caseDoc.usage.totalTokens, 25);
  assert.equal(caseDoc.usage.turns, 2);
  assert.equal(caseDoc.usage.lastResponseId, 'r2');
});
