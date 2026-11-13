import jwt from 'jsonwebtoken';
import GmailInboxConnection from '../models/GmailInboxConnection.js';
import GmailProcessedMessage from '../models/GmailProcessedMessage.js';
import Notification from '../models/Notification.js';
import { publish } from '../lib/live.js';
import { logger } from '../lib/logger.js';
import {
  gmailConfigured,
  buildAuthUrl,
  exchangeCode,
  getAccessToken,
  clearAccessCache,
  getProfile,
  listRecentMessageIds,
  listHistoryMessageIds,
  getMessage,
  extractMessageContent,
  isBankNotice,
  isOutgoingPayment,
  parseCopAmount,
  parsePaymentChannel,
  parseSenderName,
  formatCop,
  frontendBaseUrl,
  logGmail
} from '../lib/gmail.js';

const STATE_KIND = 'gmail_oauth';
let polling = false;

function redirectFrontend(res, status, extra = '') {
  const url = new URL(frontendBaseUrl());
  url.searchParams.set('gmail', status);
  if (extra) url.searchParams.set('gmailMsg', extra.slice(0, 120));
  res.redirect(url.toString());
}

export const getGmailStatus = async (req, res) => {
  if (!req.companyId) return res.status(403).json({ error: 'Company ID is required' });
  const conn = await GmailInboxConnection.findOne({ companyId: req.companyId })
    .select('email connectedAt lastCheckedAt lastError')
    .lean();
  res.json({
    configured: gmailConfigured(),
    connected: Boolean(conn),
    email: conn?.email || '',
    connectedAt: conn?.connectedAt || null,
    lastCheckedAt: conn?.lastCheckedAt || null,
    lastError: conn?.lastError || ''
  });
};

export const startGmailConnect = async (req, res) => {
  if (!req.companyId) return res.status(403).json({ error: 'Company ID is required' });
  if (!gmailConfigured()) {
    return res.status(503).json({
      error: 'Faltan GMAIL_CLIENT_ID y GMAIL_CLIENT_SECRET en el .env del backend'
    });
  }
  const state = jwt.sign(
    { kind: STATE_KIND, companyId: String(req.companyId) },
    process.env.JWT_SECRET,
    { expiresIn: '15m' }
  );
  res.json({ url: buildAuthUrl(state) });
};

export const handleGmailCallback = async (req, res) => {
  try {
    if (req.query.error) {
      return redirectFrontend(res, 'error', String(req.query.error));
    }
    const { code, state } = req.query;
    if (!code || !state) return redirectFrontend(res, 'error', 'faltan code o state');

    const payload = jwt.verify(String(state), process.env.JWT_SECRET);
    if (payload?.kind !== STATE_KIND || !payload.companyId) {
      return redirectFrontend(res, 'error', 'state invalido');
    }

    const tokens = await exchangeCode(String(code));
    if (!tokens.refresh_token) {
      return redirectFrontend(res, 'error', 'Google no envio refresh_token. Quita el acceso y vuelve a conectar.');
    }

    const profile = await getProfile(tokens.access_token);
    await GmailInboxConnection.findOneAndUpdate(
      { companyId: payload.companyId },
      {
        $set: {
          email: String(profile.emailAddress || '').toLowerCase(),
          refreshToken: tokens.refresh_token,
          historyId: String(profile.historyId || ''),
          connectedAt: new Date(),
          lastCheckedAt: new Date(),
          lastError: ''
        }
      },
      { upsert: true, new: true }
    );
    clearAccessCache(payload.companyId);
    logGmail('connected', { companyId: payload.companyId, email: profile.emailAddress });
    return redirectFrontend(res, 'connected');
  } catch (err) {
    logger.error('gmail.callback.error', { err: err.message });
    return redirectFrontend(res, 'error', err.message);
  }
};

export const disconnectGmail = async (req, res) => {
  if (!req.companyId) return res.status(403).json({ error: 'Company ID is required' });
  await GmailInboxConnection.deleteOne({ companyId: req.companyId });
  clearAccessCache(req.companyId);
  res.json({ ok: true, connected: false });
};

async function alreadyProcessed(companyId, messageId) {
  const existing = await GmailProcessedMessage.findOne({ companyId, messageId }).lean();
  return Boolean(existing);
}

async function markProcessed(companyId, messageId) {
  try {
    await GmailProcessedMessage.create({ companyId, messageId });
  } catch (err) {
    if (err?.code !== 11000) throw err;
  }
}

async function notifyPayment(companyId, parsed) {
  const notification = await Notification.create({
    companyId,
    type: 'payment.received',
    data: {
      gmailMessageId: parsed.id,
      amount: parsed.amount,
      amountLabel: parsed.amount ? formatCop(parsed.amount) : '',
      channel: parsed.channel,
      sender: parsed.sender,
      subject: parsed.subject,
      from: parsed.from,
      snippet: (parsed.snippet || parsed.body || '').slice(0, 280)
    }
  });
  await publish(String(companyId), 'notification', {
    id: notification._id.toString(),
    type: 'payment.received',
    data: notification.data,
    createdAt: notification.createdAt
  });
}

async function processMessage(companyId, accessToken, messageId, connectedAt) {
  if (await alreadyProcessed(companyId, messageId)) return;
  const raw = await getMessage(accessToken, messageId);
  const content = extractMessageContent(raw);

  const cutoff = connectedAt ? new Date(connectedAt).getTime() - 5 * 60 * 1000 : 0;
  if (content.internalDate && content.internalDate < cutoff) {
    await markProcessed(companyId, messageId);
    return;
  }

  const blob = `${content.subject}\n${content.body}`;
  if (!isBankNotice(content.from, content.subject, content.body)) {
    await markProcessed(companyId, messageId);
    return;
  }
  if (isOutgoingPayment(content.from, content.subject, content.body)) {
    await markProcessed(companyId, messageId);
    return;
  }

  await notifyPayment(companyId, {
    id: content.id,
    amount: parseCopAmount(blob),
    channel: parsePaymentChannel(blob),
    sender: parseSenderName(blob),
    subject: content.subject,
    from: content.from,
    snippet: content.snippet,
    body: content.body
  });
  await markProcessed(companyId, messageId);
}

async function syncConnection(conn) {
  const accessToken = await getAccessToken(conn.companyId, conn.refreshToken);
  let ids = [];
  let nextHistoryId = conn.historyId;

  if (conn.historyId) {
    try {
      const hist = await listHistoryMessageIds(accessToken, conn.historyId);
      ids = hist.messageIds;
      nextHistoryId = hist.historyId || conn.historyId;
    } catch (err) {
      if (err.status === 404) {
        ids = await listRecentMessageIds(accessToken);
        const profile = await getProfile(accessToken);
        nextHistoryId = String(profile.historyId || conn.historyId || '');
      } else {
        throw err;
      }
    }
  } else {
    ids = await listRecentMessageIds(accessToken);
    const profile = await getProfile(accessToken);
    nextHistoryId = String(profile.historyId || '');
  }

  for (const id of ids) {
    try {
      await processMessage(conn.companyId, accessToken, id, conn.connectedAt);
    } catch (err) {
      logger.error('gmail.message.error', { companyId: String(conn.companyId), messageId: id, err: err.message });
    }
  }

  conn.historyId = nextHistoryId || conn.historyId;
  conn.lastCheckedAt = new Date();
  conn.lastError = '';
  await conn.save();
}

export async function pollGmailInboxes() {
  if (polling) return;
  if (!gmailConfigured()) return;
  polling = true;
  try {
    const conns = await GmailInboxConnection.find({ refreshToken: { $ne: '' } });
    for (const conn of conns) {
      try {
        await syncConnection(conn);
      } catch (err) {
        logger.error('gmail.poll.connection.error', { companyId: String(conn.companyId), err: err.message });
        try {
          conn.lastError = err.message.slice(0, 240);
          conn.lastCheckedAt = new Date();
          await conn.save();
        } catch {}
      }
    }
  } catch (err) {
    logger.error('gmail.poll.error', { err: err.message });
  } finally {
    polling = false;
  }
}
