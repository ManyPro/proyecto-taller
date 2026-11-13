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

test('el aviso de dinero recibido se notifica', () => {
  assert.equal(isBankNotice('alertas@bancolombia.com', 'Alertas y Notificaciones', incomingBody), true);
  assert.equal(isIncomingPayment('', 'recibiste un pago', incomingBody), true);
  assert.equal(isOutgoingPayment('', 'Alertas y Notificaciones', incomingBody), false);
});

test('el aviso de dinero enviado no se notifica', () => {
  assert.equal(isBankNotice('alertas@bancolombia.com', 'Enviaste un pago', outgoingBody), true);
  assert.equal(isOutgoingPayment('', 'Enviaste un pago', outgoingBody), true);
  assert.equal(isIncomingPayment('', 'Enviaste un pago', outgoingBody), false);
});
