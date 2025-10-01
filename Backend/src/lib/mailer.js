// Stub dejado intencionalmente para evitar errores de import si algún archivo aún importa '../lib/mailer.js'.
// Flujo de email deshabilitado en modo local.
export function sendMail() {
  return { simulated: true };
}
export default { sendMail };
