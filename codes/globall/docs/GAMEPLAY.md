# Globall Magnetics — Gameplay Spec

## Core Loop

1. **Choose** a delivery from 3 options (short/medium/long)
2. **Launch** by holding the button — charge ring shows power
3. **Fly** toward the target, steering with swipe or WASD
4. **Land** on the concentric rings at the destination
5. **Score** based on accuracy, speed, distance, and combo
6. **Repeat** — 3-minute session, beat your high score

## Controls

| Input | Action |
|-------|--------|
| Hold LAUNCH button | Charge bounce power |
| Release LAUNCH | Fire in aimed direction |
| Swipe on screen / WASD | Steer while airborne |
| Tap delivery option | Choose next package |
| Tap airport on globe | Set manual aim target |
| Space (desktop) | Charge bounce |

### Charge Types (by hold duration)

- **Quick Pulse** (<200ms) — gentle, low arc
- **Mag Launch** (200–600ms) — high, powerful
- **Long Range** (>600ms) — far, fast

### Power Indicator

The ring around the LAUNCH button shows charge level:
- **Blue** — under-charged (too short for target distance)
- **Green** — dialed in (good match for distance)
- **Orange** — over-charged (too much power)

## Delivery Choice

After each delivery (or at game start), 3 options appear:

| Difficulty | Color | Distance | Timer | Points |
|-----------|-------|----------|-------|--------|
| SHORT | Green | Nearby | Generous | Lower |
| MEDIUM | Purple | Mid-range | Normal | Medium |
| LONG | Orange | Far | Tight | Higher |

The timer starts when you pick a delivery, not before.
Session clock (3 min) starts on first choice.

## Scoring

### Base Score
Each package type has a base value (100–500 pts).

### Accuracy Multiplier
Landing distance from target center:
- **BULLSEYE** (<0.5 units / ~320km) — **3x**
- **PRECISE** (<0.8 units / ~510km) — **2x**
- **DELIVERED** (<1.5 units / ~960km) — **1x**

### Bonuses
- **Time bonus**: Faster delivery = more points (proportional to time remaining)
- **Distance bonus**: Farther destinations = +20 pts per unit
- **Streak bonus**: +15 pts per consecutive delivery (caps at +200)
- **Chain launch**: Bounce within 3s of delivery = 1.3x force bonus
- **Combo multiplier**: Deliver within 15s of previous = escalating combo (x2, x3... up to x5)

### Penalties
- **Timeout** — package expires = **-100 pts** + combo reset
- **Miss** — fly past destination = "OVERSHOOT!" feedback (no penalty, just warning)

### Final Score Formula
```
total = (base + timeBonus + distBonus + streakBonus + chainBonus) × accuracyMultiplier × comboMultiplier
```

## Progressive Difficulty

| Deliveries Done | Options Available |
|----------------|-------------------|
| 0–2 | All 1-hop (nearby, easy) |
| 3–5 | Medium option may be 2-hop |
| 6+ | Long option is always 2-hop |

Timer also tightens: `difficultyScale = max(0.6, 1 - deliveries × 0.03)`

## Visual Feedback

### Target Rings (concentric, at destination)
- **Outer ring** (1.5u radius) — blue, slowly rotating
- **Middle ring** (0.8u) — purple, counter-rotating
- **Inner ring** (0.5u) — cyan, pulsing scale + opacity
- **Center dot** — white, pulsing
- **Beam** — purple vertical column visible from far away
- **Arrow** — cyan, bobbing above target

### Direction Arrow (HUD)
- Large triangle at top of screen points toward destination
- Distance shown in km beneath arrow
- Fades when very close

### Celebrations
- **DELIVERED** — expanding EM pulse rings + 80-particle burst
- **BULLSEYE** — enhanced haptic + camera shake
- **COMBO** — multiplier display with countdown bar
- **EXPIRED** — red text, penalty display, double vibration

## Session Flow

1. Game loads → delivery choices appear
2. Player picks first delivery → 3:00 timer starts
3. Play until timer hits 0:00
4. Game Over screen: score, deliveries, best combo, rank
5. High scores persist in localStorage
6. "PLAY AGAIN" resets everything

## Ranks

| Score | Rank |
|-------|------|
| 10,000+ | LEGENDARY COURIER |
| 5,000+ | EXPERT COURIER |
| 2,000+ | SKILLED COURIER |
| 500+ | NOVICE COURIER |
| <500 | TRAINEE COURIER |
