// Diffoogle — Google's face, Diffbot's brain.
// Zero-dependency Node server: serves the static front-end and proxies search
// through /api/search. Mock results today; flip on real Diffbot by setting
// DIFFBOT_TOKEN in your environment (see the SWAP POINT below).

const http = require('http');
const fs = require('fs');
const path = require('path');

// Load .env.local (KEY=VALUE per line) with no dependency, so DIFFBOT_TOKEN can
// live in a gitignored file next to this server. Real env vars take precedence.
(function loadEnvLocal() {
  try {
    const text = fs.readFileSync(path.join(__dirname, '.env.local'), 'utf8');
    for (const line of text.split('\n')) {
      if (!line.trim() || line.trim().startsWith('#')) continue;
      const m = line.match(/^\s*([\w.]+)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      const key = m[1];
      const val = m[2].trim().replace(/^["']|["']$/g, '');
      if (!(key in process.env)) process.env[key] = val;
    }
  } catch (_) { /* no .env.local — fine, fall back to mock */ }
})();

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname === '/api/search') {
    const q = (url.searchParams.get('q') || '').trim();
    const enrich = url.searchParams.get('enrich') === '1';
    try {
      const data = await search(q, enrich);
      send(res, 200, JSON.stringify(data), MIME['.json']);
    } catch (err) {
      send(res, 500, JSON.stringify({ error: String(err.message || err) }), MIME['.json']);
    }
    return;
  }
  serveStatic(url.pathname, res);
});

server.listen(PORT, () => {
  const mode = process.env.DIFFBOT_TOKEN ? 'web search + Diffbot Extract' : 'web search (set DIFFBOT_TOKEN for Extract)';
  console.log(`\n  Diffoogle running on http://localhost:${PORT}  (${mode})\n`);
});

// --- search ---------------------------------------------------------------

async function search(query, enrich) {
  if (!query) return { query, results: [], answer: null, elapsed: 0, source: 'none' };
  const start = Date.now();

  // === SWAP POINT =========================================================
  // A lightweight keyless web search (DuckDuckGo) sources the candidate links;
  // Diffbot's Extract API then structures each page into clean data (title,
  // author, date, lead image, summary). Diffbot does the structuring, not the
  // searching. No AI Overview (that was RAG): answer is always null.
  try {
    const results = await ddgSearch(query);
    if (!results.length) throw new Error('no search results');
    let source = 'web';
    if (enrich && process.env.DIFFBOT_TOKEN) {
      await enrichWithExtract(results, process.env.DIFFBOT_TOKEN);
      source = 'diffbot';
    }
    return { query, results, answer: null, elapsed: (Date.now() - start) / 1000, source };
  } catch (_) {
    // Search unreachable — fall back to templated mock so the page still renders.
    const results = mockSearch(query);
    return { query, results, answer: null, elapsed: +(0.04 + Math.random() * 0.04).toFixed(2), source: 'mock' };
  }
  // ========================================================================
}

// Keyless web search → candidate links (title, url, snippet). Not Diffbot:
// Diffbot can't turn a free-text query into web results without its KG, so this
// just sources the URLs that Extract structures below.
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
    const url = ddgRealUrl(t[1]);
    if (!url || seen.has(url)) continue; // skips ads (no uddg) and duplicates
    seen.add(url);
    // Pair with the snippet that sits between this result and the next.
    const nextIdx = i + 1 < titles.length ? titles[i + 1].index : Infinity;
    const snip = snips.find((s) => s.index > t.index && s.index < nextIdx);
    results.push({
      title: stripHtml(t[2]),
      url,
      snippet: snip ? stripHtml(snip[1]) : '',
      summary: '',
      publishedDate: null,
      author: null,
    });
  }
  return results;
}

// Diffbot Extract (Article API): turn each result page into clean structured
// data. This is the part that's actually Diffbot — title, author, date, lead
// image, and a clean summary, pulled straight from the messy page.
async function enrichWithExtract(results, token) {
  await Promise.all(results.map(async (r) => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000); // don't let one slow page stall the page
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
      // If Extract hit a bot-block / error page, its title+text are junk
      // ("Access Denied", "Just a moment…"); keep the original search result.
      const probe = ((obj.title || '') + ' ' + String(obj.text || '').slice(0, 140)).toLowerCase();
      if (/access denied|forbidden|attention required|just a moment|are you a (human|robot)|verify you are|enable javascript|captcha|security check|\b40[34]\b/.test(probe)) return;
      if (obj.title && obj.title.trim().toLowerCase() !== 'no title') r.title = obj.title;
      if (obj.author) r.author = obj.author;
      if (obj.date || obj.estimatedDate) r.publishedDate = obj.date || obj.estimatedDate;
      if (obj.siteName) r.siteName = obj.siteName;
      if (obj.text) r.snippet = String(obj.text).replace(/\s+/g, ' ').slice(0, 300);
    } catch (_) { /* leave the search result as-is if Extract fails or times out */ }
    finally { clearTimeout(timer); }
  }));
}

function ddgRealUrl(href) {
  const m = href.match(/[?&]uddg=([^&]+)/);
  if (!m) return ''; // ads / non-organic links (e.g. /y.js) carry no uddg
  let u = decodeURIComponent(m[1]);
  if (u.startsWith('//')) u = 'https:' + u;
  if (!/^https?:\/\//.test(u)) return '';
  // Some ads still resolve back to a duckduckgo.com tracker — drop those too.
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

// --- mock search ----------------------------------------------------------
// Templated to feel real (the joke: it's structured KG data under the hood).

function mockSearch(query) {
  const q = query;
  const Q = capitalize(query);
  const today = new Date();
  const ago = (days) => new Date(today.getTime() - days * 864e5).toISOString();

  const templates = [
    {
      title: `${Q} - Wikipedia`,
      url: `https://en.wikipedia.org/wiki/${slug(q)}`,
      author: null,
      publishedDate: ago(40),
      summary: `${Q} refers to a concept, entity, or topic widely documented across reliable sources. This overview covers its origin, key characteristics, and why it matters today.`,
      snippet: `${Q} is best understood by tracing how it developed and where it shows up in practice. The article summarizes the essentials and links onward to deeper material.`,
    },
    {
      title: `${Q}: the complete guide for 2026`,
      url: `https://www.howtogeek.com/guides/${slug(q)}`,
      author: 'Editorial Team',
      publishedDate: ago(8),
      summary: '',
      snippet: `A plain-English walkthrough of ${q}: what it means, how it works, common pitfalls, and the fastest way to get hands-on. Updated for 2026.`,
    },
    {
      title: `${Q}: latest news, analysis & updates`,
      url: `https://www.theverge.com/tag/${slug(q)}`,
      author: null,
      publishedDate: ago(2),
      summary: '',
      snippet: `The most recent reporting on ${q}, including what changed this week and what it means for everyone watching the space.`,
    },
    {
      title: `${Q} — official site`,
      url: `https://www.${domainize(q)}.com`,
      author: null,
      publishedDate: ago(120),
      summary: '',
      snippet: `Explore ${q} directly from the source. Documentation, downloads, pricing, and everything you need to get started today.`,
    },
    {
      title: `r/${slug(q).replace(/-/g, '')} - Reddit`,
      url: `https://www.reddit.com/r/${slug(q).replace(/-/g, '')}`,
      author: null,
      publishedDate: ago(1),
      summary: '',
      snippet: `Honest takes on ${q} from people who actually use it. Top threads this week, plus the questions everyone keeps asking.`,
    },
    {
      title: `${Q} explained in 5 minutes`,
      url: `https://www.youtube.com/watch?v=${slug(q).slice(0, 8)}`,
      author: 'YouTube',
      publishedDate: ago(15),
      summary: '',
      snippet: `A short, visual explainer covering ${q} from the ground up — no prior background needed.`,
    },
    {
      title: `${Q} tools and alternatives compared`,
      url: `https://news.ycombinator.com/item?id=${Math.floor(38000000 + Math.random() * 999999)}`,
      author: null,
      publishedDate: ago(5),
      summary: '',
      snippet: `Discussion comparing approaches to ${q}, including trade-offs, real-world experience, and what the community recommends.`,
    },
    {
      title: `${Q} on GitHub`,
      url: `https://github.com/topics/${slug(q)}`,
      author: null,
      publishedDate: ago(3),
      summary: '',
      snippet: `Open-source projects, libraries, and examples related to ${q}. Browse repositories sorted by stars and recent activity.`,
    },
    {
      title: `The history of ${q}, and where it's headed`,
      url: `https://www.theatlantic.com/technology/archive/${slug(q)}`,
      author: 'Staff Writer',
      publishedDate: ago(22),
      summary: '',
      snippet: `A longer read on how ${q} came to be, the people who shaped it, and the forces pulling it in new directions.`,
    },
  ];

  return templates.map((t, i) => ({
    ...t,
    score: +Math.max(0.5, 0.97 - i * 0.045 - Math.random() * 0.02).toFixed(2),
  }));
}

// --- helpers --------------------------------------------------------------

function send(res, status, body, type) {
  res.writeHead(status, { 'Content-Type': type });
  res.end(body);
}

function serveStatic(pathname, res) {
  let rel = pathname === '/' ? '/index.html' : pathname;
  const filePath = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    send(res, 403, 'Forbidden', MIME['.html']);
    return;
  }
  fs.readFile(filePath, (err, data) => {
    if (err) { send(res, 404, '<h1>404</h1>', MIME['.html']); return; }
    const ext = path.extname(filePath).toLowerCase();
    send(res, 200, data, MIME[ext] || 'application/octet-stream');
  });
}

function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
function slug(s) {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'search';
}
function domainize(s) {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '').slice(0, 20) || 'example';
}
