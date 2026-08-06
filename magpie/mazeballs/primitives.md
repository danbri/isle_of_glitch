# Primitives — the configurable kernel life is built from

> **Still current.** The schema everything hangs off. Six of its nine material axes are now built — see [`WORLD-MANUAL.md`](WORLD-MANUAL.md) for how it
> sits in the world as a whole, and for the measurements behind it.

The catalog of low-level primitives every ecosystem story projects onto. Our job
(the mission, the First Law) is never to implement "predator," "eating," "armor,"
or "locomotion" — it is to choose the minimal set of **cell material properties,
contact interactions, and substrate affordances**, over **conserved energy**, such
that all of those stories *emerge* as configured regions of that space. This is the
schema `score-config` consumes and the autoresearch loop edits (`AUTORESEARCH.md`);
it obeys `energy-speculative-friction.md` and grows the bodies-and-brains of
`METHODS.md`.

## The kernel, in one sentence

**Cells carry a continuous material vector; they interact with each other and with
the terrain through pairwise functions of those vectors; those interactions move
energy (always conserved) and momentum; and every high-level behaviour is a region
of that space — discovered, never declared.**

Three layers, all DATA (rows the loop can perturb or extend): **material** (what a
cell is), **interaction** (what happens on contact — with cells and with terrain),
**physics** (how material becomes motion).

## The two laws every primitive obeys

- **First Law — nothing high-level is a primitive.** "Predator", "muscle", "armor",
  "locomotion" are *regions* of the space, never types the kernel branches on. If a
  proposed primitive names a behaviour, it's wrong.
- **Friction law — never mint, always conserve** (`energy-speculative-friction.md`).
  Every energy transfer traces to the fixed boundary inflow (the sun) and loses to
  heat. A primitive that balances its books by inventing energy is fiction.

## Layer 1 — the cell material vector

Continuous, expressed by development from the genome (the Turing / GRN map),
heritable, mutable. Already in the build: `tag`, `enzyme`, bond
`stiffness`/`brittleness`. The ecology needs these added:

| axis | meaning | sets / gates |
|---|---|---|
| `tag[]` | surface identity — what binds to you | consumption, adhesion |
| `enzyme[]` | what you can digest on contact | consumption |
| `toughness` | resists extraction & damage | gates being eaten |
| `nutrition` | energy liberated when consumed / dead | consumption yield |
| `contractility` | muscle force per fuel | motion |
| `stiffness` / `brittleness` | structural (bone↔sinew continuum) | body mechanics *(have)* |
| `density` / `waterSaturation` | mass & drag (dense↔spongy) | speed |
| `store` | energy-reserve capacity | endurance, target value |
| `grabbiness` | grip on substrate (material base × motor) | locomotion |

"Muscle", "bone", "flesh", "foot", "armor" = named *regions* of this vector. The
kernel sees only numbers.

## Layer 2a — contact functions (cell ↔ cell)

Pairwise, roleless, graded; fire on touch as functions of *both* vectors:

- **Consumption** — energy A←B at rate `max(0, enzyme_A · tag_B − toughness_B)`,
  amount scaled by `nutrition_B`. Eating a tough cell yields little; a soft
  nutritious one yields a lot; you must both *match* (enzyme·tag) and *overpower*
  (toughness). **Conserved:** A gains what B loses, minus heat. This one primitive
  is "grazing", "predation", and "attack" — graded, never labelled.
- **Damage** — contact may cut integrity without full consumption (harass / kill
  without digesting).
- **Force / adhesion** — volume exclusion + heritable-tag adhesion (bodies);
  already present.

## Layer 2b — substrate functions (cell ↔ terrain)

Substrate **affordance fields** (world, mostly static) that a cell pushes against:

| field | kind | affords |
|---|---|---|
| `grit` | scalar | friction to shove against |
| `stick` | scalar | adhesion to anchor to |
| `grain` | vector | anisotropy axis (easy-slip vs hard-slip) |
| `flow` | vector | a current to be swept by / anchor against *(have)* |

Traction on a cell = f(`grabbiness`, grit, stick, grain, flow at its position) — a
force that **only resists relative motion or anchors position** (dissipative /
constraint; never injects energy → friction-law clean; net motion is paid by muscle
fuel).

**Affordance, not forcing — the load-bearing distinction.** A field that pushes
*every* cell is the global-drift bug. Here traction is *conditional on the cell's
grabbiness*, and **passive constant grip still nets zero** (grip both strokes →
scallop theorem). Only **actively phased** grip — raise on the power stroke, drop on
recovery — ratchets a body forward. The world *affords*; the brain *earns*. That is
what keeps locomotion an evolved behaviour and not a forcing artifact.

Emergent styles by terrain: high grit → push-crawl; high stick → adhesive crawl
(anchor–extend–release); grain → slither; flow + low-grit → anchor to hold station;
low-everything ("water") → must swim or be carried. The water-vs-land horizon, as
fields.

## Layer 3 — physics couplings (material → motion)

`mass = f(density)`, `drag = f(waterSaturation, shape)`, `force = f(contractility ·
fuel)`, bond stiffness = f(joined cells) *(have)*. **Speed is emergent** from
composition — a light, muscular, fuelled assembly is fast; a dense armored one is
slow. "Fast vs slow" is never a knob.

## The tradeoffs are the teeth

Every axis must **cost or anti-correlate**, or evolution maxes all of them and there
is no arms race:

- `toughness` ↔ `nutrition` — tough = low-value food; and armor costs to build/hold.
- spongy/light/fast ↔ `toughness` — speed buys vulnerability.
- `store` ↔ target-value + mass — reserves make you slow and a richer meal.
- `contractility` ↔ fuel burn.
- `grabbiness` ↔ mobility — a permanently-gripping cell can't be swept off course,
  but can't be swept *toward* food either; and holding grip can cost fuel.

The tradeoffs turn a parameter space into an ecology.

## What emerges — all discovered, none declared

- soft nutritious body = food → reaching it (move + sense) pays → **movement
  selected**; being it → **fleeing selected**.
- armor = sit still safely at a nutrition/energy cost → **sessile vs mobile becomes
  an evolved choice**.
- terrain affords locomotion styles → **terrain-sensing load-bearing**; gait
  co-adapts to niche.
- predator / prey / grazer / tank / sprinter / anchor-feeder = **regions** of the
  material × interaction × terrain space.

## The configurable schema (what `score-config` eats, what the loop edits)

Everything above is data. A world config is roughly:

```json
{
  "energy":  { "sun": 1.4, "eat_efficiency": 0.75, "loss_to_heat": 0.25 },
  "material_axes": ["tag3","enzyme3","toughness","nutrition","contractility",
                    "stiffness","density","store","grabbiness"],
  "tradeoffs": [
    { "budget": ["toughness","nutrition"], "kind": "anticorrelate", "k": 0.8 },
    { "cost": "contractility", "per_fuel": 0.25 },
    { "cost": "armor_maintenance", "on": "toughness", "rate": 0.01 }
  ],
  "contact": {
    "consume": "max(0, enzyme·tag - toughness) * nutrition",
    "eat_efficiency": 0.75,
    "damage": { "on": "…", "rate": 0.0 }
  },
  "substrate": {
    "fields":   { "grit":  { "fbm":  { "scale": 3.2, "seed": 7  } },
                  "stick": { "fbm":  { "scale": 5.0, "seed": 9  } },
                  "grain": { "curl": { "scale": 2.0, "seed": 11 } } },
    "traction": "grabbiness * (grit + stick*anchor) anisotropic along grain, vs flow"
  },
  "development": { "encoding": "turing|cppn|nca" },
  "physics":     { "mass": "f(density)", "drag": "f(waterSaturation, shape)" }
}
```

The loop's **tier-1** perturbs the scalars/vectors here; **tier-2** (LLM) proposes
new *rows* — a material axis, a contact term, a substrate field, a tradeoff — as a
schema diff, gated by `score-config` (objective − control, friction-checked). Every
field above is a candidate mutation.

## Adding a primitive — the checklist

1. **Is it a material property, contact function, substrate field, or physics
   coupling — not a behaviour?** (First Law.) A named behaviour ⇒ reject.
2. **Does every energy term trace to the sun and lose to heat?** (Friction law.) A
   mint ⇒ reject.
3. **Does it carry a cost or a tradeoff?** No teeth ⇒ evolution maxes it ⇒ reject.
4. **Is it affordance, not forcing?** (Anything terrain-coupled.) Does the passive
   case net zero, so the behaviour must be *earned*? Forcing ⇒ it reads as the drift
   bug.
5. **Can `score-config` measure its effect against a conserved control?** No control
   ⇒ you can't tell signal from free energy.

Pass all five and it is a lawful row in the schema — configurable, mutable, and safe
for the loop to search.
