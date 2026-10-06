// Small helpers that work the same on Vercel and on the local dev server.

export async function readJson(req) {
  if (req.body !== undefined && req.body !== null) {
    if (typeof req.body === 'string') return req.body ? JSON.parse(req.body) : {};
    if (Buffer.isBuffer(req.body)) return JSON.parse(req.body.toString('utf8') || '{}');
    return req.body;
  }
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

export function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

// Wraps a handler so thrown errors become readable JSON instead of a blank 500.
export function route(methods, fn) {
  return async function handler(req, res) {
    if (!methods.includes(req.method)) return send(res, 405, { error: `Use ${methods.join(' or ')}` });
    try {
      await fn(req, res);
    } catch (err) {
      const status = err.status && err.status >= 400 && err.status < 600 ? err.status : 500;
      send(res, status, { error: err.message || 'Unexpected error' });
    }
  };
}

export function fail(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}
