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
        this.bounceChargeRate = 0.5; // Faster recharge
        this.maxBounceCharge = 1.0;
        this.bounceForce = 12; // Slightly reduced for better control
        this.gravity = 25; // Stronger gravity for better feel
        this.airResistance = 0.008; // Less drag so gravity dominates

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
        this.lastForward = null; // Stores last velocity direction for stable camera
        this.cameraLerpSpeed = 0.15; // Configurable from debug panel
        this.cameraEnabled = true; // Disabled when orbit controls are active

        // Camera shake
        this.cameraShake = { intensity: 0, decay: 0.88 };

        // Landing tracking
        this.lastImpactSpeed = 0;
    }

    async init() {
        this.createPlayerMesh();
        this.createTrail();
        // Initialize camera to correct position immediately (no lerping on first frame)
        this.initializeCameraPosition();
    }

    initializeCameraPosition() {
        // Overhead satellite camera — no velocity dependence
        const playerDir = this.position.clone().normalize();

        // Stable tangent frame for slight perspective offset
        const ref = Math.abs(playerDir.y) < 0.95
            ? new THREE.Vector3(0, 1, 0)
            : new THREE.Vector3(0, 0, 1);
        this._cameraTangent = new THREE.Vector3().crossVectors(ref, playerDir).normalize();
        this._cameraUp = playerDir.clone();

        const cameraPos = playerDir.clone()
            .multiplyScalar(this.planetRadius + 7)
            .add(this._cameraTangent.clone().multiplyScalar(2.5));

        this.camera.position.copy(cameraPos);
        this.camera.fov = 50;
        this.camera.updateProjectionMatrix();
        this.camera.up.copy(playerDir);
        this.camera.lookAt(this.position);
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
        if (this.bounceCharge < 0.3) return; // Lower threshold for responsiveness

        const modifier = this.routeModifiers[this.routeType];

        // Get up vector (away from planet)
        const up = this.position.clone().sub(this.planetCenter).normalize();

        // Get horizontal direction from current velocity or forward
        let horizontal;
        const horizontalVel = this.velocity.clone();
        horizontalVel.sub(up.clone().multiplyScalar(horizontalVel.dot(up))); // Remove vertical component

        if (horizontalVel.length() > 0.1) {
            horizontal = horizontalVel.normalize();
        } else {
            // Default forward direction if no horizontal velocity
            horizontal = new THREE.Vector3(1, 0, 0);
            horizontal.sub(up.clone().multiplyScalar(horizontal.dot(up))).normalize();
        }

        // Calculate bounce direction based on route type
        let bounceDir;
        if (this.targetTrampoline) {
            // Great-circle aim toward target with proper loft
            const toTarget = this.targetTrampoline.position.clone().sub(this.position);
            const dist = toTarget.length();

            // Project to surface tangent (great circle direction)
            const tangentDir = toTarget.clone();
            tangentDir.sub(up.clone().multiplyScalar(tangentDir.dot(up)));
            if (tangentDir.length() > 0.01) {
                tangentDir.normalize();
            } else {
                tangentDir.copy(horizontal);
            }

            // Loft increases with distance: close = low arc, far = high arc
            const loft = Math.min(0.85, 0.3 + dist * 0.04);
            bounceDir = up.clone().multiplyScalar(loft)
                .add(tangentDir.clone().multiplyScalar(1 - loft))
                .normalize();
        } else {
            // No target: mix vertical and horizontal based on route type
            bounceDir = up.clone().multiplyScalar(modifier.angle)
                .add(horizontal.clone().multiplyScalar(1 - modifier.angle))
                .normalize();
        }

        // Apply bounce force - stronger response
        const force = this.bounceForce * modifier.force * (0.5 + this.bounceCharge * 0.5);

        // Cancel downward velocity before bouncing for snappier response
        const downwardSpeed = -this.velocity.dot(up);
        if (downwardSpeed > 0) {
            this.velocity.add(up.clone().multiplyScalar(downwardSpeed * 0.7));
        }

        this.velocity.add(bounceDir.clone().multiplyScalar(force));

        // Consume charge (but not too much)
        this.bounceCharge *= 0.4;

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
        const gravityDir = toCenter.clone().normalize();

        // Strong consistent gravity - only slight falloff at extreme distances
        // This ensures player always falls back down
        const altitude = distance - this.planetRadius;
        const gravityStrength = this.gravity * Math.max(0.7, 1 - altitude * 0.005);
        this.acceleration.copy(gravityDir.multiplyScalar(gravityStrength));

        // Light air resistance - doesn't fight gravity much
        const speed = this.velocity.length();
        const drag = this.velocity.clone().multiplyScalar(-this.airResistance * speed);
        this.acceleration.add(drag);

        // Apply physics
        this.velocity.add(this.acceleration.clone().multiplyScalar(deltaTime));
        this.position.add(this.velocity.clone().multiplyScalar(deltaTime));

        // Ground collision
        if (distance < this.planetRadius + 0.4) {
            // Bounce off surface
            const normal = this.position.clone().sub(this.planetCenter).normalize();
            const dot = this.velocity.dot(normal);

            if (dot < 0) {
                // Reflect velocity with bounce based on impact speed
                const impactSpeed = -dot;
                this.lastImpactSpeed = impactSpeed;

                // Camera shake on hard landings
                if (impactSpeed > 3) {
                    this.cameraShake.intensity = Math.min(0.3, impactSpeed * 0.02);
                }

                const bounciness = impactSpeed > 5 ? 0.5 : 0.3; // More bounce from harder impacts
                const reflection = normal.clone().multiplyScalar(-2 * dot * bounciness);
                this.velocity.add(reflection);
                this.velocity.multiplyScalar(0.85); // Less energy loss

                // Position correction
                this.position.copy(
                    this.planetCenter.clone().add(
                        normal.multiplyScalar(this.planetRadius + 0.4)
                    )
                );

                // Full recharge on ground contact
                this.bounceCharge = this.maxBounceCharge;
                this.isOnGround = true;
            }
        } else {
            this.isOnGround = false;
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
        const currentSpeed = this.velocity.length();
        const stretch = 1 + currentSpeed * 0.02;
        this.mesh.scale.set(1, 1, stretch);

        // Update trail
        this.updateTrail();

        // Update camera (skip when orbit controls are active)
        if (this.cameraEnabled) {
            this.updateCameraPosition();
        }
    }

    handleInput(keys, deltaTime) {
        // Mid-air steering: stronger influence when airborne and moving fast
        // This gives the player meaningful control during flight
        const speed = this.velocity.length();
        const baseForce = 5;
        const airBonus = this.isOnGround ? 0 : Math.min(speed * 0.4, 6);
        const influenceForce = baseForce + airBonus;

        // Get right and up vectors relative to planet
        const up = this.position.clone().sub(this.planetCenter).normalize();
        const forward = speed > 0.1
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
        // SATELLITE CAMERA — zero velocity dependence, zero jitter
        // Hovers above the player looking down with slight tilt for perspective.
        // Only depends on player POSITION (smooth) not velocity (noisy).
        const playerDir = this.position.clone().normalize();
        const altitude = this.position.distanceTo(this.planetCenter) - this.planetRadius;

        // Stable tangent direction via cross product with reference vector
        // Smoothed across frames to prevent any discontinuities near poles
        const ref = Math.abs(playerDir.y) < 0.95
            ? new THREE.Vector3(0, 1, 0)
            : new THREE.Vector3(0, 0, 1);
        const tangent = new THREE.Vector3().crossVectors(ref, playerDir).normalize();

        if (!this._cameraTangent) {
            this._cameraTangent = tangent.clone();
        } else {
            this._cameraTangent.lerp(tangent, 0.02).normalize();
        }

        // Smooth the up vector too
        if (!this._cameraUp) {
            this._cameraUp = playerDir.clone();
        } else {
            this._cameraUp.lerp(playerDir, 0.03).normalize();
        }

        // Camera height: 7 at ground, up to 11 at high altitude
        // Pulls closer during speed for excitement
        const speed = this.velocity.length();
        const speedCloseness = Math.min(speed * 0.12, 2);
        const camHeight = 7 + Math.min(altitude * 0.5, 4) - speedCloseness;

        // Position: above the player with slight lateral tilt for 3/4 view
        const cameraTargetPos = playerDir.clone()
            .multiplyScalar(this.planetRadius + camHeight)
            .add(this._cameraTangent.clone().multiplyScalar(2.5));

        // Smooth follow — faster when moving for more responsiveness
        const followSpeed = 0.05 + Math.min(speed * 0.005, 0.07);
        this.camera.position.lerp(cameraTargetPos, followSpeed);

        // Smooth up vector and look at player
        this.camera.up.copy(this._cameraUp);
        this.camera.lookAt(this.position);

        // Camera shake (decays each frame)
        if (this.cameraShake.intensity > 0.001) {
            const shakeX = (Math.random() - 0.5) * this.cameraShake.intensity;
            const shakeY = (Math.random() - 0.5) * this.cameraShake.intensity;
            const shakeZ = (Math.random() - 0.5) * this.cameraShake.intensity;
            this.camera.position.x += shakeX;
            this.camera.position.y += shakeY;
            this.camera.position.z += shakeZ;
            this.cameraShake.intensity *= this.cameraShake.decay;
        }

        // Dynamic FOV: widens during speed for sensation of velocity
        const targetFov = 50 + Math.min(speed * 0.6, 15);
        const currentFov = this.camera.fov;
        if (Math.abs(currentFov - targetFov) > 0.3) {
            this.camera.fov += (targetFov - currentFov) * 0.06;
            this.camera.updateProjectionMatrix();
        }
    }

    // Predict bounce trajectory for preview arc
    predictTrajectory(holdMs) {
        const routeType = holdMs < 200 ? 'scenic' : holdMs < 600 ? 'express' : 'stealth';
        const modifier = this.routeModifiers[routeType];

        const up = this.position.clone().sub(this.planetCenter).normalize();
        let horizontal = this.velocity.clone();
        horizontal.sub(up.clone().multiplyScalar(horizontal.dot(up)));
        if (horizontal.length() > 0.1) {
            horizontal.normalize();
        } else {
            horizontal = new THREE.Vector3(1, 0, 0);
            horizontal.sub(up.clone().multiplyScalar(horizontal.dot(up))).normalize();
        }

        let bounceDir;
        if (this.targetTrampoline) {
            const toTarget = this.targetTrampoline.position.clone().sub(this.position);
            const dist = toTarget.length();
            const tangentDir = toTarget.clone();
            tangentDir.sub(up.clone().multiplyScalar(tangentDir.dot(up)));
            if (tangentDir.length() > 0.01) tangentDir.normalize();
            else tangentDir.copy(horizontal);
            const loft = Math.min(0.85, 0.3 + dist * 0.04);
            bounceDir = up.clone().multiplyScalar(loft)
                .add(tangentDir.clone().multiplyScalar(1 - loft)).normalize();
        } else {
            bounceDir = up.clone().multiplyScalar(modifier.angle)
                .add(horizontal.clone().multiplyScalar(1 - modifier.angle)).normalize();
        }

        const charge = Math.min(1, this.bounceCharge);
        const force = this.bounceForce * modifier.force * (0.5 + charge * 0.5);

        // Simulate forward
        let pos = this.position.clone();
        let vel = this.velocity.clone();
        const downSpeed = -vel.dot(up);
        if (downSpeed > 0) vel.add(up.clone().multiplyScalar(downSpeed * 0.7));
        vel.add(bounceDir.clone().multiplyScalar(force));

        const dt = 0.06;
        const points = [pos.clone()];
        for (let i = 0; i < 50; i++) {
            const toCenter = this.planetCenter.clone().sub(pos);
            const distance = toCenter.length();
            const gravDir = toCenter.clone().normalize();
            const alt = distance - this.planetRadius;
            const gStr = this.gravity * Math.max(0.7, 1 - alt * 0.005);
            const acc = gravDir.multiplyScalar(gStr);
            const spd = vel.length();
            acc.add(vel.clone().multiplyScalar(-this.airResistance * spd));

            vel = vel.clone().add(acc.clone().multiplyScalar(dt));
            pos = pos.clone().add(vel.clone().multiplyScalar(dt));

            if (pos.length() < this.planetRadius + 0.4) {
                points.push(pos.clone());
                break;
            }
            points.push(pos.clone());
        }
        return points;
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
