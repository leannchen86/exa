// Client-side stand-in for the /api/search proxy, so the static GitHub Pages
// build works with no server. Mirrors the mock in server.js. When the demo runs
// locally with EXA_API_KEY set, the server answers instead and this is unused.
(function () {
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  function slug(s) {
    return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'search';
  }
  function domainize(s) {
    return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '').slice(0, 20) || 'example';
  }
  function hostOf(url) {
    try { return new URL(url).hostname.replace(/^www\./, ''); }
    catch { return url; }
  }

  function mockSearch(query) {
    const q = query;
    const Q = cap(query);
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

    const results = templates.map((t, i) => ({
      ...t,
      score: +Math.max(0.5, 0.97 - i * 0.045 - Math.random() * 0.02).toFixed(2),
    }));

    return {
      query,
      results,
      answer: synthAnswer(query, results),
      elapsed: +(0.04 + Math.random() * 0.04).toFixed(2),
      source: 'mock',
    };
  }

  function synthAnswer(query, results) {
    const Q = cap(query);
    const citations = results.slice(0, 3).map((r, i) => ({
      n: i + 1, title: r.title, url: r.url, host: hostOf(r.url),
    }));
    const text =
      `${Q} is best understood by how it developed and where it shows up in practice [1]. ` +
      `To get hands-on, the 2026 guides are the fastest path [2], and practitioners broadly ` +
      `recommend starting small before scaling up [3].`;
    return { text, citations };
  }

  window.mockSearch = mockSearch;
})();
