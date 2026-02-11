# Glowball Gopher — Backlog

Extracted from [GPT-5.2 review](review-2026-02-11.md) + [Gemini review](review-gemini-2026-02-11.md) + user playtesting + prior sessions.

### User playtesting verdict (2026-02-11)
> "Looks glorious but is very disorienting. More experience than game.
> Will be more fun when we add more music and sounds."

**North star: stop polishing, fix the core.** The visuals work. The game feel doesn't yet.

---

## DONE (completed P0 clarity pass)

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

## CORE GAMEPLAY — must do next (before any more polish)

- [ ] **Altitude as mechanic** — higher = faster travel but harder to land; gives charge strategic meaning *(both reviewers, user)*
- [ ] **Pre-launch overshoot warning** — screen shake / color shift / "TOO FAR" before release *(GPT-5.2, Gemini)*
- [ ] **Camera tilt during charge** — lean toward aim direction for spatial feel *(GPT-5.2)*
- [ ] **Combo/streak feedback** — "Nice!" / "Perfect!" floaters on good landings *(GPT-5.2)*
- [ ] **Sound & music** — ambient loop + varied bounce/land/deliver SFX *(user: "will be more fun")*

## GAME LOOP DEPTH — should do

- [ ] **Interception mechanic** — intercept rival couriers' packages *(original vision)*
- [ ] **Regional delivery chains** — bonus for consecutive same-region deliveries *(GPT-5.2)*
- [ ] **Long-distance precision bonus** — extra reward for BULLSEYE on long shots *(GPT-5.2)*
- [ ] **Difficulty curve tuning** — first 3 deliveries should feel generous *(GPT-5.2)*
- [ ] **Route selection UX** — radial menus or clearer route-type feedback *(original vision)*
- [ ] **OpenStreetMap integration** — street outlines at low altitude *(original vision)*

## MOBILE UX — when core is solid

- [ ] **Bottom safe area** — more aggressive `env(safe-area-inset-bottom)` *(GPT-5.2)*
- [ ] **Larger delivery option tap targets** *(GPT-5.2)*
- [ ] **Accessibility** — larger fonts, higher contrast mode *(user notes eyesight-dependent experience)*

## AVOID (for now)

Visual effects, particles, shaders, aesthetic tweaks (color temperature, lat/long grid, magnetic arcs, depth fog, adaptive contrast). Anything that doesn't change how the game **plays**.
