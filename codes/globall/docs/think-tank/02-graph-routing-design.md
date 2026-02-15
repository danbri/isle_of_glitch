# Graph Routing Design for Glo-ball Gopher

## 1. Network Topology Analysis

### What the real data looks like

The game's route dataset contains **13,143 undirected route pairs** connecting **1,144 airports** drawn from a pool of 1,269 in `airports.json`. Empirical analysis of this graph reveals:

| Property | Value |
|----------|-------|
| Nodes | 1,144 |
| Edges | 13,143 |
| Mean degree | 23.0 |
| Median degree | 10 |
| Max degree | 228 (FRA) |
| Diameter | 4 |
| Avg clustering coefficient | 0.63 |
| Connected components | 1 (fully connected) |

This is a **scale-free small-world network**, consistent with well-studied properties of real airline route graphs. The degree distribution is heavy-tailed: a handful of mega-hubs (Frankfurt, CDG, Amsterdam, Istanbul) connect to 150-230 other airports, while the median airport has only 10 connections and 61 airports have just a single route. The clustering coefficient of 0.63 is high, meaning that if airport A connects to B and C, there is a 63% chance B and C also connect to each other. This forms dense regional clusters (all of Western Europe is a near-clique) with sparser intercontinental bridges.

The diameter of 4 means that any airport can reach any other in at most 4 hops. For a delivery game, this is a problem: if most trips are 1-2 hops, there is no routing decision to make.

### Route distance distribution

| Range | Count | Share |
|-------|-------|-------|
| < 500 km | 1,475 | 11.2% |
| 500 - 2,000 km | 7,003 | 53.3% |
| 2,000 - 5,000 km | 3,367 | 25.6% |
| > 5,000 km | 1,298 | 9.9% |

The median route covers 1,493 km. Over half of all routes are mid-range (500-2,000 km), which is perfect for single-hop bounces. Long-haul routes (> 5,000 km) account for only 10% of edges, and these are the intercontinental bridge routes that hub selection must preserve.

### What makes a good gameplay graph

The raw route graph is too flat for interesting routing. We need a graph where:

1. **Average path length is 2-4 hops** for a typical delivery. This creates meaningful choices at each node.
2. **Degree per node is 4-8** in the gameplay sub-graph. More than 8 options in a radial dialog overwhelms; fewer than 3 removes choice.
3. **Geographic coverage is global** so deliveries span continents.
4. **Hub structure is visible**: some nodes are clearly "better" (more connections, more central), rewarding players who learn the network.
5. **There are no dead ends** and no isolated subgraphs. Every node must reach every other node.

The key graph-theory properties for gameplay:

- **Diameter >= 5**: ensures long deliveries require multi-hop planning.
- **Average degree ~6**: enough choice without overload.
- **Betweenness centrality variance**: some nodes should be high-betweenness (gateway hubs) and some low (leaf nodes). This creates a natural "highway system" that players discover.
- **Clustering by region**: nodes in the same continent should be densely connected, with sparser intercontinental links. This makes geography matter.

---

## 2. Hub Selection Algorithm

### The problem with naive degree-based selection

The current code selects 60 hubs by sorting all airports by route-graph degree and greedily picking with a 0.4 game-unit spacing filter. This produces a geographically biased result:

| Continent | Hubs selected |
|-----------|---------------|
| Europe | 24 |
| North America | 21 |
| Asia | 10 |
| Middle East | 3 |
| Africa | 2 |
| South America | 0 |
| Oceania | 0 |

Europe and North America dominate because they have the densest route networks. Africa, South America, and Oceania are barely represented. Worse, in the hub-only sub-graph, the average path length is only 1.44 hops because all major hubs connect directly to each other. The graph is nearly complete. There is no routing.

### Proposed algorithm: Geographically-Balanced Tiered Selection

The algorithm selects hubs in two phases, then constructs a gameplay-tuned edge set.

#### Phase 1: Continental quotas

Divide the world into 7 regions and allocate hub slots proportionally, with a floor to guarantee coverage:

| Region | Airport count | Quota | Rationale |
|--------|--------------|-------|-----------|
| Europe | 288 | 15 | Dense but over-represented; cap it |
| North America | 254 | 12 | Similar cap |
| East/SE/Central Asia | 246 | 12 | Large, important |
| Africa | 142 | 8 | Under-represented; boost |
| South America | 79 | 6 | Under-represented; boost |
| Middle East | 48 | 5 | Strategic crossroads |
| Oceania/Pacific | 29 | 4 | Under-represented; floor |
| **Total** | **1,144** | **62** | |

Within each region, select airports by a composite score:

```
score(v) = 0.6 * normalized_degree(v) + 0.4 * normalized_betweenness(v)
```

Betweenness centrality matters because it identifies airports that serve as bridges. Johannesburg (degree 69) ranks higher than many degree-100+ European airports in betweenness because it is the sole gateway to sub-Saharan Africa. Helsinki (degree 74) bridges Scandinavia and Russia. These are exactly the airports that create interesting routing.

Apply spatial deduplication within each region: minimum 400 km between selected hubs (about 0.63 game units). This prevents picking both LHR and LGW, or both JFK and EWR.

#### Phase 2: Bridge verification

After selection, verify that the hub sub-graph is connected. If any hub is isolated (no route to any other hub), add the highest-degree non-hub airport within 2,000 km that connects it to the network.

#### Concrete pseudocode

```javascript
function selectHubs(airports, routeGraph, quotas) {
    // Precompute betweenness centrality (sample-based, 100 BFS sources)
    const bc = approximateBetweenness(routeGraph, 100);

    // Normalize degree and betweenness per region
    const regions = partitionByRegion(airports);
    const selected = [];

    for (const [region, regionAirports] of regions) {
        const quota = quotas[region];

        // Score each airport
        const scored = regionAirports.map(a => ({
            ...a,
            score: 0.6 * normDegree(a, regionAirports)
                 + 0.4 * normBC(a, bc, regionAirports)
        })).sort((a, b) => b.score - a.score);

        // Greedy spatial selection
        const regionSelected = [];
        for (const airport of scored) {
            if (regionSelected.length >= quota) break;
            const tooClose = regionSelected.some(s =>
                haversine(s, airport) < 400 // km
            );
            if (!tooClose) regionSelected.push(airport);
        }
        selected.push(...regionSelected);
    }

    // Bridge verification
    ensureConnectivity(selected, routeGraph, airports);
    return selected;
}
```

### Why 62 and not 150?

The player interacts with this graph through a radial dialog on a phone screen. Cognitive load and session length constrain the design:

- **3-minute sessions**: at ~15 seconds per hop (choose + launch + fly + land), a player makes roughly 12 hops per session. They will see maybe 20-30 distinct airports.
- **Radial dialog capacity**: 5-8 options is the maximum before choice paralysis sets in. Mean degree of ~6 is ideal.
- **Visual clutter**: 60 detailed ring meshes is already at the edge of performance on mobile. 150 would require aggressive LOD or culling.
- **Network learnability**: a 60-node graph can be mentally modeled after several sessions. A 150-node graph cannot. Learning the network IS the meta-game.

---

## 3. The Routing Mechanic

### The fundamental design choice: constrained vs free

There are two possible approaches:

**Option A: Hard constraint** -- the player can ONLY bounce to airports connected in the route graph. Landing elsewhere does nothing.

**Option B: Soft constraint** -- the player can bounce anywhere, but following the route graph earns bonus multipliers, and the delivery timer only extends at graph nodes.

**Recommendation: Option B (soft constraint).** Hard constraints punish imprecision too harshly for a bouncy physics game where landing accuracy is already a skill challenge. Instead, the route graph should be a reward structure layered on top of free movement. The player CAN bounce anywhere, but they will discover that following routes is faster and more rewarding.

### How the routing interacts with the timer

The delivery timer is the core tension mechanic. Currently each delivery gets a generous base timer (20-120 seconds). With hop-by-hop routing, the timer becomes the heartbeat of navigation decisions:

- **Base timer on assignment**: 30 seconds (just enough for 1-2 hops if you are fast).
- **Time bonus per hub landing**: +12 seconds when landing at a connected hub along a valid route toward the destination. +6 seconds for landing at any hub. +0 for landing on empty ground.
- **Express route bonus**: if the destination is directly connected to the current hub (1 hop away in the graph), landing there adds +5 bonus seconds.

This creates a clear incentive loop: land at hubs, follow routes, earn time. Miss a hub, burn timer, feel the pressure.

### Radial dialog design

When the player lands at a hub airport (within 0.8 game units of a hub node while grounded), the radial dialog appears. It must communicate four things per option, fast:

```
     [NRT]
    Narita
   1,420 km  -->
   +12s  x1.5
```

For each connected hub:

| Element | What it shows | Why |
|---------|--------------|-----|
| **IATA code** (large) | Airport identifier | Primary navigation cue |
| **City name** (small) | Human-readable name | "Where am I going?" |
| **Distance** (km) | Great-circle distance from here | "How far is the bounce?" |
| **Direction arrow** | Bearing from current position | "Which way do I aim?" |
| **Time bonus** | Seconds added to timer on landing | Core incentive |
| **Route indicator** | Whether this hop moves toward the destination | "Am I going the right way?" |

The dialog should show a maximum of **6 options**, sorted by angular proximity to the destination bearing. This naturally puts the "best" options at the top while still showing alternatives. If a connected hub IS the final destination, it should be highlighted with a distinct glow.

### Express routes vs connecting flights

In the real airline network, the distinction between direct and connecting flights is the difference between a 1-edge and a multi-edge path. The game should expose this:

- **Direct route**: destination is 1 hop away in the hub graph. Show it in the radial dialog with a distinct "DIRECT" badge. Higher score bonus. Player feels clever for finding the direct path.
- **Connecting route**: destination requires 2+ hops. Each hop shows a "toward destination" or "away from destination" indicator. The player must plan a path.
- **Shortcut discovery**: occasionally, a player may find a 2-hop path through an unexpected hub that is geographically shorter than the "obvious" 3-hop path. This is the graph theory payoff: shortest path in the graph is not always the shortest path on the globe.

---

## 4. Shortest Path vs Scenic Route

### The scoring tension

If the game only rewards the shortest path, every delivery becomes a Dijkstra's algorithm exercise and the optimal strategy is memorizable. If the game only rewards distance traveled, players will aimlessly bounce. The solution is a **dual scoring system**:

#### Efficiency bonus

```
efficiency = optimal_hops / actual_hops
```

Where `optimal_hops` is the shortest path in the hub graph from origin to destination (precomputed via BFS at assignment time). If the player matches or beats the optimal path, they earn a 2x multiplier. Every extra hop reduces this toward 1x.

#### Exploration bonus

First time visiting a hub airport in a session: +50 points. First time traversing a route edge in a session: +30 points. These bonuses reward taking new paths rather than grinding the same optimal route.

#### Hub mastery bonus

After visiting the same hub 3 times in a session, it becomes "mastered." Mastered hubs give +5 seconds instead of +12 but have a permanent 1.2x score multiplier for all future deliveries passing through them. This rewards learning the network while naturally pushing the player to explore new hubs.

### The scenic route paradox

Graph theory offers a beautiful insight here: in a geographically-embedded graph, the shortest path (fewest hops) is not always the geographically shortest path. Consider delivering from Glasgow (GLA) to Narita (NRT):

- **Fewest hops**: GLA -> FRA -> NRT (2 hops, but FRA is south-east, then NRT is east -- total geographic distance ~10,500 km via Frankfurt)
- **Great-circle shortest**: GLA -> KEF -> SEA -> NRT (3 hops, but follows the polar route -- total geographic distance ~9,400 km via Iceland and Seattle)
- **Most popular**: GLA -> LHR -> NRT (2 hops via London, classic connecting flight)

All three are valid strategies. The first optimizes hops. The second optimizes geography. The third is what a real traveler would do. The scoring system should let all three feel viable:

- Route 1: 2 hops, efficiency bonus 2x, shorter timer burn
- Route 2: 3 hops, loses efficiency but earns exploration bonus for unusual airports, gains more time bonuses
- Route 3: 2 hops, efficiency 2x, LHR is probably already mastered so less time bonus but score multiplier

This is the kind of interesting decision that makes graph theory into gameplay.

---

## 5. Graph Theory as Gameplay

### Betweenness centrality as "hub traffic"

In graph theory, the **betweenness centrality** of a node v is the fraction of all shortest paths between other node pairs that pass through v. High-betweenness nodes are bottleneck bridges.

In the route data:

| Airport | Betweenness (approx.) | Degree | Role |
|---------|----------------------|--------|------|
| AMS | 5,382 | 217 | European mega-hub |
| DXB | 3,946 | 173 | East-West bridge |
| IST | 3,773 | 197 | Europe-Asia bridge |
| JNB | 2,084 | 69 | Africa gateway (low degree, high BC!) |
| HEL | 2,040 | 74 | Nordic-Russia bridge (same pattern) |
| ALA | 1,452 | 42 | Central Asia bridge (even more extreme) |

The airports with the biggest gap between degree and betweenness are the most interesting gameplay nodes. Johannesburg has only 69 connections but is the only path into most of sub-Saharan Africa. Almaty has 42 connections but bridges Central Asia. Helsinki bridges Northern Europe and Russia.

**Gameplay application**: hub traffic rating. Each hub displays a "traffic" level (1-5 stars) based on betweenness centrality. High-traffic hubs could offer:

- Better time bonuses (they are efficient transfer points)
- Higher base scores for deliveries passing through them
- Visual distinction (busier particle effects, more route arcs visible)
- But also: occasional "congestion" events where the time bonus is reduced (adds variety)

### Clustering coefficient as regional identity

The **clustering coefficient** of a node measures how densely its neighbors connect to each other. In the route graph, European airports have very high clustering (~0.7-0.8) because every European hub flies to every other European hub. African and Central Asian airports have low clustering (~0.2-0.3) because their connections are sparse and spoke-like.

**Gameplay application**: regional delivery chains. If the player completes 3 deliveries within the same geographic cluster (detected by the clustering structure of the hubs they visit), they earn a "Regional Expert" bonus. The game could identify clusters automatically using community detection (Louvain algorithm on the hub sub-graph) and name them: "European Circuit," "Pacific Rim," "Trans-Atlantic Corridor."

### Network efficiency as meta-score

**Network efficiency** E(G) of a graph G with n nodes is:

```
E(G) = (1 / n(n-1)) * sum over all pairs (i,j) of 1/d(i,j)
```

where d(i,j) is the shortest path length. For the player's session, define a **personal efficiency score**: across all deliveries in this session, what was the average ratio of optimal hops to actual hops? Display this as a percentage at the end of the session alongside the point score.

A player who always takes the optimal path scores 100% efficiency. A player who explores earns more exploration bonuses but lower efficiency. This creates two leaderboards: one for raw score (exploration-weighted) and one for efficiency (optimization-weighted). Different play styles are both rewarded.

### Unlocking nodes as progression

Start the player with **20 visible hubs** (the original set). As they deliver to new airports, those airports become permanently unlocked. The game map evolves from sparse to dense over multiple sessions. Each new hub unlocked reveals its connections, potentially opening up shorter paths that were previously invisible.

This maps directly to the graph-theory concept of **graph exploration**: the player is doing BFS on a partially-revealed graph. The tension between exploiting known efficient paths and exploring to reveal new ones mirrors the **explore-exploit tradeoff** from decision theory.

Progression milestones:

| Hubs unlocked | Title | Reward |
|---------------|-------|--------|
| 20 (start) | Local Courier | Base game |
| 30 | Regional Courier | Regional chains available |
| 45 | Continental Courier | Express route indicators |
| 60 (all) | Global Courier | Network efficiency score visible |

---

## 6. The Data Question

### What 13,143 route pairs look like

The route graph is an undirected, unweighted graph with the following structure:

- **Scale-free degree distribution**: follows an approximate power law. A few nodes have degree > 150, most have degree < 30, and a long tail has degree 1-5. This is characteristic of hub-and-spoke airline networks.
- **Small-world property**: clustering coefficient (0.63) is much higher than a random graph with the same degree distribution (~0.02), while diameter (4) is comparable. Information (or in our case, a bouncing gopher) can cross the entire network in very few hops.
- **Geographic embedding**: edge length is not random. Most edges connect airports within the same continent or neighboring continents. Only the top ~10% of edges span more than 5,000 km.
- **Community structure**: clear regional clusters (Europe, North America, East Asia, etc.) with sparser intercontinental bridges.

### Pruning for gameplay

The raw 13,143-edge graph is too dense for the hub sub-graph to be interesting. When restricted to even 60 hubs, the average path is 1.4 hops. Pruning strategy:

**Step 1: Distance-based edge filtering.** Only retain edges between hubs where the great-circle distance is under a threshold. Testing shows:

| Max distance | Avg degree | Avg path | Max path | Unreachable pairs |
|-------------|-----------|---------|---------|-------------------|
| 2,000 km | 10.8 | 1.8 | 5 | 65% |
| 3,000 km | 14.8 | 2.4 | 7 | 45% |
| 5,000 km | 18.9 | 2.5 | 6 | 0% |
| 8,000 km | 24.5 | 1.7 | 3 | 0% |
| No limit | 30.9 | 1.5 | 3 | 0% |

**5,000 km is the sweet spot**: fully connected (0 unreachable pairs), average path 2.5 hops, maximum path 6 hops. But the average degree (18.9) is still too high for a radial dialog. We need additional pruning.

**Step 2: Degree capping.** After distance filtering, if a hub has more than 8 neighbors, keep only the 8 that maximize geographic spread (furthest apart from each other by bearing angle). This can be done greedily: sort neighbors by compass bearing from the hub, then select every (360/8) = 45 degrees, picking the nearest neighbor in each sector.

This produces a graph where:
- Every hub has 3-8 connections
- Average path length is 3-5 hops
- The graph is still connected
- Connections point in diverse geographic directions
- Players face real routing decisions

**Step 3: Bridge edge protection.** Before degree capping, identify all **bridge edges** (edges whose removal would disconnect the graph). These must be retained even if they exceed the degree cap. Bridge detection runs in O(V + E) time via Tarjan's algorithm.

### Enriching for gameplay

Some additions beyond the raw data:

- **Polar routes**: if the data lacks routes over the Arctic (e.g., KEF-to-ANC, HEL-to-SEA), add synthetic edges. These create geographically interesting "shortcut" paths for players who think about great-circle distances versus Mercator-projection intuition.
- **Island chains**: Pacific islands (NAN, PPT, AKL) may be under-connected. Add edges that represent real-world Pacific route patterns even if they are missing from the dataset.
- **Seasonal routes**: one or two edges could be flagged as "seasonal" and only active every other game session, adding variety.

---

## 7. Concrete Proposal

### Data structures

```javascript
class RouteGraph {
    constructor() {
        // Core graph
        this.hubs = new Map();         // IATA -> HubNode
        this.edges = new Map();        // "IATA1-IATA2" -> EdgeData
        this.adjacency = new Map();    // IATA -> Set<IATA>

        // Precomputed properties
        this.betweenness = new Map();  // IATA -> float
        this.communities = new Map();  // IATA -> communityId
        this.shortestPaths = null;     // lazy-computed BFS cache
    }
}

// HubNode: per-airport data
{
    iata: "FRA",
    city: "Frankfurt",
    country: "DE",
    lat: 50.0379,
    lon: 8.5622,
    position: THREE.Vector3,    // 3D position on planet
    normal: THREE.Vector3,      // surface normal
    tier: "mega" | "regional",
    degree: 6,                  // in gameplay graph (not raw data)
    traffic: 4,                 // 1-5, from betweenness
    community: "europe-west",
    unlocked: true,             // player progression
    timesVisited: 0,            // session counter
    mastered: false             // visited 3+ times this session
}

// EdgeData: per-route data
{
    from: "FRA",
    to: "NRT",
    distanceKm: 9350,
    distanceGU: 14.68,          // game units (km / 637)
    bearing: 52,                // degrees from north
    isBridge: false,            // Tarjan bridge detection
    traversals: 0               // session counter
}
```

### Initialization flow

```
1. Load airports.json and routes.json
2. Compute betweenness centrality (sample-based, ~50ms)
3. Select ~62 hubs via geographically-balanced algorithm
4. Build hub sub-graph:
   a. Filter edges: both endpoints must be hubs, distance <= 5000 km
   b. Detect bridge edges (Tarjan's)
   c. Degree-cap to 8 per hub, protecting bridges
   d. Verify full connectivity
5. Detect communities (simple: partition by continent + sub-region)
6. Compute all-pairs shortest paths (BFS, 62 nodes = 62 BFS runs, trivial)
7. Store in RouteGraph instance
```

### UI flow: a single delivery

```
STATE 1: CHOOSE DELIVERY
  Player sees 3 delivery cards:
    [SHORT] GLA -> DUB   |  ~580 km  |  1 hop  |  150 pts
    [MEDIUM] GLA -> FCO  |  ~2200 km |  2 hops |  300 pts
    [LONG] GLA -> NRT    |  ~9400 km |  4 hops |  600 pts
  Player taps LONG.
  Timer starts: 30s base.
  Optimal path precomputed: GLA -> LHR -> IST -> DEL -> NRT (4 hops).

STATE 2: AT HUB (GLA) -- RADIAL DIALOG
  Radial shows connected hubs (max 6):
    LHR  540 km  SE   --> (toward destination)  +12s
    DUB  280 km  SW   (away from destination)   +12s
    KEF  1500 km NW   --> (toward via polar)    +12s
    CDG  890 km  SE   --> (toward destination)  +12s
    AMS  720 km  E    --> (toward destination)  +12s
    FRA  1050 km SE   --> (toward destination)  +12s
  Sorted by angular proximity to destination bearing.
  Player taps LHR. Timer: 30s. Hop target set to LHR.

STATE 3: IN FLIGHT
  Player charges, launches toward LHR.
  HUD shows: direction arrow to LHR, distance countdown, timer.
  Guide arc shows trajectory vs. great-circle path to LHR.

STATE 4: LANDING
  Player lands within 0.8 GU of LHR.
  Timer += 12s (hub landing bonus). Now: ~30s remaining.
  Hop counter: 1/4.

  IF player lands on empty ground (not near any hub):
    No time bonus. No radial dialog. Must bounce again.
    Can still reach any hub with a good bounce.

STATE 5: AT HUB (LHR) -- RADIAL DIALOG
  New set of connected hubs shown.
  IST highlighted as "toward destination" + high-traffic hub.
  Player taps IST. Process repeats.

STATE 6: AT HUB (NRT) -- FINAL DESTINATION
  Radial dialog not needed. Landing within delivery zone triggers delivery.
  Score calculated:
    Base: 600 pts
    Time bonus: based on remaining timer
    Distance bonus: +20 per game unit
    Efficiency: took 4 hops, optimal was 4 --> 2x multiplier
    Accuracy: PRECISE (landed 0.6 GU from center) --> 2x
    Total: (600 + timeBonus + distBonus) * 2 * 2 * comboMultiplier
```

### Scoring integration

```javascript
function computeDeliveryScore(delivery) {
    const base = delivery.type.value;

    // Time bonus: proportional to remaining time
    const elapsed = (Date.now() - delivery.startTime) / 1000;
    const remaining = Math.max(0, delivery.effectiveTimeLimit - elapsed);
    const timeBonus = Math.floor((remaining / delivery.effectiveTimeLimit) * base);

    // Distance bonus: 20 per game unit of origin-to-destination distance
    const distBonus = Math.floor(delivery.totalDistance * 20);

    // Efficiency multiplier: optimal_hops / actual_hops, clamped [1, 2]
    const efficiency = Math.min(2, delivery.optimalHops / delivery.actualHops);

    // Accuracy multiplier: BULLSEYE 3x, PRECISE 2x, DELIVERED 1x
    const accuracyMult = delivery.accuracy === 'BULLSEYE' ? 3
                       : delivery.accuracy === 'PRECISE' ? 2 : 1;

    // Combo multiplier: from consecutive deliveries
    const comboMult = Math.min(5, this.comboCount);

    // Exploration bonus: flat points for new hubs/edges visited
    const explorationBonus = delivery.newHubsVisited * 50
                           + delivery.newEdgesTraversed * 30;

    const subtotal = base + timeBonus + distBonus + explorationBonus;
    return Math.floor(subtotal * efficiency * accuracyMult * comboMult);
}
```

### Edge cases

**Player lands on non-hub airport.** The 1,200+ non-hub airports remain as dots on the globe. Landing near one shows its name but does NOT trigger a radial dialog or give a time bonus. The player must bounce to a hub. This teaches the hub system naturally.

**Player gets lost.** If the timer runs below 10 seconds and the player is more than 2 hops from the destination, show a "REROUTE" hint: highlight the nearest hub that lies on a shortest path to the destination. Do not auto-navigate; just nudge.

**Player discovers a shortcut.** If the player reaches the destination in fewer hops than the precomputed optimal path (possible if they found an unlocked route we did not predict), award a "Shortcut!" bonus of 100 points and update the optimal path cache.

**Radial dialog while in air.** The dialog only appears when the player is grounded (velocity magnitude < 0.5 GU/s) and within 0.8 GU of a hub. It dismisses automatically on launch.

**Two hubs very close together.** The spatial deduplication (400 km minimum) in hub selection prevents this. But if it somehow occurs, only the higher-traffic hub gets a radial dialog trigger zone.

**Destination hub not yet unlocked (progression mode).** The destination is always visible (marked with the delivery beacon), but intermediate hubs might be hidden. The player sees "???" nodes in the radial dialog for locked hubs, with only distance and direction visible. Landing at a locked hub unlocks it permanently. This makes "exploring the unknown" part of the delivery itself.

### Performance considerations

- **Hub sub-graph**: 62 nodes, ~250 edges. All-pairs BFS precomputes in < 1ms. No performance concern.
- **Radial dialog**: a 2D HTML/CSS overlay. No Three.js geometry. Renders 6 options. Trivial.
- **Route arc rendering**: current pool of 60 arc lines is sufficient. Show arcs only from the current hub to its neighbors (max 8 arcs), not all routes globally. Significant reduction in visual clutter.
- **Betweenness centrality**: sample-based approximation (50-100 BFS runs) computes in ~50ms for a 1,144-node graph. Run once at init.
- **Degree capping**: O(V * max_degree^2) for geographic spread selection. With V=62, max_degree=20, this is < 1ms.

### Data file changes

The current `routes.json` (13,143 pairs) and `airports.json` (1,269 entries) remain unchanged. The gameplay graph is computed at runtime from these files. No new data files needed.

Optionally, a `hub-overrides.json` could allow manual inclusion/exclusion of specific airports (e.g., force-include GLA because it is in the user's example, even if its degree does not qualify it for automatic selection).

### Summary of the complete system

| Component | Source | Runtime cost |
|-----------|--------|-------------|
| Hub selection | airports.json + routes.json | ~100ms init |
| Edge construction | routes.json + distance filter + degree cap | ~50ms init |
| All-pairs shortest path | BFS on 62-node graph | < 1ms init |
| Betweenness centrality | Sample BFS on full 1,144-node graph | ~50ms init |
| Radial dialog | HTML/CSS overlay, 6 options | 0ms per frame |
| Route arcs | 8 Three.js Lines, reused from existing pool | trivial per frame |
| Delivery assignment | BFS + distance sort | < 1ms per delivery |
| Score computation | Arithmetic | 0ms |

Total additional init cost: ~200ms. Total per-frame cost: negligible. The routing system is computationally free; the challenge is entirely in UI design and game feel.

---

## Appendix: Key Graph Theory Terms

- **Degree**: the number of edges connected to a node. High-degree airports connect to many others.
- **Betweenness centrality**: the fraction of all-pairs shortest paths that pass through a given node. High-betweenness nodes are critical bridges.
- **Clustering coefficient**: for a node v, the fraction of v's neighbor pairs that are also connected to each other. High clustering = dense local neighborhood.
- **Diameter**: the longest shortest path between any pair of nodes. The "width" of the network.
- **Bridge edge**: an edge whose removal disconnects the graph. Critical for maintaining reachability.
- **Scale-free network**: a network whose degree distribution follows a power law. A few hubs, many spokes. This is what airline networks look like.
- **Small-world network**: high clustering + short average path length. "Six degrees of separation." The route graph has this property.
- **Community structure**: groups of nodes that are densely connected internally and sparsely connected to other groups. In airline networks, these correspond to geographic regions.
