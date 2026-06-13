// Exoogle — Google's face, Exa's brain.
// A zero-dependency Node server: serves the static front-end and proxies
// search through /api/search. Mock results today; flip on real Exa by
// setting EXA_API_KEY in your environment (see the SWAP POINT below).

const http = require('http');
const fs = require('fs');
const path = require('path');

// Load .env.local (KEY=VALUE per line) with no dependency, so EXA_API_KEY can
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
    try {
      const data = await search(q);
      send(res, 200, JSON.stringify(data), MIME['.json']);
    } catch (err) {
      send(res, 500, JSON.stringify({ error: String(err.message || err) }), MIME['.json']);
    }
    return;
  }

  serveStatic(url.pathname, res);
});

server.listen(PORT, () => {
  const mode = process.env.EXA_API_KEY ? 'LIVE Exa' : 'mock';
  console.log(`\n  Exoogle running on http://localhost:${PORT}  (${mode} results)\n`);
});

// --- search ---------------------------------------------------------------

async function search(query) {
  if (!query) return { query, results: [], answer: null, elapsed: 0, source: 'none' };
  const start = Date.now();

  // === SWAP POINT =========================================================
  // Set EXA_API_KEY in your environment and this branch calls the real Exa
  // search + answer APIs. Nothing else changes — the front-end is agnostic.
  if (process.env.EXA_API_KEY) {
    const results = await exaSearch(query);
    const answer = await exaAnswer(query).catch(() => synthAnswer(query, results));
    return { query, results, answer, elapsed: (Date.now() - start) / 1000, source: 'exa' };
  }
  // ========================================================================

  const results = mockSearch(query);
  const answer = synthAnswer(query, results);
  return { query, results, answer, elapsed: +(0.04 + Math.random() * 0.04).toFixed(2), source: 'mock' };
}

async function exaSearch(query) {
  const resp = await fetch('https://api.exa.ai/search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.EXA_API_KEY,
    },
    body: JSON.stringify({
      query,
      numResults: 9,
      type: 'auto',
      contents: {
        highlights: { numSentences: 2, highlightsPerUrl: 1 },
        summary: true,
      },
    }),
  });
  if (!resp.ok) throw new Error(`Exa API ${resp.status}: ${await resp.text()}`);
  const data = await resp.json();
  return (data.results || []).map((r, i) => ({
    title: r.title || r.url,
    url: r.url,
    publishedDate: r.publishedDate || null,
    author: r.author || null,
    snippet: (r.highlights && r.highlights[0]) || r.summary || '',
    summary: r.summary || '',
    // Exa's /search with type:auto often omits a score; fall back to a
    // believable descending one so the agent view always shows the gag.
    score: typeof r.score === 'number' ? +r.score.toFixed(2) : +Math.max(0.5, 0.97 - i * 0.045).toFixed(2),
  }));
}

// --- answer ---------------------------------------------------------------
// The "AI ate the SERP" beat: one synthesized answer, grounded in citations.

async function exaAnswer(query) {
  const resp = await fetch('https://api.exa.ai/answer', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.EXA_API_KEY,
    },
    body: JSON.stringify({ query, text: false }),
  });
  if (!resp.ok) throw new Error(`Exa answer ${resp.status}`);
  const data = await resp.json();
  return {
    text: data.answer || '',
    citations: (data.citations || []).slice(0, 4).map((c, i) => ({
      n: i + 1,
      title: c.title || c.url,
      url: c.url,
      host: hostOf(c.url),
    })),
  };
}

// Generic-but-plausible synthesis used for mock results (and as the fallback
// if the live /answer call fails). Kept terse on purpose.
function synthAnswer(query, results) {
  const Q = capitalize(query);
  const citations = results.slice(0, 3).map((r, i) => ({
    n: i + 1,
    title: r.title,
    url: r.url,
    host: hostOf(r.url),
  }));
  const text =
    `${Q} is best understood by how it developed and where it shows up in practice [1]. ` +
    `To get hands-on, the 2026 guides are the fastest path [2], and practitioners broadly ` +
    `recommend starting small before scaling up [3].`;
  return { text, citations };
}

function hostOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); }
  catch { return url; }
}

// --- mock search ----------------------------------------------------------
// Templated to feel uncannily on-point (that's the joke: it's neural under
// the hood). Drops the query into believable titles/snippets across a spread
// of real-looking domains.

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

  // Descending neural relevance scores — high enough to feel uncannily on-point.
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
  // Prevent path traversal.
  const filePath = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    send(res, 403, 'Forbidden', MIME['.html']);
    return;
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      send(res, 404, '<h1>404</h1>', MIME['.html']);
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    send(res, 200, data, MIME[ext] || 'application/octet-stream');
  });
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function slug(s) {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'search';
}

function domainize(s) {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '').slice(0, 20) || 'example';
}
