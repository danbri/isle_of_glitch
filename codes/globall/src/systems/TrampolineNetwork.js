/**
 * Trampoline Network System
 * Creates the global network of trampolines for bouncing between locations
 */

import * as THREE from 'three';

export class TrampolineNetwork {
    constructor(scene, planet) {
        this.scene = scene;
        this.planet = planet;
        this.trampolines = [];
        this.trampolineMeshes = [];
        this.connections = [];
        this.highlightedTrampoline = null;
        this.planetRadius = 10;
    }

    async init() {
        this.createTrampolineNodes();
        this.createConnections();
    }

    createTrampolineNodes() {
        // Create trampolines at major airport locations
        // 20 airports spread across all continents for good gameplay coverage.
        // Avoid clusters: max ~2 per region so they're visually distinct on the globe.
        const airports = [
            // North America (3)
            { name: 'JFK', city: 'New York', lat: 40.6413, lon: -73.7781 },
            { name: 'LAX', city: 'Los Angeles', lat: 33.9416, lon: -118.4085 },
            { name: 'MEX', city: 'Mexico City', lat: 19.4361, lon: -99.0719 },
            // Europe (3) — spread: west, central, east
            { name: 'LHR', city: 'London', lat: 51.4700, lon: -0.4543 },
            { name: 'ATH', city: 'Athens', lat: 37.9364, lon: 23.9445 },
            { name: 'SVO', city: 'Moscow', lat: 55.9726, lon: 37.4146 },
            // Middle East / Central Asia (1)
            { name: 'DXB', city: 'Dubai', lat: 25.2532, lon: 55.3657 },
            // South Asia (1)
            { name: 'DEL', city: 'Delhi', lat: 28.5562, lon: 77.1000 },
            // Southeast Asia (2)
            { name: 'BKK', city: 'Bangkok', lat: 13.6900, lon: 100.7501 },
            { name: 'SIN', city: 'Singapore', lat: 1.3644, lon: 103.9915 },
            // East Asia (2) — spread: north and south
            { name: 'PEK', city: 'Beijing', lat: 40.0799, lon: 116.6031 },
            { name: 'NRT', city: 'Tokyo', lat: 35.7720, lon: 140.3929 },
            // Oceania (2)
            { name: 'SYD', city: 'Sydney', lat: -33.9399, lon: 151.1753 },
            { name: 'AKL', city: 'Auckland', lat: -37.0082, lon: 174.7850 },
            // Africa (2)
            { name: 'CPT', city: 'Cape Town', lat: -33.9715, lon: 18.6021 },
            { name: 'NBO', city: 'Nairobi', lat: -1.3192, lon: 36.9278 },
            // South America (2)
            { name: 'GRU', city: 'São Paulo', lat: -23.4356, lon: -46.4731 },
            { name: 'SCL', city: 'Santiago', lat: -33.3930, lon: -70.7858 },
            // Caribbean / Central (1)
            { name: 'HAV', city: 'Havana', lat: 22.9892, lon: -82.4091 },
            // North / Arctic (1)
            { name: 'KEF', city: 'Reykjavik', lat: 63.9850, lon: -22.6056 },
        ];

        airports.forEach((airport, index) => {
            const trampoline = this.createTrampoline(airport, index);
            this.trampolines.push(trampoline);
        });
    }

    createTrampoline(airport, index) {
        const position = this.latLonToPosition(airport.lat, airport.lon, this.planetRadius + 0.05);
        const normal = position.clone().normalize();

        const group = new THREE.Group();

        // Trampoline base ring
        const ringGeometry = new THREE.TorusGeometry(0.3, 0.03, 16, 32);
        const ringMaterial = new THREE.MeshPhongMaterial({
            color: 0xff66aa,
            emissive: 0xff3377,
            emissiveIntensity: 0.3,
            shininess: 100
        });
        const ring = new THREE.Mesh(ringGeometry, ringMaterial);
        group.add(ring);

        // Trampoline surface (bouncy part)
        const surfaceGeometry = new THREE.CircleGeometry(0.28, 32);
        const surfaceMaterial = new THREE.MeshPhongMaterial({
            color: 0x66ddff,
            emissive: 0x33aadd,
            emissiveIntensity: 0.2,
            transparent: true,
            opacity: 0.8,
            side: THREE.DoubleSide
        });
        const surface = new THREE.Mesh(surfaceGeometry, surfaceMaterial);
        surface.position.y = 0.01;
        group.add(surface);

        // Energy rings (animated)
        for (let i = 0; i < 3; i++) {
            const energyRingGeometry = new THREE.RingGeometry(0.32 + i * 0.05, 0.34 + i * 0.05, 32);
            const energyRingMaterial = new THREE.MeshBasicMaterial({
                color: new THREE.Color().setHSL((index * 0.1 + i * 0.1) % 1, 0.8, 0.6),
                transparent: true,
                opacity: 0.5 - i * 0.1,
                side: THREE.DoubleSide
            });
            const energyRing = new THREE.Mesh(energyRingGeometry, energyRingMaterial);
            energyRing.position.y = 0.02;
            energyRing.userData.baseScale = 1;
            energyRing.userData.pulseOffset = i * 0.3;
            group.add(energyRing);
        }

        // Glow sprite
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 128;
        const ctx = canvas.getContext('2d');

        const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
        gradient.addColorStop(0, 'rgba(102, 221, 255, 0.8)');
        gradient.addColorStop(0.3, 'rgba(255, 102, 170, 0.4)');
        gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 128, 128);

        const glowTexture = new THREE.CanvasTexture(canvas);
        const glowMaterial = new THREE.SpriteMaterial({
            map: glowTexture,
            transparent: true,
            blending: THREE.AdditiveBlending
        });
        const glow = new THREE.Sprite(glowMaterial);
        glow.scale.set(1, 1, 1);
        glow.position.y = 0.1;
        group.add(glow);

        // Name label — large, bright, always-facing-camera sprite
        const labelCanvas = document.createElement('canvas');
        labelCanvas.width = 512;
        labelCanvas.height = 128;
        const labelCtx = labelCanvas.getContext('2d');

        // Semi-transparent dark background with glow border
        labelCtx.fillStyle = 'rgba(10, 5, 25, 0.75)';
        if (labelCtx.roundRect) {
            labelCtx.beginPath();
            labelCtx.roundRect(8, 8, 496, 112, 16);
            labelCtx.fill();
            // Glow border
            labelCtx.strokeStyle = 'rgba(255, 102, 170, 0.6)';
            labelCtx.lineWidth = 2;
            labelCtx.beginPath();
            labelCtx.roundRect(8, 8, 496, 112, 16);
            labelCtx.stroke();
        } else {
            labelCtx.fillRect(8, 8, 496, 112);
        }

        // IATA code — large, bold, candy pink with dark outline for contrast
        labelCtx.font = 'bold 48px Arial';
        labelCtx.textAlign = 'center';
        labelCtx.lineWidth = 5;
        labelCtx.strokeStyle = '#000000';
        labelCtx.miterLimit = 2;
        labelCtx.strokeText(airport.name, 256, 55);
        labelCtx.fillStyle = '#ff77bb';
        labelCtx.fillText(airport.name, 256, 55);

        // City name — smaller, white with dark outline
        labelCtx.font = '28px Arial';
        labelCtx.lineWidth = 3;
        labelCtx.strokeText(airport.city, 256, 95);
        labelCtx.fillStyle = '#ddddff';
        labelCtx.fillText(airport.city, 256, 95);

        const labelTexture = new THREE.CanvasTexture(labelCanvas);
        const labelMaterial = new THREE.SpriteMaterial({
            map: labelTexture,
            transparent: true,
            depthTest: true,
            sizeAttenuation: true
        });
        const label = new THREE.Sprite(labelMaterial);
        label.scale.set(2.0, 0.5, 1);
        label.position.y = 0.8;
        label.renderOrder = 10;
        label.userData.isLabel = true;
        group.add(label);

        // Position and orient
        group.position.copy(position);
        group.lookAt(new THREE.Vector3(0, 0, 0));
        group.rotateX(Math.PI / 2);

        // Store metadata
        group.userData.trampoline = {
            airport: airport,
            position: position.clone(),
            normal: normal,
            index: index,
            bounceForce: 15 + Math.random() * 5,
            connections: []
        };

        this.trampolineMeshes.push(group);
        this.scene.add(group);

        return group.userData.trampoline;
    }

    createConnections() {
        // Create visible connection lines between nearby trampolines
        const maxConnectionDistance = 8;

        for (let i = 0; i < this.trampolines.length; i++) {
            for (let j = i + 1; j < this.trampolines.length; j++) {
                const t1 = this.trampolines[i];
                const t2 = this.trampolines[j];

                const distance = t1.position.distanceTo(t2.position);

                if (distance < maxConnectionDistance) {
                    t1.connections.push(t2);
                    t2.connections.push(t1);

                    // Create arc connection
                    const connection = this.createArcConnection(t1.position, t2.position);
                    this.connections.push(connection);
                    this.scene.add(connection);
                }
            }
        }
    }

    createArcConnection(start, end) {
        const points = [];
        const segments = 32;

        // Calculate arc through space above planet
        const midpoint = start.clone().add(end).multiplyScalar(0.5);
        const arcHeight = start.distanceTo(end) * 0.3;
        midpoint.normalize().multiplyScalar(this.planetRadius + arcHeight + 0.5);

        for (let i = 0; i <= segments; i++) {
            const t = i / segments;

            // Quadratic bezier curve
            const p1 = start.clone().lerp(midpoint, t);
            const p2 = midpoint.clone().lerp(end, t);
            const point = p1.lerp(p2, t);

            points.push(point);
        }

        const geometry = new THREE.BufferGeometry().setFromPoints(points);

        // Gradient material
        const colors = [];
        for (let i = 0; i <= segments; i++) {
            const t = i / segments;
            const color = new THREE.Color().setHSL(0.85 + t * 0.15, 0.7, 0.5);
            colors.push(color.r, color.g, color.b);
        }
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

        const material = new THREE.LineBasicMaterial({
            vertexColors: true,
            transparent: true,
            opacity: 0.3,
            linewidth: 1
        });

        const line = new THREE.Line(geometry, material);
        line.userData.isConnection = true;

        return line;
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

        // Find the mesh for this trampoline
        const mesh = this.trampolineMeshes.find(
            m => m.userData.trampoline === trampoline
        );

        if (mesh) {
            // Scale up slightly
            mesh.scale.setScalar(1.2);

            // Increase emission
            mesh.children.forEach(child => {
                if (child.material && child.material.emissiveIntensity !== undefined) {
                    child.material.emissiveIntensity = 0.6;
                }
            });
        }
    }

    clearHighlights() {
        this.highlightedTrampoline = null;

        this.trampolineMeshes.forEach(mesh => {
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

        this.trampolines.forEach(trampoline => {
            const distance = trampoline.position.distanceTo(position);
            if (distance < nearestDistance) {
                nearestDistance = distance;
                nearest = trampoline;
            }
        });

        return { trampoline: nearest, distance: nearestDistance };
    }

    update(time, deltaTime) {
        // Animate trampolines
        this.trampolineMeshes.forEach((mesh, index) => {
            // Pulse energy rings
            mesh.children.forEach(child => {
                if (child.userData.pulseOffset !== undefined) {
                    const scale = 1 + Math.sin(time * 3 + child.userData.pulseOffset) * 0.1;
                    child.scale.setScalar(scale);
                }

                // Rotate glow
                if (child.isSprite && !child.userData.isLabel) {
                    child.material.rotation = time * 0.5;
                }
            });

            // Subtle bounce animation
            const bounce = Math.sin(time * 2 + index * 0.5) * 0.01;
            mesh.position.copy(this.trampolines[index].position);
            mesh.position.add(
                this.trampolines[index].normal.clone().multiplyScalar(bounce)
            );
        });

        // Animate connection lines
        this.connections.forEach((connection, index) => {
            if (connection.material) {
                // Pulse opacity
                const pulse = Math.sin(time * 2 + index * 0.3) * 0.1 + 0.3;
                connection.material.opacity = pulse;
            }
        });
    }
}
