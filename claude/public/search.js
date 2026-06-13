// Results page: read ?q=, ask /api/search, render a Google-style SERP.
// Two views: "human" (the disguise) and "agent" (what the model sees).

const params = new URLSearchParams(window.location.search);
const query = (params.get('q') || '').trim();

const input = document.getElementById('q');
const statsEl = document.getElementById('stats');
const resultsEl = document.getElementById('results');
const paginationEl = document.getElementById('pagination');
const clearBtn = document.getElementById('clearBtn');
const viewToggle = document.getElementById('viewToggle');
const ctxMeter = document.getElementById('ctxMeter');
const ctxRaw = document.getElementById('ctxRaw');
const ctxFill = document.getElementById('ctxFill');
const ctxNums = document.getElementById('ctxNums');
const agentStatus = document.getElementById('agentStatus');
const agentChip = document.getElementById('agentChip');
const answerEl = document.getElementById('answer');

const BUDGET = 200000; // context window, in tokens
let DATA = null;
let view = localStorage.getItem('exoogle-view') || 'human';
let runId = 0; // bumped on every view switch so stale streams self-cancel

input.value = query;
document.title = query ? `${query} - Google Search` : 'Google';

clearBtn?.addEventListener('click', () => { input.value = ''; input.focus(); });

viewToggle.querySelectorAll('.vt').forEach((btn) => {
  btn.addEventListener('click', () => {
    view = btn.dataset.view;
    localStorage.setItem('exoogle-view', view);
    if (DATA) applyView();
  });
});

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
    applyView();
  } catch (err) {
    resultsEl.innerHTML = '<p class="empty">something went wrong reaching the search backend.</p>';
  }
}

function applyView() {
  runId++; // cancel any in-flight stream
  viewToggle.querySelectorAll('.vt').forEach((b) => {
    b.classList.toggle('active', b.dataset.view === view);
  });
  if (view === 'agent') renderAgent(DATA, runId);
  else renderHuman(DATA);
}

// ============================================================ HUMAN VIEW
function renderHuman(data) {
  const results = data.results || [];
  ctxMeter.hidden = true;
  agentChip.hidden = true;
  answerEl.hidden = true;

  if (!results.length) {
    statsEl.textContent = '';
    resultsEl.innerHTML = `<p class="empty">Your search - <b>${escapeHtml(query)}</b> - did not match any documents.</p>`;
    return;
  }

  const count = (11000 + Math.floor(Math.random() * 900000)).toLocaleString('en-US');
  statsEl.textContent = `About ${count} results (${data.elapsed} seconds)`;

  let html = '';
  const featured = results.find((r) => r.summary && r.summary.length > 40);
  if (featured) {
    html += `
      <div class="featured">
        <div class="featured-text">${escapeHtml(clampExcerpt(featured.summary, 320))}</div>
        <div class="featured-src">
          <a class="result-title" href="${escapeAttr(featured.url)}">${escapeHtml(hostName(featured.url))}</a>
        </div>
      </div>`;
  }

  for (const r of results) {
    const host = hostName(r.url);
    const fav = faviconFor(host);
    const date = r.publishedDate
      ? `<span class="snippet-date">${formatDate(r.publishedDate)} — </span>`
      : '';
    html += `
      <div class="result">
        <div class="result-head">
          <span class="favicon" style="background:${fav.color}">${fav.letter}</span>
          <div class="result-site">
            <div class="site-name">${escapeHtml(prettySite(host))}</div>
            <div class="site-url">${escapeHtml(breadcrumb(r.url))}</div>
          </div>
        </div>
        <a class="result-title" href="${escapeAttr(r.url)}">${escapeHtml(r.title)}</a>
        <div class="result-snippet">${date}${escapeHtml(r.excerpt)}</div>
      </div>`;
  }

  resultsEl.innerHTML = html;
  paginationEl.hidden = false;
}

// ============================================================ AGENT VIEW
// Streams: search -> read each source, keep only a token-efficient slice ->
// synthesize one answer. The meter contrasts raw web vs. tokens kept.
async function renderAgent(data, myRun) {
  const results = data.results || [];
  agentChip.hidden = false;
  paginationEl.hidden = true;
  answerEl.hidden = true;
  resultsEl.innerHTML = '';

  if (!results.length) {
    ctxMeter.hidden = true;
    statsEl.textContent = '';
    resultsEl.innerHTML = `<p class="empty">0 docs retrieved. nothing to ingest.</p>`;
    return;
  }

  statsEl.textContent = `${results.length} sources retrieved · 0 ads · agents don't click`;
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
    agentStatus.textContent = `reading ${hostName(r.url)} — keeping ${r.kept} of ${fmtK(r.raw)} tok…`;
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

  renderAnswer(data.answer, raw);
  const trimmed = raw ? (100 - (kept / raw) * 100) : 0;
  const over = raw > BUDGET ? ' — raw wouldn’t fit your window' : '';
  agentStatus.textContent =
    `${fmtK(raw)} tok of raw web → kept ${kept.toLocaleString('en-US')} · ${trimmed.toFixed(1)}% trimmed${over}`;
}

function cardHtml(r) {
  const host = hostName(r.url);
  const score = typeof r.score === 'number' ? r.score.toFixed(2) : '—';
  const trimmed = r.raw ? Math.min(99, Math.round(100 - (r.kept / r.raw) * 100)) : 0;
  return `
    <div class="ctx-card">
      <div class="ctx-card-head">
        <span class="score">${score}</span>
        <span class="src">${escapeHtml(host)}</span>
        <span class="toks"><span class="kept">${r.kept} tok</span> kept <span class="raw">/ ${fmtK(r.raw)} page</span></span>
        <span class="chip">−${trimmed}%</span>
      </div>
      <a class="ctx-title" href="${escapeAttr(r.url)}">${escapeHtml(r.title)}</a>
      <div class="ctx-hl">“${escapeHtml(r.excerpt)}”</div>
    </div>`;
}

function renderAnswer(answer, rawTotal) {
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

  const ansTok = estTok(answer.text);
  const saved = rawTotal ? ` (you'd have read ${fmtK(rawTotal)})` : '';

  answerEl.innerHTML = `
    <div class="answer-head">
      <span class="tag">answer</span>
      <span>${cites.length} sources → 1 answer · ~${ansTok} tok${saved}</span>
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
  ctxNums.textContent = `${kept.toLocaleString('en-US')} / ${BUDGET.toLocaleString('en-US')} tok kept`;
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

function prettySite(host) {
  const root = host.split('.')[0];
  return root.charAt(0).toUpperCase() + root.slice(1);
}

function breadcrumb(url) {
  try {
    const u = new URL(url);
    const path = u.pathname === '/' ? '' : u.pathname.replace(/\/$/, '').split('/').filter(Boolean).join(' › ');
    return u.hostname.replace(/^www\./, '') + (path ? ' › ' + path : '');
  } catch { return url; }
}

const FAV_COLORS = ['#4285F4', '#EA4335', '#FBBC05', '#34A853', '#9334e6', '#e8710a', '#1da1f2'];
function faviconFor(host) {
  let sum = 0;
  for (let i = 0; i < host.length; i++) sum += host.charCodeAt(i);
  return { letter: host.charAt(0).toUpperCase(), color: FAV_COLORS[sum % FAV_COLORS.length] };
}

function formatDate(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return '';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
function escapeAttr(s) { return escapeHtml(s); }
