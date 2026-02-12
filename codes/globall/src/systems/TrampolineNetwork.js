/**
 * Trampoline Network System
 * Loads all international airports from IATA database.
 * Renders all ~1200 as dots (one draw call), detailed meshes for nearest ~25.
 * Loads real flight route graph for airport connections.
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
        this.iataIndex = {};             // IATA code → trampoline data

        // Route graph: IATA → Set of connected IATAs
        this.routeGraph = {};
        this.routeCount = 0;

        this.airportDots = null;         // THREE.Points for all airports
        this.detailedPool = [];          // Reusable detailed Groups
        this.assignedAirports = [];      // Airport index per pool slot

        // Route arc rendering
        this.routeArcPool = [];          // Pool of arc Line objects
        this.activeArcs = 0;
        this.ROUTE_ARC_POOL_SIZE = 60;   // Max visible route arcs

        this.connections = [];
        this.highlightedTrampoline = null;

        // LOD update throttle
        this._lastLODTime = 0;
        this._lastLODPos = new THREE.Vector3();

        this.DETAIL_POOL_SIZE = 25;
        this.padScale = 0.5; // Scale factor for detailed pad rings

        // Magnetic field particles
        this.fieldParticles = null;
        this.PARTICLES_PER_PAD = 8;
        this._particlePhases = [];
    }

    async init() {
        await this.loadAirports();
        await this.loadRoutes();
        this.selectHubAirports();
        this.createAirportDots();
        this.createDetailedPool();
        this.createRouteArcPool();
        this.createFieldParticles();
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

            // Build IATA index
            this.trampolines.forEach(t => {
                this.iataIndex[t.airport.name] = t;
            });

            console.log(`Loaded ${this.trampolines.length} airports`);
        } catch (e) {
            console.error('Failed to load airports, using fallback:', e);
            this.createFallbackAirports();
        }
    }

    async loadRoutes() {
        try {
            const response = await fetch('data/routes.json');
            const pairs = await response.json();

            // Build adjacency map
            for (const [a, b] of pairs) {
                if (!this.routeGraph[a]) this.routeGraph[a] = new Set();
                if (!this.routeGraph[b]) this.routeGraph[b] = new Set();
                this.routeGraph[a].add(b);
                this.routeGraph[b].add(a);
            }

            this.routeCount = pairs.length;
            console.log(`Loaded ${pairs.length} route pairs, ${Object.keys(this.routeGraph).length} airports connected`);
        } catch (e) {
            console.warn('Failed to load routes:', e);
        }
    }

    selectHubAirports() {
        // Select ~60 major hub airports for interactive ring display.
        // Uses route-graph degree (most connections = biggest hub).
        // Spatial deduplication: skip airports within 0.4 game units of an already-selected hub.
        const MIN_SPACING = 0.4; // game units — prevents overlapping rings

        // Rank all airports by route connectivity
        const ranked = this.trampolines
            .map((t, idx) => ({
                idx,
                iata: t.airport.name,
                degree: this.routeGraph[t.airport.name]
                    ? this.routeGraph[t.airport.name].size
                    : 0,
                position: t.position
            }))
            .filter(a => a.degree > 0)
            .sort((a, b) => b.degree - a.degree);

        // Greedily select hubs with spatial deduplication
        this.hubIndices = new Set();
        const hubPositions = [];

        for (const airport of ranked) {
            if (this.hubIndices.size >= 60) break;

            // Check distance to all already-selected hubs
            let tooClose = false;
            for (const pos of hubPositions) {
                if (airport.position.distanceTo(pos) < MIN_SPACING) {
                    tooClose = true;
                    break;
                }
            }

            if (!tooClose) {
                this.hubIndices.add(airport.idx);
                hubPositions.push(airport.position);
                this.trampolines[airport.idx].isHub = true;
            }
        }

        console.log(`Selected ${this.hubIndices.size} hub airports from ${this.trampolines.length} total`);
    }

    getConnectedAirports(iataCode) {
        const connected = this.routeGraph[iataCode];
        if (!connected) return [];
        return Array.from(connected)
            .map(code => this.iataIndex[code])
            .filter(Boolean);
    }

    getConnectedHubs(iataCode) {
        // Get connected airports that are also hubs (for graph routing UI)
        const connected = this.routeGraph[iataCode];
        if (!connected) return [];
        return Array.from(connected)
            .map(code => this.iataIndex[code])
            .filter(t => t && t.isHub);
    }

    isHub(iataCode) {
        const t = this.iataIndex[iataCode];
        return t && t.isHub;
    }

    areConnected(iata1, iata2) {
        return this.routeGraph[iata1] && this.routeGraph[iata1].has(iata2);
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

            // Electric blue magnetic dots
            colors[i * 3] = 0.3;
            colors[i * 3 + 1] = 0.6;
            colors[i * 3 + 2] = 1.0;
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
        // Shared geometries — electromagnetic coil design
        // Outer coil ring (main visible ring)
        const outerCoilGeo = new THREE.TorusGeometry(0.3, 0.02, 8, 32);
        const coilMat = new THREE.MeshPhongMaterial({
            color: 0x3388ff,
            emissive: 0x2266dd,
            emissiveIntensity: 0.5,
            shininess: 120
        });
        // Inner coil ring
        const innerCoilGeo = new THREE.TorusGeometry(0.18, 0.015, 8, 24);
        const innerCoilMat = new THREE.MeshPhongMaterial({
            color: 0x6644ff,
            emissive: 0x4422cc,
            emissiveIntensity: 0.6,
            shininess: 120
        });
        // Magnetic core (center energy disc)
        const coreGeo = new THREE.CircleGeometry(0.12, 24);
        const coreMat = new THREE.MeshBasicMaterial({
            color: 0x88aaff,
            transparent: true,
            opacity: 0.6,
            side: THREE.DoubleSide
        });

        // Shared glow texture — electromagnetic blue-white
        const glowCanvas = document.createElement('canvas');
        glowCanvas.width = 64;
        glowCanvas.height = 64;
        const gCtx = glowCanvas.getContext('2d');
        const grad = gCtx.createRadialGradient(32, 32, 0, 32, 32, 32);
        grad.addColorStop(0, 'rgba(130, 180, 255, 0.9)');
        grad.addColorStop(0.25, 'rgba(80, 120, 255, 0.5)');
        grad.addColorStop(0.6, 'rgba(60, 40, 200, 0.2)');
        grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        gCtx.fillStyle = grad;
        gCtx.fillRect(0, 0, 64, 64);
        const glowTexture = new THREE.CanvasTexture(glowCanvas);

        for (let i = 0; i < this.DETAIL_POOL_SIZE; i++) {
            const group = new THREE.Group();

            // Outer coil ring
            group.add(new THREE.Mesh(outerCoilGeo, coilMat));

            // Inner coil ring (slightly above surface — -Z is outward after lookAt)
            const innerRing = new THREE.Mesh(innerCoilGeo, innerCoilMat);
            innerRing.position.z = -0.02;
            group.add(innerRing);

            // Magnetic core disc
            const core = new THREE.Mesh(coreGeo, coreMat);
            core.position.z = -0.03;
            group.add(core);

            // Electromagnetic glow sprite
            const glow = new THREE.Sprite(new THREE.SpriteMaterial({
                map: glowTexture,
                transparent: true,
                blending: THREE.AdditiveBlending
            }));
            glow.scale.set(0.8, 0.8, 1);
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

    createRouteArcPool() {
        // Pre-create a pool of arc line objects for route visualization
        const segments = 24;
        const positions = new Float32Array((segments + 1) * 3);

        for (let i = 0; i < this.ROUTE_ARC_POOL_SIZE; i++) {
            const geometry = new THREE.BufferGeometry();
            geometry.setAttribute('position', new THREE.BufferAttribute(
                new Float32Array((segments + 1) * 3), 3
            ));

            const material = new THREE.LineBasicMaterial({
                color: 0x66aaff,
                transparent: true,
                opacity: 0.5,
                depthWrite: false
            });

            const line = new THREE.Line(geometry, material);
            line.visible = false;
            line.frustumCulled = false;
            this.scene.add(line);
            this.routeArcPool.push(line);
        }
    }

    updateRouteArcs(playerPosition) {
        if (!playerPosition || this.routeCount === 0) return;

        // Find the nearest airport to the player
        const { trampoline: nearest } = this.getNearestTrampoline(playerPosition);
        if (!nearest) return;

        const nearestIata = nearest.airport.name;
        const connected = this.routeGraph[nearestIata];
        if (!connected) {
            // Hide all arcs
            for (let i = 0; i < this.ROUTE_ARC_POOL_SIZE; i++) {
                this.routeArcPool[i].visible = false;
            }
            this.activeArcs = 0;
            return;
        }

        // Get connected airports sorted by distance (show closest routes first)
        const routes = Array.from(connected)
            .map(code => this.iataIndex[code])
            .filter(Boolean)
            .sort((a, b) =>
                a.position.distanceToSquared(playerPosition) -
                b.position.distanceToSquared(playerPosition)
            )
            .slice(0, this.ROUTE_ARC_POOL_SIZE);

        const segments = 24;

        for (let i = 0; i < this.ROUTE_ARC_POOL_SIZE; i++) {
            const line = this.routeArcPool[i];

            if (i < routes.length) {
                const dest = routes[i];
                const startPos = nearest.position;
                const endPos = dest.position;

                // Compute great-circle arc above planet surface
                const posAttr = line.geometry.attributes.position;
                const dist = startPos.distanceTo(endPos);
                const arcHeight = Math.min(dist * 0.15, 1.5);

                const midpoint = startPos.clone().add(endPos).multiplyScalar(0.5);
                midpoint.normalize().multiplyScalar(this.planetRadius + 0.1 + arcHeight);

                for (let s = 0; s <= segments; s++) {
                    const t = s / segments;
                    const p1 = startPos.clone().lerp(midpoint, t);
                    const p2 = midpoint.clone().lerp(endPos, t);
                    const point = p1.lerp(p2, t);
                    posAttr.setXYZ(s, point.x, point.y, point.z);
                }

                posAttr.needsUpdate = true;

                // Fade by distance — nearby routes brighter
                const distToPlayer = dest.position.distanceTo(playerPosition);
                line.material.opacity = Math.max(0.25, 0.7 - distToPlayer * 0.02);
                line.visible = true;
            } else {
                line.visible = false;
            }
        }

        this.activeArcs = routes.length;
    }

    updateLabel(poolIndex, airport) {
        const group = this.detailedPool[poolIndex];
        const labelSprite = group.children.find(c => c.userData && c.userData.isLabel);
        if (!labelSprite) return;

        const canvas = labelSprite.userData.labelCanvas;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // No background pill — just outlined text (eliminates dark rectangle artifact)

        // IATA code
        ctx.font = 'bold 24px Arial';
        ctx.textAlign = 'center';
        ctx.lineWidth = 4;
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
        ctx.miterLimit = 2;
        ctx.strokeText(airport.name, 128, 25);
        ctx.fillStyle = '#77bbff';
        ctx.fillText(airport.name, 128, 25);

        // City
        ctx.font = '14px Arial';
        ctx.lineWidth = 3;
        ctx.strokeText(airport.city, 128, 48);
        ctx.fillStyle = '#ddddff';
        ctx.fillText(airport.city, 128, 48);

        labelSprite.userData.labelTexture.needsUpdate = true;
    }

    updateDetailedDisplay(playerPosition) {
        if (!playerPosition || this.trampolines.length === 0) return;

        // Only show detailed rings for hub airports (top ~60 by connectivity)
        // This prevents dense clusters of overlapping rings
        const nearest = [];
        for (let i = 0; i < this.trampolines.length; i++) {
            if (!this.hubIndices || !this.hubIndices.has(i)) continue;
            const dist = this.trampolines[i].position.distanceToSquared(playerPosition);
            if (nearest.length < this.DETAIL_POOL_SIZE) {
                nearest.push({ index: i, dist });
                if (nearest.length === this.DETAIL_POOL_SIZE) {
                    nearest.sort((a, b) => a.dist - b.dist);
                }
            } else if (dist < nearest[this.DETAIL_POOL_SIZE - 1].dist) {
                nearest[this.DETAIL_POOL_SIZE - 1] = { index: i, dist };
                let j = this.DETAIL_POOL_SIZE - 1;
                while (j > 0 && nearest[j].dist < nearest[j - 1].dist) {
                    [nearest[j], nearest[j - 1]] = [nearest[j - 1], nearest[j]];
                    j--;
                }
            }
        }

        // Assign pool slots — fade by distance to reduce visual noise
        for (let slot = 0; slot < this.DETAIL_POOL_SIZE && slot < nearest.length; slot++) {
            const airportIdx = nearest[slot].index;
            const dist = Math.sqrt(nearest[slot].dist);
            const group = this.detailedPool[slot];
            const trampoline = this.trampolines[airportIdx];

            if (this.assignedAirports[slot] !== airportIdx) {
                this.assignedAirports[slot] = airportIdx;

                // Reposition — lookAt(origin) makes local +Z face center,
                // so XY plane = tangent to sphere. Torus sits flat. No rotateX.
                group.position.copy(trampoline.position);
                group.lookAt(new THREE.Vector3(0, 0, 0));
                group.scale.setScalar(this.padScale);

                // Update label
                this.updateLabel(slot, trampoline.airport);

                // Link data
                group.userData.trampoline = trampoline;
            }

            // Distance-based fade: full opacity within 3 units, fade 3-8, hidden beyond 8
            const fadeFar = 8;
            const fadeNear = 3;
            const alpha = dist < fadeNear ? 1.0 : dist > fadeFar ? 0.0 : 1.0 - (dist - fadeNear) / (fadeFar - fadeNear);
            group.visible = alpha > 0.01;

            // Apply fade to children materials
            if (group.visible) {
                group.children.forEach(child => {
                    if (child.material && child.material.opacity !== undefined) {
                        child.material._baseOpacity = child.material._baseOpacity ?? child.material.opacity;
                        child.material.opacity = child.material._baseOpacity * alpha;
                    }
                });
            }
        }

        // Hide unused slots
        for (let slot = nearest.length; slot < this.DETAIL_POOL_SIZE; slot++) {
            this.detailedPool[slot].visible = false;
        }

        // Update raycasting list
        this.trampolineMeshes = this.detailedPool.filter(g => g.visible);
    }

    createFieldParticles() {
        // Magnetic field line particles — float above nearby airport pads
        const total = this.DETAIL_POOL_SIZE * this.PARTICLES_PER_PAD;
        const positions = new Float32Array(total * 3);
        const colors = new Float32Array(total * 3);
        const sizes = new Float32Array(total);

        for (let i = 0; i < total; i++) {
            // Initialize offscreen
            positions[i * 3] = 0;
            positions[i * 3 + 1] = -999;
            positions[i * 3 + 2] = 0;
            // Blue-white color with variation
            const b = 0.7 + Math.random() * 0.3;
            colors[i * 3] = 0.4 * b;
            colors[i * 3 + 1] = 0.6 * b;
            colors[i * 3 + 2] = 1.0 * b;
            sizes[i] = 0.03 + Math.random() * 0.03;
            // Random phase for each particle's oscillation
            this._particlePhases.push(Math.random() * Math.PI * 2);
        }

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

        const material = new THREE.PointsMaterial({
            size: 0.04,
            vertexColors: true,
            transparent: true,
            opacity: 0.6,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            sizeAttenuation: true
        });

        this.fieldParticles = new THREE.Points(geometry, material);
        this.scene.add(this.fieldParticles);
    }

    updateFieldParticles(time) {
        if (!this.fieldParticles) return;
        const posAttr = this.fieldParticles.geometry.attributes.position;
        const arr = posAttr.array;

        for (let slot = 0; slot < this.DETAIL_POOL_SIZE; slot++) {
            const group = this.detailedPool[slot];
            const baseIdx = slot * this.PARTICLES_PER_PAD;

            for (let p = 0; p < this.PARTICLES_PER_PAD; p++) {
                const idx = (baseIdx + p) * 3;
                if (!group.visible || !group.userData.trampoline) {
                    arr[idx + 1] = -999;
                    continue;
                }

                const tramp = group.userData.trampoline;
                const normal = tramp.normal;
                const phase = this._particlePhases[baseIdx + p];

                // Particle rises along the field line (normal direction) then resets
                const cycle = ((time * 0.8 + phase) % 1.5); // 0-1.5s cycle
                const height = cycle * 0.6; // 0 to 0.9 units above pad
                const fade = cycle < 0.3 ? cycle / 0.3 : (1.5 - cycle) / 1.2; // fade in/out

                // Slight spiral offset
                const angle = time * 2 + phase * 6.28;
                const spiralR = 0.08 + height * 0.06;

                // Get tangent vectors for offset
                const ref = Math.abs(normal.y) < 0.95
                    ? new THREE.Vector3(0, 1, 0)
                    : new THREE.Vector3(1, 0, 0);
                const tangent1 = new THREE.Vector3().crossVectors(normal, ref).normalize();
                const tangent2 = new THREE.Vector3().crossVectors(normal, tangent1);

                arr[idx] = tramp.position.x + normal.x * height
                    + tangent1.x * Math.cos(angle) * spiralR
                    + tangent2.x * Math.sin(angle) * spiralR;
                arr[idx + 1] = tramp.position.y + normal.y * height
                    + tangent1.y * Math.cos(angle) * spiralR
                    + tangent2.y * Math.sin(angle) * spiralR;
                arr[idx + 2] = tramp.position.z + normal.z * height
                    + tangent1.z * Math.cos(angle) * spiralR
                    + tangent2.z * Math.sin(angle) * spiralR;
            }
        }

        posAttr.needsUpdate = true;
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
            mesh.scale.setScalar(this.padScale * 1.2);
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
            mesh.scale.setScalar(this.padScale);
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
                this.updateRouteArcs(playerPosition);
                this._lastLODPos.copy(playerPosition);
                this._lastLODTime = time;

                // Fade airport dot cloud by player altitude — less clutter when close to surface
                if (this.airportDots) {
                    const alt = playerPosition.length() - this.planetRadius;
                    // Near surface (<2): dots very subtle; in space (>8): full brightness
                    const dotAlpha = Math.min(0.9, Math.max(0.15, (alt - 2) * 0.12));
                    this.airportDots.material.opacity = dotAlpha;
                }
            }
        }

        // Animate visible magnetic pads
        this.detailedPool.forEach(mesh => {
            if (!mesh.visible) return;
            mesh.children.forEach((child, idx) => {
                if (child.isSprite && !child.userData.isLabel) {
                    child.material.rotation = time * 0.5;
                    child.material.opacity = 0.6 + Math.sin(time * 2 + idx) * 0.2;
                }
                if (idx === 1 && child.isMesh) {
                    child.rotation.z = time * 1.5;
                }
                if (idx === 2 && child.isMesh && child.material.opacity !== undefined) {
                    child.material.opacity = 0.4 + Math.sin(time * 3) * 0.2;
                }
            });
        });

        // Update magnetic field particles
        this.updateFieldParticles(time);
    }
}
