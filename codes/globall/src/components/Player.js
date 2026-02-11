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
        this.trampolineNetwork = null;

        // Visual
        this.mesh = null;
        this.trail = null;
        this.trailPositions = [];
        this.maxTrailLength = 100;

        // Smooth orientation
        this._targetQuaternion = new THREE.Quaternion();
        this._currentQuaternion = new THREE.Quaternion();
        this._orientationInitialized = false;
        this._smoothScale = new THREE.Vector3(1, 1, 1);

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

        // Chain launch multiplier (set by main.js before bounce)
        this.bounceForceMultiplier = 1.0;
    }

    async init() {
        this.createPlayerMesh();
        this.createTrail();
        this.createSpeedStreaks();
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

        // Main body — magnetic delivery pod
        const bodyGeometry = new THREE.SphereGeometry(0.3, 16, 16);
        const bodyMaterial = new THREE.MeshPhongMaterial({
            color: 0x4488ff,
            emissive: 0x2255cc,
            emissiveIntensity: 0.3,
            shininess: 120
        });
        const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
        group.add(body);

        // Magnetic stabilizer wings
        const wingGeometry = new THREE.BoxGeometry(0.8, 0.1, 0.3);
        const wingMaterial = new THREE.MeshPhongMaterial({
            color: 0x6644ff,
            emissive: 0x4422cc,
            emissiveIntensity: 0.4
        });
        const wings = new THREE.Mesh(wingGeometry, wingMaterial);
        wings.position.y = 0;
        wings.position.z = -0.1;
        group.add(wings);

        // Dark outline shell — always visible against bright terrain
        const outlineGeometry = new THREE.SphereGeometry(0.38, 16, 16);
        const outlineMaterial = new THREE.MeshBasicMaterial({
            color: 0x0a0520,
            transparent: true,
            opacity: 0.5,
            side: THREE.BackSide
        });
        const outline = new THREE.Mesh(outlineGeometry, outlineMaterial);
        group.add(outline);

        // EM field glow (outside the outline)
        const glowGeometry = new THREE.SphereGeometry(0.45, 16, 16);
        const glowMaterial = new THREE.MeshBasicMaterial({
            color: 0x88aaff,
            transparent: true,
            opacity: 0.2,
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

        // Package cargo — visible when carrying a delivery
        const cargoGroup = new THREE.Group();
        const cargoBox = new THREE.Mesh(
            new THREE.BoxGeometry(0.18, 0.14, 0.18),
            new THREE.MeshPhongMaterial({
                color: 0x88ddff,
                emissive: 0x4466aa,
                emissiveIntensity: 0.4
            })
        );
        // Ribbon strap
        const strap = new THREE.Mesh(
            new THREE.BoxGeometry(0.2, 0.02, 0.04),
            new THREE.MeshBasicMaterial({ color: 0xaa88ff })
        );
        strap.position.y = 0.07;
        cargoGroup.add(cargoBox);
        cargoGroup.add(strap);
        cargoGroup.position.set(0, -0.25, -0.1); // Under the pod
        cargoGroup.visible = true; // Start visible since first package assigned at load
        group.add(cargoGroup);
        this._cargoMesh = cargoGroup;

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

    createSpeedStreaks() {
        // Speed streaks — tiny particles that rush past during fast flight
        this.STREAK_COUNT = 40;
        const positions = new Float32Array(this.STREAK_COUNT * 3);
        const colors = new Float32Array(this.STREAK_COUNT * 3);

        for (let i = 0; i < this.STREAK_COUNT; i++) {
            positions[i * 3] = 0;
            positions[i * 3 + 1] = -999;
            positions[i * 3 + 2] = 0;
            colors[i * 3] = 0.5 + Math.random() * 0.3;
            colors[i * 3 + 1] = 0.6 + Math.random() * 0.3;
            colors[i * 3 + 2] = 1.0;
        }

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

        this.speedStreaks = new THREE.Points(geometry, new THREE.PointsMaterial({
            size: 0.06,
            vertexColors: true,
            transparent: true,
            opacity: 0,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            sizeAttenuation: true
        }));
        this.scene.add(this.speedStreaks);

        // Per-streak random offsets
        this._streakOffsets = [];
        for (let i = 0; i < this.STREAK_COUNT; i++) {
            this._streakOffsets.push({
                angle: Math.random() * Math.PI * 2,
                radius: 0.5 + Math.random() * 2,
                phase: Math.random()
            });
        }
    }

    updateSpeedStreaks(time) {
        if (!this.speedStreaks) return;
        const speed = this.velocity.length();
        const threshold = 5;

        // Fade in/out based on speed
        const targetOpacity = speed > threshold ? Math.min(0.6, (speed - threshold) * 0.06) : 0;
        this.speedStreaks.material.opacity += (targetOpacity - this.speedStreaks.material.opacity) * 0.1;

        if (this.speedStreaks.material.opacity < 0.01) return;

        const posAttr = this.speedStreaks.geometry.attributes.position;
        const arr = posAttr.array;

        // Streaks flow from in front of camera toward player
        const velDir = this.velocity.clone().normalize();
        const up = this.position.clone().normalize();
        const right = new THREE.Vector3().crossVectors(up, velDir).normalize();
        const camUp = new THREE.Vector3().crossVectors(velDir, right);

        for (let i = 0; i < this.STREAK_COUNT; i++) {
            const s = this._streakOffsets[i];
            // Cycle along velocity direction
            const t = ((time * 2 + s.phase * 3) % 3) - 1.5; // -1.5 to 1.5

            // Position: ahead of player + radial offset
            const ox = Math.cos(s.angle) * s.radius;
            const oy = Math.sin(s.angle) * s.radius;

            arr[i * 3] = this.position.x + velDir.x * t * 2 + right.x * ox + camUp.x * oy;
            arr[i * 3 + 1] = this.position.y + velDir.y * t * 2 + right.y * ox + camUp.y * oy;
            arr[i * 3 + 2] = this.position.z + velDir.z * t * 2 + right.z * ox + camUp.z * oy;
        }

        posAttr.needsUpdate = true;
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

            // Gradient from white-blue to deep purple (magnetic flux)
            const t = i / this.maxTrailLength;
            colors[i * 3] = 0.5 - t * 0.3;     // R: bright→dim
            colors[i * 3 + 1] = 0.6 - t * 0.3; // G: bright→dim
            colors[i * 3 + 2] = 1.0 - t * 0.3; // B: stays bright
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

        // Apply bounce force - stronger response, with chain launch bonus
        let force = this.bounceForce * modifier.force * (0.5 + this.bounceCharge * 0.5) * this.bounceForceMultiplier;

        // Scale force down for nearby targets — tiny hops should be easy
        if (this.targetTrampoline) {
            const targetDist = this.targetTrampoline.position.distanceTo(this.position);
            if (targetDist < 3) {
                force *= Math.max(0.25, targetDist / 3);
            }
        }

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
        // Electromagnetic pulse — concentric expanding rings
        const rings = [];
        const colors = [0x4488ff, 0x6644ff, 0x88aaff];

        for (let r = 0; r < 3; r++) {
            const geometry = new THREE.RingGeometry(0.05 + r * 0.08, 0.15 + r * 0.08, 32);
            const material = new THREE.MeshBasicMaterial({
                color: colors[r],
                transparent: true,
                opacity: 1,
                side: THREE.DoubleSide
            });

            const ring = new THREE.Mesh(geometry, material);
            ring.position.copy(this.position);
            ring.lookAt(this.planetCenter);
            this.scene.add(ring);
            rings.push({ ring, geometry, material, delay: r * 0.06 });
        }

        // Animate and remove
        const startTime = Date.now();
        const animate = () => {
            const elapsed = (Date.now() - startTime) / 1000;
            let allDone = true;

            for (const r of rings) {
                const t = Math.max(0, elapsed - r.delay);
                if (t < 0.5) {
                    allDone = false;
                    const scale = 1 + t * 6;
                    r.ring.scale.set(scale, scale, 1);
                    r.material.opacity = Math.max(0, 1 - t * 2.5);
                } else {
                    r.material.opacity = 0;
                }
            }

            if (!allDone) {
                requestAnimationFrame(animate);
            } else {
                for (const r of rings) {
                    this.scene.remove(r.ring);
                    r.geometry.dispose();
                    r.material.dispose();
                }
            }
        };
        animate();
    }

    createLandingPulse(impactSpeed) {
        // Single fast-expanding ring that contracts slightly (magnetic snap)
        const intensity = Math.min(1, impactSpeed / 10);
        const geometry = new THREE.RingGeometry(0.1, 0.2, 32);
        const material = new THREE.MeshBasicMaterial({
            color: 0x88aaff,
            transparent: true,
            opacity: 0.7 * intensity,
            side: THREE.DoubleSide
        });
        const ring = new THREE.Mesh(geometry, material);
        ring.position.copy(this.position);
        ring.lookAt(this.planetCenter);
        this.scene.add(ring);

        const startTime = Date.now();
        const animate = () => {
            const elapsed = (Date.now() - startTime) / 1000;
            // Quick expand then slight contract (magnetic snap feel)
            const expand = elapsed < 0.1 ? elapsed * 30 : 3 - (elapsed - 0.1) * 4;
            const scale = Math.max(0.5, expand);
            ring.scale.set(scale, scale, 1);
            material.opacity = Math.max(0, 0.7 * intensity * (1 - elapsed * 3));
            if (elapsed < 0.35) {
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

    setTrampolineNetwork(network) {
        this.trampolineNetwork = network;
    }

    setCarrying(hasPackage) {
        if (this._cargoMesh) this._cargoMesh.visible = hasPackage;
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

                // EM landing pulse near airports
                if (impactSpeed > 2 && this.trampolineNetwork) {
                    const { distance: nearDist } =
                        this.trampolineNetwork.getNearestTrampoline(this.position);
                    if (nearDist < 2) {
                        this.createLandingPulse(impactSpeed);
                    }
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

        // Magnetic attraction to nearby airports
        if (this.trampolineNetwork && altitude < 2) {
            const { trampoline: nearest, distance: nearestDist } = 
                this.trampolineNetwork.getNearestTrampoline(this.position);
            if (nearest && nearestDist < 3) {
                const pullDir = nearest.position.clone().sub(this.position).normalize();
                const pullStrength = Math.min(2.0, 0.5 / (nearestDist * nearestDist + 0.1));
                this.velocity.add(pullDir.multiplyScalar(pullStrength * deltaTime));
            }
        }

        // Recharge bounce over time
        this.bounceCharge = Math.min(this.maxBounceCharge,
            this.bounceCharge + this.bounceChargeRate * deltaTime);

        // Update mesh
        this.mesh.position.copy(this.position);

        // --- Smooth orientation with quaternion slerp ---
        const playerUp = this.position.clone().normalize(); // "up" = away from planet

        if (this.isOnGround || speed < 0.5) {
            // PARKED STANCE: face toward camera so eyes are visible
            // Camera is above + offset along tangent, so face the tangent direction
            const cameraTangent = this._cameraTangent || new THREE.Vector3(0, 0, 1);
            const faceDir = cameraTangent.clone(); // face toward camera's offset direction
            // Build a lookAt target: position + face direction (tangent) + slight upward tilt
            const lookTarget = this.position.clone()
                .add(faceDir.clone().multiplyScalar(1.0))
                .add(playerUp.clone().multiplyScalar(0.3)); // Tilt face slightly upward

            // Compute target quaternion from a dummy object
            const dummyMatrix = new THREE.Matrix4();
            dummyMatrix.lookAt(this.position, lookTarget, playerUp);
            this._targetQuaternion.setFromRotationMatrix(dummyMatrix);
        } else {
            // AIRBORNE: face velocity direction (the dolphin/whale look)
            const lookTarget = this.position.clone().add(this.velocity);
            const dummyMatrix = new THREE.Matrix4();
            dummyMatrix.lookAt(this.position, lookTarget, playerUp);
            this._targetQuaternion.setFromRotationMatrix(dummyMatrix);
        }

        // Initialize quaternion on first frame
        if (!this._orientationInitialized) {
            this._currentQuaternion.copy(this._targetQuaternion);
            this._orientationInitialized = true;
        }

        // Slerp toward target — slow on ground (stable), faster in air (responsive)
        const slerpRate = this.isOnGround ? 0.04 : 0.08;
        this._currentQuaternion.slerp(this._targetQuaternion, slerpRate);
        this.mesh.quaternion.copy(this._currentQuaternion);

        // Banking — tilt wings into turns for visual feedback (air only)
        if (!this.isOnGround && speed > 1) {
            const bankAngle = -(this._lastSteerX || 0) * 0.4;
            this.mesh.rotateZ(bankAngle);
        }

        // Cargo bobble animation
        if (this._cargoMesh && this._cargoMesh.visible) {
            this._cargoMesh.rotation.y = Math.sin(time * 2) * 0.15;
            this._cargoMesh.position.y = -0.25 + Math.sin(time * 3) * 0.02;
        }

        // Smooth squash and stretch — lerp scale to avoid popping
        const currentSpeed = this.velocity.length();
        const verticalSpeed = this.velocity.dot(playerUp);
        let targetScale;
        if (this.isOnGround) {
            const squash = Math.max(0.7, 1 - Math.abs(verticalSpeed) * 0.03);
            targetScale = new THREE.Vector3(1 / squash, squash, 1 / squash);
        } else {
            const stretch = 1 + currentSpeed * 0.02;
            targetScale = new THREE.Vector3(1, 1, stretch);
        }
        this._smoothScale.lerp(targetScale, 0.1);
        this.mesh.scale.copy(this._smoothScale);

        // Eye tracking — pupils look toward target
        if (this.targetTrampoline && this.mesh.children.length >= 7) {
            const toTarget = this.targetTrampoline.position.clone().sub(this.position);
            const localDir = this.mesh.worldToLocal(
                this.position.clone().add(toTarget.normalize())
            );
            const ex = Math.max(-0.04, Math.min(0.04, localDir.x * 0.1));
            const ey = Math.max(-0.04, Math.min(0.04, localDir.y * 0.1));
            // Pupils are children[5] (left) and children[6] (right)
            this.mesh.children[5].position.set(-0.1 + ex, 0.1 + ey, 0.3);
            this.mesh.children[6].position.set(0.1 + ex, 0.1 + ey, 0.3);
        }

        // Update trail
        this.updateTrail();

        // Update speed streaks
        this.updateSpeedStreaks(time);

        // Update camera (skip when orbit controls are active)
        if (this.cameraEnabled) {
            this.updateCameraPosition();
        }
    }

    handleInput(keys, deltaTime) {
        // Mid-air steering: stronger influence when airborne and moving fast
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

        // Analog steering from touch (proportional 0-1)
        const steerX = keys['_steerX'] || 0;
        const steerY = keys['_steerY'] || 0;

        // Apply analog + keyboard input combined
        let forwardForce = 0;
        let rightForce = 0;

        // Keyboard (binary 0/1)
        if (keys['KeyW'] || keys['ArrowUp']) forwardForce += 1;
        if (keys['KeyS'] || keys['ArrowDown']) forwardForce -= 1;
        if (keys['KeyA'] || keys['ArrowLeft']) rightForce -= 1;
        if (keys['KeyD'] || keys['ArrowRight']) rightForce += 1;

        // Touch analog (proportional, overrides keyboard if active)
        if (Math.abs(steerX) > 0.01) rightForce = steerX;
        if (Math.abs(steerY) > 0.01) forwardForce = -steerY; // Inverted: swipe up = forward

        if (Math.abs(forwardForce) > 0.01) {
            this.velocity.add(forward.clone().multiplyScalar(influenceForce * forwardForce * deltaTime));
        }
        if (Math.abs(rightForce) > 0.01) {
            this.velocity.add(right.clone().multiplyScalar(influenceForce * rightForce * deltaTime));
        }

        // Track for banking animation
        this._lastSteerX = rightForce;
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
