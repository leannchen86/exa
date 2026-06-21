# Exoogle

Google's face, Exa's brain. A pixel-faithful clone of Google — the homepage and
a modern results page (AI Overview, blue-link results, "People also ask") — where
**every result is actually [Exa](https://exa.ai) underneath**.

The whole joke is the surprise: it looks exactly like you opened Google, but the
AI Overview is Exa's `/answer` and the ten blue links are Exa's `/search`. No
"AI search" badges, no token meters, no tells — just Google's interface, answered
by Exa.

## Run it

```bash
cd claude
npm start        # or: node server.js
```

Then open http://localhost:3000.

No dependencies, no build step — just Node 18+.

## Mock vs. real Exa

By default it serves **mock results** templated to feel real. To use the real Exa
API, drop your key in `.env.local`:

```bash
cp .env.example .env.local   # then add your key
npm start                    # the server auto-loads .env.local
```

When `EXA_API_KEY` is present, the server calls the real Exa `/search` + `/answer`
endpoints (see the **SWAP POINT** in [server.js](server.js)). The front-end is
agnostic — it renders the same `{ answer, results }` shape either way.

`.env.local` is gitignored; never commit your key.

## Layout

```
server.js           zero-dep Node server: static files + /api/search (Exa proxy)
public/
  index.html        Google homepage clone
  search.html       Google results-page clone (header, tabs, AI Overview, results)
  styles.css        Google-faithful styling
  home.js           homepage behavior (submit -> search.html)
  search.js         fetches /api/search; renders the AI Overview + blue-link results
```

Result favicons (and the AI Overview source thumbnails) are loaded live from
Google's public favicon service, so the page looks real without bundling assets.
