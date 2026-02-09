/**
 * Planet Component
 * Creates a beautiful Earth-like planet with procedural textures and atmosphere
 */

import * as THREE from 'three';
import { PlanetSurfaceShader } from '../shaders/PlanetSurface.js';
import { AtmosphereGlowMaterial } from '../shaders/AtmosphericScattering.js';

export class Planet {
    constructor(scene) {
        this.scene = scene;
        this.radius = 10;
        this.atmosphereRadius = 10.5;
        this.group = new THREE.Group();
        this.sunDirection = new THREE.Vector3(1, 0.3, 0.5).normalize();
    }

    async init() {
        await this.createPlanetSphere();
        this.createAtmosphere();
        this.createClouds();
        this.scene.add(this.group);
    }

    async createPlanetSphere() {
        // Create procedural textures
        const dayTexture = this.generateDayTexture();
        const nightTexture = this.generateNightTexture();
        const cityLightsTexture = this.generateCityLightsTexture();
        const cloudsTexture = this.generateCloudsTexture();
        const bumpTexture = this.generateBumpTexture();

        // Planet geometry
        const geometry = new THREE.SphereGeometry(this.radius, 128, 128);

        // Custom shader material
        const material = new THREE.ShaderMaterial({
            uniforms: {
                time: { value: 0 },
                sunDirection: { value: this.sunDirection },
                dayTexture: { value: dayTexture },
                nightTexture: { value: nightTexture },
                cityLightsTexture: { value: cityLightsTexture },
                cloudsTexture: { value: cloudsTexture },
                bumpMap: { value: bumpTexture },
                bumpScale: { value: 0.05 },
                cloudOpacity: { value: 0.4 },
                atmosphereColor: { value: new THREE.Color(0.4, 0.7, 1.0) }
            },
            vertexShader: PlanetSurfaceShader.vertexShader,
            fragmentShader: PlanetSurfaceShader.fragmentShader
        });

        this.planetMesh = new THREE.Mesh(geometry, material);
        this.planetMesh.receiveShadow = true;
        this.group.add(this.planetMesh);
    }

    generateDayTexture() {
        const size = 2048;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size / 2;
        const ctx = canvas.getContext('2d');

        // Ocean base
        const oceanGradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
        oceanGradient.addColorStop(0, '#1a3a5c');
        oceanGradient.addColorStop(0.5, '#2d5a7b');
        oceanGradient.addColorStop(1, '#1a4a6c');
        ctx.fillStyle = oceanGradient;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Generate continents with candy colors
        const continentColors = [
            '#4a7c59', // Green
            '#6b8e5f', // Light green
            '#8fbc8f', // Dark sea green
            '#98d8aa', // Mint
            '#c9b458', // Desert
            '#e8d5b7', // Sand
        ];

        // Draw procedural continents
        for (let i = 0; i < 8; i++) {
            this.drawContinent(ctx, canvas.width, canvas.height, continentColors);
        }

        // Add some mountain ranges
        ctx.strokeStyle = '#5d4e3a';
        ctx.lineWidth = 2;
        for (let i = 0; i < 20; i++) {
            const x = Math.random() * canvas.width;
            const y = Math.random() * canvas.height;
            this.drawMountainRange(ctx, x, y, 50 + Math.random() * 100);
        }

        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.ClampToEdgeWrapping;
        return texture;
    }

    drawContinent(ctx, width, height, colors) {
        const centerX = Math.random() * width;
        const centerY = Math.random() * height;
        const baseRadius = 50 + Math.random() * 200;

        ctx.beginPath();
        const points = 50;
        for (let i = 0; i <= points; i++) {
            const angle = (i / points) * Math.PI * 2;
            const noise = Math.sin(angle * 5) * 20 + Math.cos(angle * 3) * 30 + Math.random() * 20;
            const r = baseRadius + noise;
            const x = centerX + Math.cos(angle) * r;
            const y = centerY + Math.sin(angle) * r;

            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        }
        ctx.closePath();

        // Gradient fill
        const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, baseRadius);
        gradient.addColorStop(0, colors[Math.floor(Math.random() * colors.length)]);
        gradient.addColorStop(1, colors[Math.floor(Math.random() * colors.length)]);
        ctx.fillStyle = gradient;
        ctx.fill();
    }

    drawMountainRange(ctx, startX, startY, length) {
        ctx.beginPath();
        ctx.moveTo(startX, startY);

        let x = startX;
        let y = startY;
        const direction = Math.random() * Math.PI * 2;

        for (let i = 0; i < length; i += 5) {
            x += Math.cos(direction + Math.sin(i * 0.1) * 0.5) * 5;
            y += Math.sin(direction + Math.cos(i * 0.1) * 0.5) * 5;
            ctx.lineTo(x, y);
        }
        ctx.stroke();
    }

    generateNightTexture() {
        const size = 2048;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size / 2;
        const ctx = canvas.getContext('2d');

        // Dark ocean
        ctx.fillStyle = '#0a0a15';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Dark land masses
        for (let i = 0; i < 8; i++) {
            this.drawDarkContinent(ctx, canvas.width, canvas.height);
        }

        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.ClampToEdgeWrapping;
        return texture;
    }

    drawDarkContinent(ctx, width, height) {
        const centerX = Math.random() * width;
        const centerY = Math.random() * height;
        const baseRadius = 50 + Math.random() * 200;

        ctx.beginPath();
        const points = 50;
        for (let i = 0; i <= points; i++) {
            const angle = (i / points) * Math.PI * 2;
            const noise = Math.sin(angle * 5) * 20 + Math.cos(angle * 3) * 30 + Math.random() * 20;
            const r = baseRadius + noise;
            const x = centerX + Math.cos(angle) * r;
            const y = centerY + Math.sin(angle) * r;

            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        }
        ctx.closePath();
        ctx.fillStyle = '#151520';
        ctx.fill();
    }

    generateCityLightsTexture() {
        const size = 2048;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size / 2;
        const ctx = canvas.getContext('2d');

        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Major city clusters
        const cities = [
            // North America
            { x: 0.15, y: 0.35, size: 40 },  // NYC
            { x: 0.08, y: 0.38, size: 35 },  // LA
            { x: 0.12, y: 0.4, size: 25 },   // Chicago

            // Europe
            { x: 0.48, y: 0.32, size: 50 },  // London/Paris cluster
            { x: 0.52, y: 0.35, size: 30 },  // Berlin

            // Asia
            { x: 0.78, y: 0.38, size: 60 },  // Tokyo
            { x: 0.72, y: 0.42, size: 55 },  // Shanghai
            { x: 0.68, y: 0.5, size: 45 },   // Singapore
            { x: 0.62, y: 0.45, size: 40 },  // Mumbai

            // South America
            { x: 0.22, y: 0.65, size: 35 },  // São Paulo

            // Australia
            { x: 0.85, y: 0.7, size: 25 },   // Sydney
        ];

        cities.forEach(city => {
            this.drawCityLights(ctx, city.x * canvas.width, city.y * canvas.height, city.size);
        });

        // Scattered smaller cities
        for (let i = 0; i < 200; i++) {
            const x = Math.random() * canvas.width;
            const y = Math.random() * canvas.height;
            this.drawCityLights(ctx, x, y, 5 + Math.random() * 15);
        }

        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.ClampToEdgeWrapping;
        return texture;
    }

    drawCityLights(ctx, x, y, size) {
        // Cluster of light points
        const numLights = Math.floor(size * size / 10);

        for (let i = 0; i < numLights; i++) {
            const angle = Math.random() * Math.PI * 2;
            const dist = Math.random() * size;
            const lx = x + Math.cos(angle) * dist;
            const ly = y + Math.sin(angle) * dist;
            const lightSize = 1 + Math.random() * 2;

            // Candy-colored city lights
            const colors = ['#ffdd88', '#ff9966', '#ff77aa', '#77ddff', '#aaffaa'];
            ctx.fillStyle = colors[Math.floor(Math.random() * colors.length)];
            ctx.beginPath();
            ctx.arc(lx, ly, lightSize, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    generateCloudsTexture() {
        const size = 1024;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size / 2;
        const ctx = canvas.getContext('2d');

        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Generate cloud patterns
        for (let i = 0; i < 100; i++) {
            const x = Math.random() * canvas.width;
            const y = Math.random() * canvas.height;
            const cloudSize = 20 + Math.random() * 100;
            this.drawCloud(ctx, x, y, cloudSize);
        }

        // Soften with blur effect (simulate via multiple overlapping circles)
        ctx.filter = 'blur(5px)';
        ctx.drawImage(canvas, 0, 0);
        ctx.filter = 'none';

        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.ClampToEdgeWrapping;
        return texture;
    }

    drawCloud(ctx, x, y, size) {
        const gradient = ctx.createRadialGradient(x, y, 0, x, y, size);
        gradient.addColorStop(0, 'rgba(255, 255, 255, 0.8)');
        gradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.3)');
        gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.fill();

        // Add some puffs
        for (let i = 0; i < 5; i++) {
            const px = x + (Math.random() - 0.5) * size;
            const py = y + (Math.random() - 0.5) * size * 0.5;
            const ps = size * (0.3 + Math.random() * 0.5);

            const pGradient = ctx.createRadialGradient(px, py, 0, px, py, ps);
            pGradient.addColorStop(0, 'rgba(255, 255, 255, 0.5)');
            pGradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

            ctx.fillStyle = pGradient;
            ctx.beginPath();
            ctx.arc(px, py, ps, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    generateBumpTexture() {
        const size = 1024;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size / 2;
        const ctx = canvas.getContext('2d');

        // Create height map with perlin-like noise
        const imageData = ctx.createImageData(canvas.width, canvas.height);

        for (let y = 0; y < canvas.height; y++) {
            for (let x = 0; x < canvas.width; x++) {
                const i = (y * canvas.width + x) * 4;

                // Simple multi-octave noise
                let value = 0;
                let amplitude = 1;
                let frequency = 0.01;

                for (let octave = 0; octave < 4; octave++) {
                    value += Math.sin(x * frequency) * Math.cos(y * frequency) * amplitude;
                    amplitude *= 0.5;
                    frequency *= 2;
                }

                value = (value + 1) * 0.5 * 255;

                imageData.data[i] = value;
                imageData.data[i + 1] = value;
                imageData.data[i + 2] = value;
                imageData.data[i + 3] = 255;
            }
        }

        ctx.putImageData(imageData, 0, 0);

        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.ClampToEdgeWrapping;
        return texture;
    }

    createAtmosphere() {
        // Outer atmosphere glow
        const geometry = new THREE.SphereGeometry(this.atmosphereRadius, 64, 64);

        const material = new THREE.ShaderMaterial({
            uniforms: {
                time: { value: 0 },
                sunDirection: { value: this.sunDirection },
                glowColor: { value: new THREE.Color(0.4, 0.7, 1.0) },
                glowIntensity: { value: 1.5 },
                viewVector: { value: new THREE.Vector3() }
            },
            vertexShader: AtmosphereGlowMaterial.vertexShader,
            fragmentShader: AtmosphereGlowMaterial.fragmentShader,
            side: THREE.BackSide,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });

        this.atmosphereMesh = new THREE.Mesh(geometry, material);
        this.group.add(this.atmosphereMesh);
    }

    createClouds() {
        const geometry = new THREE.SphereGeometry(this.radius + 0.05, 64, 64);
        const cloudTexture = this.generateCloudsTexture();

        const material = new THREE.MeshPhongMaterial({
            map: cloudTexture,
            transparent: true,
            opacity: 0.4,
            depthWrite: false,
            blending: THREE.AdditiveBlending
        });

        this.cloudsMesh = new THREE.Mesh(geometry, material);
        this.group.add(this.cloudsMesh);
    }

    update(time, deltaTime) {
        // Rotate planet slowly
        this.planetMesh.rotation.y += deltaTime * 0.02;

        // Rotate clouds slightly faster
        if (this.cloudsMesh) {
            this.cloudsMesh.rotation.y += deltaTime * 0.025;
        }

        // Update shader uniforms
        if (this.planetMesh.material.uniforms) {
            this.planetMesh.material.uniforms.time.value = time;
        }

        if (this.atmosphereMesh.material.uniforms) {
            this.atmosphereMesh.material.uniforms.time.value = time;
        }
    }

    getSurfacePosition(lat, lon) {
        // Convert lat/lon to 3D position on sphere
        const phi = (90 - lat) * (Math.PI / 180);
        const theta = (lon + 180) * (Math.PI / 180);

        const x = -this.radius * Math.sin(phi) * Math.cos(theta);
        const y = this.radius * Math.cos(phi);
        const z = this.radius * Math.sin(phi) * Math.sin(theta);

        return new THREE.Vector3(x, y, z);
    }

    getNormalAtPosition(position) {
        return position.clone().normalize();
    }

    getRadius() {
        return this.radius;
    }
}
