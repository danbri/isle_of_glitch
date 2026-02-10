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
            { name: 'Glowing Cube', color: 0xff66aa, value: 100, icon: '📦' },
            { name: 'Crystal Sphere', color: 0x66ffaa, value: 150, icon: '🔮' },
            { name: 'Ancient Scroll', color: 0xffaa66, value: 200, icon: '📜' },
            { name: 'Quantum Container', color: 0x66aaff, value: 250, icon: '⚛️' },
            { name: 'Rainbow Prism', color: 0xff99ff, value: 300, icon: '💎' },
            { name: 'Time Capsule', color: 0xffff66, value: 350, icon: '⏰' },
            { name: 'Stardust Vial', color: 0xaaffff, value: 400, icon: '✨' },
            { name: 'Dream Fragment', color: 0xffaaff, value: 500, icon: '🌙' }
        ];

        // Destination marker
        this.destinationMarker = null;
        this.guideLine = null;

        // Delivery celebration state
        this._celebrationTimer = 0;
    }

    async init() {
        this.createDestinationMarker();
        this.createGuideLine();
        this.assignNewPackage();
    }

    getRandomDestinationAirport(excludeNear) {
        // Pick a random airport that's far enough from the player
        const trampolines = this.trampolineNetwork.trampolines;
        if (trampolines.length === 0) return null;

        // Try to find one at least 5 units away (interesting distance)
        for (let attempt = 0; attempt < 20; attempt++) {
            const t = trampolines[Math.floor(Math.random() * trampolines.length)];
            if (!excludeNear || t.position.distanceTo(excludeNear) > 5) {
                return t;
            }
        }
        // Fallback: any airport
        return trampolines[Math.floor(Math.random() * trampolines.length)];
    }

    assignNewPackage() {
        const packageType = this.packageTypes[Math.floor(Math.random() * this.packageTypes.length)];
        const destAirport = this.getRandomDestinationAirport(
            this.trampolineNetwork.trampolines.length > 0 ? this._lastPlayerPos : null
        );

        if (!destAirport) return;

        this.currentPackage = {
            type: packageType,
            destinationAirport: destAirport,
            destinationName: `${destAirport.airport.name} ${destAirport.airport.city}`,
            carrying: true,
            assignedTime: Date.now()
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

        // Pulsing ring beacon
        const ringGeometry = new THREE.RingGeometry(0.3, 0.4, 32);
        const ringMaterial = new THREE.MeshBasicMaterial({
            color: 0x00ff88, transparent: true, opacity: 0.8, side: THREE.DoubleSide
        });
        group.add(new THREE.Mesh(ringGeometry, ringMaterial));

        // Inner target
        const innerGeometry = new THREE.CircleGeometry(0.15, 32);
        const innerMaterial = new THREE.MeshBasicMaterial({
            color: 0x00ff88, transparent: true, opacity: 0.5, side: THREE.DoubleSide
        });
        group.add(new THREE.Mesh(innerGeometry, innerMaterial));

        // Vertical beam
        const beamGeometry = new THREE.CylinderGeometry(0.05, 0.05, 2, 8);
        const beamMaterial = new THREE.MeshBasicMaterial({
            color: 0x00ff88, transparent: true, opacity: 0.4
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
            color: 0x00ff88, transparent: true, opacity: 0.9, side: THREE.DoubleSide
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
            color: 0x00ff88, dashSize: 0.3, gapSize: 0.2,
            transparent: true, opacity: 0.6
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
        // Award score
        this.gameState.addScore(this.currentPackage.type.value);
        this.gameState.deliveries++;

        // Big celebration effect
        this.createDeliveryEffect(destPos);

        // Clear and assign new package
        this.currentPackage = null;
        this.assignNewPackage();
    }

    createDeliveryEffect(position) {
        // Multiple expanding rings
        for (let i = 0; i < 3; i++) {
            setTimeout(() => {
                const ringGeometry = new THREE.RingGeometry(0.2, 0.35, 32);
                const ringMaterial = new THREE.MeshBasicMaterial({
                    color: 0x00ff88, transparent: true, opacity: 1, side: THREE.DoubleSide
                });
                const ring = new THREE.Mesh(ringGeometry, ringMaterial);
                ring.position.copy(position);
                ring.lookAt(new THREE.Vector3(0, 0, 0));
                this.scene.add(ring);

                const startTime = Date.now();
                const animate = () => {
                    const elapsed = (Date.now() - startTime) / 1000;
                    const scale = 1 + elapsed * 8;
                    ring.scale.set(scale, scale, 1);
                    ringMaterial.opacity = Math.max(0, 1 - elapsed * 1.5);
                    if (elapsed < 0.8) {
                        requestAnimationFrame(animate);
                    } else {
                        this.scene.remove(ring);
                        ringGeometry.dispose();
                        ringMaterial.dispose();
                    }
                };
                animate();
            }, i * 150);
        }

        // Particle burst
        const particleCount = 50;
        const particleGeometry = new THREE.BufferGeometry();
        const positions = new Float32Array(particleCount * 3);
        const colors = new Float32Array(particleCount * 3);
        const velocities = [];

        for (let i = 0; i < particleCount; i++) {
            positions[i * 3] = position.x;
            positions[i * 3 + 1] = position.y;
            positions[i * 3 + 2] = position.z;

            const hue = Math.random() * 0.3 + 0.3; // Green to cyan
            const c = new THREE.Color().setHSL(hue, 1, 0.6);
            colors[i * 3] = c.r;
            colors[i * 3 + 1] = c.g;
            colors[i * 3 + 2] = c.b;

            velocities.push(new THREE.Vector3(
                (Math.random() - 0.5) * 3,
                (Math.random() - 0.5) * 3,
                (Math.random() - 0.5) * 3
            ));
        }

        particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        particleGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

        const particleMaterial = new THREE.PointsMaterial({
            size: 0.06, vertexColors: true, transparent: true, opacity: 1,
            blending: THREE.AdditiveBlending
        });

        const particles = new THREE.Points(particleGeometry, particleMaterial);
        this.scene.add(particles);

        const startTime = Date.now();
        const animate = () => {
            const elapsed = (Date.now() - startTime) / 1000;
            const pPos = particles.geometry.attributes.position;
            for (let i = 0; i < particleCount; i++) {
                pPos.setX(i, pPos.getX(i) + velocities[i].x * 0.03);
                pPos.setY(i, pPos.getY(i) + velocities[i].y * 0.03);
                pPos.setZ(i, pPos.getZ(i) + velocities[i].z * 0.03);
            }
            pPos.needsUpdate = true;
            particleMaterial.opacity = Math.max(0, 1 - elapsed * 0.8);
            if (elapsed < 1.5) {
                requestAnimationFrame(animate);
            } else {
                this.scene.remove(particles);
                particleGeometry.dispose();
                particleMaterial.dispose();
            }
        };
        animate();
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
