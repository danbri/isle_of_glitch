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
        this.createConstellations();
        this.createDeepFieldObjects();
        this.createISS();
        this.createSatellites();
        this.createDistantGalaxies();
        this.createMoon();
        this.createLagrangeMarkers();
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

    createConstellations() {
        // Real constellation star positions (RA/Dec → 3D) with stick-figure lines
        // Major recognizable constellations at correct sky positions
        const constellations = [
            {
                name: 'Ursa Major',  // Great Bear / Big Dipper
                stars: [
                    { ra: 11.06, dec: 61.75, mag: 1.8 },  // Dubhe
                    { ra: 11.03, dec: 56.38, mag: 2.4 },  // Merak
                    { ra: 11.90, dec: 53.69, mag: 2.4 },  // Phecda
                    { ra: 12.26, dec: 57.03, mag: 3.3 },  // Megrez
                    { ra: 12.90, dec: 55.96, mag: 1.8 },  // Alioth
                    { ra: 13.40, dec: 54.93, mag: 2.3 },  // Mizar
                    { ra: 13.79, dec: 49.31, mag: 1.9 },  // Alkaid
                ],
                lines: [[0,1],[1,2],[2,3],[3,4],[4,5],[5,6],[3,0]]
            },
            {
                name: 'Orion',
                stars: [
                    { ra: 5.92, dec: 7.41, mag: 0.5 },    // Betelgeuse
                    { ra: 5.24, dec: -8.20, mag: 0.2 },   // Rigel
                    { ra: 5.68, dec: -1.94, mag: 1.7 },   // Alnitak
                    { ra: 5.60, dec: -1.20, mag: 1.7 },   // Alnilam
                    { ra: 5.53, dec: -1.94, mag: 2.2 },   // Mintaka
                    { ra: 5.42, dec: 6.35, mag: 1.6 },    // Bellatrix
                    { ra: 5.80, dec: -9.67, mag: 2.1 },   // Saiph
                ],
                lines: [[0,5],[5,4],[4,3],[3,2],[2,6],[6,1],[1,4],[0,2]]
            },
            {
                name: 'Cassiopeia',
                stars: [
                    { ra: 0.68, dec: 56.54, mag: 2.2 },   // Schedar
                    { ra: 0.15, dec: 59.15, mag: 2.3 },   // Caph
                    { ra: 0.95, dec: 60.72, mag: 2.5 },   // Gamma Cas
                    { ra: 1.43, dec: 60.24, mag: 2.7 },   // Ruchbah
                    { ra: 1.91, dec: 63.67, mag: 3.4 },   // Segin
                ],
                lines: [[1,0],[0,2],[2,3],[3,4]]
            },
            {
                name: 'Crux',  // Southern Cross
                stars: [
                    { ra: 12.44, dec: -63.10, mag: 0.8 },  // Acrux
                    { ra: 12.52, dec: -57.11, mag: 1.3 },  // Mimosa
                    { ra: 12.25, dec: -58.75, mag: 1.6 },  // Gacrux
                    { ra: 12.35, dec: -60.40, mag: 2.8 },  // Delta Cru
                ],
                lines: [[0,2],[1,3]]
            },
            {
                name: 'Scorpius',
                stars: [
                    { ra: 16.49, dec: -26.43, mag: 1.0 },  // Antares
                    { ra: 16.01, dec: -22.62, mag: 2.6 },  // Dschubba
                    { ra: 16.09, dec: -19.81, mag: 2.3 },  // Acrab
                    { ra: 17.56, dec: -37.10, mag: 1.9 },  // Shaula
                    { ra: 17.71, dec: -39.03, mag: 2.7 },  // Lesath
                    { ra: 16.84, dec: -34.29, mag: 2.3 },  // Epsilon Sco
                ],
                lines: [[2,1],[1,0],[0,5],[5,3],[3,4]]
            },
            {
                name: 'Leo',
                stars: [
                    { ra: 10.14, dec: 11.97, mag: 1.4 },  // Regulus
                    { ra: 11.82, dec: 14.57, mag: 2.1 },  // Denebola
                    { ra: 10.33, dec: 19.84, mag: 2.6 },  // Algieba
                    { ra: 11.24, dec: 20.52, mag: 2.1 },  // Zosma
                    { ra: 9.76, dec: 23.77, mag: 3.5 },   // Epsilon Leo
                ],
                lines: [[0,2],[2,4],[2,3],[3,1]]
            },
            {
                name: 'Cygnus',  // Northern Cross
                stars: [
                    { ra: 20.69, dec: 45.28, mag: 1.3 },  // Deneb
                    { ra: 19.51, dec: 27.96, mag: 2.2 },  // Albireo
                    { ra: 20.37, dec: 40.26, mag: 2.2 },  // Sadr
                    { ra: 20.77, dec: 33.97, mag: 2.5 },  // Gienah
                    { ra: 19.94, dec: 35.08, mag: 2.9 },  // Delta Cyg
                ],
                lines: [[0,2],[2,1],[4,2],[2,3]]
            }
        ];

        const skyRadius = 600;

        // Convert RA/Dec to 3D position
        const raDecTo3D = (ra, dec, radius) => {
            // RA in hours (0-24), Dec in degrees (-90 to +90)
            const raRad = (ra / 24) * Math.PI * 2;
            const decRad = dec * Math.PI / 180;
            return new THREE.Vector3(
                radius * Math.cos(decRad) * Math.cos(raRad),
                radius * Math.sin(decRad),
                radius * Math.cos(decRad) * Math.sin(raRad)
            );
        };

        // Draw constellation stick figures
        const lineMaterial = new THREE.LineBasicMaterial({
            color: 0x334466,
            transparent: true,
            opacity: 0.25,
            depthWrite: false
        });

        this.constellationStars = [];

        for (const c of constellations) {
            const starPositions = c.stars.map(s => raDecTo3D(s.ra, s.dec, skyRadius));

            // Stick-figure lines
            for (const [a, b] of c.lines) {
                const geo = new THREE.BufferGeometry().setFromPoints([starPositions[a], starPositions[b]]);
                const line = new THREE.Line(geo, lineMaterial);
                this.scene.add(line);
            }

            // Bright named stars — add extra bright points for these
            for (let i = 0; i < c.stars.length; i++) {
                this.constellationStars.push({
                    position: starPositions[i],
                    magnitude: c.stars[i].mag,
                    constellation: c.name
                });
            }
        }

        // Add constellation stars as larger, brighter points
        const count = this.constellationStars.length;
        const positions = new Float32Array(count * 3);
        const colors = new Float32Array(count * 3);
        const sizes = new Float32Array(count);

        for (let i = 0; i < count; i++) {
            const s = this.constellationStars[i];
            positions[i * 3] = s.position.x;
            positions[i * 3 + 1] = s.position.y;
            positions[i * 3 + 2] = s.position.z;

            // Brighter stars are whiter, dimmer have slight color
            const brightness = Math.max(0.6, 1.0 - s.magnitude * 0.15);
            colors[i * 3] = brightness;
            colors[i * 3 + 1] = brightness;
            colors[i * 3 + 2] = Math.min(1.0, brightness + 0.1);

            // Size inversely related to magnitude (lower mag = brighter)
            sizes[i] = Math.max(2, 5 - s.magnitude);
        }

        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        geo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

        const starMat = new THREE.ShaderMaterial({
            uniforms: { time: { value: 0 } },
            vertexShader: `
                attribute float size;
                attribute vec3 color;
                varying vec3 vColor;
                uniform float time;
                void main() {
                    vColor = color;
                    float twinkle = sin(time * 1.5 + position.x * 0.02) * 0.15 + 0.85;
                    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                    gl_PointSize = size * twinkle * (400.0 / -mvPosition.z);
                    gl_Position = projectionMatrix * mvPosition;
                }
            `,
            fragmentShader: `
                varying vec3 vColor;
                void main() {
                    float dist = length(gl_PointCoord - vec2(0.5));
                    if (dist > 0.5) discard;
                    float alpha = smoothstep(0.5, 0.0, dist);
                    float core = smoothstep(0.15, 0.0, dist);
                    vec3 color = vColor * (0.6 + core * 0.4);
                    gl_FragColor = vec4(color, alpha);
                }
            `,
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending
        });

        this.constellationPoints = new THREE.Points(geo, starMat);
        this.scene.add(this.constellationPoints);
    }

    createDeepFieldObjects() {
        // Hubble Deep Field aesthetic: distant galaxies, star clusters, nebulae
        // scattered throughout the void — "star systems and planets everywhere, however sparse"
        const skyRadius = 700;

        // --- Distant galaxy clusters (tiny smudges of light) ---
        const galaxyCount = 80;
        const galaxyPositions = new Float32Array(galaxyCount * 3);
        const galaxyColors = new Float32Array(galaxyCount * 3);
        const galaxySizes = new Float32Array(galaxyCount);

        // Color palette: warm golds, pale blues, faint reds — like the Deep Field photo
        const deepFieldColors = [
            [1.0, 0.9, 0.6],   // Golden spiral
            [0.7, 0.8, 1.0],   // Blue elliptical
            [1.0, 0.7, 0.5],   // Orange irregular
            [0.8, 0.6, 0.9],   // Pale violet
            [0.9, 0.9, 1.0],   // White dwarf cluster
            [1.0, 0.5, 0.4],   // Red shifted
        ];

        for (let i = 0; i < galaxyCount; i++) {
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1);
            const r = skyRadius + Math.random() * 200;

            galaxyPositions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
            galaxyPositions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
            galaxyPositions[i * 3 + 2] = r * Math.cos(phi);

            const col = deepFieldColors[Math.floor(Math.random() * deepFieldColors.length)];
            const dim = 0.3 + Math.random() * 0.7; // Most are faint
            galaxyColors[i * 3] = col[0] * dim;
            galaxyColors[i * 3 + 1] = col[1] * dim;
            galaxyColors[i * 3 + 2] = col[2] * dim;

            // Mostly tiny, a few larger (nearby galaxies)
            galaxySizes[i] = Math.random() < 0.1 ? 4 + Math.random() * 4 : 1 + Math.random() * 2;
        }

        const galaxyGeo = new THREE.BufferGeometry();
        galaxyGeo.setAttribute('position', new THREE.BufferAttribute(galaxyPositions, 3));
        galaxyGeo.setAttribute('color', new THREE.BufferAttribute(galaxyColors, 3));
        galaxyGeo.setAttribute('size', new THREE.BufferAttribute(galaxySizes, 1));

        const galaxyMat = new THREE.ShaderMaterial({
            vertexShader: `
                attribute float size;
                attribute vec3 color;
                varying vec3 vColor;
                void main() {
                    vColor = color;
                    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                    gl_PointSize = size * (300.0 / -mvPosition.z);
                    gl_Position = projectionMatrix * mvPosition;
                }
            `,
            fragmentShader: `
                varying vec3 vColor;
                void main() {
                    float dist = length(gl_PointCoord - vec2(0.5));
                    if (dist > 0.5) discard;
                    // Softer, more diffuse than stars — galaxy smudge
                    float alpha = smoothstep(0.5, 0.1, dist) * 0.7;
                    gl_FragColor = vec4(vColor, alpha);
                }
            `,
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending
        });

        this.deepFieldGalaxies = new THREE.Points(galaxyGeo, galaxyMat);
        this.scene.add(this.deepFieldGalaxies);

        // --- A few larger nebula sprites for visual depth ---
        const nebulaData = [
            { ra: 5.59, dec: -5.39, name: 'Orion Nebula', color: 0xff6688, size: 40 },
            { ra: 18.59, dec: -23.02, name: 'Lagoon Nebula', color: 0xff8866, size: 30 },
            { ra: 5.64, dec: 22.01, name: 'Crab Nebula', color: 0x8888ff, size: 15 },
        ];

        for (const neb of nebulaData) {
            const canvas = document.createElement('canvas');
            canvas.width = 128;
            canvas.height = 128;
            const ctx = canvas.getContext('2d');

            // Soft nebula glow
            const r2 = ((neb.color >> 16) & 0xff);
            const g2 = ((neb.color >> 8) & 0xff);
            const b2 = (neb.color & 0xff);

            const grad = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
            grad.addColorStop(0, `rgba(${r2}, ${g2}, ${b2}, 0.6)`);
            grad.addColorStop(0.3, `rgba(${r2}, ${g2}, ${b2}, 0.2)`);
            grad.addColorStop(0.7, `rgba(${r2 >> 1}, ${g2 >> 1}, ${b2 >> 1}, 0.05)`);
            grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, 128, 128);

            // Add some structure — wispy filaments
            ctx.globalCompositeOperation = 'lighter';
            for (let f = 0; f < 5; f++) {
                const fx = 40 + Math.random() * 48;
                const fy = 40 + Math.random() * 48;
                const fg = ctx.createRadialGradient(fx, fy, 0, fx, fy, 20 + Math.random() * 20);
                fg.addColorStop(0, `rgba(255, 255, 255, 0.15)`);
                fg.addColorStop(1, 'rgba(0, 0, 0, 0)');
                ctx.fillStyle = fg;
                ctx.fillRect(0, 0, 128, 128);
            }

            const texture = new THREE.CanvasTexture(canvas);
            const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
                map: texture,
                transparent: true,
                opacity: 0.25,
                blending: THREE.AdditiveBlending,
                depthWrite: false
            }));

            // Position at correct sky location
            const raRad = (neb.ra / 24) * Math.PI * 2;
            const decRad = neb.dec * Math.PI / 180;
            const dist = skyRadius;
            sprite.position.set(
                dist * Math.cos(decRad) * Math.cos(raRad),
                dist * Math.sin(decRad),
                dist * Math.cos(decRad) * Math.sin(raRad)
            );
            sprite.scale.set(neb.size, neb.size, 1);
            this.scene.add(sprite);
        }
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

    createMoon() {
        // Realistic moon — radius ~2.73 game units (1,737 km / 637.1 km per unit)
        const moonRadius = 2.73;
        const geometry = new THREE.SphereGeometry(moonRadius, 32, 32);
        const material = new THREE.MeshPhongMaterial({
            color: 0xcccccc,
            emissive: 0x111111,
            shininess: 5,
            // The moon is matte gray — no specularity
        });
        this.moonMesh = new THREE.Mesh(geometry, material);
        // Initial position will be set by orbital mechanics
        this.moonMesh.position.set(400, 0, 0);
        this.scene.add(this.moonMesh);

        // Moon label
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 32;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.font = '16px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('Moon', 64, 20);
        const labelTexture = new THREE.CanvasTexture(canvas);
        const labelMat = new THREE.SpriteMaterial({
            map: labelTexture,
            transparent: true,
            depthWrite: false
        });
        this.moonLabel = new THREE.Sprite(labelMat);
        this.moonLabel.scale.set(8, 2, 1);
        this.scene.add(this.moonLabel);
    }

    createLagrangeMarkers() {
        // Create markers for Earth-Moon Lagrange points (L1-L5)
        this.lagrangeMarkers = {};

        const labels = {
            'EM-L1': { color: 0x44ffaa, desc: 'Earth-Moon L1' },
            'EM-L2': { color: 0x44aaff, desc: 'Earth-Moon L2' },
            'EM-L3': { color: 0xff44aa, desc: 'Earth-Moon L3' },
            'EM-L4': { color: 0xffaa44, desc: 'Earth-Moon L4 (stable)' },
            'EM-L5': { color: 0xaaff44, desc: 'Earth-Moon L5 (stable)' },
        };

        for (const [key, info] of Object.entries(labels)) {
            const group = new THREE.Group();

            // Diamond marker
            const markerGeo = new THREE.OctahedronGeometry(1.5, 0);
            const markerMat = new THREE.MeshBasicMaterial({
                color: info.color,
                transparent: true,
                opacity: 0.6,
                wireframe: true
            });
            const marker = new THREE.Mesh(markerGeo, markerMat);
            group.add(marker);

            // Glow sprite
            const spriteMat = new THREE.SpriteMaterial({
                color: info.color,
                transparent: true,
                opacity: 0.3,
                blending: THREE.AdditiveBlending
            });
            const sprite = new THREE.Sprite(spriteMat);
            sprite.scale.set(6, 6, 1);
            group.add(sprite);

            // Label
            const canvas = document.createElement('canvas');
            canvas.width = 128;
            canvas.height = 32;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#' + info.color.toString(16).padStart(6, '0');
            ctx.font = 'bold 14px monospace';
            ctx.textAlign = 'center';
            ctx.fillText(key, 64, 20);
            const labelTex = new THREE.CanvasTexture(canvas);
            const labelSprite = new THREE.Sprite(new THREE.SpriteMaterial({
                map: labelTex,
                transparent: true,
                depthWrite: false
            }));
            labelSprite.scale.set(8, 2, 1);
            labelSprite.position.y = 3;
            group.add(labelSprite);

            group.visible = false; // Will be positioned by orbital update
            this.scene.add(group);
            this.lagrangeMarkers[key] = group;
        }
    }

    update(time, deltaTime, orbital) {
        // Update star twinkle
        if (this.stars && this.stars.material.uniforms) {
            this.stars.material.uniforms.time.value = time;
        }

        // Update constellation star twinkle
        if (this.constellationPoints && this.constellationPoints.material.uniforms) {
            this.constellationPoints.material.uniforms.time.value = time;
        }

        // Orbit ISS — use real position from orbital mechanics
        if (this.iss && orbital) {
            this.iss.position.copy(orbital.issPosition);
            // Face along orbital velocity (prograde)
            this.iss.lookAt(0, 0, 0);
            this.iss.rotateY(Math.PI / 2); // ISS flies sideways relative to nadir
        } else if (this.iss) {
            // Fallback: simple circular orbit
            this.issOrbitAngle += this.issOrbitSpeed * deltaTime;
            this.iss.position.x = Math.cos(this.issOrbitAngle) * this.issOrbitRadius;
            this.iss.position.z = Math.sin(this.issOrbitAngle) * this.issOrbitRadius;
            this.iss.position.y = Math.sin(this.issOrbitAngle * 0.3) * 3 + 5;
            this.iss.rotation.y = -this.issOrbitAngle + Math.PI / 2;
        }

        // Update Moon position from orbital mechanics
        if (this.moonMesh && orbital) {
            this.moonMesh.position.copy(orbital.moonPosition);
            // Moon label just above
            if (this.moonLabel) {
                this.moonLabel.position.copy(orbital.moonPosition);
                this.moonLabel.position.y += orbital.moonRadius + 2;
            }
        }

        // Update Lagrange point markers from orbital mechanics
        if (this.lagrangeMarkers && orbital) {
            for (let i = 1; i <= 5; i++) {
                const key = `EM-L${i}`;
                const marker = this.lagrangeMarkers[key];
                const pos = orbital.lagrangeEM[i];
                if (marker && pos) {
                    marker.position.copy(pos);
                    marker.visible = true;
                    // Slow rotation for visual interest
                    marker.children[0].rotation.y = time * 0.5;
                    marker.children[0].rotation.x = time * 0.3;
                } else if (marker) {
                    marker.visible = false;
                }
            }
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
