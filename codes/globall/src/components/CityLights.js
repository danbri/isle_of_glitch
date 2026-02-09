/**
 * City Lights Component
 * Creates procedural city lights and street outlines inspired by OpenStreetMap
 */

import * as THREE from 'three';

export class CityLights {
    constructor(scene, planet) {
        this.scene = scene;
        this.planet = planet;
        this.cityMeshes = [];
        this.streetMeshes = [];
        this.planetRadius = 10;
    }

    async init() {
        await this.createMajorCities();
        this.createStreetGrids();
    }

    async createMajorCities() {
        // Major world cities with approximate coordinates
        const cities = [
            { name: 'Tokyo', lat: 35.6762, lon: 139.6503, population: 37400000, color: 0xff6699 },
            { name: 'Delhi', lat: 28.7041, lon: 77.1025, population: 30290000, color: 0xffaa66 },
            { name: 'Shanghai', lat: 31.2304, lon: 121.4737, population: 27058000, color: 0xff9966 },
            { name: 'São Paulo', lat: -23.5505, lon: -46.6333, population: 22043000, color: 0x66ff99 },
            { name: 'Mexico City', lat: 19.4326, lon: -99.1332, population: 21782000, color: 0xffff66 },
            { name: 'Cairo', lat: 30.0444, lon: 31.2357, population: 20901000, color: 0xffcc66 },
            { name: 'Mumbai', lat: 19.0760, lon: 72.8777, population: 20411000, color: 0xff66aa },
            { name: 'Beijing', lat: 39.9042, lon: 116.4074, population: 20384000, color: 0xff8866 },
            { name: 'New York', lat: 40.7128, lon: -74.0060, population: 18819000, color: 0x66aaff },
            { name: 'London', lat: 51.5074, lon: -0.1278, population: 9046000, color: 0x99ff66 },
            { name: 'Paris', lat: 48.8566, lon: 2.3522, population: 11020000, color: 0xffaacc },
            { name: 'Los Angeles', lat: 34.0522, lon: -118.2437, population: 12459000, color: 0xff66cc },
            { name: 'Sydney', lat: -33.8688, lon: 151.2093, population: 5312000, color: 0x66ffcc },
            { name: 'Dubai', lat: 25.2048, lon: 55.2708, population: 3331000, color: 0xffdd66 },
            { name: 'Singapore', lat: 1.3521, lon: 103.8198, population: 5686000, color: 0xff99aa },
            { name: 'Hong Kong', lat: 22.3193, lon: 114.1694, population: 7500000, color: 0xffaa88 },
            { name: 'Moscow', lat: 55.7558, lon: 37.6173, population: 12538000, color: 0x88aaff },
            { name: 'Berlin', lat: 52.5200, lon: 13.4050, population: 3645000, color: 0xaaff88 },
            { name: 'Toronto', lat: 43.6532, lon: -79.3832, population: 6197000, color: 0x88ffaa },
            { name: 'Seoul', lat: 37.5665, lon: 126.9780, population: 9776000, color: 0xff88aa },
        ];

        cities.forEach(city => {
            const cityMesh = this.createCityMesh(city);
            this.cityMeshes.push(cityMesh);
            this.scene.add(cityMesh);
        });

        // Add random smaller cities
        for (let i = 0; i < 100; i++) {
            const smallCity = {
                name: `City_${i}`,
                lat: (Math.random() - 0.5) * 140, // Avoid extreme poles
                lon: Math.random() * 360 - 180,
                population: 100000 + Math.random() * 2000000,
                color: new THREE.Color().setHSL(Math.random(), 0.7, 0.6).getHex()
            };
            const cityMesh = this.createCityMesh(smallCity);
            this.cityMeshes.push(cityMesh);
            this.scene.add(cityMesh);
        }
    }

    createCityMesh(city) {
        const group = new THREE.Group();

        // Calculate 3D position
        const position = this.latLonToPosition(city.lat, city.lon, this.planetRadius + 0.01);

        // City size based on population
        const baseSize = Math.pow(city.population / 1000000, 0.4) * 0.05;

        // Create glowing city point
        const glowGeometry = new THREE.SphereGeometry(baseSize, 16, 16);
        const glowMaterial = new THREE.MeshBasicMaterial({
            color: city.color,
            transparent: true,
            opacity: 0.8
        });
        const glow = new THREE.Mesh(glowGeometry, glowMaterial);
        group.add(glow);

        // Create outer glow
        const outerGlowGeometry = new THREE.SphereGeometry(baseSize * 2, 16, 16);
        const outerGlowMaterial = new THREE.MeshBasicMaterial({
            color: city.color,
            transparent: true,
            opacity: 0.3,
            side: THREE.BackSide
        });
        const outerGlow = new THREE.Mesh(outerGlowGeometry, outerGlowMaterial);
        group.add(outerGlow);

        // Create sprite for distance visibility
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');

        const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
        const color = new THREE.Color(city.color);
        gradient.addColorStop(0, `rgba(${color.r * 255}, ${color.g * 255}, ${color.b * 255}, 1)`);
        gradient.addColorStop(0.3, `rgba(${color.r * 255}, ${color.g * 255}, ${color.b * 255}, 0.5)`);
        gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');

        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 64, 64);

        const spriteTexture = new THREE.CanvasTexture(canvas);
        const spriteMaterial = new THREE.SpriteMaterial({
            map: spriteTexture,
            transparent: true,
            blending: THREE.AdditiveBlending
        });

        const sprite = new THREE.Sprite(spriteMaterial);
        sprite.scale.set(baseSize * 4, baseSize * 4, 1);
        group.add(sprite);

        group.position.copy(position);
        group.userData.city = city;
        group.userData.baseSize = baseSize;

        return group;
    }

    createStreetGrids() {
        // Create procedural street grids for major urban areas
        const gridCount = 30;

        for (let i = 0; i < gridCount; i++) {
            const lat = (Math.random() - 0.5) * 120;
            const lon = Math.random() * 360 - 180;
            const gridSize = 0.3 + Math.random() * 0.5;

            const streetGrid = this.createStreetGrid(lat, lon, gridSize);
            this.streetMeshes.push(streetGrid);
            this.scene.add(streetGrid);
        }
    }

    createStreetGrid(lat, lon, size) {
        const group = new THREE.Group();

        // Create a grid pattern
        const gridResolution = 8;
        const lineWidth = 0.002;

        // Candy colors for streets
        const streetColors = [0xff6699, 0x66ff99, 0x6699ff, 0xffff66, 0xff99ff];
        const color = streetColors[Math.floor(Math.random() * streetColors.length)];

        const material = new THREE.LineBasicMaterial({
            color: color,
            transparent: true,
            opacity: 0.6
        });

        // Horizontal lines
        for (let i = 0; i <= gridResolution; i++) {
            const points = [];
            const offsetLat = (i / gridResolution - 0.5) * size;

            for (let j = 0; j <= gridResolution * 2; j++) {
                const offsetLon = (j / (gridResolution * 2) - 0.5) * size;
                const pos = this.latLonToPosition(
                    lat + offsetLat,
                    lon + offsetLon,
                    this.planetRadius + 0.012
                );
                points.push(pos);
            }

            const geometry = new THREE.BufferGeometry().setFromPoints(points);
            const line = new THREE.Line(geometry, material);
            group.add(line);
        }

        // Vertical lines
        for (let i = 0; i <= gridResolution; i++) {
            const points = [];
            const offsetLon = (i / gridResolution - 0.5) * size;

            for (let j = 0; j <= gridResolution * 2; j++) {
                const offsetLat = (j / (gridResolution * 2) - 0.5) * size;
                const pos = this.latLonToPosition(
                    lat + offsetLat,
                    lon + offsetLon,
                    this.planetRadius + 0.012
                );
                points.push(pos);
            }

            const geometry = new THREE.BufferGeometry().setFromPoints(points);
            const line = new THREE.Line(geometry, material);
            group.add(line);
        }

        // Add some diagonal avenues for variety
        if (Math.random() > 0.5) {
            const diagonalPoints = [];
            for (let i = 0; i <= gridResolution; i++) {
                const t = i / gridResolution;
                const pos = this.latLonToPosition(
                    lat + (t - 0.5) * size,
                    lon + (t - 0.5) * size,
                    this.planetRadius + 0.012
                );
                diagonalPoints.push(pos);
            }
            const diagGeometry = new THREE.BufferGeometry().setFromPoints(diagonalPoints);
            const diagLine = new THREE.Line(diagGeometry, material);
            group.add(diagLine);
        }

        group.userData.lat = lat;
        group.userData.lon = lon;

        return group;
    }

    latLonToPosition(lat, lon, radius) {
        const phi = (90 - lat) * (Math.PI / 180);
        const theta = (lon + 180) * (Math.PI / 180);

        const x = -radius * Math.sin(phi) * Math.cos(theta);
        const y = radius * Math.cos(phi);
        const z = radius * Math.sin(phi) * Math.sin(theta);

        return new THREE.Vector3(x, y, z);
    }

    update(time, deltaTime, camera) {
        // Calculate sun direction for day/night
        const sunDirection = new THREE.Vector3(1, 0.3, 0.5).normalize();

        // Update city lights - brighter on dark side
        this.cityMeshes.forEach(cityGroup => {
            const position = cityGroup.position.clone().normalize();
            const sunFacing = position.dot(sunDirection);

            // City lights visible on dark side
            const nightIntensity = Math.max(0, -sunFacing + 0.2);
            const baseOpacity = 0.3 + nightIntensity * 0.7;

            // Pulse effect
            const pulse = Math.sin(time * 2 + cityGroup.position.x) * 0.1 + 0.9;

            cityGroup.children.forEach(child => {
                if (child.material) {
                    child.material.opacity = baseOpacity * pulse;
                }
            });

            // Scale based on camera distance for LOD
            const distance = camera.position.distanceTo(cityGroup.position);
            const scale = Math.min(2, Math.max(0.5, 30 / distance));
            const baseSize = cityGroup.userData.baseSize || 0.1;
            cityGroup.scale.setScalar(scale);
        });

        // Street grids visibility based on camera distance
        this.streetMeshes.forEach(streetGroup => {
            const pos = this.latLonToPosition(
                streetGroup.userData.lat,
                streetGroup.userData.lon,
                this.planetRadius
            );
            const distance = camera.position.distanceTo(pos);

            // Only show when close
            streetGroup.visible = distance < 8;

            if (streetGroup.visible) {
                // Fade based on distance
                const opacity = Math.max(0, 1 - distance / 8);
                streetGroup.children.forEach(child => {
                    if (child.material) {
                        child.material.opacity = opacity * 0.6;
                    }
                });
            }
        });
    }
}
