// Netlify Function to proxy /api and /uploads to your backend
// Usage: /.netlify/functions/proxy?prefix=api&path=v1/health -> http://HOST:PORT/api/v1/health

const BACKEND_HOST = process.env.BACKEND_HOST || '143.110.131.35';
const BACKEND_PORT = process.env.BACKEND_PORT || '3000';

export async function handler(event) {
  try {
    const { queryStringParameters } = event;
    const prefix = queryStringParameters?.prefix || '';
    const path = queryStringParameters?.path || '';
    const url = `http://${BACKEND_HOST}:${BACKEND_PORT}/${prefix}/${path}`.replace(/\/+$/,'').replace(/([^:]\/)\/+/, '$1/');

    const headers = { ...event.headers };
    delete headers.host; // avoid host forwarding issues

    const init = { method: event.httpMethod, headers };
    if (event.body && event.httpMethod !== 'GET' && event.httpMethod !== 'HEAD') {
      init.body = event.isBase64Encoded ? Buffer.from(event.body, 'base64') : event.body;
    }

    const resp = await fetch(url, init);
    const buf = Buffer.from(await resp.arrayBuffer());
    const contentType = resp.headers.get('content-type') || 'application/octet-stream';

    return {
      statusCode: resp.status,
      headers: { 'content-type': contentType },
      body: buf.toString('base64'),
      isBase64Encoded: true
    };
  } catch (e) {
    return { statusCode: 502, body: JSON.stringify({ error: e.message }) };
  }
}
