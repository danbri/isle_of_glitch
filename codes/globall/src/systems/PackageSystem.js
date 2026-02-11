/**
 * Package System
 * Manages mysterious packages, deliveries, and interceptions.
 * Flow: pick up package at origin → bounce to destination airport → deliver.
 */

import * as THREE from 'three';

export class PackageSystem {
    constructor(scene, gameState, trampolineNetwork) {
        this.scene = scene;
        this.gameState = gameState;
        this.trampolineNetwork = trampolineNetwork;

        this.packages = [];
        this.currentPackage = null;  // The package data we're currently carrying
        this.rivals = [];

        // Package types with different properties
        this.packageTypes = [
            { name: 'EM Coil', color: 0x4488ff, value: 100, icon: '🧲' },
            { name: 'Flux Capacitor', color: 0x66ffaa, value: 150, icon: '⚡' },
            { name: 'Tesla Scroll', color: 0x88aaff, value: 200, icon: '📜' },
            { name: 'Quantum Cell', color: 0x6644ff, value: 250, icon: '⚛️' },
            { name: 'Polarity Crystal', color: 0xaa88ff, value: 300, icon: '💎' },
            { name: 'Chrono Inductor', color: 0x88ddff, value: 350, icon: '⏰' },
            { name: 'Stardust Core', color: 0x4466dd, value: 400, icon: '✨' },
            { name: 'Field Fragment', color: 0x6688ff, value: 500, icon: '🔮' }
        ];

        // Destination marker
        this.destinationMarker = null;
        this.guideLine = null;

        // Delivery celebration state
        this._celebrationTimer = 0;

        // Combo system
        this.comboCount = 0;
        this.lastDeliveryTime = 0;
        this.comboTimeout = 15000; // 15 seconds to maintain combo

        // Last delivery info (for celebration display)
        this._lastDelivery = null;

        // Delivery choice system — player picks from options
        this.pendingChoices = []; // Array of {type, airport, distance, timeLimit, value}
        this.awaitingChoice = false;

        // Hop-by-hop graph routing — core mechanic
        this.pendingHops = [];   // Connected hub airports to choose from
        this.awaitingHop = false;
        this._lastHubIata = null; // Prevent re-triggering hops at same hub
    }

    async init() {
        this.createDestinationMarker();
        this.createGuideLine();
        // Start by offering choices instead of auto-assigning
        this.offerDeliveryChoices();
    }

    offerDeliveryChoices() {
        const originPos = this._lastPlayerPos || new THREE.Vector3(0, 12, 0);
        const deliveries = this.gameState.deliveries;
        this.pendingChoices = [];

        // Graph routing: destinations should be multi-hop away so routing matters
        // Early game: 2 hops. Later: 2-3 hops. Always enough to require navigation.
        const configs = [
            { bias: 'short', hops: 2 },                          // Easy: 2 hops
            { bias: 'medium', hops: deliveries < 3 ? 2 : 3 },    // Medium: 2-3 hops
            { bias: 'long', hops: deliveries < 6 ? 3 : 3 }       // Hard: 3 hops
        ];

        for (const config of configs) {
            const airport = this._findAirportAtDistance(originPos, config);
            if (!airport) continue;

            const dist = originPos.distanceTo(airport.position);
            const type = this.packageTypes[Math.floor(Math.random() * this.packageTypes.length)];

            // Value scales with distance: short=low, long=high
            const distMultiplier = config.bias === 'short' ? 0.8 : config.bias === 'long' ? 1.5 : 1.0;
            const value = Math.floor(type.value * distMultiplier);

            // Timer: more generous for multi-hop (each hop adds time)
            // Base time covers first hop; additional time awarded per hop
            const difficultyScale = Math.max(0.6, 1 - deliveries * 0.03);
            const baseTime = 20 + dist * 3;
            const timerMultiplier = config.bias === 'short' ? 1.3 : config.bias === 'long' ? 0.8 : 1.0;
            const timeLimit = Math.min(120, Math.max(20, baseTime * difficultyScale * timerMultiplier));

            this.pendingChoices.push({
                type,
                airport,
                distance: dist,
                timeLimit,
                value,
                bias: config.bias,
                destName: `${airport.airport.name} ${airport.airport.city}`,
                distKm: Math.round(dist * 637),
                estHops: config.hops
            });
        }

        this.awaitingChoice = true;
    }

    _findAirportAtDistance(originPos, config) {
        let startIata = null;
        const { trampoline: nearest } = this.trampolineNetwork.getNearestTrampoline(originPos);
        if (nearest) startIata = nearest.airport.name;

        if (startIata && this.trampolineNetwork.routeGraph[startIata]) {
            // Walk the graph N hops to find a destination at the right distance
            const visited = new Set([startIata]);
            let frontier = [startIata];

            for (let hop = 0; hop < config.hops; hop++) {
                const nextFrontier = [];
                for (const iata of frontier) {
                    const hubs = this.trampolineNetwork.getConnectedHubs(iata);
                    for (const hub of hubs) {
                        if (!visited.has(hub.airport.name)) {
                            visited.add(hub.airport.name);
                            nextFrontier.push(hub.airport.name);
                        }
                    }
                }
                if (nextFrontier.length === 0) break;
                frontier = nextFrontier;
            }

            // frontier now contains airports exactly N hops away
            const candidates = frontier
                .map(iata => this.trampolineNetwork.iataIndex[iata])
                .filter(t => t && t.isHub);

            if (candidates.length > 0) {
                const sorted = [...candidates].sort((a, b) =>
                    a.position.distanceTo(originPos) - b.position.distanceTo(originPos)
                );
                if (config.bias === 'short') return sorted[0];
                if (config.bias === 'long') return sorted[sorted.length - 1];
                return sorted[Math.floor(sorted.length / 2)];
            }

            // Fallback: any connected hub
            const connected = this.trampolineNetwork.getConnectedHubs(startIata);
            if (connected.length > 0) {
                return connected[Math.floor(Math.random() * connected.length)];
            }
        }

        // Fallback
        const trampolines = this.trampolineNetwork.trampolines;
        return trampolines[Math.floor(Math.random() * trampolines.length)];
    }

    acceptDelivery(choiceIndex) {
        if (!this.awaitingChoice || choiceIndex >= this.pendingChoices.length) return;

        const choice = this.pendingChoices[choiceIndex];
        this.awaitingChoice = false;
        this.pendingChoices = [];

        const originPos = this._lastPlayerPos || new THREE.Vector3(0, 12, 0);

        this.currentPackage = {
            type: choice.type,
            destinationAirport: choice.airport,
            destinationName: choice.destName,
            carrying: true,
            assignedTime: Date.now(),
            originPosition: originPos.clone(),
            distance: choice.distance,
            timeLimit: choice.timeLimit,
            startTime: Date.now(),
            hopsCompleted: 0,
            estHops: choice.estHops || 2
        };

        // Don't set final destination as immediate target —
        // player must navigate hop-by-hop via the route graph.
        // Immediately offer hop choices from current hub.
        this._lastHubIata = null;
        const { trampoline: nearest } = this.trampolineNetwork.getNearestTrampoline(originPos);
        if (nearest && nearest.isHub) {
            this.offerHopChoices(nearest.airport.name);
        }
    }

    offerHopChoices(currentIata) {
        const destPos = this.getDestinationPosition();
        if (!destPos || !this.currentPackage) return;

        const hubs = this.trampolineNetwork.getConnectedHubs(currentIata);
        if (hubs.length === 0) return;

        const playerPos = this._lastPlayerPos || new THREE.Vector3(0, 12, 0);
        const currentDistToDest = playerPos.distanceTo(destPos);

        // Sort by proximity to final destination (closer = better route)
        const sorted = hubs
            .map(hub => ({
                trampoline: hub,
                iata: hub.airport.name,
                city: hub.airport.city || '',
                distToDest: hub.position.distanceTo(destPos),
                distFromHere: hub.position.distanceTo(playerPos),
                isFinalDest: hub.airport.name === this.currentPackage.destinationAirport.airport.name,
                towardDest: hub.position.distanceTo(destPos) < currentDistToDest
            }))
            .sort((a, b) => a.distToDest - b.distToDest);

        // Take top 5 (don't overwhelm)
        this.pendingHops = sorted.slice(0, 5).map(h => ({
            trampoline: h.trampoline,
            iata: h.iata,
            city: h.city,
            distToDest: h.distToDest,
            distFromHere: h.distFromHere,
            distKm: Math.round(h.distFromHere * 637),
            isFinalDest: h.isFinalDest,
            towardDest: h.towardDest
        }));

        this.awaitingHop = true;
        this._lastHubIata = currentIata;
    }

    acceptHop(hopIndex) {
        if (!this.awaitingHop || hopIndex >= this.pendingHops.length) return null;

        const hop = this.pendingHops[hopIndex];
        this.awaitingHop = false;
        this.pendingHops = [];

        // Track hop progress
        this.currentPackage.hopsCompleted++;

        // Reward: add time for each hop (keeps urgency but rewards progress)
        this.currentPackage.timeLimit += 10;

        // Set this hop as the current navigation target
        this.currentPackage._currentHopTarget = hop.trampoline;

        // Reset miss tracking for this leg
        this.currentPackage._closestApproach = null;
        this.currentPackage._prevDist = null;
        this.currentPackage._missShown = false;

        return hop.trampoline;
    }

    getRandomDestinationAirport(excludeNear) {
        // Progressive difficulty: early deliveries are nearby, later ones are farther
        const deliveries = this.gameState.deliveries;
        const trampolines = this.trampolineNetwork.trampolines;
        if (trampolines.length === 0) return null;

        // Find nearest airport to player as starting point
        let startIata = null;
        if (excludeNear) {
            const { trampoline: nearest } = this.trampolineNetwork.getNearestTrampoline(excludeNear);
            if (nearest) startIata = nearest.airport.name;
        }

        // Difficulty tiers:
        // 0-2 deliveries: always 1-hop (nearby, easy wins to learn)
        // 3-5: mostly 1-hop, sometimes 2-hop
        // 6+: mix of distances, more 2-hop
        const twoHopChance = deliveries < 3 ? 0 : deliveries < 6 ? 0.3 : 0.6;

        if (startIata && this.trampolineNetwork.routeGraph[startIata]) {
            const connected = this.trampolineNetwork.getConnectedAirports(startIata);
            if (connected.length > 0) {
                if (Math.random() >= twoHopChance) {
                    // 1-hop: direct connection
                    return connected[Math.floor(Math.random() * connected.length)];
                } else {
                    // 2-hop: pick a random connection of a random connection
                    const mid = connected[Math.floor(Math.random() * connected.length)];
                    const hop2 = this.trampolineNetwork.getConnectedAirports(mid.airport.name);
                    const filtered = hop2.filter(t => t.airport.name !== startIata);
                    if (filtered.length > 0) {
                        return filtered[Math.floor(Math.random() * filtered.length)];
                    }
                    // Fallback to 1-hop if no 2-hop found
                    return connected[Math.floor(Math.random() * connected.length)];
                }
            }
        }

        // Fallback: any airport at least 5 units away
        for (let attempt = 0; attempt < 20; attempt++) {
            const t = trampolines[Math.floor(Math.random() * trampolines.length)];
            if (!excludeNear || t.position.distanceTo(excludeNear) > 5) {
                return t;
            }
        }
        return trampolines[Math.floor(Math.random() * trampolines.length)];
    }

    assignNewPackage() {
        // Now redirects to choice system — player picks their delivery
        this.offerDeliveryChoices();
    }

    getCurrentPackage() {
        return this.currentPackage;
    }

    getDestinationPosition() {
        if (!this.currentPackage || !this.currentPackage.destinationAirport) return null;
        return this.currentPackage.destinationAirport.position.clone();
    }

    getDestinationTrampoline() {
        if (!this.currentPackage) return null;
        return this.currentPackage.destinationAirport;
    }

    // Get the immediate navigation target (next hop or final destination)
    getNavTarget() {
        if (!this.currentPackage) return null;
        // If player has a hop target set, return that; otherwise final destination
        if (this.currentPackage._currentHopTarget) {
            return this.currentPackage._currentHopTarget;
        }
        return this.currentPackage.destinationAirport;
    }

    getNavTargetPosition() {
        const target = this.getNavTarget();
        return target ? target.position.clone() : null;
    }

    createDestinationMarker() {
        const group = new THREE.Group();

        // After group.lookAt(origin), +z = toward center, XY = tangent plane.
        // Rings in XY plane → flat on surface. Outward = -z direction.

        // [0] Outer ring: delivery zone (1.5 units) — blue
        const outerRing = new THREE.Mesh(
            new THREE.RingGeometry(1.3, 1.5, 64),
            new THREE.MeshBasicMaterial({
                color: 0x4488ff, transparent: true, opacity: 0.45,
                side: THREE.DoubleSide, depthWrite: false
            })
        );
        group.add(outerRing);

        // [1] Middle ring: PRECISE zone (0.8 units) — purple
        const midRing = new THREE.Mesh(
            new THREE.RingGeometry(0.65, 0.8, 48),
            new THREE.MeshBasicMaterial({
                color: 0xaa88ff, transparent: true, opacity: 0.55,
                side: THREE.DoubleSide, depthWrite: false
            })
        );
        group.add(midRing);

        // [2] Inner ring: BULLSEYE zone (0.5 units) — bright cyan, will pulse
        const innerRing = new THREE.Mesh(
            new THREE.RingGeometry(0.35, 0.5, 48),
            new THREE.MeshBasicMaterial({
                color: 0x88ddff, transparent: true, opacity: 0.7,
                side: THREE.DoubleSide, depthWrite: false
            })
        );
        group.add(innerRing);

        // [3] Center bullseye dot
        const center = new THREE.Mesh(
            new THREE.CircleGeometry(0.15, 32),
            new THREE.MeshBasicMaterial({
                color: 0xffffff, transparent: true, opacity: 0.85,
                side: THREE.DoubleSide, depthWrite: false
            })
        );
        group.add(center);

        // [4] Fill discs for zone coloring
        const outerFill = new THREE.Mesh(
            new THREE.CircleGeometry(1.5, 64),
            new THREE.MeshBasicMaterial({
                color: 0x4488ff, transparent: true, opacity: 0.08,
                side: THREE.DoubleSide, depthWrite: false
            })
        );
        group.add(outerFill);

        // [5]
        const midFill = new THREE.Mesh(
            new THREE.CircleGeometry(0.8, 48),
            new THREE.MeshBasicMaterial({
                color: 0xaa88ff, transparent: true, opacity: 0.12,
                side: THREE.DoubleSide, depthWrite: false
            })
        );
        group.add(midFill);

        // [6]
        const innerFill = new THREE.Mesh(
            new THREE.CircleGeometry(0.5, 48),
            new THREE.MeshBasicMaterial({
                color: 0x88ddff, transparent: true, opacity: 0.18,
                side: THREE.DoubleSide, depthWrite: false
            })
        );
        group.add(innerFill);

        // [7] Vertical EM beam (visible from distance) — points outward (-z)
        const beam = new THREE.Mesh(
            new THREE.CylinderGeometry(0.05, 0.05, 4, 8),
            new THREE.MeshBasicMaterial({
                color: 0x6644ff, transparent: true, opacity: 0.4, depthWrite: false
            })
        );
        beam.rotation.x = -Math.PI / 2; // align cylinder with -z (outward)
        beam.position.z = -2; // center of 4-unit beam, 2 units above surface
        group.add(beam);

        // [8] Floating arrow above (visible from far away) — in tangent plane at -z
        const arrowShape = new THREE.Shape();
        arrowShape.moveTo(0, 0.3);
        arrowShape.lineTo(0.15, 0);
        arrowShape.lineTo(0.05, 0);
        arrowShape.lineTo(0.05, -0.2);
        arrowShape.lineTo(-0.05, -0.2);
        arrowShape.lineTo(-0.05, 0);
        arrowShape.lineTo(-0.15, 0);
        arrowShape.closePath();
        const arrow = new THREE.Mesh(
            new THREE.ShapeGeometry(arrowShape),
            new THREE.MeshBasicMaterial({
                color: 0x88ddff, transparent: true, opacity: 0.9,
                side: THREE.DoubleSide, depthWrite: false
            })
        );
        arrow.position.z = -4.5; // float above surface (outward = -z)
        group.add(arrow);

        group.visible = false;
        this.destinationMarker = group;
        this.scene.add(group);
    }

    createGuideLine() {
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(100 * 3);
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

        const material = new THREE.LineDashedMaterial({
            color: 0x4488ff, dashSize: 0.3, gapSize: 0.2,
            transparent: true, opacity: 0.5
        });

        this.guideLine = new THREE.Line(geometry, material);
        this.guideLine.visible = false;
        this.scene.add(this.guideLine);
    }

    updateDestinationMarker(playerPosition, time) {
        if (!this.currentPackage || !this.destinationMarker) {
            if (this.destinationMarker) this.destinationMarker.visible = false;
            if (this.guideLine) this.guideLine.visible = false;
            return;
        }

        const destPos = this.getDestinationPosition();
        if (!destPos) {
            this.destinationMarker.visible = false;
            this.guideLine.visible = false;
            return;
        }

        // Position marker at destination, slightly above surface
        this.destinationMarker.position.copy(destPos);
        this.destinationMarker.position.add(destPos.clone().normalize().multiplyScalar(0.3));
        this.destinationMarker.visible = true;

        // Orient: lookAt(origin) makes +z point toward center, XY = tangent plane
        // Rings in XY are flat on surface, beam/arrow along -z point outward
        this.destinationMarker.lookAt(new THREE.Vector3(0, 0, 0));

        // Animate concentric rings
        // Outer ring: slow rotation
        this.destinationMarker.children[0].rotation.z = time * 0.3;
        // Middle ring: opposite rotation
        this.destinationMarker.children[1].rotation.z = -time * 0.5;
        // Inner bullseye ring: pulse scale
        const bullseyePulse = 1 + Math.sin(time * 5) * 0.15;
        this.destinationMarker.children[2].scale.setScalar(bullseyePulse);
        // Inner bullseye ring: pulse opacity
        this.destinationMarker.children[2].material.opacity = 0.5 + Math.sin(time * 5) * 0.2;
        // Center dot: bright pulse
        this.destinationMarker.children[3].material.opacity = 0.6 + Math.sin(time * 6) * 0.25;
        // Arrow: bob along -z (outward from planet)
        this.destinationMarker.children[8].position.z = -4.5 - Math.sin(time * 3) * 0.3;

        // Update guide line from player to destination
        this.updateGuideLine(playerPosition, destPos);
    }

    updateGuideLine(playerPos, destPos) {
        if (!this.guideLine) return;

        const distance = playerPos.distanceTo(destPos);
        if (distance < 1) {
            this.guideLine.visible = false;
            return;
        }

        this.guideLine.visible = true;

        const positions = this.guideLine.geometry.attributes.position;
        const segmentCount = Math.min(50, Math.floor(distance * 10));

        const midpoint = playerPos.clone().add(destPos).multiplyScalar(0.5);
        const arcHeight = Math.min(distance * 0.2, 2);
        midpoint.normalize().multiplyScalar(midpoint.length() + arcHeight);

        for (let i = 0; i <= segmentCount; i++) {
            const t = i / segmentCount;
            const p1 = playerPos.clone().lerp(midpoint, t);
            const p2 = midpoint.clone().lerp(destPos, t);
            const point = p1.lerp(p2, t);
            positions.setXYZ(i, point.x, point.y, point.z);
        }

        positions.needsUpdate = true;
        this.guideLine.geometry.setDrawRange(0, segmentCount + 1);
        this.guideLine.computeLineDistances();
    }

    checkDelivery(playerPosition) {
        if (!this.currentPackage || !this.currentPackage.carrying) return false;

        const destPos = this.getDestinationPosition();
        if (!destPos) return false;

        const distance = playerPosition.distanceTo(destPos);

        // Track closest approach (for miss feedback)
        if (!this.currentPackage._closestApproach || distance < this.currentPackage._closestApproach) {
            this.currentPackage._closestApproach = distance;
        }

        // Delivery zone: 1.5 units (generous on mobile) but accuracy matters for score
        if (distance < 1.5) {
            // Accuracy tier determines bonus multiplier
            let accuracy, accuracyMultiplier;
            if (distance < 0.5) {
                accuracy = 'BULLSEYE';
                accuracyMultiplier = 3;
            } else if (distance < 0.8) {
                accuracy = 'PRECISE';
                accuracyMultiplier = 2;
            } else {
                accuracy = 'DELIVERED';
                accuracyMultiplier = 1;
            }
            this.completeDelivery(destPos, accuracy, accuracyMultiplier);
            return true;
        }

        // Miss detection: was close (< 3 units) but now moving away
        const prevDist = this.currentPackage._prevDist || distance;
        this.currentPackage._prevDist = distance;

        // Grace period: don't trigger overshoot if player hasn't actually traveled yet
        // (prevents false "overshoot" on nearby destinations right after accepting)
        const elapsed = (Date.now() - this.currentPackage.startTime) / 1000;
        const travelDist = this.currentPackage.originPosition
            ? playerPosition.distanceTo(this.currentPackage.originPosition) : 0;

        if (elapsed > 3 && travelDist > 1.5
            && distance < 4 && distance > prevDist && this.currentPackage._closestApproach < 3) {
            // Player passed near destination and is now moving away
            if (!this.currentPackage._missShown) {
                this.currentPackage._missShown = true;
                const kmMissed = (this.currentPackage._closestApproach * 637).toFixed(0);
                this._lastMiss = {
                    type: 'OVERSHOOT',
                    detail: `Closest: ${kmMissed}km — come back!`,
                    time: Date.now()
                };
                // Allow another miss notification after 3s if they come back and miss again
                setTimeout(() => {
                    if (this.currentPackage) this.currentPackage._missShown = false;
                }, 3000);
            }
        }

        return false;
    }

    getLastMiss() {
        if (!this._lastMiss) return null;
        // Only return miss within last 2 seconds
        if (Date.now() - this._lastMiss.time > 2000) return null;
        return this._lastMiss;
    }

    completeDelivery(destPos, accuracy, accuracyMultiplier) {
        const pkg = this.currentPackage;
        const baseScore = pkg.type.value;

        // Time bonus: faster delivery = more points
        const elapsed = (Date.now() - pkg.startTime) / 1000;
        const timeRatio = Math.max(0, 1 - elapsed / pkg.timeLimit);
        const timeBonus = Math.floor(timeRatio * baseScore);

        // Distance bonus: farther = more reward (1 unit ≈ 637km)
        const distBonus = Math.floor(pkg.distance * 20);

        // Combo: deliveries within 15s of each other
        const now = Date.now();
        if (now - this.lastDeliveryTime < this.comboTimeout && this.comboCount > 0) {
            this.comboCount = Math.min(5, this.comboCount + 1);
        } else {
            this.comboCount = 1;
        }
        this.lastDeliveryTime = now;

        // Streak bonus: escalating reward for consecutive deliveries
        const streakBonus = Math.min(200, this.gameState.deliveries * 15);

        // Chain launch bonus: did they bounce recently? Reward quick turnaround
        const chainBonus = (now - this.lastDeliveryTime < 3000 && this.gameState.deliveries > 0) ? 50 : 0;

        // Total score: accuracy × combo × (base + bonuses)
        const subtotal = baseScore + timeBonus + distBonus + streakBonus + chainBonus;
        const totalScore = subtotal * accuracyMultiplier * this.comboCount;
        this.gameState.addScore(totalScore);
        this.gameState.deliveries++;

        // Store delivery info for celebration display
        this._lastDelivery = {
            score: totalScore,
            baseScore,
            timeBonus,
            distBonus,
            accuracy,
            accuracyMultiplier,
            comboMultiplier: this.comboCount,
            timeRemaining: Math.max(0, pkg.timeLimit - elapsed)
        };

        // Big celebration effect
        this.createDeliveryEffect(destPos);

        // Include hop count in delivery info
        this._lastDelivery.hopsCompleted = pkg.hopsCompleted || 0;

        // Clear hop state and assign new package
        this.currentPackage = null;
        this.pendingHops = [];
        this.awaitingHop = false;
        this._lastHubIata = null;
        this.assignNewPackage();
    }

    createDeliveryEffect(position) {
        const ringColors = [0x4488ff, 0x6644ff, 0x88ddff];

        // Multiple expanding EM pulse rings
        for (let i = 0; i < 3; i++) {
            setTimeout(() => {
                const ringGeometry = new THREE.RingGeometry(0.2, 0.35, 32);
                const ringMaterial = new THREE.MeshBasicMaterial({
                    color: ringColors[i], transparent: true, opacity: 1, side: THREE.DoubleSide
                });
                const ring = new THREE.Mesh(ringGeometry, ringMaterial);
                ring.position.copy(position);
                ring.lookAt(new THREE.Vector3(0, 0, 0));
                this.scene.add(ring);

                const startTime = Date.now();
                const animate = () => {
                    const elapsed = (Date.now() - startTime) / 1000;
                    const scale = 1 + elapsed * 10;
                    ring.scale.set(scale, scale, 1);
                    ringMaterial.opacity = Math.max(0, 1 - elapsed * 1.8);
                    if (elapsed < 0.7) {
                        requestAnimationFrame(animate);
                    } else {
                        this.scene.remove(ring);
                        ringGeometry.dispose();
                        ringMaterial.dispose();
                    }
                };
                animate();
            }, i * 100);
        }

        // Magnetic particle burst — 80 particles in blue-purple spectrum
        const particleCount = 80;
        const particleGeometry = new THREE.BufferGeometry();
        const positions = new Float32Array(particleCount * 3);
        const colors = new Float32Array(particleCount * 3);
        const velocities = [];
        const normal = position.clone().normalize();

        for (let i = 0; i < particleCount; i++) {
            positions[i * 3] = position.x;
            positions[i * 3 + 1] = position.y;
            positions[i * 3 + 2] = position.z;

            // Blue to purple spectrum
            const hue = Math.random() * 0.15 + 0.55; // 0.55-0.70 = blue-purple
            const c = new THREE.Color().setHSL(hue, 0.8, 0.6 + Math.random() * 0.3);
            colors[i * 3] = c.r;
            colors[i * 3 + 1] = c.g;
            colors[i * 3 + 2] = c.b;

            // Radiate upward (along surface normal) + random spread
            const vel = new THREE.Vector3(
                (Math.random() - 0.5) * 3,
                (Math.random() - 0.5) * 3,
                (Math.random() - 0.5) * 3
            );
            vel.add(normal.clone().multiplyScalar(2 + Math.random() * 2)); // Bias upward
            velocities.push(vel);
        }

        particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        particleGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

        const particleMaterial = new THREE.PointsMaterial({
            size: 0.08, vertexColors: true, transparent: true, opacity: 1,
            blending: THREE.AdditiveBlending, depthWrite: false
        });

        const particles = new THREE.Points(particleGeometry, particleMaterial);
        this.scene.add(particles);

        const startTime = Date.now();
        const animate = () => {
            const elapsed = (Date.now() - startTime) / 1000;
            const pPos = particles.geometry.attributes.position;
            for (let i = 0; i < particleCount; i++) {
                // Slow down over time (magnetic deceleration)
                const drag = Math.max(0.01, 1 - elapsed * 0.5);
                pPos.setX(i, pPos.getX(i) + velocities[i].x * 0.025 * drag);
                pPos.setY(i, pPos.getY(i) + velocities[i].y * 0.025 * drag);
                pPos.setZ(i, pPos.getZ(i) + velocities[i].z * 0.025 * drag);
            }
            pPos.needsUpdate = true;
            particleMaterial.opacity = Math.max(0, 1 - elapsed * 0.7);
            particleMaterial.size = 0.08 * Math.max(0.3, 1 - elapsed * 0.3);
            if (elapsed < 1.8) {
                requestAnimationFrame(animate);
            } else {
                this.scene.remove(particles);
                particleGeometry.dispose();
                particleMaterial.dispose();
            }
        };
        animate();
    }

    getTimerInfo() {
        if (!this.currentPackage) return null;
        const elapsed = (Date.now() - this.currentPackage.startTime) / 1000;
        const remaining = Math.max(0, this.currentPackage.timeLimit - elapsed);
        const ratio = remaining / this.currentPackage.timeLimit;
        return { remaining, ratio, expired: remaining <= 0 };
    }

    getLastDelivery() {
        return this._lastDelivery;
    }

    getCombo() {
        const now = Date.now();
        if (this.comboCount > 0 && now - this.lastDeliveryTime > this.comboTimeout) {
            this.comboCount = 0;
        }
        return this.comboCount;
    }

    expirePackage() {
        // Package timed out — REAL penalty: lose points and combo
        const penalty = Math.min(this.gameState.score, 100);
        this.gameState.score = Math.max(0, this.gameState.score - penalty);
        this.comboCount = 0;
        this._lastExpiry = { penalty, time: Date.now() };
        this.currentPackage = null;
        this.pendingHops = [];
        this.awaitingHop = false;
        this._lastHubIata = null;
        this.assignNewPackage();
    }

    getLastExpiry() {
        if (!this._lastExpiry) return null;
        if (Date.now() - this._lastExpiry.time > 2500) return null;
        return this._lastExpiry;
    }

    // Check if player has landed at a hub airport (for hop routing)
    checkHubLanding(playerPosition, isOnGround) {
        if (!this.currentPackage || !this.currentPackage.carrying) return;
        if (this.awaitingHop || this.awaitingChoice) return;
        if (!isOnGround) return;

        const { trampoline: nearest, distance: nearDist } =
            this.trampolineNetwork.getNearestTrampoline(playerPosition);
        if (!nearest || nearDist > 0.8 || !nearest.isHub) return;

        const iata = nearest.airport.name;

        // Don't re-trigger at the same hub
        if (iata === this._lastHubIata) return;

        // Don't trigger if we're at the final destination (delivery will handle it)
        const destIata = this.currentPackage.destinationAirport.airport.name;
        if (iata === destIata) return;

        // Player landed at a new hub — offer hop choices
        this.offerHopChoices(iata);
    }

    update(time, deltaTime, player) {
        const playerPosition = player.getPosition();
        this._lastPlayerPos = playerPosition;

        // Check for delivery completion (final destination)
        this.checkDelivery(playerPosition);

        // Check for hub landing (hop routing)
        this.checkHubLanding(playerPosition, player.isOnGround);

        // Update destination marker and guide
        this.updateDestinationMarker(playerPosition, time);
    }
}
