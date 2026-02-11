# Globall Magnetics — Backlog

Extracted from [GPT-5.2 review](review-2026-02-11.md) + [Gemini review](review-gemini-2026-02-11.md) + user playtesting + prior sessions.

### User playtesting verdict (2026-02-11)
> "Looks glorious but is very disorienting. More experience than game.
> Will be more fun when we add more music and sounds."

This is the north star: **make it less disorienting and more game-like.**
The visuals work. The feel doesn't yet. Sound/music is a key missing piece.

### Review consensus (both AI reviewers independently flagged)
- **Ring clutter** — dense clusters as #1 visual problem
- **Bloom washout** — obliterates player pod + surface detail
- **Player pod visibility** — lost against bright terrain
- **Debug panel overlap** — colliding with game UI
- **Altitude has no gameplay effect** — should be functional
- **Delivery list legibility** — too small / blends with background

### Where AI reviewers diverge
- GPT-5.2: **mechanic feel** (charge curve, pre-launch feedback, combo animation)
- Gemini: **information clarity** (direction arrow ambiguity, delivery list backdrop, overshoot dynamism)
- GPT-5.2: aesthetic extensions (lat/long grid, magnetic arcs, color temperature)
- ~~Gemini: battery drain~~ *(user says ignore this)*

---

## P0 — Disorientation & clarity

The user's "disorienting" + "more experience than game" maps directly to these.
**All fixes must work visually — mobile games cannot rely on audio.**

- [ ] **Reduce visual noise in ring-dense areas** — LOD: fade/hide by distance; only show nearby + target airport rings during delivery *(both reviewers, #1 issue)*
- [ ] **Clamp bloom at mid-altitude** — bloom + atmospheric haze stack = white washout; hard-cap near surface *(both reviewers)*
- [ ] **Trajectory arc during charge** — make the existing preview arc more prominent so player knows where they're going *(GPT-5.2, addresses disorientation)*
- [ ] **"Ideal charge" band on power meter** — green zone/tick mark for ideal hold duration, not just color shift *(GPT-5.2)*
- [ ] **Player pod rim light / silhouette** — dark outline or contrasting rim glow so you always know where you are *(both reviewers — promoted from P1)*

## P1 — Make it feel like a game, not a screensaver

- [ ] **Make altitude affect gameplay** — higher = faster travel but harder to land; gives altitude meaning beyond scenery *(both reviewers, user)*
- [ ] **Pre-launch overshoot warning** — feedback BEFORE release when charge exceeds viable range *(GPT-5.2)*
- [ ] **Make overshoot warning more dynamic** — screen shake, color shift, not just text *(Gemini)*
- [ ] **Camera tilt toward trajectory during charge** — lean toward aim direction *(GPT-5.2, addresses disorientation)*
- [ ] **Combo text animation** — make it scale/pulse assertively on increment *(GPT-5.2)*
- [ ] **Direction arrow clarity** — ensure arrow points to selected delivery target, not nearest airport *(Gemini)*

## P2 — Scoring, progression & audio

- [ ] **Sound & music** — ambient music + richer sound design; nice-to-have but NOT relied upon for core feedback since mobile often played muted *(user feedback, deprioritized)*
- [ ] **Regional delivery chains** — bonus for consecutive deliveries in same region *(GPT-5.2)*
- [ ] **Long-distance precision bonus** — extra points for BULLSEYE on long-range *(GPT-5.2)*
- [ ] **Escalating streak audio/visuals** — sound pitch + particle intensity rise with combo *(GPT-5.2)*
- [ ] **Difficulty curve tuning** — review timer tightening; first 3 deliveries should feel generous

## P3 — Mobile UX polish

- [ ] **Fix UI stacking / debug panel overlap** — auto-collapse debug in production *(both reviewers)*
- [ ] **Delivery list legibility** — backdrop blur/plate behind "Choose Delivery" *(Gemini)*
- [ ] **Bottom safe area** — more aggressive `env(safe-area-inset-bottom)` *(GPT-5.2)*
- [ ] **Larger delivery option tap targets** — increase padding *(GPT-5.2)*
- [ ] **Accessibility** — user notes eyesight-dependent experience; consider larger fonts, higher contrast mode *(user feedback)*

## P4 — Aesthetic enhancements

- [ ] **Depth fog / distance desaturation** — distant rings fade to reduce clutter *(GPT-5.2)*
- [ ] **Adaptive UI contrast** — darken panels when terrain beneath is light *(GPT-5.2)*
- [ ] **Reduce particle count at low altitude** — 30–40% fewer near surface *(GPT-5.2)*
- [ ] **Landmass/UI contrast** — more contrast between landmasses and UI *(Gemini)*
- [ ] **Animated lat/long grid** — subtle wireframe globe overlay *(GPT-5.2)*
- [ ] **Magnetic field line arcs** — faint curvature arcs between airports *(GPT-5.2)*
- [ ] **Regional color temperature** — polar cooler, equatorial warmer *(GPT-5.2)*

## Previously identified (from original vision)

- [ ] **OpenStreetMap integration** — street outlines at low altitude
- [ ] **Interception mechanic** — intercept rival couriers' packages
- [ ] **Route selection UX** — radial menus or clearer route-type feedback
- [ ] **Camera feel** — smoothing, zoom-to-target on delivery pick
- [ ] **Real Earth texture option** — NASA Blue Marble for instant recognition
