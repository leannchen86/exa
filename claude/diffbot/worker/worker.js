// Diffoogle search proxy (Cloudflare Worker). Lets the static GitHub Pages site
// serve real results: a keyless web search (DuckDuckGo) sources the links, then
// Diffbot Extract structures each page. DIFFBOT_TOKEN is a Worker secret.
//
// Same logic as ../server.js, minus static file serving. Supports ?q= (fast web
// links) and ?q=&enrich=1 (Diffbot-structured). No AI Overview (no RAG).
//
// NOTE: DuckDuckGo may rate-limit or block datacenter IPs. If it returns nothing,
// this responds with an empty result set and the front-end shows its bundled mock.

export default {
  async fetch(request, env) {
    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });

    const url = new URL(request.url);
    const q = (url.searchParams.get('q') || '').trim();
    const enrich = url.searchParams.get('enrich') === '1';
    if (!q) return json({ query: '', results: [], answer: null, source: 'none' }, cors);

    try {
      const start = Date.now();
      const results = await ddgSearch(q);
      if (!results.length) return json({ query: q, results: [], answer: null, source: 'web' }, cors);
      let source = 'web';
      if (enrich && env.DIFFBOT_TOKEN) {
        await enrichWithExtract(results, env.DIFFBOT_TOKEN);
        source = 'diffbot';
      }
      return json({ query: q, results, answer: null, elapsed: (Date.now() - start) / 1000, source }, cors);
    } catch (err) {
      return json({ error: String(err.message || err), results: [], answer: null }, cors, 500);
    }
  },
};

function json(obj, cors, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...cors },
  });
}

async function ddgSearch(query) {
  const resp = await fetch('https://html.duckduckgo.com/html/?q=' + encodeURIComponent(query), {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
    },
  });
  if (!resp.ok) throw new Error(`search ${resp.status}`);
  const html = await resp.text();

  const titles = [...html.matchAll(/<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)];
  const snips = [...html.matchAll(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g)];

  const seen = new Set();
  const results = [];
  for (let i = 0; i < titles.length && results.length < 9; i++) {
    const t = titles[i];
    const u = ddgRealUrl(t[1]);
    if (!u || seen.has(u)) continue;
    seen.add(u);
    const nextIdx = i + 1 < titles.length ? titles[i + 1].index : Infinity;
    const snip = snips.find((s) => s.index > t.index && s.index < nextIdx);
    results.push({
      title: stripHtml(t[2]),
      url: u,
      snippet: snip ? stripHtml(snip[1]) : '',
      summary: '',
      publishedDate: null,
      author: null,
    });
  }
  return results;
}

async function enrichWithExtract(results, token) {
  await Promise.all(results.map(async (r) => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    try {
      const api = 'https://api.diffbot.com/v3/article'
        + '?token=' + encodeURIComponent(token)
        + '&url=' + encodeURIComponent(r.url)
        + '&discussion=false';
      const resp = await fetch(api, { signal: ctrl.signal });
      if (!resp.ok) return;
      const data = await resp.json();
      const obj = data.objects && data.objects[0];
      if (!obj) return;
      const probe = ((obj.title || '') + ' ' + String(obj.text || '').slice(0, 140)).toLowerCase();
      if (/access denied|forbidden|attention required|just a moment|are you a (human|robot)|verify you are|enable javascript|captcha|security check|\b40[34]\b/.test(probe)) return;
      if (obj.title && obj.title.trim().toLowerCase() !== 'no title') r.title = obj.title;
      if (obj.author) r.author = obj.author;
      if (obj.date || obj.estimatedDate) r.publishedDate = obj.date || obj.estimatedDate;
      if (obj.siteName) r.siteName = obj.siteName;
      if (obj.text) r.snippet = String(obj.text).replace(/\s+/g, ' ').slice(0, 300);
    } catch (_) { /* keep the search result as-is if Extract fails or times out */ }
    finally { clearTimeout(timer); }
  }));
}

function ddgRealUrl(href) {
  const m = href.match(/[?&]uddg=([^&]+)/);
  if (!m) return '';
  let u = decodeURIComponent(m[1]);
  if (u.startsWith('//')) u = 'https:' + u;
  if (!/^https?:\/\//.test(u)) return '';
  try { if (new URL(u).hostname.endsWith('duckduckgo.com')) return ''; } catch (_) { return ''; }
  return u;
}

function stripHtml(s) {
  return String(s)
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&#x27;/g, "'").replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ').trim();
}
