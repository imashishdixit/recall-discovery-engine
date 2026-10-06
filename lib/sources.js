export const clean = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
export const isoDate = (d) => { const t = new Date(d); return Number.isNaN(t.getTime()) ? null : t.toISOString().slice(0, 10); };

export function mapRedditListing(data, subreddit) {
  const children = data?.data?.children || [];
  return children.map((c) => c.data).filter((p) => p && p.id && (p.selftext || p.title)).map((p) => ({
    id: `rd_${p.id}`, source: 'reddit', label: `r/${p.subreddit || subreddit}`,
    url: `https://www.reddit.com${p.permalink}`,
    date: p.created_utc ? isoDate(p.created_utc * 1000) : null, rating: null,
    text: clean(`${p.title || ''}. ${p.selftext || ''}`, 3000)
  })).filter((i) => i.text.length > 30);
}
