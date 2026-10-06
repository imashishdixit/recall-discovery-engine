import { route, send } from '../lib/http.js';
import { llmConfig } from '../lib/llm.js';
import { TAXONOMY } from '../lib/taxonomy.js';

export default route(['GET'], async (req, res) => {
  const cfg = llmConfig();
  send(res, 200, { provider: cfg.provider, model: cfg.model, mock: cfg.provider === 'mock', taxonomy: TAXONOMY, limits: { codeBatch: 12, askRows: 200 } });
});
