import { fail } from './http.js';

// Picks the provider from whichever key is configured. Keys never leave the server.
export function llmConfig() {
  if (process.env.MOCK_LLM === '1') return { provider: 'mock', model: 'mock (no real analysis)' };
  if (process.env.GEMINI_API_KEY) return { provider: 'gemini', model: process.env.LLM_MODEL || 'gemini-3.5-flash' };
  if (process.env.ANTHROPIC_API_KEY) return { provider: 'anthropic', model: process.env.LLM_MODEL || 'claude-haiku-4-5-20251001' };
  return { provider: null, model: null };
}

export function parseJsonLoose(text) {
  let t = String(text || '').trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  try { return JSON.parse(t); } catch { /* fall through */ }
  const start = t.search(/[\[{]/);
  const end = Math.max(t.lastIndexOf('}'), t.lastIndexOf(']'));
  if (start === -1 || end <= start) throw fail(502, 'The model did not return JSON. Try again.');
  try { return JSON.parse(t.slice(start, end + 1)); } catch {
    throw fail(502, 'The model returned malformed JSON. Try again with a smaller batch.');
  }
}

async function providerError(provider, resp) {
  let detail = '';
  try {
    const body = await resp.json();
    detail = body?.error?.message || JSON.stringify(body).slice(0, 300);
  } catch { /* ignore */ }
  if (resp.status === 429) return fail(429, `${provider} rate limit reached. Wait a minute and continue. ${detail}`.trim());
  if (resp.status === 401 || resp.status === 403) return fail(502, `${provider} rejected the API key. Check the environment variable. ${detail}`.trim());
  if (resp.status === 404) return fail(502, `${provider} does not recognise the model. Set LLM_MODEL to a current model name. ${detail}`.trim());
  return fail(502, `${provider} error ${resp.status}. ${detail}`.trim());
}

async function callGemini({ model, system, user, maxTokens }) {
  const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: user }] }],
      generationConfig: { maxOutputTokens: maxTokens, responseMimeType: 'application/json' }
    })
  });
  if (!resp.ok) throw await providerError('Gemini', resp);
  const data = await resp.json();
  const parts = data?.candidates?.[0]?.content?.parts || [];
  const text = parts.filter((p) => !p.thought && typeof p.text === 'string').map((p) => p.text).join('');
  if (!text) throw fail(502, `Gemini returned no text (finish reason: ${data?.candidates?.[0]?.finishReason || 'unknown'}).`);
  return text;
}

async function callAnthropic({ model, system, user, maxTokens }) {
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({ model, max_tokens: maxTokens, system, messages: [{ role: 'user', content: user }] })
  });
  if (!resp.ok) throw await providerError('Anthropic', resp);
  const data = await resp.json();
  const text = (data?.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
  if (!text) throw fail(502, 'Anthropic returned no text.');
  return text;
}

// Sends one prompt and returns parsed JSON. `mock` is only used when MOCK_LLM=1 (tests).
export async function askJson({ system, user, maxTokens = 8000, mock }) {
  const cfg = llmConfig();
  if (!cfg.provider) {
    throw fail(500, 'No API key is configured. Add GEMINI_API_KEY or ANTHROPIC_API_KEY in Vercel > Settings > Environment Variables, then redeploy.');
  }
  if (cfg.provider === 'mock') return { json: mock(), ...cfg };
  const call = cfg.provider === 'gemini' ? callGemini : callAnthropic;
  const text = await call({ model: cfg.model, system, user, maxTokens });
  return { json: parseJsonLoose(text), ...cfg };
}
