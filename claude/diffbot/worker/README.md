# Diffoogle search proxy (Cloudflare Worker)

Lets the static GitHub Pages site serve **real results**: a keyless web search
(DuckDuckGo) sources the links, then **Diffbot Extract** structures each page.
The Diffbot token lives only as a Worker secret.

## Deploy (one-time, ~3 commands)

```bash
npm i -g wrangler          # if you don't have it
wrangler login
cd claude/diffbot/worker
wrangler deploy            # creates the Worker, prints its URL
wrangler secret put DIFFBOT_TOKEN   # paste your Diffbot token
```

`wrangler deploy` prints a URL like
`https://diffoogle-api.<your-subdomain>.workers.dev`

## Wire it up

Paste that URL into `DIFFBOT_PROXY` at the top of
[../public/search.js](../public/search.js), commit, and push. The live site at
`/exa/diffbot/` will then return real, Diffbot-structured results.

Test it directly:

```bash
curl "https://diffoogle-api.<your-subdomain>.workers.dev/?q=diffbot&enrich=1"
```

## Caveat

DuckDuckGo can rate-limit or block datacenter IPs (Cloudflare's included). If the
Worker stops returning results, the front-end falls back to the bundled mock. The
robust fix is to swap DuckDuckGo for a real search API (Brave/Serper) feeding
Extract.
