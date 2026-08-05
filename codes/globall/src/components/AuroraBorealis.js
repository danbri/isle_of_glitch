/**
 * Aurora Borealis Component
 * Creates beautiful animated northern lights visible at high altitudes
 */

import * as THREE from 'three';
import { AuroraShader, AuroraParticleShader } from '../shaders/Aurora.js';

export class AuroraBorealis {
    constructor(scene) {
        this.scene = scene;
        this.curtains = [];
        this.particles = null;
        this.planetRadius = 10;
        this.auroraAltitude = 12; // Just above atmosphere
    }

    async init() {
        this.createAuroraCurtains();
        this.createAuroraParticles();
    }

    createAuroraCurtains() {
        // Create multiple curtain meshes around the polar regions
        const curtainCount = 8;

        // Northern lights
        for (let i = 0; i < curtainCount; i++) {
            const curtain = this.createCurtain(
                (i / curtainCount) * Math.PI * 2,
                true
            );
            this.curtains.push(curtain);
            this.scene.add(curtain);
        }

        // Southern lights (Aurora Australis)
        for (let i = 0; i < curtainCount / 2; i++) {
            const curtain = this.createCurtain(
                (i / (curtainCount / 2)) * Math.PI * 2,
                false
            );
            this.curtains.push(curtain);
            this.scene.add(curtain);
        }
    }

    createCurtain(angle, isNorthern) {
        // Create a curved plane for the curtain
        const width = 8;
        const height = 4;
        const widthSegments = 64;
        const heightSegments = 32;

        const geometry = new THREE.PlaneGeometry(width, height, widthSegments, heightSegments);

        // Curve the geometry
        const positions = geometry.attributes.position;
        for (let i = 0; i < positions.count; i++) {
            const x = positions.getX(i);
            const y = positions.getY(i);

            // Curve along width
            const curveAngle = (x / width) * Math.PI * 0.5;

            // Apply polar positioning
            const polarAngle = isNorthern ? 0.2 : Math.PI - 0.2; // Near poles
            const baseRadius = this.auroraAltitude;

            positions.setZ(i, Math.sin(curveAngle) * 2);
        }
        geometry.computeVertexNormals();

        // Create shader material
        const material = new THREE.ShaderMaterial({
            uniforms: {
                time: { value: 0 },
                color1: { value: new THREE.Color(0x00ff88) }, // Green
                color2: { value: new THREE.Color(0x00ddff) }, // Cyan
                color3: { value: new THREE.Color(0xff44aa) }, // Pink
                intensity: { value: 1.0 },
                speed: { value: 0.5 + Math.random() * 0.5 },
                playerAltitude: { value: 0 }
            },
            vertexShader: AuroraShader.vertexShader,
            fragmentShader: AuroraShader.fragmentShader,
            transparent: true,
            side: THREE.DoubleSide,
            depthWrite: false,
            blending: THREE.AdditiveBlending
        });

        const mesh = new THREE.Mesh(geometry, material);

        // Position around polar region
        const latitude = isNorthern ? 70 : -70; // degrees
        const phi = (90 - latitude) * (Math.PI / 180);
        const theta = angle;

        const radius = this.auroraAltitude;
        mesh.position.x = radius * Math.sin(phi) * Math.cos(theta);
        mesh.position.y = radius * Math.cos(phi);
        mesh.position.z = radius * Math.sin(phi) * Math.sin(theta);

        // Orient to face outward
        mesh.lookAt(0, 0, 0);
        mesh.rotateX(Math.PI);

        // Store metadata
        mesh.userData.isNorthern = isNorthern;
        mesh.userData.baseAngle = angle;

        return mesh;
    }

    createAuroraParticles() {
        const particleCount = 2000;
        const geometry = new THREE.BufferGeometry();

        const positions = new Float32Array(particleCount * 3);
        const colors = new Float32Array(particleCount * 3);
        const sizes = new Float32Array(particleCount);

        const colorOptions = [
            new THREE.Color(0x00ff88), // Green
            new THREE.Color(0x00ddff), // Cyan
            new THREE.Color(0xff44aa), // Pink
            new THREE.Color(0xffff66), // Yellow
        ];

        for (let i = 0; i < particleCount; i++) {
            // Position particles in aurora zone
            const isNorthern = Math.random() > 0.3;
            const latitude = isNorthern
                ? 60 + Math.random() * 25
                : -60 - Math.random() * 25;
            const longitude = Math.random() * 360;
            const altitude = this.auroraAltitude + Math.random() * 3;

            const phi = (90 - latitude) * (Math.PI / 180);
            const theta = longitude * (Math.PI / 180);

            positions[i * 3] = altitude * Math.sin(phi) * Math.cos(theta);
            positions[i * 3 + 1] = altitude * Math.cos(phi);
            positions[i * 3 + 2] = altitude * Math.sin(phi) * Math.sin(theta);

            // Random aurora color
            const color = colorOptions[Math.floor(Math.random() * colorOptions.length)];
            colors[i * 3] = color.r;
            colors[i * 3 + 1] = color.g;
            colors[i * 3 + 2] = color.b;

            sizes[i] = 0.5 + Math.random() * 1.5;
        }

        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('customColor', new THREE.BufferAttribute(colors, 3));
        geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

        const material = new THREE.ShaderMaterial({
            uniforms: {
                time: { value: 0 },
                color: { value: new THREE.Color(0x00ff88) },
                pointSize: { value: 2.0 }
            },
            vertexShader: AuroraParticleShader.vertexShader,
            fragmentShader: AuroraParticleShader.fragmentShader,
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending
        });

        this.particles = new THREE.Points(geometry, material);
        this.scene.add(this.particles);
    }

    update(time, deltaTime, playerPosition) {
        const playerAltitude = playerPosition.length() - this.planetRadius;

        // Update curtain shaders
        this.curtains.forEach((curtain, index) => {
            if (curtain.material.uniforms) {
                curtain.material.uniforms.time.value = time;
                curtain.material.uniforms.playerAltitude.value = playerAltitude * 100;

                // Vary intensity based on time
                const intensityVariation = Math.sin(time * 0.2 + index) * 0.3 + 0.7;
                curtain.material.uniforms.intensity.value = intensityVariation;
            }

            // Subtle movement
            const wobble = Math.sin(time * 0.3 + index * 0.5) * 0.02;
            curtain.rotation.z = wobble;
        });

        // Update particles
        if (this.particles && this.particles.material.uniforms) {
            this.particles.material.uniforms.time.value = time;

            // Animate particle positions slightly
            const positions = this.particles.geometry.attributes.position;
            for (let i = 0; i < positions.count; i++) {
                const x = positions.getX(i);
                const y = positions.getY(i);
                const z = positions.getZ(i);

                // Subtle drift
                const drift = Math.sin(time + i * 0.1) * 0.001;
                positions.setY(i, y + drift);
            }
            positions.needsUpdate = true;
        }

        // Visibility based on altitude
        const visibility = Math.min(1, Math.max(0, (playerAltitude - 1) / 3));
        this.curtains.forEach(curtain => {
            curtain.visible = visibility > 0.1;
            if (curtain.material.uniforms) {
                curtain.material.uniforms.intensity.value *= visibility;
            }
        });

        if (this.particles) {
            this.particles.visible = visibility > 0.1;
        }
    }
}
