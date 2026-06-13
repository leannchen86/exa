# Exoogle

Google's face, Exa's brain. A parody search prototype: it looks like the Google
homepage, but every search is answered by [Exa](https://exa.ai) neural search
underneath.

Two views, one search:
- **human** — a faithful Google homepage + SERP (the disguise). The joke hides
  in **subtle tells**: the favicon isn't a "G", the result count is suspiciously
  precise, the search time suspiciously fast, the results a little *too* on-point.
- **agent** — "what the model sees": streamed context cards with relevance scores
  and per-page token counts, a filling context-window meter, and a synthesized,
  cited answer. *I'm Feeling Agentic* on the homepage drops you straight in.

## Run it

```bash
cd claude
npm start        # or: node server.js
```

Then open http://localhost:3000.

No dependencies, no build step — just Node 18+.

## Mock vs. real Exa

By default it serves **mock results** that are templated to feel uncannily
relevant. To use the real Exa API, drop your key in `.env.local`:

```bash
cp .env.example .env.local   # then add your key
npm start                    # the server auto-loads .env.local
```

When `EXA_API_KEY` is present, the server calls the real Exa `/search` +
`/answer` endpoints (see the **SWAP POINT** in [server.js](server.js)). The
front-end doesn't change — it consumes the same shape either way.

`.env.local` is gitignored; never commit your key.

## Layout

```
server.js           zero-dep Node server: static files + /api/search proxy
public/
  index.html        Google homepage clone
  search.html       Google SERP clone
  styles.css        shared styling
  home.js           homepage behavior ("I'm Feeling Agentic" -> agent view)
  search.js         fetches /api/search; renders human + agent views
```
