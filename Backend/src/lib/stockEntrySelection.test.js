import test from 'node:test';
import assert from 'node:assert/strict';
import { orderStockEntriesForSaleItem } from './stockEntrySelection.js';

function entry({ id, entryDate, investorId = null, supplierId = null }) {
  return {
    _id: id,
    entryDate: entryDate ? new Date(entryDate) : new Date('2026-01-01T00:00:00Z'),
    investorId,
    supplierId,
    qty: 10
  };
}

test('FIFO puro si no hay meta de QR', () => {
  const e1 = entry({ id: 'aaaaaaaaaaaaaaaaaaaaaaaa', entryDate: '2026-01-01T00:00:00Z' });
  const e2 = entry({ id: 'bbbbbbbbbbbbbbbbbbbbbbbb', entryDate: '2026-01-02T00:00:00Z' });
  const { preferred, ordered } = orderStockEntriesForSaleItem([e1, e2], null);
  assert.equal(preferred, null);
  assert.deepEqual(ordered.map(e => String(e._id)), [String(e1._id), String(e2._id)]);
});

test('prioriza entryId exacto cuando viene en meta', () => {
  const e1 = entry({ id: 'aaaaaaaaaaaaaaaaaaaaaaaa', entryDate: '2026-01-01T00:00:00Z' });
  const e2 = entry({ id: 'bbbbbbbbbbbbbbbbbbbbbbbb', entryDate: '2026-01-02T00:00:00Z' });
  const { preferred, ordered } = orderStockEntriesForSaleItem([e1, e2], { entryId: String(e2._id) });
  assert.ok(preferred);
  assert.equal(String(preferred._id), String(e2._id));
  // El orden puede ser FIFO, pero el preferred se descuenta primero en el controlador
  assert.deepEqual(ordered.map(e => String(e._id)), [String(e1._id), String(e2._id)]);
});

test('prioriza coincidencia de investorId/supplierId cuando vienen en meta', () => {
  const invA = '111111111111111111111111';
  const invB = '222222222222222222222222';
  const supX = '999999999999999999999999';

  const e1 = entry({ id: 'aaaaaaaaaaaaaaaaaaaaaaaa', entryDate: '2026-01-01T00:00:00Z', investorId: invA, supplierId: supX });
  const e2 = entry({ id: 'bbbbbbbbbbbbbbbbbbbbbbbb', entryDate: '2026-01-02T00:00:00Z', investorId: invB, supplierId: supX });
  const e3 = entry({ id: 'cccccccccccccccccccccccc', entryDate: '2026-01-03T00:00:00Z', investorId: invA, supplierId: null });

  const { ordered } = orderStockEntriesForSaleItem([e1, e2, e3], { investorId: invA, supplierId: supX });
  assert.deepEqual(ordered.map(e => String(e._id)), [String(e1._id), String(e3._id), String(e2._id)]);
});

