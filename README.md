# Exoogle

Google's face, Exa's brain. A parody search prototype: it looks like the Google
homepage, but every search is answered by [Exa](https://exa.ai) neural search
underneath.

The joke lives in the **subtle tells** — the favicon isn't a "G", the result
count is suspiciously precise, the search time is suspiciously fast, and the
results feel a little *too* on-point. Look twice and you'll catch it.

## Run it

```bash
npm start        # or: node server.js
```

Then open http://localhost:3000.

No dependencies, no build step — just Node 18+.

## Mock vs. real Exa

By default it serves **mock results** that are templated to feel uncannily
relevant. To use the real Exa API:

```bash
cp .env.example .env.local   # then add your key
EXA_API_KEY=sk-... npm start
```

When `EXA_API_KEY` is set, the server calls the real Exa `/search` endpoint
(see the **SWAP POINT** in [server.js](server.js)). The front-end doesn't change
— it consumes the same shape either way.

## Layout

```
server.js           zero-dep Node server: static files + /api/search proxy
public/
  index.html        Google homepage clone
  search.html       Google SERP clone
  styles.css        shared styling
  home.js           homepage behavior ("I'm Feeling Lucky" -> top Exa hit)
  search.js         fetches /api/search and renders the results page
```
