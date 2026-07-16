# TVP/2007 — broadcast-style web TV from the open archives

**Watch it: https://danbri.github.io/isle_of_glitch/tvp/app/**

TVP is television the mid-2000s web promised: channels of free and
openly licensed film and TV, running on a **real broadcast clock**.
You don't browse a catalogue — you switch on and join whatever is on
*now*, flip channels, and let the schedule surprise you. Everything is
streamed from the Internet Archive's public collections; TVP hosts no
media.

| splash | live + controller | channel guide | widgets |
|---|---|---|---|
| ![splash](docs/screens/splash.png) | ![controller](docs/screens/controller.png) | ![guide](docs/screens/epg.png) | ![widgets](docs/screens/widgets.png) |

## The channels

Blender Foundation open movies (CC-BY) share the lineup with
public-domain-era features, shorts, cartoons, newsreels, classic TV,
serials, trailers, and the Prelinger ephemera — three thousand programs
and counting, every one verified streamable and rights-clean at harvest
time. The broadcast clock is deterministic (epoch: 16 Jan 2007), so two
people tuned to the same channel see the same thing.

## What the player does

- **TV-first UX**: channel zapping with double-buffered video, a
  full-screen swooshy channel guide, digit tuning, a last-channel back
  button, and picture-in-3D "venues" (drive-in, synthwave lounge,
  picture palace, ice grotto, 2007 rec room) with WebXR entry.
- **Fast starts**: direct datanode addressing, a service-worker
  first-seconds cache (OPFS), background trickle prefetch under
  battery/network guards, and an optional Cloudflare R2 prefix mirror
  with cold-start racing (see `../docs/cloudflare/`).
- **Deep metadata**: Wikidata identities, Wikipedia lead extracts
  (CC BY-SA, attributed), dialogue keywords from subtitles, and SKOS
  subject coding (LC Genre/Form, LC Subjects, Getty AAT — resolved via
  [skosdex](https://skosdex.fly.dev)) surfaced as tappable chips, an
  `about:` search operator, and a zoomable subjects treemap.
- **👀 Watch Buddy**: discreet content notes — specific heads-ups,
  an ⏳ flag with specifics where material reflects outdated
  perspectives, 📚 fact-check links, and corpus-wide 🎷🎻 "sax &
  violins" tags.
- **Chromecast & AirPlay**, hashed `#ia…;t=` deep links to programs and
  scenes, SVG subtitles, pinnable widgets with an edge tray, and a
  quiet layer of intermissions and cross-channel threads.

Serve `app/` with any static file server (`python3 -m http.server`,
GitHub Pages, etc.) and tap the power button.

## The pipeline (`tools/`)

`curate → enrich → wikilink → subindex → buddygen → skosify`, all
resumable via on-disk caches in `tools/.cache/`. Generated outputs
(`app/js/channels.js`, `annotations-gen.js`, `skos-gen.js`) are never
edited by hand. External services are treated politely: cached, paced,
batched — Wikidata bulk goes through QLever, and Wikimedia API use
requires explicit approval (see `/CLAUDE.md`).

## Legal

TVP/2007 is a neutral interface over the Internet Archive's public
collections, in the same way a web browser is: it hosts, copies, and
transmits no media, and links only to files the Archive serves
publicly. Wikipedia text appears under CC BY-SA with attribution and
links back. Channel and program metadata carries provenance links
(archive.org, Wikidata, Wikipedia, Library of Congress, Getty) so
any program can be vetted at its source.
