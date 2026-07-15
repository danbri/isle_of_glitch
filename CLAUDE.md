# Working notes for Claude in this repository

## Wikimedia API use requires explicit human approval

Wikimedia's infrastructure (wikidata.org, *.wikipedia.org — Action API,
REST API, and especially the WDQS query service) is under sustained load
from automated scrapers. We do not add to that.

**Do not run any tool, script, or pipeline stage that calls a Wikimedia
API unless the human has explicitly approved that run in the current
conversation.** This includes `tvp/tools/wikilink.mjs` and any
`wbgetentities`/`wbsearchentities`/Wikipedia-extract fetching, whether
direct or inside a pipeline chain. "Approved the pipeline" counts only
if the human knows a Wikimedia-touching stage is part of it — when in
doubt, ask before the stage runs, not after.

When Wikimedia access IS approved:

- **Prefer QLever** (`https://qlever.dev/api/wikidata`) for anything
  bulk or query-shaped against Wikidata — batched SPARQL `VALUES`
  queries replace dozens of Action API calls and put zero load on
  Wikimedia. `tvp/tools/skosify.mjs` already works this way.
- **Cache everything on disk** (`tvp/tools/.cache/`) so an approved run
  never re-fetches what a previous run already learned. Re-runs of the
  enrichment pipeline must cost Wikimedia (and QLever) nothing for
  already-known items.
- Keep the descriptive User-Agent, pacing between requests, and modest
  batch sizes.
- Never call the WDQS SPARQL endpoint (`query.wikidata.org`) from
  automation here at all.

## Other third-party services

The same spirit applies everywhere: archive.org, skosdex, and QLever
calls are cached and paced (see `tvp/tools/`); don't strip those
protections when editing the tools, and don't add new external
API consumers to the pipeline without flagging it to the human.

## Repository practicalities

- The GitHub Pages site deploys ONLY from branch
  `claude/fink-authoring-guide-bDtaY`. Ship chain: feature branch →
  `main` → deploy branch → verify live.
- `tvp/app/js/channels.js`, `annotations-gen.js`, and `skos-gen.js` are
  GENERATED — edit the tools in `tvp/tools/`, not the outputs.
- Run the regression suite (scratchpad `test-tvp2.js` harness) before
  shipping player changes; venue/SKOS/seek behaviours have their own
  test scripts alongside it.
