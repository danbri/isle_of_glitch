/**
 * Country Outlines
 * Renders country/continent borders on the globe from GeoJSON data.
 * Uses LineSegments for efficient single-draw-call rendering.
 */

import * as THREE from 'three';

export class CountryOutlines {
    constructor(scene) {
        this.scene = scene;
        this.planetRadius = 10;
        this.outlines = null;
    }

    async init() {
        try {
            const response = await fetch('data/countries.geo.json');
            const geojson = await response.json();
            this.createOutlines(geojson);
            console.log(`Country outlines: ${geojson.features.length} countries`);
        } catch (e) {
            console.warn('Failed to load country outlines:', e);
        }
    }

    createOutlines(geojson) {
        const vertices = [];
        const radius = this.planetRadius + 0.02; // Slightly above surface

        geojson.features.forEach(feature => {
            const geometry = feature.geometry;
            if (!geometry) return;

            const polygons = geometry.type === 'Polygon'
                ? [geometry.coordinates]
                : geometry.coordinates; // MultiPolygon

            polygons.forEach(polygon => {
                polygon.forEach(ring => {
                    for (let i = 0; i < ring.length - 1; i++) {
                        const [lon1, lat1] = ring[i];
                        const [lon2, lat2] = ring[i + 1];

                        // Skip segments that cross the antimeridian (wrapping artifacts)
                        if (Math.abs(lon2 - lon1) > 90) continue;

                        const p1 = this.latLonToVec3(lat1, lon1, radius);
                        const p2 = this.latLonToVec3(lat2, lon2, radius);

                        vertices.push(p1.x, p1.y, p1.z);
                        vertices.push(p2.x, p2.y, p2.z);
                    }
                });
            });
        });

        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));

        const material = new THREE.LineBasicMaterial({
            color: 0x5599bb,
            transparent: true,
            opacity: 0.35,
            depthWrite: false
        });

        this.outlines = new THREE.LineSegments(geo, material);
        this.scene.add(this.outlines);
    }

    latLonToVec3(lat, lon, radius) {
        const phi = (90 - lat) * (Math.PI / 180);
        const theta = (lon + 180) * (Math.PI / 180);

        return new THREE.Vector3(
            -radius * Math.sin(phi) * Math.cos(theta),
            radius * Math.cos(phi),
            radius * Math.sin(phi) * Math.sin(theta)
        );
    }
}
