/**
 * Space Environment Component
 * Creates starfield, ISS, and other space elements
 */

import * as THREE from 'three';

export class SpaceEnvironment {
    constructor(scene) {
        this.scene = scene;
        this.stars = null;
        this.iss = null;
        this.satellites = [];
    }

    async init() {
        this.createStarfield();
        this.createISS();
        this.createSatellites();
        this.createDistantGalaxies();
    }

    createStarfield() {
        const starCount = 10000;
        const geometry = new THREE.BufferGeometry();

        const positions = new Float32Array(starCount * 3);
        const colors = new Float32Array(starCount * 3);
        const sizes = new Float32Array(starCount);

        const colorPalette = [
            new THREE.Color(0xffffff),  // White
            new THREE.Color(0xffeedd),  // Warm white
            new THREE.Color(0xddddff),  // Cool white
            new THREE.Color(0xffaaaa),  // Red giant
            new THREE.Color(0xaaaaff),  // Blue star
            new THREE.Color(0xffffaa),  // Yellow star
        ];

        for (let i = 0; i < starCount; i++) {
            // Distribute stars on a large sphere
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1);
            const radius = 500 + Math.random() * 500;

            positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
            positions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
            positions[i * 3 + 2] = radius * Math.cos(phi);

            // Random star color
            const color = colorPalette[Math.floor(Math.random() * colorPalette.length)];
            colors[i * 3] = color.r;
            colors[i * 3 + 1] = color.g;
            colors[i * 3 + 2] = color.b;

            // Random size with some very bright stars
            sizes[i] = Math.random() < 0.02 ? 3 + Math.random() * 2 : 0.5 + Math.random() * 1.5;
        }

        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

        const material = new THREE.ShaderMaterial({
            uniforms: {
                time: { value: 0 }
            },
            vertexShader: `
                attribute float size;
                attribute vec3 color;
                varying vec3 vColor;
                varying float vSize;
                uniform float time;

                void main() {
                    vColor = color;
                    vSize = size;

                    // Subtle twinkle
                    float twinkle = sin(time * 2.0 + position.x * 0.01) * 0.2 + 0.8;

                    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                    gl_PointSize = size * twinkle * (300.0 / -mvPosition.z);
                    gl_Position = projectionMatrix * mvPosition;
                }
            `,
            fragmentShader: `
                varying vec3 vColor;
                varying float vSize;

                void main() {
                    float dist = length(gl_PointCoord - vec2(0.5));
                    if (dist > 0.5) discard;

                    // Soft glow
                    float alpha = smoothstep(0.5, 0.0, dist);
                    float core = smoothstep(0.2, 0.0, dist);

                    vec3 color = vColor * (0.5 + core * 0.5);
                    gl_FragColor = vec4(color, alpha);
                }
            `,
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending
        });

        this.stars = new THREE.Points(geometry, material);
        this.scene.add(this.stars);
    }

    createISS() {
        // Create a simplified ISS model
        const issGroup = new THREE.Group();

        // Main body
        const bodyGeometry = new THREE.BoxGeometry(0.3, 0.15, 0.8);
        const bodyMaterial = new THREE.MeshPhongMaterial({
            color: 0xcccccc,
            emissive: 0x333333,
            shininess: 80
        });
        const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
        issGroup.add(body);

        // Solar panels
        const panelGeometry = new THREE.BoxGeometry(1.5, 0.02, 0.4);
        const panelMaterial = new THREE.MeshPhongMaterial({
            color: 0x2244aa,
            emissive: 0x112255,
            shininess: 100,
            transparent: true,
            opacity: 0.9
        });

        const leftPanel = new THREE.Mesh(panelGeometry, panelMaterial);
        leftPanel.position.set(-0.85, 0, 0);
        issGroup.add(leftPanel);

        const rightPanel = new THREE.Mesh(panelGeometry, panelMaterial);
        rightPanel.position.set(0.85, 0, 0);
        issGroup.add(rightPanel);

        // Modules
        const moduleGeometry = new THREE.CylinderGeometry(0.08, 0.08, 0.4, 8);
        const moduleMaterial = new THREE.MeshPhongMaterial({
            color: 0xeeeeee,
            emissive: 0x444444
        });

        for (let i = 0; i < 3; i++) {
            const module = new THREE.Mesh(moduleGeometry, moduleMaterial);
            module.position.set(0, 0, -0.2 + i * 0.3);
            module.rotation.x = Math.PI / 2;
            issGroup.add(module);
        }

        // Position in orbit
        issGroup.position.set(15, 8, 10);
        issGroup.scale.set(0.5, 0.5, 0.5);

        this.iss = issGroup;
        this.issOrbitRadius = 18;
        this.issOrbitSpeed = 0.05;
        this.issOrbitAngle = 0;

        this.scene.add(this.iss);
    }

    createSatellites() {
        // Create a few orbiting satellites
        const satelliteCount = 5;

        for (let i = 0; i < satelliteCount; i++) {
            const satellite = this.createSatellite();

            satellite.userData.orbitRadius = 14 + Math.random() * 8;
            satellite.userData.orbitSpeed = 0.02 + Math.random() * 0.03;
            satellite.userData.orbitAngle = Math.random() * Math.PI * 2;
            satellite.userData.orbitTilt = (Math.random() - 0.5) * Math.PI * 0.5;

            this.satellites.push(satellite);
            this.scene.add(satellite);
        }
    }

    createSatellite() {
        const group = new THREE.Group();

        // Body
        const bodyGeometry = new THREE.BoxGeometry(0.1, 0.1, 0.15);
        const bodyMaterial = new THREE.MeshPhongMaterial({
            color: 0xaaaaaa,
            emissive: 0x222222
        });
        const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
        group.add(body);

        // Small solar panels
        const panelGeometry = new THREE.BoxGeometry(0.3, 0.01, 0.1);
        const panelMaterial = new THREE.MeshPhongMaterial({
            color: 0x3355aa,
            emissive: 0x112244
        });

        const leftPanel = new THREE.Mesh(panelGeometry, panelMaterial);
        leftPanel.position.set(-0.2, 0, 0);
        group.add(leftPanel);

        const rightPanel = new THREE.Mesh(panelGeometry, panelMaterial);
        rightPanel.position.set(0.2, 0, 0);
        group.add(rightPanel);

        // Antenna
        const antennaGeometry = new THREE.ConeGeometry(0.03, 0.1, 8);
        const antennaMaterial = new THREE.MeshPhongMaterial({ color: 0xdddddd });
        const antenna = new THREE.Mesh(antennaGeometry, antennaMaterial);
        antenna.position.y = 0.1;
        group.add(antenna);

        return group;
    }

    createDistantGalaxies() {
        // Create a few nebula-like galaxy sprites
        const galaxyCount = 5;

        for (let i = 0; i < galaxyCount; i++) {
            const canvas = document.createElement('canvas');
            canvas.width = 256;
            canvas.height = 256;
            const ctx = canvas.getContext('2d');

            // Create galaxy gradient
            const colors = [
                ['#ff66aa', '#6666ff'],
                ['#66ffaa', '#ff6666'],
                ['#ffaa66', '#66aaff'],
                ['#aa66ff', '#ffff66'],
                ['#66ffff', '#ff66ff']
            ];
            const colorPair = colors[i % colors.length];

            const gradient = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
            gradient.addColorStop(0, colorPair[0]);
            gradient.addColorStop(0.3, colorPair[1]);
            gradient.addColorStop(1, 'transparent');

            ctx.fillStyle = gradient;
            ctx.fillRect(0, 0, 256, 256);

            // Add spiral arms effect
            ctx.globalCompositeOperation = 'lighter';
            for (let arm = 0; arm < 3; arm++) {
                ctx.save();
                ctx.translate(128, 128);
                ctx.rotate(arm * Math.PI * 2 / 3);

                const armGradient = ctx.createLinearGradient(-100, 0, 100, 0);
                armGradient.addColorStop(0, 'transparent');
                armGradient.addColorStop(0.5, colorPair[0] + '44');
                armGradient.addColorStop(1, 'transparent');

                ctx.fillStyle = armGradient;
                ctx.beginPath();
                ctx.ellipse(0, 0, 100, 20, 0.3, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
            }

            const texture = new THREE.CanvasTexture(canvas);
            const material = new THREE.SpriteMaterial({
                map: texture,
                transparent: true,
                opacity: 0.3,
                blending: THREE.AdditiveBlending
            });

            const sprite = new THREE.Sprite(material);

            // Position far away
            const angle = Math.random() * Math.PI * 2;
            const elevation = (Math.random() - 0.5) * Math.PI;
            const distance = 800 + Math.random() * 200;

            sprite.position.set(
                Math.cos(angle) * Math.cos(elevation) * distance,
                Math.sin(elevation) * distance,
                Math.sin(angle) * Math.cos(elevation) * distance
            );

            sprite.scale.set(100 + Math.random() * 100, 100 + Math.random() * 100, 1);

            this.scene.add(sprite);
        }
    }

    update(time, deltaTime) {
        // Update star twinkle
        if (this.stars && this.stars.material.uniforms) {
            this.stars.material.uniforms.time.value = time;
        }

        // Orbit ISS
        if (this.iss) {
            this.issOrbitAngle += this.issOrbitSpeed * deltaTime;
            this.iss.position.x = Math.cos(this.issOrbitAngle) * this.issOrbitRadius;
            this.iss.position.z = Math.sin(this.issOrbitAngle) * this.issOrbitRadius;
            this.iss.position.y = Math.sin(this.issOrbitAngle * 0.3) * 3 + 5;

            // ISS rotation
            this.iss.rotation.y = -this.issOrbitAngle + Math.PI / 2;

            // Solar panel tracking
            const sunDir = new THREE.Vector3(1, 0.3, 0.5).normalize();
            const issForward = new THREE.Vector3(0, 0, 1).applyQuaternion(this.iss.quaternion);
            // Panels would rotate to track sun - simplified here
        }

        // Update satellites
        this.satellites.forEach(satellite => {
            satellite.userData.orbitAngle += satellite.userData.orbitSpeed * deltaTime;
            const angle = satellite.userData.orbitAngle;
            const radius = satellite.userData.orbitRadius;
            const tilt = satellite.userData.orbitTilt;

            satellite.position.x = Math.cos(angle) * radius;
            satellite.position.z = Math.sin(angle) * radius;
            satellite.position.y = Math.sin(angle + tilt) * radius * 0.3;

            satellite.rotation.y = -angle;
        });
    }
}
