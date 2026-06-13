# Exoogle — Decision Log

> A funny prototype that looks like you're opening Google, but it's **Exa** underneath.
> This file tracks how our thinking evolved, the key calls we made, and the fun bits worth remembering.

_Last updated: 2026-06-12_

---

## The one-line concept

A parody of Google's interface where the familiar search box quietly runs on Exa's neural
search engine — so it can answer meaning-shaped queries that real Google can't.

---

## How the thinking evolved

### v0 — "Looks like Google, but it's Exa"
The starting pitch. Build a pixel-faithful Google homepage; route the search through Exa instead.

**Key realization:** Google's homepage is trivially cloneable (it's one of the simplest pages
on the web). The actual craft lives in two places:
1. **The results page** — where people squint and judge whether the illusion holds.
2. **The reveal** — the moment they realize it isn't Google.

**Why Exa fits the joke specifically:** Exa's `/search` returns title, URL, date, and
`highlights`/`summary` — an almost 1:1 fit for Google's blue-link SERP anatomy. And the
punchline writes itself: Exa is *neural/semantic*, so "Google" quietly does things real Google
can't. The gag lands hardest when the UI is boringly familiar but the results are suspiciously smart.

### v1 — The Jmail reference reframed the whole thing
We looked at **Jmail** (jmail.world) — the Gmail-style portal into the Epstein files
(Jdrive, Jyoutube, "Jemini" AI, etc.). Three lessons that changed the plan:

1. **Parody is load-bearing — legally *and* comedically.** Jmail's creators stress it's "a
   parody, not a clone." That's the magic word: parody gets real legal protection a straight
   clone doesn't. So leaning *into* parody markers (a slightly-off logo, a visible wink) is the
   *safer* path, not the riskier one. A flawless clone with Google's real logo is the dangerous version.

2. **The UI was never the product — making bad search good was.** Jmail existed to call the
   DOJ's "technically impossible to search" bluff by wrapping genuinely good search in a familiar
   shell. The interface was a Trojan horse for a point. **Our equivalent:** the Google shell is
   just the delivery mechanism; the joke is "this familiar box quietly out-Googles Google."

3. **Parody-with-a-payload spreads; pure parody just chuckles.** Jmail hit ~350k visitors and
   ~4M views in a day because it *did something useful* under the gag.

### v2 — The unifying thesis (current direction)
> **Keep every Google interface exactly as-is. Swap only the engine, keyword → neural.
> Watch every product suddenly get smart.**

This reframes the build from "a Google clone that secretly uses Exa" into "a parody Google
whose punchline is that Exa is better at the thing Google is supposed to be good at." Same code,
sharper purpose. Crucially, it makes the **suite non-random**: each fake app is a *fresh proof
of the same claim*. The bottleneck was never the UI — it was 1998-era retrieval.

**The suite and the payload are the same argument:** the hero query is the *proof*, the suite is
the *generalization*.

---

## Decisions locked

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | It's a **parody**, not a clone | Legal cover + it's funnier. Lean into the wink ("Exoogle"). |
| 2 | **Exa API key stays server-side** | A tiny proxy route avoids leaking the key in client JS and dodges CORS. |
| 3 | Map Exa → Google SERP anatomy | favicon + breadcrumb URL, blue title link, gray snippet from `highlights`, fake "About 1,240,000 results (0.31s)" line. |
| 4 | Design the homepage as **one tab of a suite**, not a dead end | The shtick scales to Images / News / Scholar / etc. |
| 5 | Ship a **side-by-side** as the hero artifact | "Same query. Real Google left, Exoogle right." That split-screen IS the shareable object. |

## Decisions still open

- **Hero query** — which describe-don't-name / analogy query do we lead with? (leaning: a
  describe-don't-name query; the Google-vs-Exa gap is most visceral there)
- **Build order** — hero split-screen first, or the suite shell first? (recommendation: hero first;
  it decides whether this is *funny* or merely *cute*)
- **Logo treatment** — "Exoogle" wordmark vs. a Google logo that glitches to "Exa" on hover vs.
  retro 2009 Google homepage (nostalgia is more shareable + dodges trademark freshness).

---

## The fun highlights (idea bank)

### Suite ideas, respectable → feral
- **Images / News / Scholar** — build first; they sell the illusion.
- **The ad slot, weaponized** — render the "Sponsored" block empty with one line:
  *"No ads. We just found the thing you asked for."* The absence is the feature. Zero engineering.
- **"Cached" comes back from the dead** — Google killed it; Exa holds page content, so we resurrect it.
- **Knowledge Panel for the long tail** — assemble an entity card live from Exa for obscure
  things Google has no panel for.
- **"People also ask" → "People also *are*"** — a live table of related *entities* (Exa websets).
  Search "lab-grown coffee" → 12 actual startups doing it. The blue-links page secretly becomes a database.
- **Google Alerts → semantic standing monitor** — "tell me when anyone starts doing this thing,
  even if they never use the word." The most genuinely useful one.

### The unhinged ones
- **reCAPTCHA parody** — *"Select all squares that **mean** the same thing."* A semantic captcha.
- **"I'm Feeling Lucky" → "I'm Feeling Curious"** — runs a `findSimilar` walk and drops you
  somewhere you didn't know to ask for. A serendipity button.
- **Autocomplete by *meaning*, not popularity** — suggests continuations no human has ever typed.
  The search bar becomes the demo before you hit enter.
- **The search bar accepts not-a-query** — paste a whole paragraph or a URL → "pages that feel
  like this." Breaks Google's entire mental model in one gesture.
- **Time-machine search** — recency filter reframed as a slider: "top results for 'AI safety' as
  if nothing after 2014 existed."
- **"Did you mean" → the engine confessing** — show Exa's autoprompt rewrite of your sloppy query.
  Funny *and* it teaches why it's smarter.

### Hero-query candidates (must fail on Google, shine on Exa)
1. **Describe-don't-name:** *"that startup where you point your phone at a plant and it tells you
   if it's dying."*
2. **Analogy:** *"who is the Patrick Collison of Africa?"*
3. **Find-similar-to-a-taste:** *"blogs like Paul Graham's essays but written by women in biotech."*
4. **Enumerate the long tail:** *"every company working on X"* — returned as a *list*.
5. **Vibe:** *"websites that feel like the early-2000s internet."*
6. **Conceptual negation:** *"papers about transformers that are NOT about language."*

---

## Practical notes / TODO
- [ ] Get an Exa API key (exa.ai — free tier exists). Wire to read from `.env`.
- [ ] Stack: small Next.js app (or vanilla HTML + ~50-line Express proxy). Two pages to start.
- [ ] Keep Google branding for internal/demo use only — don't deploy publicly with their real logo.

---

## Reference reading
- [SF hacktivists built JMail, a Gmail-style portal into Epstein's inbox](https://sfstandard.com/2025/11/21/epstein-emails-san-francisco-jmail/)
- [The easiest way to search the new Epstein files — Fast Company](https://www.fastcompany.com/91465154/the-easiest-way-to-search-the-new-epstein-files)
- [Jmail — Wikipedia](https://en.wikipedia.org/wiki/Jmail)
