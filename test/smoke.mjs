// Runs the API handlers end to end in mock mode. No network, no API key.
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import { sanitize, verifyQuote, TAXONOMY } from '../lib/taxonomy.js';
import { parseJsonLoose } from '../lib/llm.js';
import { mapRedditListing } from '../lib/sources.js';

process.env.MOCK_LLM = '1';
const { items } = JSON.parse(fs.readFileSync(new URL('./fixtures.json', import.meta.url)));

// --- unit checks ---
assert.deepEqual(sanitize({ id: 1, relevant: false, photo_type: 'moment' }), { id: '1', relevant: false });
const s = sanitize({ id: 'a', relevant: true, photo_type: 'nonsense', remembered: ['who', 'who', 'bogus'], failure_stage: 'refine', stakes: 'HIGH', extra: 1 });
assert.equal(s.photo_type, 'not_stated'); assert.deepEqual(s.remembered, ['who']); assert.equal(s.failure_stage, 'refine');
assert.equal(s.stakes, 'not_stated'); assert.equal(s.extra, undefined); assert.equal(s.outcome, 'unknown');
assert.equal(verifyQuote('got random pictures of food', items[0].text), true);
assert.equal(verifyQuote('“Got  random pictures of FOOD.”', items[0].text), true);
assert.equal(verifyQuote('search is completely broken', items[0].text), false);
assert.equal(verifyQuote('', items[0].text), false);
assert.deepEqual(parseJsonLoose('```json\n{"a":1}\n```'), { a: 1 });
assert.deepEqual(parseJsonLoose('Here you go: {"a":[1,2]} thanks'), { a: [1, 2] });
assert.throws(() => parseJsonLoose('no json here'));
const rd = mapRedditListing({ data: { children: [{ data: { id: 'x1', title: 'Cannot find an old photo', selftext: 'I searched everywhere for it in the app.', permalink: '/r/googlephotos/comments/x1/', subreddit: 'googlephotos', created_utc: 1750000000 } }, { data: { id: 'x2', title: 'hi', selftext: '' } }] } }, 'googlephotos');
assert.equal(rd.length, 1); assert.equal(rd[0].id, 'rd_x1'); assert.equal(rd[0].date, '2025-06-15');
for (const def of Object.values(TAXONOMY)) for (const v of Object.values(def.values)) assert.ok(v.short && v.long);

// --- endpoint checks through a real HTTP server ---
const handlers = {};
for (const name of ['status', 'code', 'synthesize', 'ask', 'collect']) handlers[name] = (await import(`../api/${name}.js`)).default;
const server = http.createServer((req, res) => handlers[req.url.split('/').pop()](req, res)).listen(0);
const base = `http://localhost:${server.address().port}/api/`;
const post = async (p, body) => { const r = await fetch(base + p, { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } }); return { status: r.status, json: await r.json() }; };

const st = await (await fetch(base + 'status')).json();
assert.equal(st.mock, true); assert.ok(st.taxonomy.failure_stage);

let r = await post('code', { items });
assert.equal(r.status, 200);
const coded = r.json.coded;
assert.equal(coded.length, items.length);
const by = Object.fromEntries(coded.map((c) => [c.id, c]));
assert.equal(by.t2.relevant, false); assert.equal(by.t5.relevant, false); assert.equal(by.t7.relevant, false);
assert.equal(by.t1.relevant, true); assert.equal(by.t1.photo_type, 'receipt_or_bill'); assert.equal(by.t1.quote_verified, true);
assert.equal(by.t1.bogus_field, undefined, 'off-codebook fields are dropped');
assert.equal(by.t3.outcome, 'found_with_effort'); assert.ok(by.t3.workaround.includes('scroll_timeline'));
assert.equal(by.t4.failure_stage, 'coverage'); assert.ok(by.t4.workaround.includes('other_app'));

assert.equal((await post('code', { items: [] })).status, 400);
assert.equal((await post('code', { items: Array.from({ length: 13 }, (_, i) => ({ id: 'x' + i, text: 'search find photo text here' })) })).status, 400);
assert.equal((await fetch(base + 'code')).status, 405);

const rel = coded.filter((c) => c.relevant);
r = await post('synthesize', { stats: { n: rel.length }, items: rel });
assert.equal(r.status, 400, 'needs at least 5 rows');
r = await post('synthesize', { stats: {}, items: [...rel, { ...rel[0], id: 'dup1' }] });
assert.equal(r.status, 200);
assert.ok(!r.json.opportunities[0].evidence_ids.includes('made_up_id'), 'invented citations are removed');
assert.equal(r.json.opportunities[0].evidence_ids.length, 3);

r = await post('ask', { question: 'What do people remember?', items: rel });
assert.equal(r.status, 200); assert.deepEqual(r.json.evidence_ids, [rel[0].id]);
assert.equal((await post('ask', { question: 'short', items: rel })).status, 400);
assert.equal((await post('collect', { source: 'nope' })).status, 400);

// --- no key configured gives a readable error ---
delete process.env.MOCK_LLM; delete process.env.GEMINI_API_KEY; delete process.env.ANTHROPIC_API_KEY;
r = await post('code', { items: items.slice(0, 1) });
assert.equal(r.status, 500); assert.match(r.json.error, /No API key/);

server.close();
console.log('All smoke checks passed.');
