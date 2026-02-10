/**
 * Trampoline Network System
 * Loads all international airports from IATA database.
 * Renders all ~7900 as dots (one draw call), detailed meshes for nearest ~25.
 */

import * as THREE from 'three';

export class TrampolineNetwork {
    constructor(scene, planet) {
        this.scene = scene;
        this.planet = planet;
        this.planetRadius = 10;

        // All airports (from data file)
        this.trampolines = [];
        this.trampolineMeshes = [];      // Active detailed meshes (raycasting)

        this.airportDots = null;         // THREE.Points for all airports
        this.detailedPool = [];          // Reusable detailed Groups
        this.assignedAirports = [];      // Airport index per pool slot

        this.connections = [];
        this.highlightedTrampoline = null;

        // LOD update throttle
        this._lastLODTime = 0;
        this._lastLODPos = new THREE.Vector3();

        this.DETAIL_POOL_SIZE = 25;
    }

    async init() {
        await this.loadAirports();
        this.createAirportDots();
        this.createDetailedPool();
    }

    async loadAirports() {
        try {
            const response = await fetch('data/airports.json');
            const raw = await response.json();

            // Format: [[iata, city, country, lat, lon], ...]
            this.trampolines = raw.map((a, index) => {
                const pos = this.latLonToPosition(a[3], a[4], this.planetRadius + 0.05);
                return {
                    airport: { name: a[0], city: a[1], country: a[2] },
                    position: pos,
                    normal: pos.clone().normalize(),
                    index: index,
                    bounceForce: 15 + Math.random() * 5,
                    connections: []
                };
            });

            console.log(`Loaded ${this.trampolines.length} airports`);
        } catch (e) {
            console.error('Failed to load airports, using fallback:', e);
            this.createFallbackAirports();
        }
    }

    createFallbackAirports() {
        const airports = [
            { name: 'JFK', city: 'New York', lat: 40.6413, lon: -73.7781 },
            { name: 'LAX', city: 'Los Angeles', lat: 33.9416, lon: -118.4085 },
            { name: 'LHR', city: 'London', lat: 51.4700, lon: -0.4543 },
            { name: 'CDG', city: 'Paris', lat: 49.0097, lon: 2.5479 },
            { name: 'NRT', city: 'Tokyo', lat: 35.7720, lon: 140.3929 },
            { name: 'SYD', city: 'Sydney', lat: -33.9399, lon: 151.1753 },
            { name: 'DXB', city: 'Dubai', lat: 25.2532, lon: 55.3657 },
            { name: 'SIN', city: 'Singapore', lat: 1.3644, lon: 103.9915 },
            { name: 'HKG', city: 'Hong Kong', lat: 22.3080, lon: 113.9185 },
            { name: 'FRA', city: 'Frankfurt', lat: 50.0379, lon: 8.5622 },
            { name: 'AMS', city: 'Amsterdam', lat: 52.3105, lon: 4.7683 },
            { name: 'ICN', city: 'Seoul', lat: 37.4602, lon: 126.4407 },
            { name: 'PEK', city: 'Beijing', lat: 40.0799, lon: 116.6031 },
            { name: 'GRU', city: 'São Paulo', lat: -23.4356, lon: -46.4731 },
            { name: 'DEL', city: 'Delhi', lat: 28.5562, lon: 77.1000 },
            { name: 'BOM', city: 'Mumbai', lat: 19.0896, lon: 72.8656 },
            { name: 'YYZ', city: 'Toronto', lat: 43.6777, lon: -79.6248 },
            { name: 'MEX', city: 'Mexico City', lat: 19.4361, lon: -99.0719 },
            { name: 'CPT', city: 'Cape Town', lat: -33.9715, lon: 18.6021 },
            { name: 'SVO', city: 'Moscow', lat: 55.9726, lon: 37.4146 },
        ];

        this.trampolines = airports.map((a, index) => {
            const pos = this.latLonToPosition(a.lat, a.lon, this.planetRadius + 0.05);
            return {
                airport: { name: a.name, city: a.city, country: '' },
                position: pos,
                normal: pos.clone().normalize(),
                index: index,
                bounceForce: 15 + Math.random() * 5,
                connections: []
            };
        });
    }

    createAirportDots() {
        const count = this.trampolines.length;
        const positions = new Float32Array(count * 3);
        const colors = new Float32Array(count * 3);

        for (let i = 0; i < count; i++) {
            const p = this.trampolines[i].position;
            positions[i * 3] = p.x;
            positions[i * 3 + 1] = p.y;
            positions[i * 3 + 2] = p.z;

            // Candy pink dots
            colors[i * 3] = 1.0;
            colors[i * 3 + 1] = 0.4;
            colors[i * 3 + 2] = 0.7;
        }

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

        const material = new THREE.PointsMaterial({
            size: 0.06,
            vertexColors: true,
            sizeAttenuation: true,
            transparent: true,
            opacity: 0.9
        });

        this.airportDots = new THREE.Points(geometry, material);
        this.scene.add(this.airportDots);
    }

    createDetailedPool() {
        // Shared geometries
        const ringGeo = new THREE.TorusGeometry(0.25, 0.025, 8, 24);
        const ringMat = new THREE.MeshPhongMaterial({
            color: 0xff66aa,
            emissive: 0xff3377,
            emissiveIntensity: 0.3,
            shininess: 100
        });
        const surfGeo = new THREE.CircleGeometry(0.23, 24);
        const surfMat = new THREE.MeshPhongMaterial({
            color: 0x66ddff,
            emissive: 0x33aadd,
            emissiveIntensity: 0.2,
            transparent: true,
            opacity: 0.8,
            side: THREE.DoubleSide
        });

        // Shared glow texture
        const glowCanvas = document.createElement('canvas');
        glowCanvas.width = 64;
        glowCanvas.height = 64;
        const gCtx = glowCanvas.getContext('2d');
        const grad = gCtx.createRadialGradient(32, 32, 0, 32, 32, 32);
        grad.addColorStop(0, 'rgba(102, 221, 255, 0.8)');
        grad.addColorStop(0.3, 'rgba(255, 102, 170, 0.4)');
        grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        gCtx.fillStyle = grad;
        gCtx.fillRect(0, 0, 64, 64);
        const glowTexture = new THREE.CanvasTexture(glowCanvas);

        for (let i = 0; i < this.DETAIL_POOL_SIZE; i++) {
            const group = new THREE.Group();

            // Ring
            group.add(new THREE.Mesh(ringGeo, ringMat));

            // Bounce surface
            const surf = new THREE.Mesh(surfGeo, surfMat);
            surf.position.y = 0.01;
            group.add(surf);

            // Glow sprite
            const glow = new THREE.Sprite(new THREE.SpriteMaterial({
                map: glowTexture,
                transparent: true,
                blending: THREE.AdditiveBlending
            }));
            glow.scale.set(0.7, 0.7, 1);
            glow.position.y = 0.1;
            group.add(glow);

            // Label sprite with its own canvas
            const labelCanvas = document.createElement('canvas');
            labelCanvas.width = 256;
            labelCanvas.height = 64;
            const labelTexture = new THREE.CanvasTexture(labelCanvas);
            const labelSprite = new THREE.Sprite(new THREE.SpriteMaterial({
                map: labelTexture,
                transparent: true,
                depthTest: true,
                sizeAttenuation: true
            }));
            labelSprite.scale.set(1.5, 0.4, 1);
            labelSprite.position.y = 0.65;
            labelSprite.renderOrder = 10;
            labelSprite.userData.isLabel = true;
            labelSprite.userData.labelCanvas = labelCanvas;
            labelSprite.userData.labelTexture = labelTexture;
            group.add(labelSprite);

            group.visible = false;
            group.userData.trampoline = null;
            group.userData.poolIndex = i;

            this.scene.add(group);
            this.detailedPool.push(group);
            this.assignedAirports.push(-1);
        }
    }

    updateLabel(poolIndex, airport) {
        const group = this.detailedPool[poolIndex];
        const labelSprite = group.children.find(c => c.userData && c.userData.isLabel);
        if (!labelSprite) return;

        const canvas = labelSprite.userData.labelCanvas;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Background pill
        ctx.fillStyle = 'rgba(10, 5, 25, 0.75)';
        if (ctx.roundRect) {
            ctx.beginPath();
            ctx.roundRect(4, 4, 248, 56, 10);
            ctx.fill();
        } else {
            ctx.fillRect(4, 4, 248, 56);
        }

        // IATA code
        ctx.font = 'bold 24px Arial';
        ctx.textAlign = 'center';
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#000';
        ctx.miterLimit = 2;
        ctx.strokeText(airport.name, 128, 25);
        ctx.fillStyle = '#ff77bb';
        ctx.fillText(airport.name, 128, 25);

        // City
        ctx.font = '14px Arial';
        ctx.lineWidth = 2;
        ctx.strokeText(airport.city, 128, 48);
        ctx.fillStyle = '#ddddff';
        ctx.fillText(airport.city, 128, 48);

        labelSprite.userData.labelTexture.needsUpdate = true;
    }

    updateDetailedDisplay(playerPosition) {
        if (!playerPosition || this.trampolines.length === 0) return;

        // Find nearest N airports by distance squared
        const nearest = [];
        for (let i = 0; i < this.trampolines.length; i++) {
            const dist = this.trampolines[i].position.distanceToSquared(playerPosition);
            if (nearest.length < this.DETAIL_POOL_SIZE) {
                nearest.push({ index: i, dist });
                if (nearest.length === this.DETAIL_POOL_SIZE) {
                    nearest.sort((a, b) => a.dist - b.dist);
                }
            } else if (dist < nearest[this.DETAIL_POOL_SIZE - 1].dist) {
                nearest[this.DETAIL_POOL_SIZE - 1] = { index: i, dist };
                // Insertion sort for the last element
                let j = this.DETAIL_POOL_SIZE - 1;
                while (j > 0 && nearest[j].dist < nearest[j - 1].dist) {
                    [nearest[j], nearest[j - 1]] = [nearest[j - 1], nearest[j]];
                    j--;
                }
            }
        }

        // Assign pool slots
        for (let slot = 0; slot < this.DETAIL_POOL_SIZE && slot < nearest.length; slot++) {
            const airportIdx = nearest[slot].index;
            const group = this.detailedPool[slot];
            const trampoline = this.trampolines[airportIdx];

            if (this.assignedAirports[slot] !== airportIdx) {
                this.assignedAirports[slot] = airportIdx;

                // Reposition
                group.position.copy(trampoline.position);
                group.lookAt(new THREE.Vector3(0, 0, 0));
                group.rotateX(Math.PI / 2);

                // Update label
                this.updateLabel(slot, trampoline.airport);

                // Link data
                group.userData.trampoline = trampoline;
            }

            group.visible = true;
        }

        // Hide unused slots
        for (let slot = nearest.length; slot < this.DETAIL_POOL_SIZE; slot++) {
            this.detailedPool[slot].visible = false;
        }

        // Update raycasting list
        this.trampolineMeshes = this.detailedPool.filter(g => g.visible);
    }

    latLonToPosition(lat, lon, radius) {
        const phi = (90 - lat) * (Math.PI / 180);
        const theta = (lon + 180) * (Math.PI / 180);

        const x = -radius * Math.sin(phi) * Math.cos(theta);
        const y = radius * Math.cos(phi);
        const z = radius * Math.sin(phi) * Math.sin(theta);

        return new THREE.Vector3(x, y, z);
    }

    getTrampolineMeshes() {
        return this.trampolineMeshes;
    }

    highlightTrampoline(trampoline) {
        this.highlightedTrampoline = trampoline;

        const mesh = this.detailedPool.find(
            m => m.userData.trampoline === trampoline
        );

        if (mesh) {
            mesh.scale.setScalar(1.2);
            mesh.children.forEach(child => {
                if (child.material && child.material.emissiveIntensity !== undefined) {
                    child.material.emissiveIntensity = 0.6;
                }
            });
        }
    }

    clearHighlights() {
        this.highlightedTrampoline = null;

        this.detailedPool.forEach(mesh => {
            mesh.scale.setScalar(1);
            mesh.children.forEach(child => {
                if (child.material && child.material.emissiveIntensity !== undefined) {
                    child.material.emissiveIntensity = 0.3;
                }
            });
        });
    }

    getNearestTrampoline(position) {
        let nearest = null;
        let nearestDistance = Infinity;

        for (const trampoline of this.trampolines) {
            const distance = trampoline.position.distanceTo(position);
            if (distance < nearestDistance) {
                nearestDistance = distance;
                nearest = trampoline;
            }
        }

        return { trampoline: nearest, distance: nearestDistance };
    }

    update(time, deltaTime, playerPosition) {
        // Update LOD every ~0.5 seconds or when player moves significantly
        if (playerPosition) {
            const moved = this._lastLODPos.distanceToSquared(playerPosition) > 0.25;
            if (time - this._lastLODTime > 0.5 || moved) {
                this.updateDetailedDisplay(playerPosition);
                this._lastLODPos.copy(playerPosition);
                this._lastLODTime = time;
            }
        }

        // Animate visible detailed trampolines
        this.detailedPool.forEach(mesh => {
            if (!mesh.visible) return;
            mesh.children.forEach(child => {
                if (child.isSprite && !child.userData.isLabel) {
                    child.material.rotation = time * 0.5;
                }
            });
        });
    }
}
