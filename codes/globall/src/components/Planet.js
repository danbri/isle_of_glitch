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
        this.createLatLonGrid();
        this.createMagneticField();
        this.scene.add(this.group);
    }

    async createPlanetSphere() {
        // Start with procedural texture immediately (no CDN wait),
        // then load NASA Blue Marble in background and swap when ready.
        // This prevents the game from ever blocking on CDN or showing
        // a broken procedural fallback permanently.
        let dayTexture = this.generateDayTexture();

        // Kick off async texture load — will swap in when ready
        this.loadEarthTextureInBackground();

        const nightTexture = this.generateNightTexture();
        const cityLightsTexture = this.generateCityLightsTexture();
        const cloudsTexture = this.generateCloudsTexture();
        const bumpTexture = this.generateBumpTexture();

        // Planet geometry
        const geometry = new THREE.SphereGeometry(this.radius, 128, 128);

        // Custom shader material — opaque, writes depth
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
            fragmentShader: PlanetSurfaceShader.fragmentShader,
            depthWrite: true,
            depthTest: true,
            side: THREE.FrontSide
        });

        this.planetMesh = new THREE.Mesh(geometry, material);
        this.planetMesh.receiveShadow = true;
        this.group.add(this.planetMesh);
    }

    loadEarthTextureInBackground() {
        // Load NASA Blue Marble in background with retry.
        // When it loads, swap into the planet material uniform.
        // Game starts immediately with procedural — this just upgrades it.
        // Local bundled copy tried first (no CDN dependency), CDN as fallback.
        const urls = [
            './assets/earth-blue-marble.jpg',
            'https://unpkg.com/three-globe@2.31.0/example/img/earth-blue-marble.jpg',
            'https://cdn.jsdelivr.net/npm/three-globe@2.31.0/example/img/earth-blue-marble.jpg',
        ];

        const loader = new THREE.TextureLoader();
        loader.setCrossOrigin('anonymous');

        let attempt = 0;
        const maxAttempts = 3; // Retry up to 3 times through all URLs

        const tryLoad = () => {
            let idx = 0;
            const tryNext = () => {
                if (idx >= urls.length) {
                    attempt++;
                    if (attempt < maxAttempts) {
                        // Retry after exponential backoff
                        const delay = Math.pow(2, attempt) * 2000; // 4s, 8s
                        console.warn(`Earth texture attempt ${attempt} failed, retrying in ${delay/1000}s...`);
                        setTimeout(tryLoad, delay);
                    } else {
                        console.warn('Earth texture: all attempts exhausted, staying with procedural');
                    }
                    return;
                }
                loader.load(
                    urls[idx],
                    (texture) => {
                        texture.wrapS = THREE.RepeatWrapping;
                        texture.wrapT = THREE.ClampToEdgeWrapping;
                        texture.colorSpace = THREE.SRGBColorSpace;
                        // Swap into the planet material
                        if (this.planetMesh && this.planetMesh.material.uniforms) {
                            this.planetMesh.material.uniforms.dayTexture.value = texture;
                            this.planetMesh.material.needsUpdate = true;
                            console.log('Blue Marble texture loaded and swapped in');
                        }
                    },
                    undefined,
                    () => { idx++; tryNext(); }
                );
            };
            tryNext();
        };

        tryLoad();
    }

    generateDayTexture() {
        const width = 2048;
        const height = 1024;
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        const imageData = ctx.createImageData(width, height);

        // Deterministic smooth noise
        const hash = (x, y) => {
            const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
            return n - Math.floor(n);
        };
        const smoothNoise = (x, y) => {
            const ix = Math.floor(x), iy = Math.floor(y);
            const fx = x - ix, fy = y - iy;
            const sx = fx * fx * (3 - 2 * fx);
            const sy = fy * fy * (3 - 2 * fy);
            return hash(ix, iy) * (1-sx) * (1-sy) + hash(ix+1, iy) * sx * (1-sy)
                 + hash(ix, iy+1) * (1-sx) * sy + hash(ix+1, iy+1) * sx * sy;
        };
        const fbm = (x, y, oct = 5) => {
            let v = 0, a = 0.5, f = 1;
            for (let i = 0; i < oct; i++) { v += smoothNoise(x*f, y*f)*a; a *= 0.5; f *= 2; }
            return v;
        };

        // Earth continent zones: [lon, lat, radiusX, radiusY]
        const landZones = [
            // Africa
            { lon: 18, lat: 5, rx: 18, ry: 32 },
            { lon: 35, lat: 5, rx: 10, ry: 10 },
            { lon: 47, lat: -20, rx: 3, ry: 6 },
            // Europe
            { lon: 10, lat: 48, rx: 22, ry: 10 },
            { lon: 25, lat: 60, rx: 12, ry: 7 },
            { lon: -5, lat: 54, rx: 4, ry: 5 },
            { lon: -8, lat: 40, rx: 6, ry: 5 },
            { lon: 15, lat: 42, rx: 4, ry: 7 },
            // Asia
            { lon: 65, lat: 55, rx: 50, ry: 18 },
            { lon: 100, lat: 35, rx: 28, ry: 18 },
            { lon: 78, lat: 22, rx: 10, ry: 14 },
            { lon: 103, lat: 15, rx: 8, ry: 10 },
            { lon: 138, lat: 37, rx: 3, ry: 9 },
            { lon: 127, lat: 37, rx: 3, ry: 3 },
            { lon: 50, lat: 25, rx: 10, ry: 8 },
            { lon: 115, lat: -5, rx: 15, ry: 5 },
            // North America
            { lon: -100, lat: 52, rx: 32, ry: 18 },
            { lon: -95, lat: 32, rx: 18, ry: 10 },
            { lon: -103, lat: 23, rx: 8, ry: 7 },
            { lon: -85, lat: 14, rx: 4, ry: 4 },
            { lon: -45, lat: 72, rx: 12, ry: 9 },
            { lon: -65, lat: 50, rx: 12, ry: 6 },
            { lon: -73, lat: 62, rx: 15, ry: 8 },
            // South America
            { lon: -55, lat: -3, rx: 14, ry: 10 },
            { lon: -50, lat: -15, rx: 14, ry: 14 },
            { lon: -65, lat: -28, rx: 10, ry: 8 },
            { lon: -71, lat: -40, rx: 5, ry: 14 },
            // Australia & NZ
            { lon: 134, lat: -25, rx: 20, ry: 14 },
            { lon: 172, lat: -42, rx: 3, ry: 5 },
            // Antarctica
            { lon: 0, lat: -83, rx: 180, ry: 8 },
        ];

        // Mountain ranges: [lon, lat, spread, intensity]
        const mountains = [
            { lon: 85, lat: 30, rx: 12, ry: 4 },     // Himalayas
            { lon: -70, lat: -15, rx: 4, ry: 30 },    // Andes
            { lon: -115, lat: 42, rx: 5, ry: 18 },    // Rockies
            { lon: 10, lat: 46, rx: 6, ry: 2 },       // Alps
            { lon: 35, lat: 0, rx: 3, ry: 15 },       // East African Rift
            { lon: 60, lat: 55, rx: 3, ry: 15 },      // Urals
            { lon: 100, lat: 30, rx: 8, ry: 5 },      // Tibetan Plateau
            { lon: 148, lat: -35, rx: 3, ry: 8 },     // Australian Great Dividing Range
            { lon: 170, lat: -43, rx: 2, ry: 5 },     // Southern Alps NZ
        ];

        // Cache land mask for night texture reuse
        this._landMask = new Float32Array(width * height);

        for (let py = 0; py < height; py++) {
            for (let px = 0; px < width; px++) {
                const lon = (px / width) * 360 - 180;
                const lat = 90 - (py / height) * 180;
                const absLat = Math.abs(lat);

                // Compute land influence
                let landVal = 0;
                for (const z of landZones) {
                    let dlon = lon - z.lon;
                    if (dlon > 180) dlon -= 360;
                    if (dlon < -180) dlon += 360;
                    const dx = dlon / z.rx;
                    const dy = (lat - z.lat) / z.ry;
                    const d = Math.sqrt(dx * dx + dy * dy);
                    landVal = Math.max(landVal, 1 - d);
                }

                // Noise perturbation for natural coastlines
                const coastNoise = fbm(lon * 0.04 + 100, lat * 0.04 + 100) * 0.35 - 0.15;
                const isLand = (landVal + coastNoise) > 0.12;

                this._landMask[py * width + px] = isLand ? landVal : 0;

                // Mountain influence
                let mountainVal = 0;
                if (isLand) {
                    for (const m of mountains) {
                        let dlon = lon - m.lon;
                        if (dlon > 180) dlon -= 360;
                        if (dlon < -180) dlon += 360;
                        const dx = dlon / m.rx;
                        const dy = (lat - m.lat) / m.ry;
                        const d = Math.sqrt(dx * dx + dy * dy);
                        mountainVal = Math.max(mountainVal, Math.max(0, 1 - d));
                    }
                    mountainVal *= (0.7 + fbm(lon * 0.1, lat * 0.1) * 0.6);
                }

                const i = (py * width + px) * 4;
                let r, g, b;

                // Polar UV distortion fix: at extreme latitudes, reduce noise
                // detail to hide equirectangular stretching artifacts
                const polarFade = absLat > 75 ? Math.min(1, (absLat - 75) / 10) : 0;

                if (!isLand) {
                    // Ocean — rich deep blue with depth variation
                    const depth = fbm(lon * 0.02 + 50, lat * 0.02 + 50) * (1 - polarFade);
                    const nearCoast = Math.max(0, landVal + coastNoise + 0.1);
                    const shallowMix = Math.min(1, nearCoast * 8);
                    // Deep ocean — darker, richer blue
                    const dr = 8 + depth * 15;
                    const dg = 25 + depth * 25;
                    const db = 80 + depth * 55;
                    // Shallow turquoise near coast
                    const sr = 30 + depth * 25;
                    const sg = 130 + depth * 40;
                    const sb = 150 + depth * 30;
                    r = dr + (sr - dr) * shallowMix;
                    g = dg + (sg - dg) * shallowMix;
                    b = db + (sb - db) * shallowMix;
                    // At extreme poles, blend toward icy ocean
                    if (polarFade > 0) {
                        r = r + (180 - r) * polarFade;
                        g = g + (200 - g) * polarFade;
                        b = b + (220 - b) * polarFade;
                    }
                } else if (mountainVal > 0.4) {
                    // Mountains — grey-brown with snow caps
                    const snow = absLat > 35 || mountainVal > 0.7 ? 1 : 0;
                    const rockNoise = fbm(lon * 0.2, lat * 0.2) * 0.3 * (1 - polarFade);
                    if (snow && (absLat > 55 || mountainVal > 0.8)) {
                        r = 225 + rockNoise * 25;
                        g = 230 + rockNoise * 20;
                        b = 240 + rockNoise * 10;
                    } else {
                        r = 110 + rockNoise * 40 + mountainVal * 30;
                        g = 95 + rockNoise * 30 + mountainVal * 20;
                        b = 80 + rockNoise * 30 + mountainVal * 15;
                    }
                } else {
                    // Land biomes based on latitude
                    const biomeNoise = fbm(lon * 0.06 + 200, lat * 0.06 + 200) * 0.4 * (1 - polarFade);
                    const detail = fbm(lon * 0.15, lat * 0.15) * 0.15 * (1 - polarFade);

                    if (absLat > 72) {
                        // Ice caps — uniform white to hide pole distortion
                        r = 225; g = 235; b = 245;
                    } else if (absLat > 58) {
                        // Tundra/boreal — muted sage
                        r = 75 + detail * 30; g = 105 + detail * 30; b = 70 + detail * 20;
                    } else if (absLat > 38) {
                        // Temperate forest — rich greens
                        r = 40 + detail * 25; g = 115 + detail * 55 + biomeNoise * 30; b = 45 + detail * 15;
                    } else if (absLat > 18) {
                        // Desert / grassland belt
                        const desertFactor = fbm(lon * 0.03 + 300, lat * 0.03);
                        // Known desert regions (Sahara, Arabia, Australian outback, Gobi)
                        const inDesertBelt = (lon > -20 && lon < 60 && lat > 15 && lat < 35)
                            || (lon > 40 && lon < 60 && lat > 15 && lat < 30)
                            || (lon > 120 && lon < 150 && lat < -18 && lat > -30)
                            || (lon > 90 && lon < 115 && lat > 35 && lat < 48);
                        if (inDesertBelt && desertFactor > 0.3) {
                            // Desert — warm sand/golden, more saturated
                            r = 200 + detail * 40 + biomeNoise * 20;
                            g = 165 + detail * 30 + biomeNoise * 15;
                            b = 90 + detail * 20;
                        } else {
                            // Grassland/savanna — olive-green
                            r = 100 + detail * 30 + biomeNoise * 20;
                            g = 140 + detail * 35 + biomeNoise * 20;
                            b = 55 + detail * 15;
                        }
                    } else {
                        // Tropical — vivid jungle greens
                        r = 15 + detail * 20 + biomeNoise * 10;
                        g = 90 + detail * 50 + biomeNoise * 35;
                        b = 25 + detail * 10;
                    }
                }

                // Clamp
                imageData.data[i] = Math.max(0, Math.min(255, r));
                imageData.data[i + 1] = Math.max(0, Math.min(255, g));
                imageData.data[i + 2] = Math.max(0, Math.min(255, b));
                imageData.data[i + 3] = 255;
            }
        }

        ctx.putImageData(imageData, 0, 0);

        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.ClampToEdgeWrapping;
        return texture;
    }

    generateNightTexture() {
        const width = 2048;
        const height = 1024;
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        const imageData = ctx.createImageData(width, height);

        for (let py = 0; py < height; py++) {
            for (let px = 0; px < width; px++) {
                const i = (py * width + px) * 4;
                const landVal = this._landMask ? this._landMask[py * width + px] : 0;

                if (landVal > 0) {
                    // Dark land
                    imageData.data[i] = 12;
                    imageData.data[i + 1] = 12;
                    imageData.data[i + 2] = 18;
                } else {
                    // Dark ocean — slight blue tint
                    imageData.data[i] = 5;
                    imageData.data[i + 1] = 5;
                    imageData.data[i + 2] = 12;
                }
                imageData.data[i + 3] = 255;
            }
        }

        ctx.putImageData(imageData, 0, 0);

        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.ClampToEdgeWrapping;
        return texture;
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
        // Use land mask from day texture at bump map resolution
        const width = 1024;
        const height = 512;
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        const imageData = ctx.createImageData(width, height);

        const hash = (x, y) => {
            const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
            return n - Math.floor(n);
        };
        const smoothNoise = (x, y) => {
            const ix = Math.floor(x), iy = Math.floor(y);
            const fx = x - ix, fy = y - iy;
            const sx = fx * fx * (3 - 2 * fx);
            const sy = fy * fy * (3 - 2 * fy);
            return hash(ix, iy) * (1-sx) * (1-sy) + hash(ix+1, iy) * sx * (1-sy)
                 + hash(ix, iy+1) * (1-sx) * sy + hash(ix+1, iy+1) * sx * sy;
        };
        const fbm = (x, y) => {
            let v = 0, a = 0.5, f = 1;
            for (let i = 0; i < 4; i++) { v += smoothNoise(x*f, y*f)*a; a *= 0.5; f *= 2; }
            return v;
        };

        for (let py = 0; py < height; py++) {
            for (let px = 0; px < width; px++) {
                // Sample land mask from higher-res day texture
                const maskX = Math.floor(px / width * 2048);
                const maskY = Math.floor(py / height * 1024);
                const landVal = this._landMask ? this._landMask[maskY * 2048 + maskX] : 0;

                const lon = (px / width) * 360 - 180;
                const lat = 90 - (py / height) * 180;

                let elevation;
                if (landVal > 0) {
                    // Land: base elevation + terrain noise
                    const terrain = fbm(lon * 0.08, lat * 0.08);
                    elevation = 0.4 + landVal * 0.2 + terrain * 0.3;
                } else {
                    // Ocean: flat with subtle variation
                    elevation = 0.15 + fbm(lon * 0.03 + 50, lat * 0.03 + 50) * 0.1;
                }

                const v = Math.max(0, Math.min(255, elevation * 255));
                const i = (py * width + px) * 4;
                imageData.data[i] = v;
                imageData.data[i + 1] = v;
                imageData.data[i + 2] = v;
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
        // Inner atmosphere glow (visible from inside/close - BackSide)
        const geometry = new THREE.SphereGeometry(this.atmosphereRadius, 64, 64);

        const material = new THREE.ShaderMaterial({
            uniforms: {
                time: { value: 0 },
                sunDirection: { value: this.sunDirection },
                glowColor: { value: new THREE.Color(0.3, 0.5, 0.8) },
                glowIntensity: { value: 0.35 }
            },
            vertexShader: AtmosphereGlowMaterial.vertexShader,
            fragmentShader: AtmosphereGlowMaterial.fragmentShader,
            side: THREE.BackSide,
            transparent: true,
            blending: THREE.NormalBlending,
            depthWrite: false
        });

        this.atmosphereMesh = new THREE.Mesh(geometry, material);
        this.group.add(this.atmosphereMesh);

        // Outer atmosphere glow (visible from space - FrontSide)
        // This ensures planet has visible glow when viewed from high altitude
        const outerGeometry = new THREE.SphereGeometry(this.atmosphereRadius + 0.3, 64, 64);
        const outerMaterial = new THREE.ShaderMaterial({
            uniforms: {
                time: { value: 0 },
                sunDirection: { value: this.sunDirection },
                glowColor: { value: new THREE.Color(0.4, 0.6, 1.0) },
                glowIntensity: { value: 0.25 }
            },
            vertexShader: AtmosphereGlowMaterial.vertexShader,
            fragmentShader: AtmosphereGlowMaterial.fragmentShader,
            side: THREE.FrontSide, // Visible from outside
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });

        this.outerAtmosphereMesh = new THREE.Mesh(outerGeometry, outerMaterial);
        this.group.add(this.outerAtmosphereMesh);
    }

    createClouds() {
        const geometry = new THREE.SphereGeometry(this.radius + 0.05, 64, 64);
        const cloudTexture = this.generateCloudsTexture();

        const material = new THREE.MeshPhongMaterial({
            map: cloudTexture,
            transparent: true,
            opacity: 0.15, // Reduced from 0.4
            depthWrite: false,
            blending: THREE.NormalBlending // Changed from AdditiveBlending
        });

        this.cloudsMesh = new THREE.Mesh(geometry, material);
        this.group.add(this.cloudsMesh);
    }

    createLatLonGrid() {
        // Lat/lon grid lines on the planet surface for orientation/polarity
        const gridGroup = new THREE.Group();
        const r = this.radius + 0.02; // Slightly above surface
        const segments = 180;
        const material = new THREE.LineBasicMaterial({
            color: 0x4488cc,
            transparent: true,
            opacity: 0.18,
            depthWrite: false
        });
        const equatorMaterial = new THREE.LineBasicMaterial({
            color: 0x66aaff,
            transparent: true,
            opacity: 0.35,
            depthWrite: false
        });
        const meridianMaterial = new THREE.LineBasicMaterial({
            color: 0x66aaff,
            transparent: true,
            opacity: 0.3,
            depthWrite: false
        });

        // Latitude lines every 30°
        for (let lat = -60; lat <= 60; lat += 30) {
            const points = [];
            const phi = (90 - lat) * Math.PI / 180;
            for (let i = 0; i <= segments; i++) {
                const theta = (i / segments) * Math.PI * 2;
                points.push(new THREE.Vector3(
                    -r * Math.sin(phi) * Math.cos(theta),
                    r * Math.cos(phi),
                    r * Math.sin(phi) * Math.sin(theta)
                ));
            }
            const geo = new THREE.BufferGeometry().setFromPoints(points);
            const mat = lat === 0 ? equatorMaterial : material;
            gridGroup.add(new THREE.Line(geo, mat));
        }

        // Longitude lines every 30°
        for (let lon = -180; lon < 180; lon += 30) {
            const points = [];
            const theta = (lon + 180) * Math.PI / 180;
            for (let i = 0; i <= segments; i++) {
                const phi = (i / segments) * Math.PI;
                points.push(new THREE.Vector3(
                    -r * Math.sin(phi) * Math.cos(theta),
                    r * Math.cos(phi),
                    r * Math.sin(phi) * Math.sin(theta)
                ));
            }
            const geo = new THREE.BufferGeometry().setFromPoints(points);
            const mat = (lon === 0 || lon === 180 || lon === -180) ? meridianMaterial : material;
            gridGroup.add(new THREE.Line(geo, mat));
        }

        this.latLonGrid = gridGroup;
        this.group.add(gridGroup);
    }

    createMagneticField() {
        // Earth's magnetic field visualization — dipole field lines
        // Emerges from south magnetic pole, arcs through space, enters north magnetic pole
        const fieldGroup = new THREE.Group();
        const fieldMaterial = new THREE.LineBasicMaterial({
            color: 0x4466ff,
            transparent: true,
            opacity: 0.12,
            depthWrite: false,
            blending: THREE.AdditiveBlending
        });
        const polarMaterial = new THREE.LineBasicMaterial({
            color: 0x8844ff,
            transparent: true,
            opacity: 0.2,
            depthWrite: false,
            blending: THREE.AdditiveBlending
        });

        // Magnetic poles (tilted ~11° from geographic poles)
        const tiltAngle = 11 * Math.PI / 180;
        const magneticAxis = new THREE.Vector3(
            Math.sin(tiltAngle), Math.cos(tiltAngle), 0
        ).normalize();

        // Create dipole field lines at various longitudes around the magnetic axis
        const numFieldLines = 12;
        const segments = 64;

        for (let i = 0; i < numFieldLines; i++) {
            const azimuth = (i / numFieldLines) * Math.PI * 2;

            // Create a perpendicular reference for this azimuth
            const ref = new THREE.Vector3(0, 0, 1);
            const perp1 = new THREE.Vector3().crossVectors(magneticAxis, ref).normalize();
            const perp2 = new THREE.Vector3().crossVectors(magneticAxis, perp1).normalize();
            const startDir = perp1.clone().multiplyScalar(Math.cos(azimuth))
                .add(perp2.clone().multiplyScalar(Math.sin(azimuth)));

            const points = [];
            // Dipole field line: r = R * cos²(θ_m) where θ_m is magnetic colatitude
            // Parameterize by magnetic colatitude from one pole to the other
            const L = 2.5; // L-shell parameter — how far field line extends (in planet radii)

            for (let s = 0; s <= segments; s++) {
                const thetaM = (s / segments) * Math.PI; // 0 (north) to π (south)
                const sinT = Math.sin(thetaM);
                const cosT = Math.cos(thetaM);

                // Dipole: r = L * R * sin²(θ_m)
                const rField = this.radius * L * sinT * sinT;

                if (rField < this.radius + 0.15) continue; // Don't go inside planet

                // Position in magnetic coordinates
                const pos = magneticAxis.clone().multiplyScalar(cosT * rField)
                    .add(startDir.clone().multiplyScalar(sinT * rField));

                points.push(pos);
            }

            if (points.length > 2) {
                const geo = new THREE.BufferGeometry().setFromPoints(points);
                const mat = (i % 3 === 0) ? polarMaterial : fieldMaterial;
                fieldGroup.add(new THREE.Line(geo, mat));
            }
        }

        // Second set at higher L-shell for outer field
        for (let i = 0; i < 8; i++) {
            const azimuth = (i / 8) * Math.PI * 2 + 0.2;
            const ref = new THREE.Vector3(0, 0, 1);
            const perp1 = new THREE.Vector3().crossVectors(magneticAxis, ref).normalize();
            const perp2 = new THREE.Vector3().crossVectors(magneticAxis, perp1).normalize();
            const startDir = perp1.clone().multiplyScalar(Math.cos(azimuth))
                .add(perp2.clone().multiplyScalar(Math.sin(azimuth)));

            const points = [];
            const L = 4.0;

            for (let s = 0; s <= segments; s++) {
                const thetaM = (s / segments) * Math.PI;
                const sinT = Math.sin(thetaM);
                const cosT = Math.cos(thetaM);
                const rField = this.radius * L * sinT * sinT;

                if (rField < this.radius + 0.15) continue; // Don't go inside planet

                const pos = magneticAxis.clone().multiplyScalar(cosT * rField)
                    .add(startDir.clone().multiplyScalar(sinT * rField));
                points.push(pos);
            }

            if (points.length > 2) {
                const geo = new THREE.BufferGeometry().setFromPoints(points);
                fieldGroup.add(new THREE.Line(geo, fieldMaterial));
            }
        }

        this.magneticField = fieldGroup;
        this.group.add(fieldGroup);
    }

    update(time, deltaTime) {
        // Planet does NOT auto-rotate — airports and trampolines must stay
        // aligned with their real lat/lon positions on the texture.
        // Only clouds rotate for visual interest.
        if (this.cloudsMesh) {
            this.cloudsMesh.rotation.y += deltaTime * 0.015;
        }

        // Update shader uniforms
        if (this.planetMesh.material.uniforms) {
            this.planetMesh.material.uniforms.time.value = time;
        }

        if (this.atmosphereMesh && this.atmosphereMesh.material.uniforms) {
            this.atmosphereMesh.material.uniforms.time.value = time;
        }

        if (this.outerAtmosphereMesh && this.outerAtmosphereMesh.material.uniforms) {
            this.outerAtmosphereMesh.material.uniforms.time.value = time;
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
