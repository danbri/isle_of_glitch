# Globall Magnetics — Backlog

Extracted from [GPT-5.2 review (2026-02-11)](review-2026-02-11.md) + prior session notes.
Items marked with current status. Prioritized by impact on playability.

---

## P0 — Critical (clarity degrades when it matters most)

- [ ] **Reduce visual noise in ring-dense areas** — rings cluster and merge into noise near airports; hide/fade non-target trampoline rings when a delivery is active
- [ ] **Clamp bloom at mid-altitude** — bloom + atmospheric haze stack causes white washout; dynamically clamp based on average luminance or hard-cap at mid-altitude
- [ ] **Trajectory arc during charge** — faint predictive arc showing where the player will land (partially exists but not prominent enough)
- [ ] **"Ideal charge" band on power meter** — show a green zone/tick mark on the charge ring for the ideal hold duration, not just color shift

## P1 — Core mechanic & feedback

- [ ] **Pre-launch overshoot warning** — feedback BEFORE release when charge exceeds maximum viable range for target distance (currently only post-event "OVERSHOOT!")
- [ ] **Player pod rim light / silhouette** — pod gets lost against bright terrain; add dark outline or rim glow for contrast
- [ ] **Camera tilt toward trajectory during charge** — slight lean in the launch direction so player sees where they're aiming
- [ ] **Make altitude affect gameplay** — currently cosmetic; surface the effect (range multiplier, drag reduction, combo bonus at peak)
- [ ] **Combo text animation** — currently understated; make it scale/pulse more assertively on increment

## P2 — Scoring & progression depth

- [ ] **Regional delivery chains** — bonus multiplier for consecutive deliveries in the same region/continent
- [ ] **Long-distance precision bonus** — extra points for BULLSEYE on long-range deliveries
- [ ] **Escalating streak audio/visuals** — sound pitch + particle intensity rise with combo count
- [ ] **Difficulty curve tuning** — review timer tightening rate; ensure first 3 deliveries feel generous

## P3 — Mobile UX polish

- [ ] **Bottom safe area** — respect `env(safe-area-inset-bottom)` more aggressively on delivery choice + location panels
- [ ] **Auto-collapse debug panel** — hide debug toggle in production / detect dev mode
- [ ] **Larger delivery option tap targets** — increase padding on delivery choice buttons for fat-finger friendliness
- [ ] **Fix UI stacking** — debug panel overlaps delivery list; choose-delivery overlay competes with background action

## P4 — Aesthetic enhancements

- [ ] **Depth fog / distance desaturation** — distant trampoline rings fade with distance to reduce clutter
- [ ] **Adaptive UI contrast** — darken panel backgrounds when terrain beneath is light
- [ ] **Reduce particle count at low altitude** — 30–40% fewer particles near surface where they compete with terrain detail
- [ ] **Animated lat/long grid** — subtle wireframe globe overlay for "data-vis" aesthetic
- [ ] **Magnetic field line arcs** — faint curvature arcs between airports, reinforcing the EM theme
- [ ] **Regional color temperature** — polar regions cooler tint, equatorial regions warmer

## Previously identified (from earlier sessions)

- [ ] **OpenStreetMap integration** — street outlines visible at low altitude (original vision)
- [ ] **Interception mechanic** — intercept rival couriers' packages (original vision)
- [ ] **Route selection UX** — radial menus or clearer route-type feedback
- [ ] **Camera feel** — smoothing, zoom-to-target on delivery pick
- [ ] **Real Earth texture option** — NASA Blue Marble for instant recognition (procedural currently)
