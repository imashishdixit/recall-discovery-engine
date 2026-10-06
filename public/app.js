// Photo recall discovery engine: browser side.
// The browser holds the dataset and drives the pipeline in small batches,
// so no server call runs long and nothing needs a database.

const LS_KEY = 'rde_v1';
const SCREEN = /\b(search\w*|find|finding|found|look(?:ing|ed)? for|locate\w*|scroll\w*|where (?:is|are|did)|ask photos|can'?t see|remember\w*)\b/i;
const BATCH = 10;

const S = {
  items: [], coded: {}, synthesis: null, qa: [],
  tax: null, status: null, filter: null, snapshotInfo: null,
  running: false, stop: false, evShown: 25,
  ui: { screen: true, limit: 300 }
};

// ---------- small helpers ----------
const $ = (sel, el = document) => el.querySelector(sel);

function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'value') el.value = v;
    else if (k === 'checked') el.checked = !!v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false) continue;
    el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

// Replaces an element's children, skipping null/false and flattening arrays.
function fill(el, ...kids) {
  el.replaceChildren(...kids.flat(Infinity).filter((k) => k != null && k !== false).map((k) => (k.nodeType ? k : document.createTextNode(String(k)))));
}

async function api(path, body) {
  const resp = await fetch(path, body
    ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
    : undefined);
  let data = null;
  try { data = await resp.json(); } catch { /* not JSON */ }
  if (!resp.ok) {
    const e = new Error(data?.error || `Request failed (${resp.status})`);
    e.status = resp.status;
    throw e;
  }
  return data;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pct = (n, d) => (d ? Math.round((100 * n) / d) : 0);
const hash = (s) => { let x = 5381; for (let i = 0; i < s.length; i++) x = ((x << 5) + x + s.charCodeAt(i)) >>> 0; return x.toString(36); };
const short = (field, key) => S.tax?.[field]?.values?.[key]?.short || key;

function save() {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify({ items: S.items, coded: S.coded, synthesis: S.synthesis, qa: S.qa }));
  } catch {
    banner('This browser could not save the dataset (storage is full or blocked). Export the dataset before closing the tab.', true);
  }
}

function banner(text, isErr) {
  const b = $('#banner');
  if (!text) { b.hidden = true; return; }
  b.hidden = false;
  b.className = 'banner' + (isErr ? ' err' : '');
  b.textContent = text;
}

function download(name, text, type) {
  const a = h('a', { href: URL.createObjectURL(new Blob([text], { type })), download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

function addItems(list) {
  const have = new Set(S.items.map((i) => i.id));
  let added = 0;
  for (const it of list) {
    if (!it?.id || !it.text || have.has(it.id)) continue;
    have.add(it.id); S.items.push(it); added++;
  }
  if (added) { save(); renderFunnel(); }
  return added;
}

// ---------- derived data ----------
function relevant() { return S.items.filter((i) => S.coded[i.id]?.relevant).map((i) => ({ item: i, c: S.coded[i.id] })); }
function inScope(rows) { return rows.filter((r) => S.tax.failure_stage.values[r.c.failure_stage]?.inScope); }

function matches(c, f) {
  if (!f) return true;
  return f.pairs.every(([field, value]) => (Array.isArray(c[field]) ? c[field].includes(value) : c[field] === value));
}
function sameFilter(pairs) { return S.filter && JSON.stringify(S.filter.pairs) === JSON.stringify(pairs); }
function setFilter(pairs, label) {
  S.filter = sameFilter(pairs) ? null : { pairs, label };
  S.evShown = 25;
  renderCompare();
  if (S.filter) $('#evidence')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function tally(rows, field) {
  const out = {};
  for (const key of Object.keys(S.tax[field].values)) out[key] = 0;
  for (const { c } of rows) {
    const v = c[field];
    for (const k of Array.isArray(v) ? v : [v]) if (k in out) out[k]++;
  }
  return out;
}

function stageTable(rows) {
  return Object.keys(S.tax.failure_stage.values).map((stage) => {
    const mine = rows.filter((r) => r.c.failure_stage === stage);
    const n = mine.length;
    const notFound = mine.filter((r) => r.c.outcome === 'not_found').length;
    const high = mine.filter((r) => r.c.stakes === 'high').length;
    const score = n * (1 + (n ? notFound / n : 0)) * (1 + (n ? high / n : 0));
    return { stage, n, notFound, high, score, inScope: S.tax.failure_stage.values[stage].inScope };
  });
}

function computeStats() {
  const rows = relevant();
  const stages = stageTable(rows);
  const cells = {};
  for (const { c } of inScope(rows)) cells[`${c.photo_type} x ${c.failure_stage}`] = (cells[`${c.photo_type} x ${c.failure_stage}`] || 0) + 1;
  return {
    collected: S.items.length,
    coded: Object.keys(S.coded).length,
    about_finding_photos: rows.length,
    by_failure_stage: Object.fromEntries(stages.map((s) => [s.stage, { n: s.n, not_found: s.notFound, high_stakes: s.high }])),
    by_photo_type: tally(rows, 'photo_type'),
    remembered: tally(rows, 'remembered'),
    forgotten: tally(rows, 'forgotten'),
    search_method: tally(rows, 'search_method'),
    workaround: tally(rows, 'workaround'),
    outcome: tally(rows, 'outcome'),
    top_type_by_stage_cells: Object.fromEntries(Object.entries(cells).sort((a, b) => b[1] - a[1]).slice(0, 12))
  };
}

// Rows sent to the model: in-scope failures first, then rows with a verified quote.
function rowsForModel(limit = 200) {
  const rank = (r) => (S.tax.failure_stage.values[r.c.failure_stage]?.inScope ? 2 : 0) + (r.c.quote_verified ? 1 : 0);
  return relevant().sort((a, b) => rank(b) - rank(a)).slice(0, limit).map((r) => r.c);
}

// ---------- funnel ----------
function renderFunnel() {
  const el = $('#funnel');
  if (!S.tax) { fill(el); return; }
  const rows = relevant();
  const scoped = inScope(rows);
  const lost = scoped.filter((r) => r.c.outcome === 'not_found');
  const total = S.items.length;
  const cell = (n, label) => h('div', {}, h('b', {}, n.toLocaleString()), h('span', {}, label),
    h('div', { class: 'bar' }, h('i', { style: `width:${total ? Math.max(pct(n, total), n ? 1 : 0) : 0}%` })));
  fill(el, 
    cell(total, 'pieces of feedback collected'),
    cell(rows.length, 'are about finding a photo'),
    cell(scoped.length, 'show where retrieval broke'),
    cell(lost.length, 'say the photo was never found')
  );
}

// ---------- 1. Collect ----------
function field(label, control) { return h('div', {}, h('label', {}, label, control)); }
function select(options, value) {
  return h('select', {}, options.map(([v, t]) => h('option', { value: v, selected: v === value }, t)));
}

function mapReddit(data, subreddit) {
  // Accepts a search listing, or a thread page (an array: the post, then its comments).
  const listings = Array.isArray(data) ? data : [data];
  return listings.flatMap((l) => l?.data?.children || []).map((c) => c.data).filter((p) => p && p.id && (p.selftext || p.title || p.body)).map((p) => ({
    id: `rd_${p.id}`, source: 'reddit', label: `r/${p.subreddit || subreddit}`,
    url: p.permalink ? `https://www.reddit.com${p.permalink}` : null,
    date: p.created_utc ? new Date(p.created_utc * 1000).toISOString().slice(0, 10) : null, rating: null,
    text: (p.title ? `${p.title}. ${p.selftext || ''}` : p.body).replace(/\s+/g, ' ').trim().slice(0, 3000)
  })).filter((i) => i.text.length > (i.text.includes('. ') ? 30 : 60) && !/^\[(removed|deleted)\]/.test(i.text));
}

const redditSearchUrl = (sub, q) => `https://www.reddit.com/r/${encodeURIComponent(sub)}/search.json?q=${encodeURIComponent(q)}&restrict_sr=1&sort=relevance&t=all&limit=100&raw_json=1`;

function renderCollect() {
  const panel = $('#tab-collect');
  const COUNTRIES = [['in', 'India'], ['us', 'United States'], ['gb', 'United Kingdom'], ['au', 'Australia'], ['ca', 'Canada']];

  // Google Play
  const pCountry = select(COUNTRIES, 'in');
  const pSort = select([['newest', 'Newest first'], ['helpful', 'Most helpful first']], 'helpful');
  const pPages = h('input', { type: 'number', min: 1, max: 20, value: 4 });
  const pStatus = h('div', { class: 'status', role: 'status' });
  const pBtn = h('button', { class: 'act', onclick: async () => {
    pBtn.disabled = true; pStatus.className = 'status';
    let token = null, got = 0, fresh = 0;
    const pages = Math.min(Math.max(+pPages.value || 1, 1), 20);
    try {
      for (let p = 1; p <= pages; p++) {
        pStatus.textContent = `Fetching page ${p} of ${pages}…`;
        const r = await api('/api/collect', { source: 'play', country: pCountry.value, sort: pSort.value, token });
        got += r.items.length; fresh += addItems(r.items); renderTally();
        token = r.nextToken;
        if (!token || !r.fetched) break;
      }
      pStatus.textContent = `Fetched ${got} reviews, ${fresh} new.`;
    } catch (e) { pStatus.className = 'status err'; pStatus.textContent = `${e.message} ${got ? `Kept the ${fresh} already added.` : ''}`; }
    pBtn.disabled = false;
  } }, 'Fetch Play Store reviews');

  // App Store
  const aCountry = select(COUNTRIES, 'us');
  const aPages = h('input', { type: 'number', min: 1, max: 10, value: 5 });
  const aStatus = h('div', { class: 'status', role: 'status' });
  const aBtn = h('button', { class: 'act', onclick: async () => {
    aBtn.disabled = true; aStatus.className = 'status';
    let got = 0, fresh = 0;
    const pages = Math.min(Math.max(+aPages.value || 1, 1), 10);
    try {
      for (let p = 1; p <= pages; p++) {
        aStatus.textContent = `Fetching page ${p} of ${pages}…`;
        const r = await api('/api/collect', { source: 'appstore', country: aCountry.value, page: p });
        got += r.items.length; fresh += addItems(r.items); renderTally();
        if (!r.nextPage || !r.fetched) break;
      }
      aStatus.textContent = `Fetched ${got} reviews, ${fresh} new.`;
    } catch (e) { aStatus.className = 'status err'; aStatus.textContent = e.message; }
    aBtn.disabled = false;
  } }, 'Fetch App Store reviews');

  // Reddit
  const rSub = h('input', { type: 'text', value: 'googlephotos' });
  const rQueries = h('textarea', {}, ["can't find photo", 'search not finding', 'find old photo', 'ask photos search', 'search useless', 'scrolling to find'].join('\n'));
  const rStatus = h('div', { class: 'status', role: 'status' });
  const rBtn = h('button', { class: 'act', onclick: async () => {
    rBtn.disabled = true; rStatus.className = 'status';
    const sub = rSub.value.trim().replace(/^r\//, '') || 'googlephotos';
    const queries = rQueries.value.split('\n').map((q) => q.trim()).filter(Boolean).slice(0, 12);
    let got = 0, fresh = 0; const failed = [];
    for (const q of queries) {
      rStatus.textContent = `Searching r/${sub} for “${q}”…`;
      let items = null;
      try { // The visitor's own browser is less likely to be blocked by Reddit than a cloud server.
        const resp = await fetch(redditSearchUrl(sub, q));
        if (resp.ok) items = mapReddit(await resp.json(), sub);
      } catch { /* fall back to the server */ }
      if (!items) {
        try { items = (await api('/api/collect', { source: 'reddit', subreddit: sub, query: q })).items; } catch { failed.push(q); }
      }
      if (items) { got += items.length; fresh += addItems(items); renderTally(); }
      await sleep(1200);
    }
    rStatus.className = failed.length ? 'status err' : 'status';
    fill(rStatus, `Fetched ${got} posts, ${fresh} new.`,
      failed.length > 0 && [` Reddit blocked ${failed.length} of ${queries.length} automatic searches. Open each link below in a new tab, select everything on the page, copy it, and paste it into “Paste feedback”: `,
        failed.map((q) => [h('a', { href: redditSearchUrl(sub, q), target: '_blank', rel: 'noopener noreferrer' }, q), ' ; '])]);
    rBtn.disabled = false;
  } }, 'Search Reddit');

  // Paste
  const sLabel = h('input', { type: 'text', placeholder: 'e.g. Google Photos Help Community' });
  const sUrl = h('input', { type: 'text', placeholder: 'https://…' });
  const sText = h('textarea', { placeholder: 'One piece of feedback per paragraph. Leave a blank line between them.' });
  const sStatus = h('div', { class: 'status', role: 'status' });
  const sBtn = h('button', { class: 'act', onclick: () => {
    const label = sLabel.value.trim() || 'Pasted';
    const url = /^https?:\/\//.test(sUrl.value.trim()) ? sUrl.value.trim() : null;
    const raw = sText.value.trim();
    if (raw.startsWith('{') || raw.startsWith('[')) {
      let posts = null;
      try { posts = mapReddit(JSON.parse(raw), 'reddit'); } catch { /* not JSON after all */ }
      if (posts) {
        if (!posts.length) { sStatus.className = 'status err'; sStatus.textContent = 'That data has no Reddit posts in it. Copy the whole page and try again.'; return; }
        const fresh = addItems(posts);
        sStatus.className = 'status'; sStatus.textContent = `Added ${fresh} of ${posts.length} Reddit posts (duplicates are skipped).`;
        sText.value = ''; renderTally(); return;
      }
    }
    const parts = sText.value.split(/\n\s*\n/).map((t) => t.replace(/\s+/g, ' ').trim()).filter((t) => t.length >= 30);
    if (!parts.length) { sStatus.className = 'status err'; sStatus.textContent = 'Paste at least one paragraph of 30 characters or more.'; return; }
    const fresh = addItems(parts.map((t) => ({ id: `ps_${hash(t)}`, source: 'paste', label, url, date: null, rating: null, text: t.slice(0, 3000) })));
    sStatus.className = 'status'; sStatus.textContent = `Added ${fresh} of ${parts.length} paragraphs (duplicates are skipped).`;
    sText.value = ''; renderTally();
  } }, 'Add pasted feedback');

  fill(panel, 
    h('h2', {}, 'Collect public feedback'),
    h('p', { class: 'muted' }, 'Pull from several places so no single audience dominates. Most store reviews are about storage or backup; the next step screens those out.'),
    h('div', { class: 'grid2' },
      h('div', { class: 'block' }, h('h3', {}, 'Google Play reviews'),
        h('div', { class: 'fields' }, field('Country', pCountry), field('Order', pSort), field('Pages (150 each)', pPages)), pBtn, pStatus),
      h('div', { class: 'block' }, h('h3', {}, 'App Store reviews'),
        h('div', { class: 'fields' }, field('Country', aCountry), field('Pages (50 each)', aPages)), aBtn, aStatus),
      h('div', { class: 'block' }, h('h3', {}, 'Reddit posts'),
        h('div', { class: 'fields' }, field('Subreddit', rSub)), field('Search phrases, one per line', rQueries), h('div', { style: 'height:12px' }), rBtn, rStatus),
      h('div', { class: 'block' }, h('h3', {}, 'Paste feedback'),
        h('p', { class: 'small muted' }, 'For help-community threads, YouTube comments, forum posts or anything the fetchers cannot reach. Reddit data copied from a search link is recognised automatically.'),
        h('div', { class: 'fields' }, field('Where it is from', sLabel), field('Link (optional)', sUrl)), field('Feedback', sText), h('div', { style: 'height:12px' }), sBtn, sStatus)
    ),
    h('div', { class: 'block', id: 'tally' })
  );
  renderTally();
}

function renderTally() {
  const el = $('#tally');
  if (!el) return;
  const counts = {};
  for (const i of S.items) counts[i.label || i.source] = (counts[i.label || i.source] || 0) + 1;
  const fileIn = h('input', { type: 'file', accept: 'application/json', hidden: true, onchange: async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try { loadDataset(JSON.parse(await f.text())); save(); banner('Dataset imported.'); renderAll(); }
    catch { banner('That file is not a dataset exported from this tool.', true); }
  } });
  fill(el, 
    h('h3', {}, 'Dataset in this browser'),
    S.items.length
      ? h('div', { class: 'scroll' }, h('table', {},
        h('thead', {}, h('tr', {}, h('th', {}, 'Source'), h('th', { class: 'r' }, 'Items'))),
        h('tbody', {}, Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([k, n]) => h('tr', {}, h('td', {}, k), h('td', { class: 'r' }, n.toLocaleString()))),
          h('tr', {}, h('td', {}, h('b', {}, 'Total')), h('td', { class: 'r' }, h('b', {}, S.items.length.toLocaleString()))))))
      : h('p', { class: 'muted' }, 'Nothing collected yet. Fetch from a source above, or paste feedback.'),
    h('div', { class: 'row', style: 'margin-top:14px' },
      h('button', { class: 'act ghost', disabled: !S.items.length, onclick: exportDataset }, 'Export dataset'),
      h('button', { class: 'act ghost', onclick: () => fileIn.click() }, 'Import dataset'), fileIn,
      h('button', { class: 'act danger', disabled: !S.items.length, onclick: () => {
        if (!confirm('Remove all collected feedback, codes and answers from this browser?')) return;
        S.items = []; S.coded = {}; S.synthesis = null; S.qa = []; S.filter = null; S.snapshotInfo = null;
        save(); banner(''); renderAll();
      } }, 'Remove all data'))
  );
}

function exportDataset() {
  download('snapshot.json', JSON.stringify({ version: 1, exported_at: new Date().toISOString(), taxonomy: S.tax, items: S.items, coded: S.coded, synthesis: S.synthesis, qa: S.qa }), 'application/json');
}

function loadDataset(d) {
  if (!d || !Array.isArray(d.items)) throw new Error('bad dataset');
  S.items = d.items.filter((i) => i && i.id && i.text);
  S.coded = d.coded && typeof d.coded === 'object' ? d.coded : {};
  S.synthesis = d.synthesis || null;
  S.qa = Array.isArray(d.qa) ? d.qa : [];
  if (!S.tax && d.taxonomy) S.tax = d.taxonomy;
}

// ---------- 2. Code ----------
function codingQueue() {
  const uncoded = S.items.filter((i) => !S.coded[i.id]);
  const passing = S.ui.screen ? uncoded.filter((i) => SCREEN.test(i.text)) : uncoded;
  return { uncoded, passing, queue: passing.slice(0, Math.max(1, S.ui.limit)) };
}

function renderCode() {
  const panel = $('#tab-code');
  if (S.running) return;
  const { uncoded, passing, queue } = codingQueue();
  const codedN = S.items.filter((i) => S.coded[i.id]).length;
  const rel = relevant();
  const verified = rel.filter((r) => r.c.quote_verified).length;

  const screen = h('input', { type: 'checkbox', checked: S.ui.screen, onchange: (e) => { S.ui.screen = e.target.checked; renderCode(); } });
  const limit = h('input', { type: 'number', min: 10, max: 5000, step: 10, value: S.ui.limit, onchange: (e) => { S.ui.limit = Math.min(Math.max(+e.target.value || 10, 10), 5000); renderCode(); } });
  const prog = h('progress', { max: 1, value: 0, hidden: true });
  const status = h('div', { class: 'status', role: 'status' });
  const stopBtn = h('button', { class: 'act ghost', hidden: true, onclick: () => { S.stop = true; status.textContent = 'Stopping after this batch…'; } }, 'Stop');
  const runBtn = h('button', { class: 'act', disabled: !queue.length || !S.status?.provider, onclick: () => runCoding(queue, { prog, status, stopBtn, runBtn }) },
    queue.length ? `Code ${queue.length.toLocaleString()} items` : 'Nothing to code');

  fill(panel, 
    h('h2', {}, 'Code each item against the codebook'),
    h('p', { class: 'muted' }, 'A language model reads each item and records what the person was looking for, what they still remembered, what they had forgotten, how they searched, and where the attempt broke. Items that are not about finding photos are marked and set aside.'),
    !S.status?.provider && h('div', { class: 'banner err', style: 'margin-bottom:16px' }, 'No API key is configured on the server, so coding is unavailable. Add GEMINI_API_KEY or ANTHROPIC_API_KEY to the deployment.'),
    h('div', { class: 'block' },
      h('div', { class: 'scroll' }, h('table', {}, h('tbody', {},
        h('tr', {}, h('td', {}, 'Collected'), h('td', { class: 'r' }, S.items.length.toLocaleString())),
        h('tr', {}, h('td', {}, 'Already coded'), h('td', { class: 'r' }, codedN.toLocaleString())),
        h('tr', {}, h('td', {}, 'Not yet coded'), h('td', { class: 'r' }, uncoded.length.toLocaleString())),
        h('tr', {}, h('td', {}, S.ui.screen ? 'Of those, mention searching or finding' : 'Of those, eligible'), h('td', { class: 'r' }, passing.length.toLocaleString()))))),
      h('div', { style: 'height:14px' }),
      h('label', { class: 'check' }, screen, h('span', {}, 'Only code items that mention searching, finding, scrolling or remembering. This keyword screen saves model calls; untick it to code everything.')),
      h('div', { class: 'fields', style: 'margin-top:12px' }, h('div', { style: 'flex:0 1 220px' }, h('label', {}, 'Most items to code in this run', limit))),
      h('div', { class: 'row' }, runBtn, stopBtn),
      h('div', { style: 'height:10px' }), prog, status,
      S.status?.provider && h('p', { class: 'small muted', style: 'margin-top:10px' }, `Coding model: ${S.status.model}. Items go in batches of ${BATCH}.`)
    ),
    codedN > 0 && h('div', { class: 'block' },
      h('h3', {}, 'Result so far'),
      h('p', {}, `${rel.length.toLocaleString()} of ${codedN.toLocaleString()} coded items are about finding a photo. ${verified.toLocaleString()} carry a quote that matched its source exactly; the rest are shown as excerpts.`),
      h('button', { class: 'act ghost', onclick: () => showTab('compare') }, 'Compare the retrieval problems'))
  );
}

async function runCoding(queue, ui) {
  S.running = true; S.stop = false;
  ui.runBtn.disabled = true; ui.stopBtn.hidden = false; ui.prog.hidden = false; ui.status.className = 'status';
  let done = 0, missing = 0, failed = null;
  for (let i = 0; i < queue.length && !S.stop; i += BATCH) {
    const batch = queue.slice(i, i + BATCH).map(({ id, source, text }) => ({ id, source, text }));
    let result = null;
    for (let attempt = 1; attempt <= 4 && !result && !S.stop; attempt++) {
      try {
        ui.status.textContent = `Coding items ${i + 1} to ${Math.min(i + BATCH, queue.length)} of ${queue.length}…`;
        result = await api('/api/code', { items: batch });
      } catch (e) {
        if (e.status === 429 && attempt < 4) {
          for (let s = 30; s > 0 && !S.stop; s--) { ui.status.textContent = `The model's rate limit was reached. Continuing in ${s} s…`; await sleep(1000); }
        } else if ((e.status === 502 || e.status === 503) && attempt < 4) {
          // A garbled or overloaded reply is usually a one-off: try the same batch again.
          for (let s = 6; s > 0 && !S.stop; s--) { ui.status.textContent = `The model gave an unusable reply. Trying this batch again in ${s} s…`; await sleep(1000); }
        } else { failed = e; break; }
      }
    }
    if (failed || !result) break;
    for (const c of result.coded) { if (c.missing) missing++; else S.coded[c.id] = c; }
    done += batch.length;
    ui.prog.value = done / queue.length;
    save(); renderFunnel();
  }
  S.running = false; S.synthesis = S.synthesis && { ...S.synthesis, stale: true };
  renderCode();
  const status = $('#tab-code .status');
  if (failed) { status.className = 'status err'; status.textContent = `Stopped after ${done} items: ${failed.message}`; }
  else status.textContent = `Coded ${done - missing} items${missing ? `; the model skipped ${missing}, run again to retry them` : ''}${S.stop ? ' (stopped early)' : ''}.`;
}

// ---------- 3. Compare ----------
function barList(counts, field, total, opts = {}) {
  const entries = Object.entries(counts).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
  if (!entries.length) return h('p', { class: 'muted small' }, 'Not stated in any coded item yet.');
  const max = entries[0][1];
  return h('ul', { class: 'bars' + (opts.orange ? ' o' : '') }, entries.map(([key, n]) => {
    const pairs = [[field, key]];
    return h('li', { class: 'click' + (sameFilter(pairs) ? ' on' : ''), tabindex: 0, role: 'button',
      title: S.tax[field].values[key].long,
      onclick: () => setFilter(pairs, `${S.tax[field].label}: ${short(field, key)}`),
      onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setFilter(pairs, `${S.tax[field].label}: ${short(field, key)}`); } } },
    h('span', {}, short(field, key)), h('div', { class: 'track' }, h('i', { style: `width:${pct(n, max)}%` })), h('b', {}, n));
  }));
}

function evidenceCard(item, c) {
  const tags = [
    h('span', { class: 'tag g' }, short('photo_type', c.photo_type)),
    h('span', { class: 'tag g' }, short('failure_stage', c.failure_stage)),
    ...(c.remembered || []).map((k) => h('span', { class: 'tag', title: 'Still remembered' }, `Remembers: ${short('remembered', k).toLowerCase()}`)),
    ...(c.forgotten || []).map((k) => h('span', { class: 'tag o', title: 'No longer known' }, `Forgot: ${short('forgotten', k).toLowerCase()}`)),
    ...(c.workaround || []).map((k) => h('span', { class: 'tag g' }, short('workaround', k))),
    c.outcome !== 'unknown' && h('span', { class: 'tag g' }, short('outcome', c.outcome)),
    c.stakes === 'high' && h('span', { class: 'tag o' }, 'High stakes')
  ];
  const meta = [item.label || item.source, item.date, item.rating ? `${item.rating} of 5 stars` : null].filter(Boolean).join(', ');
  return h('div', { class: 'ev', id: `ev-${item.id}` },
    h('blockquote', {}, c.quote_verified && c.quote ? `“${c.quote}”` : `${item.text.slice(0, 220)}${item.text.length > 220 ? '…' : ''}`),
    h('div', { class: 'src' }, c.quote_verified ? 'Exact quote. ' : 'Excerpt. ', meta, item.url && [' ', h('a', { href: item.url, target: '_blank', rel: 'noopener noreferrer' }, 'Open source')], ` (${item.id})`),
    h('div', {}, tags),
    c.query_example && h('div', { class: 'small' }, 'They searched: ', h('b', {}, c.query_example)),
    c.note && h('div', { class: 'small muted' }, `Coder's reason: ${c.note}`),
    h('details', {}, h('summary', {}, 'Full text'), h('p', {}, item.text))
  );
}

function evidenceChip(id, mount) {
  const item = S.items.find((i) => i.id === id), c = S.coded[id];
  if (!item || !c) return null;
  return h('button', { class: 'chip', title: 'Show this piece of evidence', onclick: () => {
    const open = mount.querySelector(`#ev-${CSS.escape(id)}`);
    if (open) { open.remove(); return; }
    mount.append(evidenceCard(item, c));
  } }, id);
}

function renderOpportunities() {
  const syn = S.synthesis;
  const status = h('div', { class: 'status', role: 'status' });
  const rows = rowsForModel();
  const btn = h('button', { class: 'act', disabled: rows.length < 5 || !S.status?.provider, onclick: async () => {
    btn.disabled = true; status.className = 'status'; status.textContent = `Reading ${rows.length} coded items…`;
    try { S.synthesis = await api('/api/synthesize', { stats: computeStats(), items: rows }); save(); renderCompare(); $('#opps')?.scrollIntoView({ block: 'start' }); }
    catch (e) { status.className = 'status err'; status.textContent = e.message; btn.disabled = false; }
  } }, syn ? 'Redraft opportunity areas' : 'Draft opportunity areas');

  return h('div', { id: 'opps' },
    h('h2', {}, 'Opportunity areas'),
    h('p', { class: 'muted' }, 'The model groups the coded evidence into distinct retrieval problems. Each one has to cite items from this dataset; citations that do not exist are removed and the strength label is capped by how many remain.'),
    h('div', { class: 'row', style: 'margin-bottom:14px' }, btn, rows.length < 5 && h('span', { class: 'muted small' }, 'Needs at least 5 coded items about finding photos.')),
    status,
    syn?.stale && h('div', { class: 'banner', style: 'margin-bottom:14px' }, 'More items have been coded since this draft. Redraft to include them.'),
    syn && syn.opportunities.map((o) => {
      const mount = h('div', {});
      return h('div', { class: 'block opp' },
        h('h3', {}, o.name, h('span', { class: 'strength' }, `${o.evidence_strength} evidence, ${o.evidence_ids.length} cited`)),
        h('dl', {},
          h('dt', {}, 'Scenario'), h('dd', {}, o.scenario),
          h('dt', {}, 'Breaks at'), h('dd', {}, short('failure_stage', o.breaks_at)),
          h('dt', {}, 'Root cause'), h('dd', {}, o.root_cause),
          h('dt', {}, 'What people do instead'), h('dd', {}, o.workaround || 'Not shown in the evidence'),
          h('dt', {}, 'Would change this view'), h('dd', {}, o.would_change_my_mind),
          h('dt', {}, 'Evidence'), h('dd', {}, o.evidence_ids.length ? o.evidence_ids.map((id) => evidenceChip(id, mount)) : 'No valid citations')),
        mount);
    }),
    syn && (syn.not_supported.length > 0 || syn.caveats.length > 0) && h('div', { class: 'grid2' },
      h('div', { class: 'block' }, h('h3', {}, 'Not supported by this data'), h('ul', {}, syn.not_supported.map((t) => h('li', {}, t)))),
      h('div', { class: 'block' }, h('h3', {}, 'Limits of this dataset'), h('ul', {}, syn.caveats.map((t) => h('li', {}, t))))),
    syn && h('p', { class: 'small muted' }, `Drafted by ${syn.model} from ${syn.rows_used} coded items.`)
  );
}

function renderCompare() {
  const panel = $('#tab-compare');
  const rows = relevant();
  if (!rows.length) {
    fill(panel, h('h2', {}, 'Compare retrieval problems'),
      h('div', { class: 'empty' }, h('p', {}, S.items.length ? 'Nothing has been coded yet, so there is nothing to compare.' : 'There is no feedback in this browser yet.'),
        h('button', { class: 'act', onclick: () => showTab(S.items.length ? 'code' : 'collect') }, S.items.length ? 'Go to coding' : 'Collect feedback')));
    return;
  }
  const scoped = inScope(rows);
  const stages = stageTable(rows);
  const maxN = Math.max(...stages.map((s) => s.n), 1);
  const ranked = [...stages].sort((a, b) => (b.inScope - a.inScope) || (b.score - a.score));

  const stageRows = ranked.filter((s) => s.n > 0).map((s) => {
    const pairs = [['failure_stage', s.stage]];
    return h('tr', { class: 'click' + (sameFilter(pairs) ? ' on' : ''), tabindex: 0, title: S.tax.failure_stage.values[s.stage].long,
      onclick: () => setFilter(pairs, `Where it broke: ${short('failure_stage', s.stage)}`),
      onkeydown: (e) => { if (e.key === 'Enter') setFilter(pairs, `Where it broke: ${short('failure_stage', s.stage)}`); } },
    h('td', {}, short('failure_stage', s.stage), !s.inScope && h('span', { class: 'muted small' }, ' (outside the retrieval problem)')),
    h('td', {}, h('span', { class: 'meter' }, h('i', { style: `width:${pct(s.n, maxN)}%` })), h('span', { class: 'num' }, s.n)),
    h('td', { class: 'r' }, s.n ? `${s.notFound} (${pct(s.notFound, s.n)}%)` : ''),
    h('td', { class: 'r' }, s.n ? `${s.high} (${pct(s.high, s.n)}%)` : ''),
    h('td', { class: 'r' }, s.inScope ? s.score.toFixed(1) : ''));
  });

  // Heatmap: kind of photo by where it broke (in-scope stages only)
  const stageKeys = Object.keys(S.tax.failure_stage.values).filter((k) => S.tax.failure_stage.values[k].inScope);
  const typeKeys = Object.keys(S.tax.photo_type.values).filter((t) => scoped.some((r) => r.c.photo_type === t));
  const cellN = (t, s) => scoped.filter((r) => r.c.photo_type === t && r.c.failure_stage === s).length;
  const maxCell = Math.max(1, ...typeKeys.flatMap((t) => stageKeys.map((s) => cellN(t, s))));
  const heat = typeKeys.length
    ? h('div', { class: 'scroll' }, h('table', { class: 'heat' },
      h('thead', {}, h('tr', {}, h('th', {}, ''), stageKeys.map((s) => h('th', { title: S.tax.failure_stage.values[s].long }, short('failure_stage', s))))),
      h('tbody', {}, typeKeys.map((t) => h('tr', {}, h('th', { class: 'rowh', scope: 'row' }, short('photo_type', t)),
        stageKeys.map((s) => {
          const n = cellN(t, s);
          const a = n / maxCell;
          const pairs = [['photo_type', t], ['failure_stage', s]];
          return h('td', { class: (n ? '' : 'zero') + (sameFilter(pairs) ? ' on' : ''),
            style: n ? `background:rgba(11,95,165,${(0.12 + 0.88 * a).toFixed(2)});color:${a > 0.5 ? '#fff' : '#16202E'}` : '',
            onclick: n ? () => setFilter(pairs, `${short('photo_type', t)}, ${short('failure_stage', s).toLowerCase()}`) : null }, n || '·');
        }))))))
    : h('p', { class: 'muted small' }, 'No coded item shows where retrieval broke yet.');

  const queries = rows.filter((r) => r.c.query_example).slice(0, 14);
  const shown = rows.filter((r) => matches(r.c, S.filter))
    .sort((a, b) => (b.c.quote_verified - a.c.quote_verified) || ((b.c.stakes === 'high') - (a.c.stakes === 'high')));

  fill(panel, 
    h('h2', {}, 'Compare retrieval problems'),
    h('p', { class: 'muted' }, `Based on ${rows.length.toLocaleString()} coded items about finding a photo. Select any row, bar or cell to read the evidence behind it.`),

    h('div', { class: 'block' },
      h('h3', {}, 'Where retrieval breaks'),
      h('div', { class: 'scroll' }, h('table', {},
        h('thead', {}, h('tr', {}, h('th', {}, 'Stage'), h('th', {}, 'Items'), h('th', { class: 'r' }, 'Never found'), h('th', { class: 'r' }, 'High stakes'), h('th', { class: 'r' }, 'Priority score'))),
        h('tbody', {}, stageRows))),
      h('p', { class: 'small muted', style: 'margin-top:10px' }, 'Priority score = items × (1 + share never found) × (1 + share high stakes). It ranks stages by how often they occur and how badly they end; it is a sorting aid, not a measurement.')),

    h('div', { class: 'block' }, h('h3', {}, 'Which kinds of photo break at which stage'), heat),

    h('div', { class: 'grid2' },
      h('div', { class: 'block' }, h('h3', {}, 'What people still remember'), barList(tally(rows, 'remembered'), 'remembered', rows.length)),
      h('div', { class: 'block' }, h('h3', {}, 'What they no longer know'), barList(tally(rows, 'forgotten'), 'forgotten', rows.length, { orange: true })),
      h('div', { class: 'block' }, h('h3', {}, 'How they searched'), barList(tally(rows, 'search_method'), 'search_method', rows.length)),
      h('div', { class: 'block' }, h('h3', {}, 'What they did instead'), barList(tally(rows, 'workaround'), 'workaround', rows.length))),

    queries.length > 0 && h('div', { class: 'block' }, h('h3', {}, 'Searches people say they typed'),
      h('ul', {}, queries.map((r) => h('li', {}, h('b', {}, r.c.query_example), h('span', { class: 'muted small' }, ` (${short('failure_stage', r.c.failure_stage).toLowerCase()}, ${r.item.id})`))))),

    h('div', { class: 'block', id: 'evidence' },
      h('div', { class: 'row', style: 'justify-content:space-between' },
        h('h3', { style: 'margin:0' }, S.filter ? `Evidence for “${S.filter.label}” (${shown.length})` : `All evidence (${shown.length})`),
        h('div', { class: 'row' },
          S.filter && h('button', { class: 'act ghost', onclick: () => { S.filter = null; renderCompare(); } }, 'Show all'),
          h('button', { class: 'act ghost', onclick: exportCsv }, 'Download as CSV'))),
      shown.slice(0, S.evShown).map((r) => evidenceCard(r.item, r.c)),
      shown.length > S.evShown && h('button', { class: 'act ghost', style: 'margin-top:12px', onclick: () => { S.evShown += 25; renderCompare(); } }, `Show 25 more of ${shown.length - S.evShown}`)),

    renderOpportunities()
  );
}

function exportCsv() {
  const cols = ['id', 'source', 'date', 'rating', 'photo_type', 'failure_stage', 'remembered', 'forgotten', 'search_method', 'workaround', 'outcome', 'stakes', 'query_example', 'quote', 'quote_verified', 'note', 'url', 'text'];
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [cols.join(',')];
  for (const { item, c } of relevant()) {
    const row = { ...item, ...c, source: item.label || item.source };
    lines.push(cols.map((k) => esc(Array.isArray(row[k]) ? row[k].join('; ') : row[k])).join(','));
  }
  download('coded-evidence.csv', '\uFEFF' + lines.join('\n'), 'text/csv');
}

// ---------- 4. Ask ----------
const SAMPLE_QUESTIONS = [
  'What kinds of old photos do people struggle to find?',
  'What do people still remember about a photo they cannot find?',
  'What have they forgotten by the time they search?',
  'How do people phrase a search when their memory is incomplete?',
  'What do people do after the first search fails?'
];

function answerNodes(text, mount) {
  const out = [];
  let last = 0;
  for (const m of text.matchAll(/\[([\w.-]+(?:\s*,\s*[\w.-]+)*)\]/g)) {
    out.push(text.slice(last, m.index));
    for (const id of m[1].split(',').map((s) => s.trim())) out.push(evidenceChip(id, mount) || `[${id}]`);
    last = m.index + m[0].length;
  }
  out.push(text.slice(last));
  return out;
}

function renderAsk() {
  const panel = $('#tab-ask');
  const rows = rowsForModel();
  const input = h('input', { type: 'text', maxlength: 300, placeholder: 'Ask a question about the coded evidence' });
  const status = h('div', { class: 'status', role: 'status' });
  const ask = async () => {
    const q = input.value.trim();
    if (q.length < 8) { status.className = 'status err'; status.textContent = 'Ask a full question.'; return; }
    btn.disabled = true; status.className = 'status'; status.textContent = `Reading ${rows.length} coded items…`;
    try {
      const r = await api('/api/ask', { question: q, items: rows });
      S.qa.unshift({ q, ...r, at: new Date().toISOString() }); S.qa = S.qa.slice(0, 30); save(); renderAsk();
    } catch (e) { status.className = 'status err'; status.textContent = e.message; btn.disabled = false; }
  };
  const btn = h('button', { class: 'act', disabled: !rows.length || !S.status?.provider, onclick: ask }, 'Ask');
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !btn.disabled) ask(); });

  fill(panel, 
    h('h2', {}, 'Ask the evidence'),
    h('p', { class: 'muted' }, 'Answers are written only from the coded items, with the item behind each claim. If the evidence does not cover a question, the answer says so.'),
    !rows.length && h('div', { class: 'empty', style: 'margin-bottom:16px' }, h('p', {}, 'There is no coded evidence to answer from yet.'), h('button', { class: 'act', onclick: () => showTab(S.items.length ? 'code' : 'collect') }, S.items.length ? 'Go to coding' : 'Collect feedback')),
    h('div', { class: 'block' },
      h('div', { class: 'row' }, h('div', { style: 'flex:1 1 320px' }, input), btn),
      h('div', { style: 'margin-top:12px' }, SAMPLE_QUESTIONS.map((q) => h('button', { class: 'chip', onclick: () => { input.value = q; input.focus(); } }, q))),
      status),
    S.qa.map((a) => {
      const mount = h('div', {});
      return h('div', { class: 'block' }, h('h3', {}, a.q), h('p', {}, answerNodes(a.answer, mount)),
        h('p', { class: 'small muted' }, `Answered by ${a.model} from ${a.rows_used} coded items.`), mount);
    })
  );
}

// ---------- How it works ----------
function renderHow() {
  const panel = $('#tab-how');
  const codebook = S.tax ? Object.entries(S.tax).map(([, def]) => h('div', { class: 'block' },
    h('h3', {}, def.label, h('span', { class: 'muted small' }, def.multi ? ' (any that apply)' : ' (exactly one)')),
    h('div', { class: 'scroll' }, h('table', {}, h('tbody', {}, Object.values(def.values).map((v) => h('tr', {}, h('td', { style: 'white-space:nowrap' }, v.short), h('td', {}, v.long)))))))) : [];
  fill(panel, 
    h('h2', {}, 'How the engine works'),
    h('div', { class: 'block' }, h('ol', { class: 'steps' },
      h('li', {}, h('b', {}, 'Collect. '), 'Fetches Google Play and App Store reviews and Reddit posts, and accepts pasted text from anywhere else. Usernames are dropped; each item keeps its source and link.'),
      h('li', {}, h('b', {}, 'Screen. '), 'A keyword screen sets aside items that never mention searching, finding, scrolling or remembering, so the model is not spent on storage and billing complaints.'),
      h('li', {}, h('b', {}, 'Code. '), 'A language model reads each remaining item and fills in the codebook below. It is told to leave a field empty rather than guess. Answers outside the codebook are dropped, and a quote is kept only if it matches the source text exactly.'),
      h('li', {}, h('b', {}, 'Compare. '), 'Counting is done in code, not by the model: where retrieval breaks, for which kinds of photo, what people remembered and what they had lost. Every number opens the items behind it.'),
      h('li', {}, h('b', {}, 'Synthesise and ask. '), 'The model drafts opportunity areas and answers questions from the coded rows only. Each claim must cite item ids, and ids that are not in the dataset are removed.'))),
    h('div', { class: 'block' }, h('h3', {}, 'What this cannot tell you'),
      h('ul', {},
        h('li', {}, 'People who post reviews are not a sample of all users. Counts show which problems appear and how they compare here, not how common they are among everyone.'),
        h('li', {}, 'People who quietly gave up rarely write about it, so silent failure is under-counted.'),
        h('li', {}, 'A post says what someone chose to mention. What they actually remembered and did is something only interviews and observation can confirm.'))),
    h('h2', { style: 'margin-top:26px' }, 'The codebook'),
    codebook
  );
}

// ---------- shell ----------
const RENDER = { collect: renderCollect, code: renderCode, compare: renderCompare, ask: renderAsk, how: renderHow };
let current = 'collect';

function showTab(name) {
  current = name;
  for (const b of document.querySelectorAll('[role=tab]')) b.setAttribute('aria-selected', b.dataset.tab === name ? 'true' : 'false');
  for (const p of document.querySelectorAll('.panel')) p.hidden = p.id !== `tab-${name}`;
  RENDER[name]();
  window.scrollTo({ top: 0 });
}

function renderAll() { renderFunnel(); RENDER[current](); }

async function init() {
  for (const b of document.querySelectorAll('[role=tab]')) b.addEventListener('click', () => showTab(b.dataset.tab));

  try { S.status = await api('/api/status'); S.tax = S.status.taxonomy; }
  catch { S.status = { provider: null }; }

  let local = null;
  try { local = JSON.parse(localStorage.getItem(LS_KEY) || 'null'); } catch { /* ignore */ }

  if (local?.items?.length) {
    loadDataset(local);
  } else {
    try {
      const resp = await fetch('/snapshot.json', { cache: 'no-store' });
      const snap = resp.ok ? await resp.json() : null;
      if (snap?.items?.length) { loadDataset(snap); S.snapshotInfo = { at: snap.exported_at, n: snap.items.length }; }
      else if (snap?.taxonomy && !S.tax) S.tax = snap.taxonomy;
    } catch { /* no snapshot published */ }
  }

  if (!S.tax) { banner('The server did not respond, so the codebook could not be loaded. Reload the page.', true); return; }
  if (S.status.mock) banner('Mock mode is on: codes and answers are produced by test rules, not a model. Nothing here is research evidence.', true);
  else if (S.snapshotInfo) banner(`Showing the published dataset: ${S.snapshotInfo.n.toLocaleString()} items${S.snapshotInfo.at ? `, exported ${S.snapshotInfo.at.slice(0, 10)}` : ''}. Anything you add stays in this browser.`);

  showTab(S.snapshotInfo && Object.keys(S.coded).length ? 'compare' : 'collect');
  renderFunnel();
}

init();