---
title: "A uniform field, and a cell colour that was never there"
date: 2026-08-08T14:00:00Z
tags: [rendering, viewer, protocol, mobile, coordination]
---

Notes for the other session. This one worked on `world.html` from the cloud —
no GPU in that container, so the shader change below is reasoned, not run. If
the world comes up black, that commit is the first suspect and it reverts
cleanly. Everything else is plain DOM/CSS/JS and was checked with `node --check`.

## The one protocol change: the `Cam` uniform gained a field

`writeCam` and the WGSL `Cam` struct are a wire format with no names on it, only
offsets — the scar comment in the struct says as much. A field was **appended**:

    metaPacked : f32   // offset 228, written last in writeCam

`1` means `cmeta.x` is the packed material vector (a page running its own sim);
`0` means a plain `0..3` type bucket (watch mode, where the server already
resolved it). The buffer is still 240 bytes, the three cam buffers are unchanged,
and no existing offset moved. If you add the next field, put it at 232 and write
it last, same as always.

## The colour it gates: cells were never actually coloured by type

The cell shader chose its hue with `m.x == 1`, `== 2`, `== 3`. That only ever
worked in watch mode. In a page running its own sim, `cmeta.x` is the whole
packed word (`packMeta`: type in the low two bits, capacities above), so it is
never equal to 1, 2 or 3 — **every cell fell through to the stone-grey default.**
The crowd has been monochrome the entire time in local mode, and nobody caught it
because the same page in watch mode looked fine.

It now decodes contractility, grippiness and sense acuity straight out of
`cmeta.x` — the same shifts `world_gpu.js` uses — and blends the class hues by
*how much* of each a cell has, rather than the argmax label:

    base = mix(neuron, (muscle*ct + anchor*gr + sensor*se)/max(w,ε),
               smoothstep(0, 0.5, w))

So a cell that both contracts and grips reads between terracotta and plum, and a
capacity-less cell stays stone. This is the "continuous, not label buckets" ask,
and it doubles as the fix for the monochrome crowd.

Hue carries *which* capacities; **total capacity is carried separately as
saturation and brightness**, because the normalized blend alone made a cell high
in all three average to a muddy grey indistinguishable from a cell low in all
three — "does everything" looked like "does nothing". Now low total capacity
desaturates toward stone and dims, so a committed generalist reads bright and an
idle cell reads dim whatever their hues share. Watch mode keeps the discrete
path, gated by `metaPacked`. The gallery and devo thumbnails now use a JS twin,
`matColor(c)`, so all three views speak the same material language. The old
`tint[kind(c)]` argmax helpers are gone.

Worth knowing for `visual-language.md`: this delivers "categorical colour derived
from the material vector" as a *continuous* blend rather than the binned hue
families that doc proposed — the continuous version reads composition, not class.

## Mobile defaults changed — deliberately, don't "fix" them back

The first-message complaint was that the viewer had stopped being usable on a
phone. On a narrow screen (≤700px) the defaults are now:

- the **readout HUD starts collapsed** to a spine (it was ~40% of the screen);
  the `›` reopens it and the choice is remembered.
- the **right panel starts hidden** — world first; the hamburger (now a 44px
  target above the status popups) slides it out.
- the world **fits to width** instead of letterboxing the square arena in a tall
  screen.
- iOS pinch/gesture and double-tap zoom are swallowed so the page no longer drags
  around under two fingers; `touch-action` stays off the body so the panel and
  carousel still scroll.
- the creature carousel is a focusable control — arrow keys walk it — and it
  rescans on a 15s timer.

An explicit saved preference always wins over the width default, so a person who
opens the HUD on a phone keeps it open.

## New UI: the cell scope

A pop-out (`#vizBox`, opened by the in-panel `cell scope` button) that scatters
either one creature's cells or one dot per creature across the population, over
any pair of properties with a third as colour and bounds read from the data. It
reuses `develop()` / `ensureDevo()` / `localGenomes` and touches no render or
frame code.

## Deploy reality, confirmed

Pages deploys from `main` via GitHub's built-in *pages build and deployment* —
watched run #353 go green for the colour commit, so this is settled, not assumed.
The `claude/fink-authoring-guide-bDtaY` branch is stale and I stopped syncing it;
`.github/workflows/static.yml` remains inert. The old
`claude/mazeballs-github-pages-o6cog0` dev branch is being retired (deleted
locally; the remote delete is blocked through the cloud git proxy, so it is a
one-tap cleanup on GitHub, or a `git push origin --delete` from the laptop).
</content>
</invoke>
