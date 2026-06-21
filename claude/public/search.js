// Results page: read ?q=, ask /api/search, render the agent view —
// "what the model sees": context cards, a context-window meter, one cited answer.

const params = new URLSearchParams(window.location.search);
const query = (params.get('q') || '').trim();

const input = document.getElementById('q');
const statsEl = document.getElementById('stats');
const resultsEl = document.getElementById('results');
const clearBtn = document.getElementById('clearBtn');
const ctxMeter = document.getElementById('ctxMeter');
const ctxRaw = document.getElementById('ctxRaw');
const ctxFill = document.getElementById('ctxFill');
const ctxNums = document.getElementById('ctxNums');
const agentStatus = document.getElementById('agentStatus');
const answerEl = document.getElementById('answer');

const BUDGET = 200000; // context window, in tokens
let DATA = null;
let runId = 0; // bumped on each render so stale streams self-cancel

input.value = query;
document.title = query ? `${query} - Search` : 'Search';

clearBtn?.addEventListener('click', () => { input.value = ''; input.focus(); });

if (!query) {
  resultsEl.innerHTML = '<p class="empty">type a search to get started.</p>';
} else {
  run();
}

async function run() {
  statsEl.textContent = '';
  try {
    const res = await fetch('/api/search?q=' + encodeURIComponent(query));
    DATA = await res.json();
    (DATA.results || []).forEach((r) => {
      r.excerpt = clampExcerpt(r.snippet || r.summary || ''); // the slice we keep
      r.kept = estTok(r.excerpt);   // tokens actually placed in context
      r.raw = rawTokensFor(r.url);  // tokens the full page would have cost
    });
    renderAgent(DATA, ++runId);
  } catch (err) {
    resultsEl.innerHTML = '<p class="empty">something went wrong reaching the search backend.</p>';
  }
}

// ============================================================ AGENT VIEW
// Streams: search -> read each source, keep only a token-efficient slice ->
// synthesize one answer. The meter contrasts raw web vs. tokens kept.
async function renderAgent(data, myRun) {
  const results = data.results || [];
  answerEl.hidden = true;
  resultsEl.innerHTML = '';

  if (!results.length) {
    ctxMeter.hidden = true;
    statsEl.textContent = '';
    resultsEl.innerHTML = `<p class="empty">0 docs retrieved. nothing to ingest.</p>`;
    return;
  }

  statsEl.textContent = `${results.length} sources`;
  ctxMeter.hidden = false;
  setMeter(0, 0);

  agentStatus.textContent = 'searching the web…';
  await sleep(260);
  if (myRun !== runId) return;

  // Read each source, but keep only the relevant slice. The faint bar tracks
  // what the raw pages would have cost; the bright sliver is what we kept.
  let kept = 0;
  let raw = 0;
  for (const r of results) {
    if (myRun !== runId) return;
    agentStatus.textContent = `skimming ${hostName(r.url)}…`;
    resultsEl.insertAdjacentHTML('beforeend', cardHtml(r));
    kept += r.kept;
    raw += r.raw;
    setMeter(kept, raw);
    await sleep(140);
  }
  if (myRun !== runId) return;

  agentStatus.textContent = 'synthesizing answer…';
  await sleep(420);
  if (myRun !== runId) return;

  renderAnswer(data.answer);
  const skipped = raw ? (100 - (kept / raw) * 100) : 0;
  agentStatus.textContent =
    `${fmtK(raw)} tokens read, skipped ${skipped.toFixed(1)}% of the web`;
}

function cardHtml(r) {
  const host = hostName(r.url);
  const score = typeof r.score === 'number' ? r.score.toFixed(2) : '—';
  return `
    <div class="ctx-card">
      <div class="ctx-card-head">
        <span class="score">${score}</span>
        <span class="src">${escapeHtml(host)}</span>
      </div>
      <a class="ctx-title" href="${escapeAttr(r.url)}">${escapeHtml(r.title)}</a>
      <div class="ctx-hl">“${escapeHtml(r.excerpt)}”</div>
    </div>`;
}

function renderAnswer(answer) {
  if (!answer || !answer.text) { answerEl.hidden = true; return; }
  const cites = answer.citations || [];
  const byNum = Object.fromEntries(cites.map((c) => [String(c.n), c]));

  // Turn citation markers into compact chips.
  let text = escapeHtml(answer.text);
  // real Exa /answer embeds markdown links, e.g. "([Result 1](https://…))"
  text = text.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (m, label, url) => {
    const rm = label.match(/^Result\s+(\d+)$/i);
    return `<a class="cite" href="${url}" title="${url}">${rm ? rm[1] : label}</a>`;
  });
  // mock uses bare [1] [2] markers tied to the citations list
  text = text.replace(/\[(\d+)\]/g, (m, n) => {
    const c = byNum[n];
    return c ? `<a class="cite" href="${escapeAttr(c.url)}" title="${escapeAttr(c.host)}">${n}</a>` : m;
  });

  const srcs = cites.map((c) =>
    `<a href="${escapeAttr(c.url)}"><span class="n">${c.n}</span>${escapeHtml(c.host)}</a>`
  ).join('');

  answerEl.innerHTML = `
    <div class="answer-head">
      <span class="tag">answer</span>
    </div>
    <div class="answer-text">${text}</div>
    <div class="answer-srcs">${srcs}</div>`;
  answerEl.hidden = false;
}

// --- helpers --------------------------------------------------------------

function setMeter(kept, raw) {
  const keptPct = Math.min(100, (kept / BUDGET) * 100);
  const rawPct = Math.min(100, (raw / BUDGET) * 100);
  ctxRaw.style.width = rawPct.toFixed(1) + '%';
  ctxFill.style.width = (kept ? Math.max(keptPct, 0.6) : 0).toFixed(2) + '%';
  ctxNums.textContent = `${kept.toLocaleString('en-US')} / ${BUDGET.toLocaleString('en-US')} tok`;
}

function sleep(ms) { return new Promise((res) => setTimeout(res, ms)); }

// A token-efficient slice: keep just the relevant excerpt, not the whole page.
function clampExcerpt(text, max = 200) {
  text = (text || '').replace(/\s+/g, ' ').trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const sp = cut.lastIndexOf(' ');
  return cut.slice(0, sp > 120 ? sp : max).trim() + '…';
}

// ~4 chars per token, the usual rule of thumb.
function estTok(text) { return Math.max(1, Math.ceil((text || '').length / 4)); }

// Believable full-page token cost (what reading the whole thing would spend).
// Deterministic per URL so it's stable across re-renders.
function rawTokensFor(url) { return 4200 + (hashCode(url) % 24000); }

function hashCode(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

// 1820 -> "1.8K", 18234 -> "18K"
function fmtK(n) {
  if (n < 1000) return String(n);
  const k = n / 1000;
  return (k < 10 ? k.toFixed(1) : Math.round(k)) + 'K';
}

function hostName(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); }
  catch { return url; }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
function escapeAttr(s) { return escapeHtml(s); }
