// Google results page. Reads ?q=, asks /api/search (Diffbot underneath), and
// renders a faithful Google SERP of organic blue-link results. No AI Overview
// (no RAG): a keyless web search sources the links, then Diffbot Extract
// structures each page. The whole joke is that none of this is Google.

// Proxy URL for real results on the static (GitHub Pages) site. Leave empty to
// serve mock results there. Set it to your deployed Worker (see ../worker).
const DIFFBOT_PROXY = '';

const params = new URLSearchParams(window.location.search);
const query = (params.get('q') || '').trim();

const input = document.getElementById('q');
const statsEl = document.getElementById('stats');
const aiEl = document.getElementById('aiOverview');
const resultsEl = document.getElementById('results');
const clearBtn = document.getElementById('clearBtn');

input.value = query;
document.title = query ? `${query} - Google Search` : 'Google';
clearBtn?.addEventListener('click', () => { input.value = ''; input.focus(); });

if (!query) {
  resultsEl.innerHTML = '';
} else {
  run();
}

async function run() {
  // Two phases so the page feels instant: phase 1 fills the SERP with the raw
  // web links right away; phase 2 swaps in Diffbot Extract's structured data
  // (clean titles, dates, thumbnails) when it's ready. Static hosts with no
  // proxy just render the bundled mock.
  const isStatic = location.protocol === 'file:' || location.hostname.endsWith('github.io');
  const mock = () => (window.mockSearch ? window.mockSearch(query) : { results: [], answer: null });

  if (isStatic && !DIFFBOT_PROXY) { render(mock()); return; }
  const base = isStatic ? DIFFBOT_PROXY : '/api/search';
  const url = (extra) => base + (base.includes('?') ? '&' : '?') + 'q=' + encodeURIComponent(query) + extra;

  // Phase 1 — fast web links, no Extract.
  let phase1 = null;
  try {
    const res = await fetch(url(''));
    if (res.ok) phase1 = await res.json();
  } catch (_) { /* fall through to mock */ }
  const ok = phase1 && phase1.results && phase1.results.length;
  render(ok ? phase1 : mock());

  // Phase 2 — Diffbot-structured results + thumbnails, swapped in when ready.
  if (ok) {
    try {
      const res = await fetch(url('&enrich=1'));
      if (res.ok) {
        const enriched = await res.json();
        if (enriched.results && enriched.results.length) render(enriched);
      }
    } catch (_) { /* keep the phase-1 results */ }
  }
}

function render(data) {
  const results = data.results || [];

  // "About N results (X seconds)" — Google's quiet stat line.
  const count = (210000 + Math.floor(Math.random() * 8_000_000)).toLocaleString('en-US');
  const secs = data.elapsed != null ? data.elapsed : (0.3 + Math.random() * 0.4).toFixed(2);
  statsEl.textContent = `About ${count} results (${secs} seconds)`;

  renderAIOverview(data.answer, results);

  let html = '';
  results.forEach((r, i) => {
    html += resultHtml(r);
    if (i === 2) html += peopleAlsoAsk(query); // tuck PAA after the third result
  });
  if (!results.length) {
    html = `<p class="g-empty">Your search - <b>${esc(query)}</b> - did not match any documents.</p>`;
  }
  resultsEl.innerHTML = html;
}

// ============================================================ AI OVERVIEW
function renderAIOverview(answer, results) {
  if (!answer || !answer.text) { aiEl.hidden = true; return; }
  const cites = answer.citations || [];
  const srcCount = Math.max(results.length, cites.length);

  // Citations -> superscript chips, like Google's AI Overview.
  let text = esc(answer.text);
  text = text.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (m, label, url) => {
    const rm = label.match(/^Result\s+(\d+)$/i);
    return citeChip(rm ? rm[1] : label, url);
  });
  const byNum = Object.fromEntries(cites.map((c) => [String(c.n), c]));
  text = text.replace(/\[(\d+)\]/g, (m, n) => (byNum[n] ? citeChip(n, byNum[n].url) : m));

  const faviconStack = cites.slice(0, 3).map((c) =>
    `<img class="aio-stackfav" src="${favicon(c.host)}" alt="" />`).join('');

  const srcRows = cites.slice(0, 2).map((c) => `
    <a class="aio-src" href="${esc(c.url)}">
      <div class="aio-src-text">
        <div class="aio-src-title">${esc(clip(c.title, 70))}</div>
        <div class="aio-src-host">${esc(c.host)}</div>
      </div>
      <img class="aio-src-thumb" src="${favicon(c.host)}" alt="" />
    </a>`).join('');

  aiEl.hidden = false;
  aiEl.innerHTML = `
    <div class="aio-inner">
      <div class="aio-main">
        <div class="aio-head">
          <span class="aio-spark">
            <svg width="20" height="20" viewBox="0 0 24 24">
              <defs><linearGradient id="gem" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stop-color="#4285F4"/><stop offset=".5" stop-color="#9b72cb"/><stop offset="1" stop-color="#d96570"/>
              </linearGradient></defs>
              <path fill="url(#gem)" d="M12 2c.9 5.2 3.9 8.2 9 9-5.1.9-8.1 3.9-9 9-.9-5.1-3.9-8.1-9-9 5.1-.8 8.1-3.8 9-9z"/>
            </svg>
          </span>
          <span class="aio-label">AI Overview</span>
          <span class="aio-head-srcs">${faviconStack}${srcCount > 3 ? `<span class="aio-head-more">+${srcCount - 3}</span>` : ''}</span>
        </div>
        <div class="aio-text">${text}</div>
        <button class="aio-more" type="button">Show more <span class="chev">⌄</span></button>
      </div>
      <aside class="aio-card">
        <div class="aio-card-head">
          <span class="aio-favstack">${faviconStack}</span>
          <span class="aio-sites">${srcCount} sites</span>
        </div>
        ${srcRows}
      </aside>
    </div>`;

  aiEl.querySelector('.aio-more')?.addEventListener('click', (e) => {
    aiEl.classList.toggle('expanded');
    e.currentTarget.firstChild.textContent =
      aiEl.classList.contains('expanded') ? 'Show less ' : 'Show more ';
  });
}

function citeChip(n, url) {
  return `<a class="aio-cite" href="${esc(url)}" title="${esc(url)}">${esc(n)}</a>`;
}

// ============================================================ ORGANIC RESULT
function resultHtml(r) {
  const host = hostName(r.url);
  const date = r.publishedDate
    ? `<span class="g-date">${formatDate(r.publishedDate)} — </span>` : '';
  const body = deMarkdown(r.snippet || r.summary || '');
  return `
    <div class="g-result">
      <div class="g-result-head">
        <span class="g-fav-wrap"><img class="g-fav" src="${favicon(host)}" alt="" /></span>
        <div class="g-site">
          <div class="g-site-name">${esc(prettySite(host))}</div>
          <div class="g-url">${esc(breadcrumb(r.url))}</div>
        </div>
        <button class="g-kebab" aria-label="About this result">⋮</button>
      </div>
      <a class="g-title" href="${esc(r.url)}">${esc(r.title)}</a>
      <div class="g-snippet">${date}${esc(clip(body, 300))}</div>
    </div>`;
}

// ============================================================ PEOPLE ALSO ASK
function peopleAlsoAsk(q) {
  const Q = cap(q);
  const qs = [
    `What is ${q}?`,
    `How does ${q} work?`,
    `Why is ${q} important?`,
    `What are examples of ${q}?`,
  ];
  const rows = qs.map((question) => `
    <div class="paa-row">
      <span class="paa-q">${esc(question)}</span>
      <span class="paa-plus">+</span>
    </div>`).join('');
  return `
    <section class="paa">
      <h2 class="paa-title">People also ask</h2>
      ${rows}
    </section>`;
}

// --- helpers --------------------------------------------------------------

function favicon(host) {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`;
}

// Strip raw markdown that Exa sometimes returns in page content, so snippets
// read like clean Google snippets (no "##", backticks, bullets, bold markers).
function deMarkdown(s) {
  return String(s)
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s{0,3}[>*\-+]\s+/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

function clip(text, max) {
  text = (text || '').replace(/\s+/g, ' ').trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const sp = cut.lastIndexOf(' ');
  return cut.slice(0, sp > max * 0.6 ? sp : max).trim() + '…';
}

function hostName(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); }
  catch { return String(url); }
}

function prettySite(host) {
  const root = host.split('.')[0];
  return root.charAt(0).toUpperCase() + root.slice(1);
}

function breadcrumb(url) {
  try {
    const u = new URL(url);
    const path = u.pathname === '/' ? '' :
      u.pathname.replace(/\/$/, '').split('/').filter(Boolean).join(' › ');
    return u.hostname.replace(/^www\./, '') + (path ? ' › ' + path : '');
  } catch { return String(url); }
}

function formatDate(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return '';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
