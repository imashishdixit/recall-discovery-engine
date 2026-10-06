import { route, send, readJson, fail } from '../lib/http.js';
import { askJson } from '../lib/llm.js';
import { ASK_SYSTEM, evidenceRows } from '../lib/prompts.js';
import { mockAsk } from '../lib/mock.js';

const MAX_ROWS = 200;

export default route(['POST'], async (req, res) => {
  const body = await readJson(req);
  const question = String(body.question || '').trim().slice(0, 300);
  if (question.length < 8) throw fail(400, 'Ask a full question.');
  const items = Array.isArray(body.items) ? body.items.slice(0, MAX_ROWS) : [];
  if (!items.length) throw fail(400, 'There is no coded evidence to answer from yet.');

  const { json, provider, model } = await askJson({
    system: ASK_SYSTEM,
    user: `Question: ${question}\n\nEvidence rows (${items.length}):\n${evidenceRows(items)}`,
    maxTokens: 4000,
    mock: () => mockAsk(items)
  });

  const known = new Set(items.map((i) => String(i.id)));
  const evidence_ids = [...new Set((Array.isArray(json?.evidence_ids) ? json.evidence_ids : []).map(String).filter((id) => known.has(id)))];
  send(res, 200, {
    answer: typeof json?.answer === 'string' ? json.answer.slice(0, 2500) : 'The model did not return an answer.',
    evidence_ids, rows_used: items.length, provider, model
  });
});
