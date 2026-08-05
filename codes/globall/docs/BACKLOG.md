# Glo-ball Gopher — Backlog

Extracted from user playtesting + [GPT-5.2 review](review-2026-02-11.md) + [Gemini review](review-gemini-2026-02-11.md) + prior sessions.

### User playtesting verdicts (2026-02-11)
> "Looks glorious but is very disorienting. More experience than game."

> "This is supposedly set on real planet earth, and yet I just don't feel it.
> Nothing is recognizable. Why do I see dozens of rings together in one place??"

> "The idea was Glasgow → Heathrow → Narita → Kyoto. Graph theory lurking.
> Radial dialog to pick next hop at each node."

**Two core failures: doesn't feel like Earth, no graph-routing mechanic.**

---

## DONE (completed clarity pass)

- [x] Ring LOD — fade/hide by distance
- [x] Bloom clamped at mid-altitude (0.15 ground → 0.5 max)
- [x] Trajectory arc more prominent during charge
- [x] Ideal charge tick mark on power meter
- [x] Player pod dark outline shell for visibility
- [x] Debug panel hidden by default (H key / ?debug)
- [x] Delivery list backdrop blur
- [x] Destination name + progress bar + proximity arrow
- [x] HUD simplification during flight (secondary panels fade)
- [x] Pod jitter fixed (quaternion slerp)
- [x] Parked ground stance (faces camera, eyes visible)
- [x] Country outlines brighter for globe recognition
- [x] Free camera toggle button

## P0 — Sense of place + graph routing (do FIRST)

- [ ] **Planet doesn't feel like Earth** — procedural texture too abstract; consider NASA Blue Marble (public domain) or dramatically improve continents *(user: "flying over Google Maps not Earth")*
- [ ] **Airport clustering** — 1269 airports loaded, many overlap completely (LHR-LGW = 0.064 game units, ring = 0.3 units). Curate ~50-80 hub airports for interactive nodes; keep all as dots *(user: "dozens of rings in one place")*
- [ ] **Ring compositing error** — detailed rings use `rotateX(PI/2)` making them edge-on, same bug as PackageSystem. Sprite bounding boxes visible *(user: "bounding box that doesn't mix properly")*
- [ ] **Graph routing mechanic** — route data exists (13,143 pairs) but unused for gameplay. Need hop-by-hop navigation: land → radial dialog → pick next hop → bounce. This IS the game *(user: "Glasgow → Heathrow → Narita → Kyoto")*

## P1 — Game feel (after P0)

- [ ] **Altitude as mechanic** — higher = faster but harder to land *(both reviewers, user)*
- [ ] **Pre-launch overshoot warning** — feedback before release *(GPT-5.2, Gemini)*
- [ ] **Camera tilt during charge** — spatial feel for trajectory *(GPT-5.2)*
- [ ] **Combo/streak feedback** — "Nice!" / "Perfect!" floaters *(GPT-5.2)*
- [ ] **Sound & music** — ambient + varied SFX *(user: "will be more fun")*

## SHOULD DO — Game loop depth

- [ ] **Interception mechanic** — intercept rival couriers' packages *(original vision)*
- [ ] **Regional delivery chains** — bonus for same-region consecutive deliveries *(GPT-5.2)*
- [ ] **Long-distance precision bonus** — BULLSEYE on long shots *(GPT-5.2)*
- [ ] **Difficulty curve tuning** — first 3 deliveries generous *(GPT-5.2)*
- [ ] **OpenStreetMap integration** — street outlines at low altitude *(original vision)*

## MOBILE UX — when core is solid

- [ ] **Bottom safe area** — `env(safe-area-inset-bottom)` *(GPT-5.2)*
- [ ] **Larger delivery tap targets** *(GPT-5.2)*
- [ ] **Accessibility** — larger fonts, higher contrast *(user)*

## AVOID (for now)

Visual effects, particles, shaders, aesthetic tweaks. Anything that doesn't change how the game **plays**.
