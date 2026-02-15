# Glo-ball Gopher -- Player Psychology Analysis

**Document type**: Design psychology assessment
**Subject**: Glo-ball Gopher (Three.js browser game, planet-bouncing delivery courier)
**Framework**: Flow theory, Self-Determination Theory, behavioral reinforcement, spatial cognition
**Date**: 2026-02-14

---

## 1. The First 30 Seconds: Cognitive Load Mapping

A new player's first encounter with Glo-ball Gopher follows a predictable cognitive trajectory that we can map second by second.

**Seconds 0-5: Awe and disorientation.** The player sees a glowing planet, atmospheric effects, stars, aurora, magnetic field lines, constellation overlays. The visual density triggers what cognitive psychologists call *attentional capture* -- the involuntary orienting of attention toward novel, high-contrast stimuli (Yantis & Jonides, 1990). The player's first emotion is wonder. But wonder is passive. It is the emotion of a spectator, not a player. This is the precise moment where the "screensaver vs game" tension begins.

**Seconds 5-10: "What am I?"** The player must locate themselves. On a 2D screen, we find ourselves instinctively -- we are the thing in the center, or the thing that moves when we press buttons. On a rotating 3D globe with bloom effects, ring overlays, and particle systems, self-location is non-trivial. The player is a small glowing pod on a vast sphere. Spatial self-anchoring -- the foundational prerequisite for any action -- is delayed.

**Seconds 10-15: "What do I do?"** Three delivery options appear. They are color-coded (green, purple, orange) and labeled with IATA airport codes. For a player who does not know what GLA or NRT means, these are arbitrary alphanumeric strings. The delivery choice -- which should feel like a meaningful decision -- instead feels like a guess. This is *premature decision complexity*: the game asks for a strategic choice before the player has any strategic understanding.

**Seconds 15-25: The first charge.** The player holds the button. A trajectory arc appears. A ring changes color. The player releases. The pod launches. This moment has genuine kinesthetic promise -- the relationship between hold duration and arc height is intuitive. But the player does not yet know what "good" looks like. There is no reference bounce, no demonstration, no ghost trajectory from a previous attempt. The first launch is a shot in the dark, and most first launches will either barely leave the surface or massively overshoot.

**Seconds 25-30: Airborne confusion.** The player is now flying over a curved surface with no clear up, down, north, or south. The direction arrow points somewhere. The distance counter decreases, but from a number the player has no frame of reference for. Is 4,000 km close? How fast am I going? Will I land near the target? The player cannot answer any of these questions. They are a passenger in their own game.

**The core problem**: The first 30 seconds produce wonder without agency. The player feels like they are watching something beautiful happen *to* them rather than *doing* something. This is the experiential root of the user's verdict: "more experience than game."

**Cognitive load at this stage is approximately 7-9 items** -- well above Miller's (1956) working memory capacity of 7 plus or minus 2. The player must simultaneously process: (1) where they are on the globe, (2) where their target is, (3) what their pod is, (4) what the button does, (5) what the charge colors mean, (6) what the IATA codes mean, (7) what the rings are, (8) what the score means, and (9) how the direction arrow works. This is a recipe for cognitive overload in the exact moment when the game needs to feel simple.

---

## 2. Flow State Analysis

Mihaly Csikszentmihalyi's flow model (1990) describes an optimal psychological state that emerges when perceived challenge matches perceived skill. The model defines a channel: too much challenge relative to skill produces anxiety; too little produces boredom. Flow lives in the narrow band between.

**Where Glo-ball Gopher sits on the skill-challenge curve:**

The game currently presents *high perceived challenge with low perceived skill*, which places the new player squarely in the **anxiety/confusion quadrant**. This is not because the game is objectively hard -- the one-button control is mechanically simple. The challenge is *cognitive*, not *motor*. The player does not understand the consequences of their actions, cannot predict outcomes, and lacks the mental model needed to form intentions. Without intention, there can be no satisfaction in execution.

**Where flow breaks:**

1. **After launch, before landing.** The player is airborne for several seconds with limited agency. Mid-air steering is subtle and the rapid-tap boost is undiscoverable without instruction. This is a *dead zone* in the flow channel -- the player is waiting, not playing. In rhythm games and platformers, every moment is active. In Glo-ball Gopher, the longest moments (flight arcs) are the most passive.

2. **After landing, during delivery choice.** The momentum of a successful delivery is immediately interrupted by a cognitive decision (pick from three options with unfamiliar codes). The game shifts from kinesthetic to analytical at exactly the wrong moment -- the player wants to *keep bouncing*, not stop and read.

3. **During globe reorientation.** Every landing places the player at a new location on a sphere. Spherical navigation means there is no persistent "left" or "right." The player's spatial mental model must be rebuilt after every bounce. This is the deepest source of the "disorienting" feeling. Flat games allow players to build cumulative spatial knowledge. Spherical games reset it constantly.

**Flow-enabling features that already exist:**

- The charge-release mechanic has a clear input-output relationship (hold longer = go farther). This is a *flow prerequisite* -- immediate, legible feedback.
- The trajectory arc during charging provides feedforward information -- the player can see where they will go before committing. This is excellent.
- The combo timer creates urgency without punishment (the combo drops, but you do not die). This is *positive pressure*, which supports flow rather than disrupting it.

**Flow-breaking features:**

- Altitude has no gameplay consequence. The player ascends dramatically but learns nothing about how altitude relates to outcomes. This violates Csikszentmihalyi's requirement that feedback be *informative* -- the visual spectacle of height is feedback about nothing.
- The scoring formula is opaque. `(base + timeBonus + distBonus + streakBonus + chainBonus) x accuracyMultiplier x comboMultiplier` has six variables. The player cannot reason about which actions produced which points. Contrast this with *Tetris*, where the scoring relationship is transparent: more lines cleared simultaneously = more points. Period.

---

## 3. Motivation Taxonomy: Self-Determination Theory

Ryan and Deci's Self-Determination Theory (2000) identifies three innate psychological needs that drive intrinsic motivation: autonomy, competence, and relatedness.

### Autonomy: Partial

The delivery choice system provides surface-level autonomy -- the player picks short, medium, or long. But the choice lacks meaningful consequence beyond risk/reward scaling. True autonomy means the player feels their *strategy* matters, not just their *selection*. The planned graph-routing mechanic (Glasgow to Heathrow to Narita to Kyoto) would dramatically improve autonomy by making route-planning a genuine strategic layer. Currently, each delivery is an isolated event. With routing, deliveries become chapters in a narrative the player is authoring.

### Competence: Weak

Competence satisfaction requires two things: (1) a clear sense of improvement over time, and (2) feedback that attributes outcomes to player skill rather than luck. Glo-ball Gopher currently struggles with both.

The player cannot easily tell whether a good delivery resulted from their skill (precise charge timing, good aim) or from favorable geography (short distance, large target). The scoring formula is too complex to provide clear competence signals. When a player sees "+2,400 pts," they cannot decompose that into "my aim was good" versus "the combo multiplier was high." Compare *Angry Birds*, where physics simulation makes causality visible: the player sees exactly how their angle and force produced the destruction pattern.

The rank system (Trainee to Legendary) provides long-term competence framing, but within a single 3-minute session, competence feedback is muddled.

### Relatedness: Absent

This is the most significant gap. The game is entirely solo. There is no leaderboard, no ghost data from other players, no asynchronous competition, no shared world state. The original vision included an interception mechanic ("intercepting those of others"), which would have introduced both competition and a sense of shared space. Even without real multiplayer, *presence* can be simulated: ghost couriers following recorded routes, a global delivery counter ("427,000 packages delivered worldwide"), or weekly route challenges would satisfy relatedness needs without requiring server infrastructure.

Research by Rigby and Ryan (2011) in *Glued to Games* demonstrates that even minimal relatedness cues (leaderboard names, ghost cars in racing games) significantly increase play duration and return frequency.

---

## 4. The Dopamine Loop

The neurochemistry of game reward is driven by prediction, surprise, and variable-ratio reinforcement. Let us audit the current reward architecture.

### Existing rewards:

| Reward | Timing | Sensory Channel | Variable? |
|--------|--------|----------------|-----------|
| Score increment | On delivery | Visual (number) | Somewhat (accuracy varies) |
| Accuracy tier text | On delivery | Visual ("BULLSEYE!") | Yes |
| EM pulse rings | On delivery | Visual (particle) | No (always fires) |
| Combo multiplier | On fast chaining | Visual (x2, x3...) | Yes |
| Charge growl | During charge | Audio | No |
| Bounce sound | On launch | Audio | No |
| Landing sound | On touchdown | Audio | No |
| Delivery chime | On delivery | Audio | No |

### Analysis:

**The reward cluster is too narrow.** Almost all rewards fire at a single moment: delivery. The game has a long arc between reward events (charge -> fly -> land -> deliver). During the flight phase -- which can last 5-10 seconds -- there are zero rewards. This creates what behavioral psychologists call an *extinction burst risk*: the player's reward-seeking behavior (bouncing, tapping) goes unreinforced for too long, and motivation decays.

**The combo system is psychologically strong in theory but weak in execution.** Variable-ratio reinforcement -- the same mechanism that drives slot machines and loot boxes -- is most powerful when the player *almost* gets the reward and sometimes *unexpectedly* gets it. The 15-second combo window creates genuine tension ("Can I deliver fast enough to keep the chain?"), but the feedback for maintaining a combo is understated. A "x3" text indicator does not produce the visceral satisfaction of, say, *Tony Hawk's Pro Skater*'s combo meter, where the number grows in real-time, the screen edges pulse, and a crash wipes it all away. The stakes need to *feel* higher.

**The rapid-tap boost is the best dopamine generator in the game.** Each tap produces immediate feedback (speed increase, pitch rise, "BOOST x2!" text). This is a textbook *escalating reward loop*: action -> immediate feedback -> increased intensity -> action. The rising pitch is particularly effective -- auditory frequency is processed pre-consciously and directly modulates arousal. But this mechanic is undiscoverable and unrewarded by the scoring system. A player who boosts spectacularly across three continents earns nothing for the feat. The dopamine of the boost is purely kinesthetic, disconnected from the game's formal reward structure.

**Recommendation**: Introduce mid-flight micro-rewards. Altitude milestones ("Stratosphere!"), speed thresholds ("Mach 3!"), continent crossings ("Atlantic Crossing!"), and proximity to the ISS ("ISS Flyby!") would pepper the flight phase with small dopamine hits that maintain engagement during the otherwise passive arc.

---

## 5. Spatial Cognition on a Sphere

Humans evolved to navigate flat terrain. Our spatial cognition is built on Euclidean assumptions: parallel lines do not converge, shortest paths are straight lines, and north is always "up." A sphere violates all three. This is not a minor UX friction -- it is a fundamental cognitive incompatibility.

Research by Montello (2005) on spatial cognition demonstrates that humans build spatial knowledge in four stages: *landmark knowledge* (recognizable places), *route knowledge* (paths between landmarks), *survey knowledge* (bird's-eye mental maps), and *metric knowledge* (accurate distances and directions). Most games scaffold this progression. Glo-ball Gopher drops the player into a sphere and expects metric knowledge immediately.

### What would help:

**Landmark knowledge** is the foundation. The game uses real airports, but IATA codes (NRT, GLA, LHR) are jargon. Replacing or supplementing codes with city names (Tokyo, Glasgow, London) would activate existing geographic knowledge. Most players have a rough mental model of where Tokyo is relative to London. Few have a model of where NRT is relative to LHR.

**Route knowledge** would emerge naturally from the graph-routing mechanic. If the player repeatedly bounces Glasgow -> London -> Dubai -> Tokyo, they build a mental "route" that persists across sessions. This is how *Euro Truck Simulator* creates spatial familiarity: not by providing a map, but by having the player traverse the same routes until the routes become internalized.

**Survey knowledge** is partially provided by the globe itself -- the player can see the whole planet during high arcs. But the globe is an *abstract* survey representation. What the player needs is a *personalized* survey: "I have been here, here, and here." A visited-airports visualization (dots that change color after delivery) would build survey knowledge over time.

**Metric knowledge** -- understanding that 3,000 km requires a medium charge and 8,000 km requires a long charge -- develops through play. The game already supports this through the charge color indicator (blue/green/orange). This is well-designed. But metric knowledge could be accelerated by showing distance-to-target in the charge UI itself, so the player explicitly connects "this distance = this charge level."

**A minimap is not the answer.** Minimaps work for flat, bounded spaces. On a sphere, a minimap would either be a second globe (redundant) or a Mercator projection (distorted). Instead, the game should lean into *egocentric* navigation cues: "Target is 40 degrees to your left and 6,000 km away." Compass bearing, distance, and relative direction are more useful than a map when your world is a sphere.

---

## 6. The "One More Game" Problem

Replay motivation in short-session arcade games comes from three sources, which I call the **Replay Triad**:

1. **Score chasing** -- "I can do better." This is the current primary motivator. It works for competitive players but alienates explorers, socializers, and completionists (per Bartle's player taxonomy).

2. **Mastery progression** -- "I am getting better." This requires the player to perceive improvement. Currently, improvement is legible only through score numbers. More visible mastery signals: unlocking harder delivery tiers, earning named achievements ("Atlantic Express: deliver from New York to London in under 12 seconds"), or progressing through courier ranks within a session.

3. **Novelty seeking** -- "I wonder what happens if..." This is the most underexploited motivator. The game has 20 airports and a beautiful globe, but every session feels the same because the player has no way to set their own goals. *What if there were route challenges?* "This week's challenge: deliver around the Pacific Rim in 3 minutes." *What if airports had personality?* "Tokyo Narita: known for precision landings. Your best accuracy here: PRECISE."

The planned graph-routing mechanic would also transform replay motivation. Route optimization is inherently replayable -- "Can I find a faster path from Glasgow to Kyoto?" -- because the combinatorial space is large and the player's improving skill changes which routes are viable.

**The most powerful replay motivator this game could implement is a personal best system per route, not just per session.** "Your fastest Glasgow-to-Tokyo: 47 seconds via London-Dubai. Can you beat it via Reykjavik-Anchorage?" This transforms a single high-score treadmill into a rich space of personal records.

---

## 7. Onboarding Design: Guided First Experience

The current onboarding is: nothing. The player starts and must figure it out. This works for *Dark Souls* (where confusion is thematic) but not for a candy-toned arcade game that wants broad accessibility.

### Proposed first-time sequence:

**Bounce 1: "Just bounce."** The game starts with no delivery, no timer, no score. A single prompt: "Hold to charge. Release to bounce." The player is at a specific recognizable location (London, perhaps -- culturally familiar, geographically central). They bounce. They feel the physics. They land. Prompt: "Nice. You can bounce anywhere on Earth."

This follows the *Breath of the Wild* principle: teach one verb at a time in a safe space. Nintendo's onboarding research (documented in GDC talks by Hidemaro Fujibayashi, 2017) shows that players retain mechanics better when each mechanic is introduced in isolation with immediate success.

**Bounce 2: "Now deliver."** A single delivery option appears (not three -- one). "Deliver this package to Paris." The target rings appear. The direction arrow appears. The player bounces toward Paris. They land. "Delivered! +300 points." The player now understands the core loop: bounce toward target, land near rings, score.

This follows *Celeste*'s onboarding: each screen teaches one thing, and the player cannot fail permanently. Celeste's designer Matt Thorson has spoken extensively about "teaching through level design, not text" (GDC 2018).

**Bounce 3: "Charge matters."** A medium-distance delivery. The prompt: "Hold longer for a bigger bounce." The charge ring is introduced. The player experiments with hold duration. Even if they overshoot, the overshoot feedback ("OVERSHOOT!") teaches them that charge has consequences.

**Bounce 4: "Chain them."** Two deliveries appear in sequence, close together. "Deliver fast to build your combo." The combo multiplier is introduced. The player experiences the satisfaction of x2 for the first time.

**Bounce 5: "Now you're a courier."** The full UI appears. Three delivery options. The session timer starts. "3 minutes. How many can you deliver?"

**Total onboarding time: approximately 60-90 seconds.** Five bounces. Five concepts. No text walls. No pausing. The player learns by *doing*, with each bounce adding exactly one new element.

*Portal* (Valve, 2007) remains the gold standard for this approach: each test chamber introduces one mechanic, then combines it with previous mechanics. The player never reads a manual. They play their way into understanding.

---

## 8. Emotional Arc of a 3-Minute Session

A well-designed short session should follow a dramatic arc analogous to a story: rising action, climax, resolution. Here is the intended emotional map:

```
Excitement
    ^
    |          /\         /\
    |         /  \  Peak /  \     Climax
    |    /\  /    \/    /    \   /\
    |   /  \/            \  / \ /  \
    |  /  First           \/   V    \  Timer
    | / delivery                     \ anxiety
    |/ wonder                         \___
    +----------------------------------------> Time
    0:00     0:45    1:15    2:00   2:30  3:00
```

**0:00-0:30 -- Wonder and orientation.** Emotional tone: curiosity, slight confusion, visual awe. The globe is beautiful. The player is finding their footing. Low arousal, high novelty.

**0:30-1:00 -- First delivery success.** The player delivers their first package. Relief and satisfaction. The score appears. They feel competent for the first time. This is the *hook* -- if this moment does not feel good, the player will not continue. The celebration effects (EM pulse, particle burst, chime) must be unmistakably positive.

**1:00-1:30 -- Building rhythm.** The player has delivered 2-3 packages. The combo system activates. The pace increases. Flow begins to emerge as the player's mental model of charge-distance improves. Arousal rises.

**1:30-2:15 -- Peak performance.** The player is in the zone. Deliveries chain smoothly. Combos stack. The score climbs. This is where the game should feel *effortless* -- the skill-challenge balance is calibrated, the player knows what to do, and execution matches intention. This is the flow window.

**2:15-2:45 -- Tension and risk.** The timer is visible. Less than a minute left. The player faces a choice: safe short deliveries to maintain combo, or risky long deliveries for big points? This is the *dramatic question* of the session. Progressive difficulty (tighter timers) amplifies the tension. Arousal peaks.

**2:45-3:00 -- Final push.** The last delivery. The timer flashes. The player scrambles. Either they land a clutch delivery and end on a high, or they time out and feel the sting of the combo breaking. Either outcome is emotionally vivid. The session ends with adrenaline, not boredom.

**Currently missing from this arc**: The 0:00-0:30 segment is too long and too passive. The 1:00-1:30 segment lacks escalating feedback (the combo indicator is subtle). The 2:15-2:45 segment needs more dramatic cues -- audio tension, visual urgency, screen edge effects -- to sell the climactic pressure.

---

## 9. The "Screensaver vs Game" Tension

The user's critique -- "more experience than game" -- identifies a genuine design tension. The game's visual ambition works *against* its gameplay clarity. This is not unusual; it is the central challenge of any aesthetically-driven game.

**The diagnosis**: The game currently prioritizes *spectacle* over *legibility*. Spectacle creates wonder; legibility creates agency. A screensaver is pure spectacle. A spreadsheet is pure legibility. A great game is both.

**Games that solve this tension well:**

- *Journey* (thatgamecompany, 2012): Visually stunning desert and mountain landscapes, but the player always knows where to go because the mountain is always visible. Beauty serves navigation.
- *Katamari Damacy* (Namco, 2004): Absurdly colorful, visually chaotic environments, but the core mechanic (roll things up) is so simple that complexity never obscures action.
- *Alto's Odyssey* (Snowman, 2018): Gorgeous procedural landscapes with dynamic lighting. But the player's avatar is a high-contrast silhouette, the terrain is a clear line, and the verbs are just "jump" and "grind." Beauty is the background. Gameplay is the foreground.

**The principle**: Visual spectacle should be *in the periphery*, not *in the center of attention*. The planet, the aurora, the stars, the ISS -- these should be the scenery you notice *between* actions, not the thing competing with your actions for visual bandwidth.

**Specific applications for Glo-ball Gopher:**

1. During charging, dim the background 10-20%. The player's attention should be on the trajectory arc and charge indicator, not the planet surface. *Superhot* does this brilliantly -- time slows and visual noise reduces during the aiming phase.

2. During flight, let the spectacle breathe. This is where the player can appreciate the beauty. The flight arc is the "experience" phase. Do not clutter it with UI. Fade the delivery panel, minimize the HUD, let the player watch the globe roll beneath them.

3. During landing approach, shift back to legibility. Brighten the target rings, increase their contrast, suppress background detail near the landing zone. The player needs precision now, not wonder.

**The rhythm should be: legibility (charge) -> spectacle (flight) -> legibility (land) -> reward (deliver) -> repeat.** Each phase has a visual mode, and the game cross-fades between them. This preserves the wonder while ensuring the player always knows what to do when it matters.

---

## 10. Accessibility of Joy: The Rapid-Tap Boost Problem

The rapid-tap boost is, by the developer's own assessment, "the most fun input in the game." But it has three accessibility problems:

1. **Discoverability**: There is no indication that tapping while airborne does anything. The player must accidentally tap, notice the speed increase, and connect cause to effect. Many players will never discover it.

2. **Motor demand**: Rapid tapping is physically demanding, particularly for players with motor impairments, repetitive strain injuries, or who are playing on a bumpy commute. The most fun mechanic is gated behind the most demanding input.

3. **Strategic disconnection**: Boosting sends the player soaring but also guarantees an overshoot. Fun and score are inversely correlated. The player who does the most exciting thing is punished by the scoring system.

### Solving for accessibility without removing depth:

**Discoverability**: On the player's third flight (by which point they have the basics), display a one-time prompt: "Tap while flying for speed boosts!" This is a *just-in-time* hint, delivered when the player has enough context to understand it. *Hollow Knight* uses this technique extensively -- ability hints appear only when the player enters a situation where the ability is relevant.

**Motor demand**: Introduce a "hold to auto-boost" alternative. Holding the button while airborne produces a steady acceleration (like cruise control) while tapping produces discrete bursts with higher peak speed. This gives casual players access to the joy of speed while preserving the higher skill ceiling of rhythmic tapping. *Celeste*'s assist mode provides a design precedent: adjustable game speed and invincibility allow any player to experience the full game without removing the challenge for those who want it.

**Strategic disconnection**: Reward spectacular flight. Award points for altitude milestones, speed records, distance covered in a single arc, and "flyby" events (passing near the ISS, crossing the aurora zone, flying over a specific number of countries). This aligns the scoring system with the fun. The player who boosts wildly should earn *something* for the spectacle, even if they miss the delivery. This creates a legitimate playstyle: the "scenic route" player who optimizes for flight achievements rather than delivery precision.

The deeper principle here comes from Raph Koster's *Theory of Fun for Game Design* (2004): fun is the process of learning patterns. The rapid-tap boost is fun because it reveals a pattern (tap -> speed -> tap -> more speed -> rising pitch -> spectacular arc) that the player can master. Making this pattern accessible means ensuring that the *learning process* is accessible, not just the *end state*. A player who discovers the boost for the first time and manages three consecutive taps should feel as much joy as an expert who chains fifteen. The reward curve should be front-loaded (big payoff early, diminishing returns later) so that beginners taste the fun immediately.

---

## Summary of Recommendations by Priority

| Priority | Recommendation | Psychological Basis |
|----------|---------------|-------------------|
| Critical | Guided onboarding (5-bounce sequence) | Cognitive load theory, flow prerequisites |
| Critical | City names alongside IATA codes | Landmark knowledge, spatial cognition |
| Critical | Simplify scoring feedback (show one big number, not six variables) | Competence attribution |
| High | Mid-flight micro-rewards (altitude, speed, crossings) | Reinforcement scheduling, extinction prevention |
| High | Legibility/spectacle phase rhythm (dim during charge, open during flight) | Attentional resource management |
| High | Combo feedback amplification (screen effects, audio escalation) | Variable-ratio reinforcement salience |
| High | Make rapid-tap boost discoverable + accessible | Accessibility, motor equity, fun gating |
| Medium | Per-route personal bests (not just per-session high score) | Mastery motivation, replay triad |
| Medium | Visited-airport visualization | Survey knowledge building |
| Medium | Timer anxiety cues in final 45 seconds (audio, visual urgency) | Dramatic arc, arousal management |
| Low | Ghost couriers or global delivery counter | Relatedness (SDT) |
| Low | Weekly route challenges | Novelty motivation, long-term retention |

---

## Closing Note

Glo-ball Gopher has something rare: genuine spectacle in a browser game. The planet is beautiful, the physics are satisfying, and the rapid-tap boost produces real joy. The problem is not a lack of quality but a lack of *structure*. The player does not know what to attend to, when to attend to it, or how their actions connect to outcomes. This is a game that needs less addition and more curation -- reducing noise, sequencing revelations, and ensuring that every visual element serves either *wonder* or *understanding*, never both simultaneously and never neither.

The path from "gorgeous screensaver" to "gorgeous game" is not about adding mechanics. It is about making the existing mechanics *legible*. When a player understands what they are doing, why they are doing it, and how well they did it, the beauty of the globe becomes a reward rather than a distraction. That is the goal: spectacle in service of play.
