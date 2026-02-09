/**
 * Package System
 * Manages mysterious packages, deliveries, and interceptions
 */

import * as THREE from 'three';

export class PackageSystem {
    constructor(scene, gameState, trampolineNetwork) {
        this.scene = scene;
        this.gameState = gameState;
        this.trampolineNetwork = trampolineNetwork;

        this.packages = [];
        this.currentPackage = null;
        this.rivals = [];

        // Package types with different properties
        this.packageTypes = [
            {
                name: 'Glowing Cube',
                description: 'Emits a soft ethereal light',
                color: 0xff66aa,
                value: 100,
                icon: '📦'
            },
            {
                name: 'Crystal Sphere',
                description: 'Resonates with unknown frequencies',
                color: 0x66ffaa,
                value: 150,
                icon: '🔮'
            },
            {
                name: 'Ancient Scroll',
                description: 'Contains forgotten knowledge',
                color: 0xffaa66,
                value: 200,
                icon: '📜'
            },
            {
                name: 'Quantum Container',
                description: 'Contents exist in superposition',
                color: 0x66aaff,
                value: 250,
                icon: '⚛️'
            },
            {
                name: 'Rainbow Prism',
                description: 'Splits light into candy colors',
                color: 0xff99ff,
                value: 300,
                icon: '💎'
            },
            {
                name: 'Time Capsule',
                description: 'From an era yet to come',
                color: 0xffff66,
                value: 350,
                icon: '⏰'
            },
            {
                name: 'Stardust Vial',
                description: 'Collected from passing comets',
                color: 0xaaffff,
                value: 400,
                icon: '✨'
            },
            {
                name: 'Dream Fragment',
                description: 'Solidified imagination',
                color: 0xffaaff,
                value: 500,
                icon: '🌙'
            }
        ];

        // Delivery destinations (cities/airports)
        this.destinations = [
            'Tokyo Station', 'Times Square', 'Eiffel Tower',
            'Sydney Opera', 'Dubai Marina', 'Singapore Bay',
            'Hong Kong Peak', 'London Eye', 'Berlin Gate',
            'Moscow Red', 'São Paulo Centro', 'Mumbai Gateway'
        ];
    }

    async init() {
        this.spawnInitialPackages();
        this.createRivals();
        this.assignCurrentPackage();
    }

    spawnInitialPackages() {
        // Spawn packages at random trampolines
        const spawnCount = 5;

        for (let i = 0; i < spawnCount; i++) {
            this.spawnPackage();
        }
    }

    spawnPackage() {
        const trampolines = this.trampolineNetwork.trampolines;
        const randomTrampoline = trampolines[Math.floor(Math.random() * trampolines.length)];

        const packageType = this.packageTypes[Math.floor(Math.random() * this.packageTypes.length)];
        const destination = this.destinations[Math.floor(Math.random() * this.destinations.length)];

        const packageObj = this.createPackageMesh(packageType, randomTrampoline.position);
        packageObj.userData.packageData = {
            type: packageType,
            destination: destination,
            origin: randomTrampoline.airport.city,
            spawnTime: Date.now(),
            collected: false
        };

        this.packages.push(packageObj);
        this.scene.add(packageObj);

        return packageObj;
    }

    createPackageMesh(packageType, position) {
        const group = new THREE.Group();

        // Main package body
        const boxGeometry = new THREE.BoxGeometry(0.15, 0.15, 0.15);
        const boxMaterial = new THREE.MeshPhongMaterial({
            color: packageType.color,
            emissive: packageType.color,
            emissiveIntensity: 0.3,
            shininess: 100
        });
        const box = new THREE.Mesh(boxGeometry, boxMaterial);
        group.add(box);

        // Ribbon wrap
        const ribbonHGeometry = new THREE.BoxGeometry(0.17, 0.02, 0.17);
        const ribbonMaterial = new THREE.MeshPhongMaterial({
            color: 0xffffff,
            emissive: 0xffffff,
            emissiveIntensity: 0.2
        });
        const ribbonH = new THREE.Mesh(ribbonHGeometry, ribbonMaterial);
        group.add(ribbonH);

        const ribbonVGeometry = new THREE.BoxGeometry(0.02, 0.17, 0.17);
        const ribbonV = new THREE.Mesh(ribbonVGeometry, ribbonMaterial);
        group.add(ribbonV);

        // Bow on top
        const bowGeometry = new THREE.TorusGeometry(0.03, 0.01, 8, 16);
        const bowMaterial = new THREE.MeshPhongMaterial({
            color: packageType.color,
            emissive: packageType.color,
            emissiveIntensity: 0.5
        });
        const bow1 = new THREE.Mesh(bowGeometry, bowMaterial);
        bow1.position.set(-0.02, 0.08, 0);
        bow1.rotation.y = Math.PI / 4;
        group.add(bow1);

        const bow2 = new THREE.Mesh(bowGeometry, bowMaterial);
        bow2.position.set(0.02, 0.08, 0);
        bow2.rotation.y = -Math.PI / 4;
        group.add(bow2);

        // Glow effect
        const glowGeometry = new THREE.SphereGeometry(0.2, 16, 16);
        const glowMaterial = new THREE.MeshBasicMaterial({
            color: packageType.color,
            transparent: true,
            opacity: 0.3,
            side: THREE.BackSide
        });
        const glow = new THREE.Mesh(glowGeometry, glowMaterial);
        group.add(glow);

        // Particle trail
        const particleCount = 20;
        const particleGeometry = new THREE.BufferGeometry();
        const particlePositions = new Float32Array(particleCount * 3);
        const particleColors = new Float32Array(particleCount * 3);

        const color = new THREE.Color(packageType.color);
        for (let i = 0; i < particleCount; i++) {
            particlePositions[i * 3] = (Math.random() - 0.5) * 0.3;
            particlePositions[i * 3 + 1] = -Math.random() * 0.3;
            particlePositions[i * 3 + 2] = (Math.random() - 0.5) * 0.3;

            particleColors[i * 3] = color.r;
            particleColors[i * 3 + 1] = color.g;
            particleColors[i * 3 + 2] = color.b;
        }

        particleGeometry.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
        particleGeometry.setAttribute('color', new THREE.BufferAttribute(particleColors, 3));

        const particleMaterial = new THREE.PointsMaterial({
            size: 0.02,
            vertexColors: true,
            transparent: true,
            opacity: 0.6,
            blending: THREE.AdditiveBlending
        });

        const particles = new THREE.Points(particleGeometry, particleMaterial);
        group.add(particles);

        // Position above trampoline
        group.position.copy(position);
        group.position.add(position.clone().normalize().multiplyScalar(0.3));

        return group;
    }

    createRivals() {
        // Create AI rival couriers
        const rivalCount = 3;
        const rivalColors = [0xff4444, 0x44ff44, 0x4444ff];

        for (let i = 0; i < rivalCount; i++) {
            const rival = this.createRivalMesh(rivalColors[i]);
            rival.userData.rivalData = {
                targetPackage: null,
                currentTrampoline: null,
                speed: 3 + Math.random() * 2,
                state: 'seeking'
            };

            // Start at random trampoline
            const trampolines = this.trampolineNetwork.trampolines;
            const startTrampoline = trampolines[Math.floor(Math.random() * trampolines.length)];
            rival.position.copy(startTrampoline.position);
            rival.position.add(startTrampoline.normal.clone().multiplyScalar(0.5));
            rival.userData.rivalData.currentTrampoline = startTrampoline;

            this.rivals.push(rival);
            this.scene.add(rival);
        }
    }

    createRivalMesh(color) {
        const group = new THREE.Group();

        // Body
        const bodyGeometry = new THREE.SphereGeometry(0.2, 16, 16);
        const bodyMaterial = new THREE.MeshPhongMaterial({
            color: color,
            emissive: color,
            emissiveIntensity: 0.2
        });
        const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
        group.add(body);

        // Eyes (menacing but still cute)
        const eyeGeometry = new THREE.SphereGeometry(0.05, 8, 8);
        const eyeMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });

        const leftEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
        leftEye.position.set(-0.08, 0.05, 0.15);
        group.add(leftEye);

        const rightEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
        rightEye.position.set(0.08, 0.05, 0.15);
        group.add(rightEye);

        // Pupils
        const pupilGeometry = new THREE.SphereGeometry(0.025, 8, 8);
        const pupilMaterial = new THREE.MeshBasicMaterial({ color: 0x000000 });

        const leftPupil = new THREE.Mesh(pupilGeometry, pupilMaterial);
        leftPupil.position.set(-0.08, 0.05, 0.19);
        group.add(leftPupil);

        const rightPupil = new THREE.Mesh(pupilGeometry, pupilMaterial);
        rightPupil.position.set(0.08, 0.05, 0.19);
        group.add(rightPupil);

        // Trail
        const trailGeometry = new THREE.SphereGeometry(0.1, 8, 8);
        const trailMaterial = new THREE.MeshBasicMaterial({
            color: color,
            transparent: true,
            opacity: 0.3
        });
        const trail = new THREE.Mesh(trailGeometry, trailMaterial);
        trail.position.z = -0.2;
        group.add(trail);

        return group;
    }

    assignCurrentPackage() {
        // Find an uncollected package
        const availablePackages = this.packages.filter(
            p => !p.userData.packageData.collected
        );

        if (availablePackages.length > 0) {
            this.currentPackage = availablePackages[0].userData.packageData;
        } else {
            // Spawn a new package
            const newPackage = this.spawnPackage();
            this.currentPackage = newPackage.userData.packageData;
        }
    }

    getCurrentPackage() {
        return this.currentPackage;
    }

    update(time, deltaTime, player) {
        const playerPosition = player.getPosition();

        // Update packages
        this.packages.forEach(packageObj => {
            if (!packageObj.userData.packageData.collected) {
                // Float animation
                const float = Math.sin(time * 2 + packageObj.position.x) * 0.02;
                packageObj.position.add(
                    packageObj.position.clone().normalize().multiplyScalar(float * deltaTime)
                );

                // Rotate
                packageObj.rotation.y += deltaTime * 0.5;

                // Check for player collection
                const distance = packageObj.position.distanceTo(playerPosition);
                if (distance < 0.5) {
                    this.collectPackage(packageObj);
                }

                // Update particle trail
                const particles = packageObj.children.find(c => c.isPoints);
                if (particles) {
                    const positions = particles.geometry.attributes.position;
                    for (let i = 0; i < positions.count; i++) {
                        let y = positions.getY(i);
                        y -= deltaTime * 0.5;
                        if (y < -0.3) y = 0;
                        positions.setY(i, y);
                    }
                    positions.needsUpdate = true;
                }
            }
        });

        // Update rivals
        this.rivals.forEach(rival => {
            this.updateRival(rival, time, deltaTime, playerPosition);
        });

        // Spawn new packages occasionally
        if (Math.random() < 0.001 && this.packages.length < 10) {
            this.spawnPackage();
        }
    }

    collectPackage(packageObj) {
        packageObj.userData.packageData.collected = true;
        this.gameState.addScore(packageObj.userData.packageData.type.value);

        // Collection effect
        this.createCollectionEffect(packageObj.position, packageObj.userData.packageData.type.color);

        // Remove from scene after animation
        setTimeout(() => {
            this.scene.remove(packageObj);
            const index = this.packages.indexOf(packageObj);
            if (index > -1) {
                this.packages.splice(index, 1);
            }
        }, 500);

        // Assign new current package
        if (this.currentPackage === packageObj.userData.packageData) {
            this.assignCurrentPackage();
        }

        // Increment deliveries
        this.gameState.deliveries++;
    }

    createCollectionEffect(position, color) {
        // Expanding ring
        const ringGeometry = new THREE.RingGeometry(0.1, 0.15, 32);
        const ringMaterial = new THREE.MeshBasicMaterial({
            color: color,
            transparent: true,
            opacity: 1,
            side: THREE.DoubleSide
        });
        const ring = new THREE.Mesh(ringGeometry, ringMaterial);
        ring.position.copy(position);
        this.scene.add(ring);

        // Particle burst
        const particleCount = 30;
        const particleGeometry = new THREE.BufferGeometry();
        const positions = new Float32Array(particleCount * 3);
        const velocities = [];

        for (let i = 0; i < particleCount; i++) {
            positions[i * 3] = position.x;
            positions[i * 3 + 1] = position.y;
            positions[i * 3 + 2] = position.z;

            velocities.push(new THREE.Vector3(
                (Math.random() - 0.5) * 2,
                (Math.random() - 0.5) * 2,
                (Math.random() - 0.5) * 2
            ));
        }

        particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

        const particleMaterial = new THREE.PointsMaterial({
            color: color,
            size: 0.05,
            transparent: true,
            opacity: 1,
            blending: THREE.AdditiveBlending
        });

        const particles = new THREE.Points(particleGeometry, particleMaterial);
        this.scene.add(particles);

        // Animate
        const startTime = Date.now();
        const animate = () => {
            const elapsed = (Date.now() - startTime) / 1000;

            // Ring expansion
            const scale = 1 + elapsed * 5;
            ring.scale.set(scale, scale, 1);
            ringMaterial.opacity = Math.max(0, 1 - elapsed * 2);

            // Particle movement
            const positions = particles.geometry.attributes.position;
            for (let i = 0; i < particleCount; i++) {
                positions.setX(i, positions.getX(i) + velocities[i].x * 0.05);
                positions.setY(i, positions.getY(i) + velocities[i].y * 0.05);
                positions.setZ(i, positions.getZ(i) + velocities[i].z * 0.05);
            }
            positions.needsUpdate = true;
            particleMaterial.opacity = Math.max(0, 1 - elapsed);

            if (elapsed < 1) {
                requestAnimationFrame(animate);
            } else {
                this.scene.remove(ring);
                this.scene.remove(particles);
                ringGeometry.dispose();
                ringMaterial.dispose();
                particleGeometry.dispose();
                particleMaterial.dispose();
            }
        };
        animate();
    }

    updateRival(rival, time, deltaTime, playerPosition) {
        const data = rival.userData.rivalData;

        // Simple AI: move toward nearest uncollected package
        if (!data.targetPackage || data.targetPackage.collected) {
            // Find new target
            const availablePackages = this.packages.filter(
                p => !p.userData.packageData.collected
            );

            if (availablePackages.length > 0) {
                // Pick random package
                const target = availablePackages[Math.floor(Math.random() * availablePackages.length)];
                data.targetPackage = target.userData.packageData;
                data.targetPosition = target.position.clone();
            }
        }

        if (data.targetPosition) {
            // Move toward target
            const direction = data.targetPosition.clone().sub(rival.position).normalize();
            rival.position.add(direction.multiplyScalar(data.speed * deltaTime * 0.3));

            // Look toward target
            rival.lookAt(data.targetPosition);

            // Bobbing motion
            const bob = Math.sin(time * 5) * 0.02;
            rival.position.add(rival.position.clone().normalize().multiplyScalar(bob));
        }
    }
}
