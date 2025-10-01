import nodemailer from 'nodemailer';

/**
 * Simple mailer wrapper.
 * Requires env vars:
 *  SMTP_HOST
 *  SMTP_PORT (number, typically 465 SSL or 587 STARTTLS)
 *  SMTP_USER
 *  SMTP_PASS
 *  MAIL_FROM (optional, fallback to SMTP_USER)
 */
let transporter = null;

function getTransporter() {
  if (transporter) return transporter;
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS) {
    console.warn('[mailer] Falta configuración SMTP: no se enviarán correos reales.');
    return null;
  }
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT),
    secure: Number(SMTP_PORT) === 465, // SSL directo si puerto 465
    auth: { user: SMTP_USER, pass: SMTP_PASS }
  });
  return transporter;
}

export async function sendMail({ to, subject, text, html }) {
  const tx = getTransporter();
  if (!tx) {
    console.log('[mailer:DEV] Simulación de email =>', { to, subject, text });
    return { simulated: true };
  }
  const from = process.env.MAIL_FROM || process.env.SMTP_USER;
  const info = await tx.sendMail({ from, to, subject, text, html: html || `<pre>${text}</pre>` });
  console.log('[mailer] Mensaje enviado id=%s to=%s', info.messageId, to);
  return info;
}

export default { sendMail };
