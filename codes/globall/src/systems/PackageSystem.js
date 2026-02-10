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
    }

    async init() {
        this.createDestinationMarker();
        this.createGuideLine();
        this.assignNewPackage();
    }

    getRandomDestinationAirport(excludeNear) {
        // Pick a destination reachable via the route network
        // Prefer airports 1-3 hops away for interesting gameplay
        const trampolines = this.trampolineNetwork.trampolines;
        if (trampolines.length === 0) return null;

        // Find nearest airport to player as starting point
        let startIata = null;
        if (excludeNear) {
            const { trampoline: nearest } = this.trampolineNetwork.getNearestTrampoline(excludeNear);
            if (nearest) startIata = nearest.airport.name;
        }

        // Try to find a route-connected destination
        if (startIata && this.trampolineNetwork.routeGraph[startIata]) {
            const connected = this.trampolineNetwork.getConnectedAirports(startIata);
            if (connected.length > 0) {
                // Pick a random connected airport (1 hop)
                // 50% chance of 1-hop, 50% chance of 2-hop for variety
                if (Math.random() < 0.5 && connected.length > 0) {
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
        const packageType = this.packageTypes[Math.floor(Math.random() * this.packageTypes.length)];
        const originPos = this._lastPlayerPos || new THREE.Vector3(0, 12, 0);
        const destAirport = this.getRandomDestinationAirport(
            this.trampolineNetwork.trampolines.length > 0 ? originPos : null
        );

        if (!destAirport) return;

        // Calculate distance for timer and rewards
        // Planet radius=10, so max dist ~20 (antipodal). 1 unit ≈ 637 km
        const dist = originPos.distanceTo(destAirport.position);

        // Timer: gets tighter as deliveries increase (difficulty progression)
        // Base: 25s + 4s per distance unit, then scaled down by delivery count
        const difficultyScale = Math.max(0.6, 1 - this.gameState.deliveries * 0.03);
        const rawTime = 25 + dist * 4;
        const timeLimit = Math.min(90, Math.max(20, rawTime * difficultyScale));

        this.currentPackage = {
            type: packageType,
            destinationAirport: destAirport,
            destinationName: `${destAirport.airport.name} ${destAirport.airport.city}`,
            carrying: true,
            assignedTime: Date.now(),
            originPosition: originPos.clone(),
            distance: dist,
            timeLimit: timeLimit,
            startTime: Date.now()
        };
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

    createDestinationMarker() {
        const group = new THREE.Group();

        // Outer magnetic ring beacon
        const ringGeometry = new THREE.RingGeometry(0.3, 0.4, 32);
        const ringMaterial = new THREE.MeshBasicMaterial({
            color: 0x4488ff, transparent: true, opacity: 0.8, side: THREE.DoubleSide
        });
        group.add(new THREE.Mesh(ringGeometry, ringMaterial));

        // Inner target core
        const innerGeometry = new THREE.CircleGeometry(0.15, 32);
        const innerMaterial = new THREE.MeshBasicMaterial({
            color: 0x88aaff, transparent: true, opacity: 0.5, side: THREE.DoubleSide
        });
        group.add(new THREE.Mesh(innerGeometry, innerMaterial));

        // Vertical EM beam
        const beamGeometry = new THREE.CylinderGeometry(0.05, 0.05, 2, 8);
        const beamMaterial = new THREE.MeshBasicMaterial({
            color: 0x6644ff, transparent: true, opacity: 0.4
        });
        const beam = new THREE.Mesh(beamGeometry, beamMaterial);
        beam.position.y = 1;
        group.add(beam);

        // Floating arrow above
        const arrowShape = new THREE.Shape();
        arrowShape.moveTo(0, 0.3);
        arrowShape.lineTo(0.15, 0);
        arrowShape.lineTo(0.05, 0);
        arrowShape.lineTo(0.05, -0.2);
        arrowShape.lineTo(-0.05, -0.2);
        arrowShape.lineTo(-0.05, 0);
        arrowShape.lineTo(-0.15, 0);
        arrowShape.closePath();

        const arrowGeometry = new THREE.ShapeGeometry(arrowShape);
        const arrowMaterial = new THREE.MeshBasicMaterial({
            color: 0x88ddff, transparent: true, opacity: 0.9, side: THREE.DoubleSide
        });
        const arrow = new THREE.Mesh(arrowGeometry, arrowMaterial);
        arrow.position.y = 2.5;
        arrow.rotation.x = -Math.PI / 2;
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

        // Position marker at destination
        this.destinationMarker.position.copy(destPos);
        this.destinationMarker.position.add(destPos.clone().normalize().multiplyScalar(0.2));
        this.destinationMarker.visible = true;

        // Orient marker to face up from planet
        this.destinationMarker.lookAt(new THREE.Vector3(0, 0, 0));
        this.destinationMarker.rotateX(Math.PI / 2);

        // Animate marker
        const pulse = Math.sin(time * 4) * 0.2 + 1;
        this.destinationMarker.children[0].scale.setScalar(pulse);
        this.destinationMarker.children[3].position.y = 2.5 + Math.sin(time * 3) * 0.3;

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
        if (distance < 1.5) {
            this.completeDelivery(destPos);
            return true;
        }
        return false;
    }

    completeDelivery(destPos) {
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

        // Total score with combo multiplier
        const totalScore = (baseScore + timeBonus + distBonus + streakBonus) * this.comboCount;
        this.gameState.addScore(totalScore);
        this.gameState.deliveries++;

        // Store delivery info for celebration display
        this._lastDelivery = {
            score: totalScore,
            baseScore,
            timeBonus,
            distBonus,
            comboMultiplier: this.comboCount,
            timeRemaining: Math.max(0, pkg.timeLimit - elapsed)
        };

        // Big celebration effect
        this.createDeliveryEffect(destPos);

        // Clear and assign new package
        this.currentPackage = null;
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
        // Package timed out — reassign with a small penalty
        this.comboCount = 0;
        this.currentPackage = null;
        this.assignNewPackage();
    }

    update(time, deltaTime, player) {
        const playerPosition = player.getPosition();
        this._lastPlayerPos = playerPosition;

        // Check for delivery completion
        const delivered = this.checkDelivery(playerPosition);

        // Update destination marker and guide
        this.updateDestinationMarker(playerPosition, time);
    }
}
