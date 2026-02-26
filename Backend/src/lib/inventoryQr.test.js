import test from 'node:test';
import assert from 'node:assert/strict';
import { parseInventoryQrPayload } from './inventoryQr.js';

test('parsea payload completo con supplier/investor/entryId/purchaseId', () => {
  const payload = 'IT:68c871198d7595062498d7a1:68d6f6578131fdb25f95e083:BUJI03:6967c17330e23a9cec5305ec:6967c06330e23a9cec5304e8:699f89c2b9e35b202ab5258b:P699f89c3b9e35b202ab52591';
  const p = parseInventoryQrPayload(payload);
  assert.ok(p);
  assert.equal(p.itemId, '68d6f6578131fdb25f95e083');
  assert.equal(p.sku, 'BUJI03');
  assert.equal(p.supplierId, '6967c17330e23a9cec5305ec');
  assert.equal(p.investorId, '6967c06330e23a9cec5304e8');
  assert.equal(p.entryId, '699f89c2b9e35b202ab5258b');
  assert.equal(p.purchaseId, '699f89c3b9e35b202ab52591');
});

test('retorna null si no es IT:', () => {
  assert.equal(parseInventoryQrPayload('BUJI03'), null);
});

