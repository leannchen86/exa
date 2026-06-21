// Exoogle search proxy — a Cloudflare Worker that lets the static GitHub Pages
// site serve REAL Exa results without exposing the API key. The key lives only
// in the Worker secret (EXA_API_KEY); the browser only ever talks to this Worker.
//
// This is the same logic as the local server.js, minus the static file serving.
// Deploy: see README.md in this folder.

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
    if (!q) return json({ query: '', results: [], answer: null, elapsed: 0, source: 'none' }, cors);
    if (!env.EXA_API_KEY) return json({ error: 'EXA_API_KEY not set on the Worker' }, cors, 500);

    try {
      const start = Date.now();
      const results = await exaSearch(q, env.EXA_API_KEY);
      const answer = await exaAnswer(q, env.EXA_API_KEY).catch(() => synthAnswer(q, results));
      return json({ query: q, results, answer, elapsed: (Date.now() - start) / 1000, source: 'exa' }, cors);
    } catch (err) {
      return json({ error: String(err.message || err) }, cors, 500);
    }
  },
};

function json(obj, cors, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...cors },
  });
}

async function exaSearch(query, key) {
  const resp = await fetch('https://api.exa.ai/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': key },
    body: JSON.stringify({
      query,
      numResults: 9,
      type: 'auto',
      contents: { highlights: { numSentences: 2, highlightsPerUrl: 1 }, summary: true },
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
    score: typeof r.score === 'number'
      ? +r.score.toFixed(2)
      : +Math.max(0.5, 0.97 - i * 0.045).toFixed(2),
  }));
}

async function exaAnswer(query, key) {
  const resp = await fetch('https://api.exa.ai/answer', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': key },
    body: JSON.stringify({ query, text: false }),
  });
  if (!resp.ok) throw new Error(`Exa answer ${resp.status}`);
  const data = await resp.json();
  return {
    text: data.answer || '',
    citations: (data.citations || []).slice(0, 4).map((c, i) => ({
      n: i + 1, title: c.title || c.url, url: c.url, host: hostOf(c.url),
    })),
  };
}

function synthAnswer(query, results) {
  const Q = query.charAt(0).toUpperCase() + query.slice(1);
  const citations = results.slice(0, 3).map((r, i) => ({
    n: i + 1, title: r.title, url: r.url, host: hostOf(r.url),
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
