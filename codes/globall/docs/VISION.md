# Glo-ball Gopher — Vision & Design

## The Pitch

A planet-bouncing delivery game. You're a glowing gopher-like courier, trampolining between airports worldwide, delivering mysterious packages. Candy-colored, not grim. Beautiful but playful.

## Original Vision (verbatim)

> In codes/globall/ make a game designed to look beautiful and be set planetwide with threejs and sota exploitation of webgpu for 90hz gameplay, compositing and shaders for city and natural lighting effects and a dynamic based on the idea of literally bouncing around the planet as if airport networks were trampolining routes. Gameplay involves selecting a bounce route and taking mysterious packages to destinations or intercepting those of others. Candy mood not grim. The trampolines take us up into thin air where ISS and aurora borealis visible. At lower levels we see street outlines thanks to OpenStreetMap plus other elevation etc data. Pure realism not needed but some beautiful and fun.

## Core Loop

1. **Choose** — pick a delivery from 3 options (short/medium/long distance)
2. **Aim** — select target airport, hold to charge bounce
3. **Launch** — release to bounce along a great-circle arc
4. **Steer** — swipe/WASD to adjust mid-air trajectory
5. **Land** — accuracy scored by distance from target (concentric rings)
6. **Repeat** — progressive difficulty: tighter timers, smaller rings, longer distances

## What Makes It a Game (not a screensaver)

- **Altitude is a trade-off**: high arcs = faster travel but harder to land precisely
- **Charge has strategy**: short tap = low hop (precise), long hold = high arc (risky)
- **Scoring rewards skill**: bullseye/inner/outer ring tiers, combo streaks, time bonuses
- **Progressive challenge**: difficulty ramps with each delivery
- **Interception**: rival couriers carrying packages you can intercept (future)

## Altitude Layers

| Altitude | What you see | Gameplay effect |
|----------|-------------|-----------------|
| Surface | City lights, country outlines, airport rings | Precise landing zone, magnetic pull to airports |
| Low (0-5km) | Street outlines (OSM), elevation detail | Fine steering, short hops |
| Mid (5-50km) | Cloud layer, country shapes | Standard delivery arcs |
| High (50-200km) | Aurora borealis, atmosphere glow | Fast travel, hard to aim |
| Space (200km+) | ISS, stars, full planet view | Spectacular but overshooting |

## Tone & Aesthetic

- **Candy, not grim** — bright blues, purples, glowing effects
- **Playful physics** — squash/stretch, bounce effects, speed streaks
- **Mysterious packages** — Quantum Containers, Dream Fragments, etc.
- **Sound matters** — EM hums, bounce pops, delivery chimes, ambient music

## Name: Glo-ball Gopher

A glowing ball-shaped courier (the "gopher") bouncing around the globe ("glowball"). Eyes, wings, cargo pod. Faces the camera when parked (cute), faces velocity when flying (dolphin/whale silhouette).

## Player Verdict

> "Looks glorious but is very disorienting. More experience than game.
> Will be more fun when we add more music and sounds.
> Someone with better eyesight might have different experience!"

**Translation**: visuals are done, gameplay needs work. Focus on game feel, not more effects.
