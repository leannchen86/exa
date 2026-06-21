# Exoogle search proxy (Cloudflare Worker)

Lets the static GitHub Pages site serve **real Exa results** without exposing the
API key. The key lives only as a Worker secret; the browser only talks to the Worker.

## Deploy (one-time, ~3 commands)

```bash
npm i -g wrangler          # Cloudflare's CLI
wrangler login             # opens a browser; create/log into a free account
cd claude/worker
wrangler deploy            # creates the Worker; prompts for a workers.dev subdomain
wrangler secret put EXA_API_KEY   # paste your Exa key when asked
```

`wrangler deploy` prints your Worker URL, e.g.
`https://exoogle-api.<your-subdomain>.workers.dev`

## Wire it up

Paste that URL into `EXA_PROXY` at the top of [../public/search.js](../public/search.js),
commit, and push. The live site will then call the Worker for real results.

Test it directly:

```bash
curl "https://exoogle-api.<your-subdomain>.workers.dev/?q=exa+search"
```
