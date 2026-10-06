import { route, send, readJson, fail } from '../lib/http.js';
import { askJson } from '../lib/llm.js';
import { CODE_SYSTEM, codeUser } from '../lib/prompts.js';
import { sanitize, verifyQuote } from '../lib/taxonomy.js';
import { mockCode } from '../lib/mock.js';

const MAX_ITEMS = 12;
const MAX_CHARS = 1500;

export default route(['POST'], async (req, res) => {
  const body = await readJson(req);
  if (!Array.isArray(body.items) || body.items.length === 0) throw fail(400, 'Send {items:[{id, source, text}]}.');
  if (body.items.length > MAX_ITEMS) throw fail(400, `Send at most ${MAX_ITEMS} items per request.`);

  const items = body.items.map((it) => ({
    id: String(it.id).replace(/[^\w.-]/g, '').slice(0, 80),
    source: String(it.source || 'unknown').replace(/[^\w-]/g, '').slice(0, 20),
    text: String(it.text || '').replace(/<\/?item[^>]*>/gi, ' ').slice(0, MAX_CHARS)
  })).filter((it) => it.id && it.text.trim());
  if (!items.length) throw fail(400, 'No items had text.');

  const { json, provider, model } = await askJson({
    system: CODE_SYSTEM,
    user: codeUser(items),
    maxTokens: 16000,
    mock: () => mockCode(items)
  });

  const returned = Array.isArray(json) ? json : Array.isArray(json?.items) ? json.items : [];
  const byId = new Map(returned.filter((r) => r && r.id != null).map((r) => [String(r.id), r]));

  const coded = items.map((it) => {
    const raw = byId.get(it.id);
    if (!raw) return { id: it.id, missing: true };
    const c = sanitize(raw);
    if (c.relevant) {
      c.quote_verified = verifyQuote(c.quote, it.text);
      if (!c.quote_verified) c.quote = '';
    }
    return c;
  });

  send(res, 200, { coded, provider, model });
});
