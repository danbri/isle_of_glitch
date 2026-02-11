# Globall Magnetics — Backlog

Extracted from [GPT-5.2 review](review-2026-02-11.md) + [Gemini review](review-gemini-2026-02-11.md) + prior sessions.
Items marked with current status. Prioritized by impact on playability.

### Review consensus (both reviewers independently flagged these)
- **Ring clutter** — both cite dense ring clusters as the #1 visual problem
- **Bloom washout** — both say bloom obliterates player pod + surface detail
- **Player pod visibility** — lost against bright terrain
- **Debug panel overlap** — both noticed it colliding with game UI
- **Altitude has no gameplay effect** — both suggest making it functional
- **Delivery list legibility** — too small / blends with background

### Where they diverge
- GPT-5.2 focuses more on **mechanic feel** (charge curve, pre-launch feedback, combo animation)
- Gemini focuses more on **information clarity** (direction arrow ambiguity, delivery list backdrop, overshoot dynamism)
- Gemini uniquely flags **battery drain / mobile perf** as a concern
- GPT-5.2 uniquely suggests **aesthetic extensions** (lat/long grid, magnetic arcs, color temperature)

---

## P0 — Critical (clarity degrades when it matters most)

- [ ] **Reduce visual noise in ring-dense areas** — LOD system: rings fade/hide by distance; only show nearby + target airport rings when delivery is active *(both reviewers, #1 issue)*
- [ ] **Clamp bloom at mid-altitude** — bloom + atmospheric haze stack causes white washout; hard-cap bloom strength when near surface; consider luminance-adaptive clamping *(both reviewers)*
- [ ] **Trajectory arc during charge** — faint predictive arc showing where the player will land (partially exists but not prominent enough) *(GPT-5.2)*
- [ ] **"Ideal charge" band on power meter** — show a green zone/tick mark on the charge ring for the ideal hold duration, not just color shift *(GPT-5.2)*

## P1 — Core mechanic & feedback

- [ ] **Player pod rim light / silhouette** — pod gets lost against bright terrain; add dark outline, rim glow, or contrasting stroke *(both reviewers)*
- [ ] **Pre-launch overshoot warning** — feedback BEFORE release when charge exceeds maximum viable range (currently only post-event "OVERSHOOT!") *(GPT-5.2)*
- [ ] **Make overshoot warning more dynamic** — screen shake, color shift, not just text *(Gemini)*
- [ ] **Camera tilt toward trajectory during charge** — slight lean in the launch direction so player sees where they're aiming *(GPT-5.2)*
- [ ] **Make altitude affect gameplay** — currently cosmetic; surface the effect (higher = faster travel but harder to land, range multiplier, drag) *(both reviewers)*
- [ ] **Combo text animation** — currently understated; make it scale/pulse more assertively on increment *(GPT-5.2)*
- [ ] **Direction arrow clarity** — ensure arrow clearly points to selected delivery target, not nearest airport *(Gemini)*

## P2 — Scoring & progression depth

- [ ] **Regional delivery chains** — bonus multiplier for consecutive deliveries in the same region/continent *(GPT-5.2)*
- [ ] **Long-distance precision bonus** — extra points for BULLSEYE on long-range deliveries *(GPT-5.2)*
- [ ] **Escalating streak audio/visuals** — sound pitch + particle intensity rise with combo count *(GPT-5.2)*
- [ ] **Difficulty curve tuning** — review timer tightening rate; ensure first 3 deliveries feel generous

## P3 — Mobile UX polish

- [ ] **Fix UI stacking / debug panel overlap** — debug panel overlaps delivery list + nearest airport; auto-collapse in production *(both reviewers)*
- [ ] **Delivery list legibility** — add semi-transparent backing plate / blur behind "Choose Delivery" options *(Gemini)*
- [ ] **Bottom safe area** — respect `env(safe-area-inset-bottom)` more aggressively on delivery choice + location panels *(GPT-5.2)*
- [ ] **Larger delivery option tap targets** — increase padding on delivery choice buttons *(GPT-5.2)*
- [ ] **Mobile performance / battery** — reduce shader passes, particle count on mobile; phone was at 8-9% battery in screenshots *(Gemini)*

## P4 — Aesthetic enhancements

- [ ] **Depth fog / distance desaturation** — distant trampoline rings fade with distance to reduce clutter *(GPT-5.2)*
- [ ] **Adaptive UI contrast** — darken panel backgrounds when terrain beneath is light *(GPT-5.2)*
- [ ] **Reduce particle count at low altitude** — 30–40% fewer particles near surface where they compete with terrain detail *(GPT-5.2)*
- [ ] **Landmass/UI contrast** — more contrast between landmasses and UI elements *(Gemini)*
- [ ] **Animated lat/long grid** — subtle wireframe globe overlay for "data-vis" aesthetic *(GPT-5.2)*
- [ ] **Magnetic field line arcs** — faint curvature arcs between airports, reinforcing the EM theme *(GPT-5.2)*
- [ ] **Regional color temperature** — polar regions cooler tint, equatorial regions warmer *(GPT-5.2)*

## Previously identified (from earlier sessions)

- [ ] **OpenStreetMap integration** — street outlines visible at low altitude (original vision)
- [ ] **Interception mechanic** — intercept rival couriers' packages (original vision)
- [ ] **Route selection UX** — radial menus or clearer route-type feedback
- [ ] **Camera feel** — smoothing, zoom-to-target on delivery pick
- [ ] **Real Earth texture option** — NASA Blue Marble for instant recognition (procedural currently)
