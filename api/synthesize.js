import { route, send, readJson, fail } from '../lib/http.js';
import { askJson } from '../lib/llm.js';
import { SYNTH_SYSTEM, evidenceRows } from '../lib/prompts.js';
import { TAXONOMY } from '../lib/taxonomy.js';
import { mockSynth } from '../lib/mock.js';

const MAX_ROWS = 200;

export default route(['POST'], async (req, res) => {
  const body = await readJson(req);
  const items = Array.isArray(body.items) ? body.items.slice(0, MAX_ROWS) : [];
  if (items.length < 5) throw fail(400, 'Code at least 5 retrieval-related items before drafting opportunity areas.');
  const stats = JSON.stringify(body.stats || {}).slice(0, 6000);

  const { json, provider, model } = await askJson({
    system: SYNTH_SYSTEM,
    user: `Summary counts (computed in code, trust these):\n${stats}\n\nEvidence rows (${items.length}):\n${evidenceRows(items)}`,
    maxTokens: 8000,
    mock: () => mockSynth(items)
  });

  const known = new Set(items.map((i) => String(i.id)));
  const str = (v, n) => (typeof v === 'string' ? v.trim().slice(0, n) : '');
  const opportunities = (Array.isArray(json?.opportunities) ? json.opportunities : []).slice(0, 6).map((o) => {
    const ids = [...new Set((Array.isArray(o.evidence_ids) ? o.evidence_ids : []).map(String).filter((id) => known.has(id)))];
    return {
      name: str(o.name, 90), scenario: str(o.scenario, 400),
      breaks_at: TAXONOMY.failure_stage.values[o.breaks_at] ? o.breaks_at : 'unclear',
      root_cause: str(o.root_cause, 500), workaround: str(o.workaround, 300),
      evidence_ids: ids,
      // Strength is capped by how many cited rows actually exist, whatever the model claims.
      evidence_strength: ids.length < 3 ? 'thin' : (['strong', 'moderate', 'thin'].includes(o.evidence_strength) ? o.evidence_strength : 'moderate'),
      would_change_my_mind: str(o.would_change_my_mind, 300)
    };
  }).filter((o) => o.name);

  const lines = (a) => (Array.isArray(a) ? a.filter((s) => typeof s === 'string').slice(0, 3).map((s) => s.slice(0, 300)) : []);
  send(res, 200, { opportunities, not_supported: lines(json?.not_supported), caveats: lines(json?.caveats), rows_used: items.length, provider, model });
});
