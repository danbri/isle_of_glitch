/**
 * Player Component
 * Handles player movement, bouncing physics, and camera following
 */

import * as THREE from 'three';

export class Player {
    constructor(scene, camera, gameState) {
        this.scene = scene;
        this.camera = camera;
        this.gameState = gameState;

        // Physics state
        this.position = new THREE.Vector3(0, 12, 0);
        this.velocity = new THREE.Vector3(0, 0, 0);
        this.acceleration = new THREE.Vector3(0, 0, 0);

        // Planet reference
        this.planetRadius = 10;
        this.planetCenter = new THREE.Vector3(0, 0, 0);

        // Player properties
        this.bounceCharge = 1.0;
        this.bounceChargeRate = 0.3;
        this.maxBounceCharge = 1.0;
        this.bounceForce = 15;
        this.gravity = 9.8;
        this.airResistance = 0.02;

        // Route types affect trajectory
        this.routeType = 'express';
        this.routeModifiers = {
            express: { angle: 0.7, force: 1.5 },
            scenic: { angle: 0.4, force: 1.0 },
            stealth: { angle: 0.2, force: 0.7 }
        };

        // Target trampoline
        this.targetTrampoline = null;
        this.isOnTrampoline = false;

        // Visual
        this.mesh = null;
        this.trail = null;
        this.trailPositions = [];
        this.maxTrailLength = 100;

        // Camera
        this.cameraOffset = new THREE.Vector3(0, 3, 8);
        this.cameraLookOffset = new THREE.Vector3(0, 0, 0);
    }

    async init() {
        this.createPlayerMesh();
        this.createTrail();
        this.updateCameraPosition();
    }

    createPlayerMesh() {
        // Create a cute package-carrier character
        const group = new THREE.Group();

        // Main body (rounded cube-ish)
        const bodyGeometry = new THREE.SphereGeometry(0.3, 16, 16);
        const bodyMaterial = new THREE.MeshPhongMaterial({
            color: 0xff6b9d,
            emissive: 0xff3366,
            emissiveIntensity: 0.2,
            shininess: 100
        });
        const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
        group.add(body);

        // Jetpack/wings
        const wingGeometry = new THREE.BoxGeometry(0.8, 0.1, 0.3);
        const wingMaterial = new THREE.MeshPhongMaterial({
            color: 0x66d9ff,
            emissive: 0x00aaff,
            emissiveIntensity: 0.3
        });
        const wings = new THREE.Mesh(wingGeometry, wingMaterial);
        wings.position.y = 0;
        wings.position.z = -0.1;
        group.add(wings);

        // Glow effect
        const glowGeometry = new THREE.SphereGeometry(0.4, 16, 16);
        const glowMaterial = new THREE.MeshBasicMaterial({
            color: 0xff99cc,
            transparent: true,
            opacity: 0.3,
            side: THREE.BackSide
        });
        const glow = new THREE.Mesh(glowGeometry, glowMaterial);
        group.add(glow);

        // Eyes (two small spheres)
        const eyeGeometry = new THREE.SphereGeometry(0.06, 8, 8);
        const eyeMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });

        const leftEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
        leftEye.position.set(-0.1, 0.1, 0.25);
        group.add(leftEye);

        const rightEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
        rightEye.position.set(0.1, 0.1, 0.25);
        group.add(rightEye);

        // Pupils
        const pupilGeometry = new THREE.SphereGeometry(0.03, 8, 8);
        const pupilMaterial = new THREE.MeshBasicMaterial({ color: 0x000000 });

        const leftPupil = new THREE.Mesh(pupilGeometry, pupilMaterial);
        leftPupil.position.set(-0.1, 0.1, 0.3);
        group.add(leftPupil);

        const rightPupil = new THREE.Mesh(pupilGeometry, pupilMaterial);
        rightPupil.position.set(0.1, 0.1, 0.3);
        group.add(rightPupil);

        this.mesh = group;
        this.mesh.position.copy(this.position);
        this.scene.add(this.mesh);
    }

    createTrail() {
        // Create a ribbon trail
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(this.maxTrailLength * 3);
        const colors = new Float32Array(this.maxTrailLength * 3);

        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

        const material = new THREE.LineBasicMaterial({
            vertexColors: true,
            transparent: true,
            opacity: 0.6,
            linewidth: 2
        });

        this.trail = new THREE.Line(geometry, material);
        this.scene.add(this.trail);
    }

    updateTrail() {
        // Add current position to trail
        this.trailPositions.unshift(this.position.clone());

        if (this.trailPositions.length > this.maxTrailLength) {
            this.trailPositions.pop();
        }

        // Update geometry
        const positions = this.trail.geometry.attributes.position.array;
        const colors = this.trail.geometry.attributes.color.array;

        for (let i = 0; i < this.trailPositions.length; i++) {
            const pos = this.trailPositions[i];
            positions[i * 3] = pos.x;
            positions[i * 3 + 1] = pos.y;
            positions[i * 3 + 2] = pos.z;

            // Gradient from pink to cyan
            const t = i / this.maxTrailLength;
            colors[i * 3] = 1.0 - t * 0.5;     // R
            colors[i * 3 + 1] = 0.4 + t * 0.5; // G
            colors[i * 3 + 2] = 0.6 + t * 0.4; // B
        }

        this.trail.geometry.attributes.position.needsUpdate = true;
        this.trail.geometry.attributes.color.needsUpdate = true;
        this.trail.geometry.setDrawRange(0, this.trailPositions.length);
    }

    bounce() {
        if (this.bounceCharge < 0.5) return;

        const modifier = this.routeModifiers[this.routeType];

        // Calculate bounce direction
        let bounceDir;

        if (this.targetTrampoline) {
            // Bounce toward target
            bounceDir = this.targetTrampoline.position.clone()
                .sub(this.position)
                .normalize();
        } else {
            // Bounce upward from planet surface
            bounceDir = this.position.clone()
                .sub(this.planetCenter)
                .normalize();
        }

        // Add some horizontal component based on velocity
        const horizontalDir = this.velocity.clone().normalize();
        bounceDir.lerp(horizontalDir, 0.3);
        bounceDir.normalize();

        // Apply bounce force
        const force = this.bounceForce * modifier.force * this.bounceCharge;
        this.velocity.add(bounceDir.multiplyScalar(force));

        // Consume charge
        this.bounceCharge *= 0.5;

        // Visual feedback
        this.createBounceEffect();
    }

    createBounceEffect() {
        // Ring expanding outward
        const geometry = new THREE.RingGeometry(0.1, 0.3, 32);
        const material = new THREE.MeshBasicMaterial({
            color: 0xff66aa,
            transparent: true,
            opacity: 1,
            side: THREE.DoubleSide
        });

        const ring = new THREE.Mesh(geometry, material);
        ring.position.copy(this.position);
        ring.lookAt(this.planetCenter);

        this.scene.add(ring);

        // Animate and remove
        const startTime = Date.now();
        const animate = () => {
            const elapsed = (Date.now() - startTime) / 1000;
            const scale = 1 + elapsed * 5;
            ring.scale.set(scale, scale, 1);
            material.opacity = Math.max(0, 1 - elapsed * 2);

            if (elapsed < 0.5) {
                requestAnimationFrame(animate);
            } else {
                this.scene.remove(ring);
                geometry.dispose();
                material.dispose();
            }
        };
        animate();
    }

    interact() {
        // Placeholder for package pickup/delivery interaction
        this.gameState.triggerInteraction(this.position);
    }

    setTargetTrampoline(trampoline) {
        this.targetTrampoline = trampoline;
    }

    setRouteType(routeType) {
        this.routeType = routeType;
    }

    update(time, deltaTime, keys) {
        // Handle input
        this.handleInput(keys, deltaTime);

        // Apply gravity toward planet center
        const toCenter = this.planetCenter.clone().sub(this.position);
        const distance = toCenter.length();
        const gravityDir = toCenter.normalize();

        // Gravity falls off with distance squared (but clamped for gameplay)
        const gravityStrength = this.gravity * Math.min(1, Math.pow(this.planetRadius / distance, 1.5));
        this.acceleration.copy(gravityDir.multiplyScalar(gravityStrength));

        // Air resistance (increases with altitude for gameplay balance)
        const altitude = distance - this.planetRadius;
        const airResistanceFactor = this.airResistance * (1 + altitude * 0.01);
        const drag = this.velocity.clone().multiplyScalar(-airResistanceFactor);
        this.acceleration.add(drag);

        // Apply physics
        this.velocity.add(this.acceleration.clone().multiplyScalar(deltaTime));
        this.position.add(this.velocity.clone().multiplyScalar(deltaTime));

        // Ground collision
        if (distance < this.planetRadius + 0.5) {
            // Bounce off surface
            const normal = this.position.clone().sub(this.planetCenter).normalize();
            const dot = this.velocity.dot(normal);

            if (dot < 0) {
                // Reflect velocity
                const reflection = normal.clone().multiplyScalar(-2 * dot);
                this.velocity.add(reflection);
                this.velocity.multiplyScalar(0.6); // Energy loss

                // Position correction
                this.position.copy(
                    this.planetCenter.clone().add(
                        normal.multiplyScalar(this.planetRadius + 0.5)
                    )
                );

                // Recharge bounce on ground contact
                this.bounceCharge = Math.min(this.maxBounceCharge, this.bounceCharge + 0.5);
            }
        }

        // Recharge bounce over time
        this.bounceCharge = Math.min(this.maxBounceCharge,
            this.bounceCharge + this.bounceChargeRate * deltaTime);

        // Update mesh
        this.mesh.position.copy(this.position);

        // Orient player to face velocity direction
        if (this.velocity.length() > 0.1) {
            const lookTarget = this.position.clone().add(this.velocity);
            this.mesh.lookAt(lookTarget);
        }

        // Squash and stretch based on velocity
        const speed = this.velocity.length();
        const stretch = 1 + speed * 0.02;
        this.mesh.scale.set(1, 1, stretch);

        // Update trail
        this.updateTrail();

        // Update camera
        this.updateCameraPosition();
    }

    handleInput(keys, deltaTime) {
        // WASD for directional influence
        const influenceForce = 5;

        // Get right and up vectors relative to planet
        const up = this.position.clone().sub(this.planetCenter).normalize();
        const forward = this.velocity.length() > 0.1
            ? this.velocity.clone().normalize()
            : new THREE.Vector3(0, 0, 1);
        const right = new THREE.Vector3().crossVectors(up, forward).normalize();

        if (keys['KeyW'] || keys['ArrowUp']) {
            this.velocity.add(forward.clone().multiplyScalar(influenceForce * deltaTime));
        }
        if (keys['KeyS'] || keys['ArrowDown']) {
            this.velocity.add(forward.clone().multiplyScalar(-influenceForce * deltaTime));
        }
        if (keys['KeyA'] || keys['ArrowLeft']) {
            this.velocity.add(right.clone().multiplyScalar(-influenceForce * deltaTime));
        }
        if (keys['KeyD'] || keys['ArrowRight']) {
            this.velocity.add(right.clone().multiplyScalar(influenceForce * deltaTime));
        }
    }

    updateCameraPosition() {
        // Camera follows player with smooth lerp
        const up = this.position.clone().sub(this.planetCenter).normalize();
        const forward = this.velocity.length() > 0.1
            ? this.velocity.clone().normalize()
            : new THREE.Vector3(0, 0, 1);

        // Position camera behind and above player
        const cameraTargetPos = this.position.clone()
            .add(up.clone().multiplyScalar(this.cameraOffset.y))
            .sub(forward.clone().multiplyScalar(this.cameraOffset.z));

        this.camera.position.lerp(cameraTargetPos, 0.05);
        this.camera.lookAt(this.position);
    }

    getPosition() {
        return this.position.clone();
    }

    getAltitude() {
        const distance = this.position.distanceTo(this.planetCenter);
        return Math.max(0, (distance - this.planetRadius) * 100); // Scale for display
    }

    getSpeed() {
        return this.velocity.length();
    }

    getBounceCharge() {
        return this.bounceCharge;
    }
}
