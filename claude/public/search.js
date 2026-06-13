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
    (DATA.results || []).forEach((r) => { r.tok = estTokens(r); });
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
        <div class="featured-text">${escapeHtml(featured.summary)}</div>
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
        <div class="result-snippet">${date}${escapeHtml(r.snippet || '')}</div>
      </div>`;
  }

  resultsEl.innerHTML = html;
  paginationEl.hidden = false;
}

// ============================================================ AGENT VIEW
// Streams: search -> read each source (meter fills) -> synthesize answer.
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
  setMeter(0);

  agentStatus.textContent = 'searching the web…';
  await sleep(260);
  if (myRun !== runId) return;

  // Read sources one at a time; the context window fills as we go.
  let used = 0;
  for (const r of results) {
    if (myRun !== runId) return;
    agentStatus.textContent = `reading ${hostName(r.url)}…`;
    resultsEl.insertAdjacentHTML('beforeend', cardHtml(r));
    used += r.tok;
    setMeter(used);
    await sleep(130);
  }
  if (myRun !== runId) return;

  agentStatus.textContent = 'synthesizing answer…';
  await sleep(420);
  if (myRun !== runId) return;

  renderAnswer(data.answer);
  agentStatus.textContent = `read ${results.length} pages so you didn't have to.`;
}

function cardHtml(r) {
  const host = hostName(r.url);
  const score = typeof r.score === 'number' ? r.score.toFixed(2) : '—';
  return `
    <div class="ctx-card">
      <div class="ctx-card-head">
        <span class="score">${score}</span>
        <span class="src">${escapeHtml(host)}</span>
        <span class="tok">${r.tok.toLocaleString('en-US')} tok</span>
        <span class="chip">read ✓</span>
      </div>
      <a class="ctx-title" href="${escapeAttr(r.url)}">${escapeHtml(r.title)}</a>
      <div class="ctx-hl">“${escapeHtml(r.snippet || r.summary || '')}”</div>
    </div>`;
}

function renderAnswer(answer) {
  if (!answer || !answer.text) { answerEl.hidden = true; return; }
  const cites = answer.citations || [];
  const byNum = Object.fromEntries(cites.map((c) => [String(c.n), c]));

  // Turn [1] [2] markers into linked citation chips.
  const text = escapeHtml(answer.text).replace(/\[(\d+)\]/g, (m, n) => {
    const c = byNum[n];
    return c ? `<a class="cite" href="${escapeAttr(c.url)}" title="${escapeAttr(c.host)}">${n}</a>` : m;
  });

  const srcs = cites.map((c) =>
    `<a href="${escapeAttr(c.url)}"><span class="n">${c.n}</span>${escapeHtml(c.host)}</a>`
  ).join('');

  answerEl.innerHTML = `
    <div class="answer-head">
      <span class="tag">answer</span>
      <span>synthesized from ${cites.length} sources · 0 links clicked by you</span>
    </div>
    <div class="answer-text">${text}</div>
    <div class="answer-srcs">${srcs}</div>`;
  answerEl.hidden = false;
}

// --- helpers --------------------------------------------------------------

function setMeter(used) {
  const pct = Math.min(100, (used / BUDGET) * 100);
  ctxFill.style.width = pct.toFixed(1) + '%';
  ctxNums.textContent = `${used.toLocaleString('en-US')} / ${BUDGET.toLocaleString('en-US')} tok · ${pct.toFixed(0)}% used`;
}

function sleep(ms) { return new Promise((res) => setTimeout(res, ms)); }

function estTokens(r) {
  const text = `${r.title || ''} ${r.summary || ''} ${r.snippet || ''}`;
  // Pretend we read the whole page, not just the snippet.
  return Math.min(4200, 700 + text.length * 5);
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
