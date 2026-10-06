import { route, send, readJson, fail } from '../lib/http.js';
import { mapRedditListing, clean, isoDate } from '../lib/sources.js';

const code2 = (s, d) => (/^[a-z]{2}$/i.test(String(s || '')) ? String(s).toLowerCase() : d);

async function collectPlay(body) {
  const { default: gplay } = await import('google-play-scraper');
  const sort = { newest: gplay.sort.NEWEST, helpful: gplay.sort.HELPFULNESS, rating: gplay.sort.RATING }[body.sort] ?? gplay.sort.NEWEST;
  const appId = /^[\w.]+$/.test(body.appId || '') ? body.appId : 'com.google.android.apps.photos';
  const country = code2(body.country, 'in');
  let result;
  try {
    result = await gplay.reviews({
      appId, sort, country, lang: code2(body.lang, 'en'), num: 150,
      paginate: true, nextPaginationToken: body.token || null
    });
  } catch (e) {
    throw fail(502, `Google Play did not return reviews (${e.message}). Try again, or paste reviews instead.`);
  }
  const items = (result.data || []).filter((r) => r.text && r.text.trim().length > 20).map((r) => ({
    id: `gp_${String(r.id).replace(/[^\w-]/g, '').slice(0, 60)}`,
    source: 'play', label: `Play Store (${country.toUpperCase()})`,
    url: r.url || `https://play.google.com/store/apps/details?id=${appId}&showAllReviews=true`,
    date: isoDate(r.date), rating: r.score ?? null, text: clean(r.text, 3000)
  }));
  return { items, nextToken: result.nextPaginationToken || null, fetched: (result.data || []).length };
}

async function collectAppStore(body) {
  const country = code2(body.country, 'us');
  const appId = /^\d+$/.test(String(body.appId || '')) ? String(body.appId) : '962194608';
  const page = Math.min(Math.max(parseInt(body.page, 10) || 1, 1), 10);
  const url = `https://itunes.apple.com/${country}/rss/customerreviews/page=${page}/id=${appId}/sortby=mostrecent/json`;
  const resp = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (research prototype)' } });
  if (!resp.ok) throw fail(502, `App Store returned ${resp.status}. Try another country, or paste reviews instead.`);
  let data;
  try { data = await resp.json(); } catch { throw fail(502, 'App Store returned an unreadable response.'); }
  let entries = data?.feed?.entry || [];
  if (!Array.isArray(entries)) entries = [entries];
  const items = entries.filter((e) => e?.['im:rating'] && e?.content?.label).map((e) => ({
    id: `as_${String(e.id?.label || '').replace(/[^\w-]/g, '').slice(0, 40)}`,
    source: 'appstore', label: `App Store (${country.toUpperCase()})`,
    url: `https://apps.apple.com/${country}/app/id${appId}?see-all=reviews`,
    date: isoDate(e.updated?.label), rating: parseInt(e['im:rating'].label, 10) || null,
    text: clean(`${e.title?.label || ''}. ${e.content.label}`, 3000)
  })).filter((i) => i.id.length > 3 && i.text.length > 20);
  return { items, nextPage: entries.length && page < 10 ? page + 1 : null, fetched: entries.length };
}

async function collectReddit(body) {
  const subreddit = /^\w{2,30}$/.test(body.subreddit || '') ? body.subreddit : 'googlephotos';
  const q = clean(body.query, 120);
  if (!q) throw fail(400, 'Give a search phrase.');
  const url = `https://www.reddit.com/r/${subreddit}/search.json?q=${encodeURIComponent(q)}&restrict_sr=1&sort=relevance&t=all&limit=100&raw_json=1`;
  const resp = await fetch(url, { headers: { 'User-Agent': 'web:recall-discovery-engine:1.0 (research prototype)' } });
  if (!resp.ok) throw fail(502, `Reddit returned ${resp.status}. Reddit often blocks cloud servers; paste the thread text instead.`);
  let data;
  try { data = await resp.json(); } catch { throw fail(502, 'Reddit returned an unreadable response.'); }
  const items = mapRedditListing(data, subreddit);
  return { items, fetched: items.length };
}

export default route(['POST'], async (req, res) => {
  const body = await readJson(req);
  if (body.source === 'play') return send(res, 200, await collectPlay(body));
  if (body.source === 'appstore') return send(res, 200, await collectAppStore(body));
  if (body.source === 'reddit') return send(res, 200, await collectReddit(body));
  throw fail(400, 'source must be play, appstore or reddit.');
});
