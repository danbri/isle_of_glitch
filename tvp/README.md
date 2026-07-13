# tvp/ — raising the ghost of Joost (2006–2008)

This directory holds a small act of software necromancy:

1. **`joost0.13.096614.dmg`** — an original Joost beta installer for Mac OS X
   (version 0.13.0.96614, built 2007-09-21), kept as a historical artifact.
2. **`app/`** — a brand-new, mobile-first web app that resurrects the Joost
   *user experience* using only free and open video streamed from the
   Internet Archive.

**[▶ Open the player](app/index.html)** — serve `app/` with any static file
server (`python3 -m http.server`, GitHub Pages, etc.) and tap the power button.

| splash | live + controller | channel guide | widgets |
|---|---|---|---|
| ![splash](docs/screens/splash.png) | ![controller](docs/screens/controller.png) | ![epg](docs/screens/epg.png) | ![widgets](docs/screens/widgets.png) |

---

## Part 1 — the archaeology

The `.dmg` is a UDIF/HFS+ image; `7z x joost0.13.096614.dmg` extracts it
(the extracted tree is intentionally **not** committed — see *Legal*, below).
Inside `Joost.app` there is no bespoke C++ UI at all. The whole client is a
**XULRunner application** (Gecko 1.9a5pre) — essentially a single-purpose,
chromeless Firefox rendering the UI as XUL + SVG + HTML sprites composited
over the video plane:

```
Joost.app/Contents/Resources/
├── application.ini            Vendor=Joost N.V. (formerly Baaima N.V.)
├── anthill_primed_channel.rdf the pre-seeded "Welcome" channel (RDF!)
└── chrome/
    ├── tvp-ui.jar             the entire UI: tvp.xul + ~100 JS/XBL files
    ├── tvp-en-US.jar          locale: strings, EPG categories (CSV)
    └── tvprdf.jar, tvpzelos…  data layer, services
```

Things learned from `tvp.xul` and friends, all faithfully echoed in the
recreation:

- **A `<compositor>` full of `<sprite>`s** — controller, EPG, menu, OSD,
  interstitial, "coming up" overlay, error panels — all floating over
  full-bleed video. The web app mirrors this as absolutely-positioned
  overlays over a fullscreen `<video>`.
- **Theme constants** (from the locale DTD): font `Trebuchet MS`, frame
  stroke `white`, focus color `rgb(198,96,12)` — that burnt orange — plus
  translucent black panels (`rgba(0,0,0,.5)` + 2px white borders) and a
  teal selection color `rgba(98,163,176,.8)`. All reused verbatim as CSS
  custom properties.
- **Hot edges** (`hotedges.xml`): mousing to screen edges summoned the
  channel menu, widget menu and search. Mobile translation: swipe in from
  the left edge → channel guide, right edge → widgets, tap → controller.
- **The widget ecosystem** (`widget-manager.js`, `menu_plugin_*.png`):
  channel chat, clock (`canvasclock.js`), news ticker, ratings, blog-this,
  invites, trivia. The recreation ships a canvas clock, a (gently haunted)
  channel chat, a news ticker and jewel ratings.
- **EPG categories** (`epg.csv`): *Explore, My Channels, What's New,
  What's Popular, Cartoons & Animation, Comedy, Documentary, Drama,
  Entertainment, Film, Lifestyle, Music, News, Sports & Games* — the
  guide's category rail keeps the same vocabulary.
- **The little theatrics**: interstitials while the P2P engine fetched
  ("Fetching your channel…"), a white-dot CRT power-off animation, big
  on-screen channel numbers for 1–9 zapping, a "coming up" toast before
  the next show, five-jewel ratings, `search.noResults1=Your search for
  "%S" did not match any programs.` All back.

## Part 2 — the séance (`app/`)

Zero dependencies, zero build step: one HTML file, one stylesheet, two JS
files. Works as a static page anywhere.

**Broadcast simulation** — the defining Joost feeling was *television*:
you tuned in, something was already on. Every channel here runs on a wall
clock anchored to `2007-01-16T00:00Z` (the day The Venice Project became
Joost). Tuning computes `(now − epoch) mod playlist-length` and seeks the
current program to the right offset, so everyone watching "channel 4" sees
the same moment of *Night of the Living Dead*. The guide shows real
start times, LIVE tags, and a "coming up" overlay near the end of a show.
A modern concession: **⊢ from start** on the info bar drops out of the
broadcast into on-demand, and the schedule reclaims you at the next show.

**The dial** (all free/open, all verified range-streamable from archive.org):

| # | Channel | Category | On the air |
|---|---------|----------|------------|
| 1 | Animation Station | Cartoons & Animation | Big Buck Bunny, Caminandes 1 & 2 *(CC-BY, Blender)* |
| 2 | Open Cinema | Film | Elephants Dream, Sintel, Tears of Steel, Cosmos Laundromat, Spring *(CC-BY, Blender)* |
| 3 | Cartoon Classics | Kids | Little Nemo (1911), Gertie the Dinosaur (1914), Steamboat Willie (1928), Fleischer Superman (1941) *(PD)* |
| 4 | Creature Feature | Cult | Night of the Living Dead (1968), House on Haunted Hill (1959) *(PD)* |
| 5 | Screwball Screen | Comedy | His Girl Friday (1940) *(PD)* |
| 6 | Retro Vault | Documentary | Duck and Cover (1951), The Home Economics Story (1951) *(PD, Prelinger)* |
| 7 | Moon TV | Science & Tech | Apollo 11 moonwalk, restored NASA EVA broadcast (1969) *(PD)* |

**Controls**

- *Touch*: tap = controller · swipe ↑/↓ = zap channels · swipe from left
  edge = channel guide · swipe from right edge = widgets · ★ = My Channels
  (persisted).
- *Keyboard*: `1–7` channel numbers (with big OSD digits) · `↑/↓` zap ·
  `←/→` seek · `space` pause · `m` mute · `f` fullscreen · `g` guide ·
  `w` widgets · `/` search · `p` power off (CRT dot included).

## Legal

- The `.dmg` is preserved unmodified as a historical artifact of a
  discontinued service; its **extracted contents are proprietary**
  (© Joost N.V. / Joost Technologies B.V.) and are deliberately excluded
  from version control (`.gitignore`).
- `app/` is **original code** — a UX homage, no Joost code, artwork or
  trademarks reproduced. Not affiliated with or endorsed by Joost N.V.
- Video: Blender Foundation open movies under CC-BY; everything else is
  public domain, streamed from the [Internet Archive](https://archive.org).
