import test from 'node:test';
import assert from 'node:assert/strict';
import { isBankNotice, isIncomingPayment, isOutgoingPayment } from './gmail.js';

const incomingBody = `
Bancolombia: CASA RENAULT, recibiste un pago de GIOVANNY MANRIQUE por $100.00
en tu cuenta *5698. Para que enviar plata siempre sea un éxito, revisa que la
llave de la persona a quien le transfieres plata coincida con el nombre.
`;

const outgoingBody = `
Bancolombia: enviaste un pago a JUAN PEREZ por $50.000. Hiciste una transferencia
desde tu cuenta *5698.
`;

const paidBody = `
Bancolombia: pagaste $80.000 en el comercio TIENDA XYZ con tu cuenta *5698.
`;

const boughtBody = `
Bancolombia: compraste por $25.000 en SUPERMERCADO con tu tarjeta *1234.
`;

test('solo se notifica una transferencia recibida', () => {
  assert.equal(isBankNotice('alertas@bancolombia.com', 'Alertas y Notificaciones', incomingBody), true);
  assert.equal(isIncomingPayment('', 'recibiste un pago', incomingBody), true);
});

test('enviaste, pagaste y compraste no se notifican', () => {
  assert.equal(isIncomingPayment('', 'Enviaste un pago', outgoingBody), false);
  assert.equal(isOutgoingPayment('', 'Enviaste un pago', outgoingBody), true);
  assert.equal(isIncomingPayment('', 'Pagaste', paidBody), false);
  assert.equal(isOutgoingPayment('', 'Pagaste', paidBody), true);
  assert.equal(isIncomingPayment('', 'Compraste', boughtBody), false);
  assert.equal(isOutgoingPayment('', 'Compraste', boughtBody), true);
});
