/**
 * GLOBALL - Planetary Trampoline Express
 * Main game entry point
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

import { Planet } from './components/Planet.js';
import { Player } from './components/Player.js';
import { TrampolineNetwork } from './systems/TrampolineNetwork.js';
import { AuroraBorealis } from './components/AuroraBorealis.js';
import { SpaceEnvironment } from './components/SpaceEnvironment.js';
import { CityLights } from './components/CityLights.js';
import { PackageSystem } from './systems/PackageSystem.js';
import { GameState } from './systems/GameState.js';
import { AudioSystem } from './systems/AudioSystem.js';
import { ChromaticAberrationShader } from './shaders/ChromaticAberration.js';
import { AtmosphericScatteringShader } from './shaders/AtmosphericScattering.js';
import GUI from 'lil-gui';

class GloballGame {
    constructor() {
        this.isWebGPU = false;
        this.targetFPS = 90;
        this.frameTime = 1000 / this.targetFPS;
        this.lastFrameTime = 0;
        this.deltaTime = 0;

        this.loadingProgress = 0;
        this.isLoading = true;

        // Smoothed display values to prevent flickering
        this.displayedAltitude = 0;
        this.altitudeSmoothFactor = 0.15;

        // Defer audio initialization to avoid blocking
        this.audio = null;

        console.log('🎮 Globall starting...');
        this.init();
    }

    getEl(id) {
        const el = document.getElementById(id);
        if (!el) console.warn(`Missing DOM element #${id}`);
        return el;
    }

    toggleGUI() {
        if (!this.gui) return;
        if (this.gui._hidden) this.gui.show();
        else this.gui.hide();
    }

    async init() {
        try {
            // Check for WebGPU support
            await this.checkWebGPU();

            // Initialize renderer
            this.setupRenderer();

            // Setup scene and camera
            this.setupScene();

            // Setup post-processing
            this.setupPostProcessing();

            // Load game components
            await this.loadGameComponents();

            // Setup input handling
            this.setupInput();

            // Setup UI
            this.setupUI();

            // Setup debug panel (press 'H' to toggle)
            this.setupDebugPanel();

            // Initialize audio (deferred, non-blocking)
            try {
                this.audio = new AudioSystem();
                console.log('🔊 Audio initialized');
            } catch (e) {
                console.warn('Audio init failed:', e);
                this.audio = { playBounce: () => {}, updateAltitude: () => {}, updateSpeed: () => {} };
            }

            // Hide loading screen
            this.hideLoadingScreen();

            // Start game loop
            this.animate();
        } catch (error) {
            console.error('Game initialization failed:', error);
            // Show error on loading screen
            const loadingScreen = document.getElementById('loading-screen');
            if (loadingScreen) {
                loadingScreen.innerHTML = `
                    <h1 style="color: #f5576c;">Error Loading Game</h1>
                    <p style="margin-top: 1rem; opacity: 0.8;">${error.message}</p>
                    <p style="margin-top: 0.5rem; font-size: 0.8rem; opacity: 0.6;">Check console for details</p>
                `;
            }
        }
    }

    async checkWebGPU() {
        // Skip WebGPU on mobile - just use WebGL for reliability
        const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
        if (isMobile) {
            console.log('📱 Mobile detected, using WebGL2');
            return;
        }

        if (navigator.gpu) {
            try {
                // Add timeout to prevent hanging on WebGPU check
                const timeoutPromise = new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('WebGPU timeout')), 2000)
                );
                const adapterPromise = navigator.gpu.requestAdapter();

                const adapter = await Promise.race([adapterPromise, timeoutPromise]);
                if (adapter) {
                    const device = await adapter.requestDevice();
                    this.isWebGPU = true;
                    console.log('🎮 WebGPU initialized');
                    return;
                }
            } catch (e) {
                console.warn('WebGPU check failed:', e.message);
            }
        }

        console.log('⚠️ Using WebGL2 fallback');
    }

    setupRenderer() {
        const container = this.getEl('canvas-container');
        if (!container) throw new Error('Missing #canvas-container');

        // Use WebGPURenderer if available, fallback to WebGLRenderer
        this.renderer = new THREE.WebGLRenderer({
            antialias: true,
            alpha: false,
            powerPreference: 'high-performance',
            logarithmicDepthBuffer: true,
            stencil: false
        });

        // Set clear color to prevent flickering
        this.renderer.setClearColor(0x1a0a2e, 1);
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.0;
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

        container.appendChild(this.renderer.domElement);

        // Handle resize
        window.addEventListener('resize', () => this.onResize());

        this.updateLoadingProgress(10);
    }

    setupScene() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x1a0a2e);

        // Camera setup - positioned to see Earth from space
        this.camera = new THREE.PerspectiveCamera(
            60,
            window.innerWidth / window.innerHeight,
            0.1,
            100000
        );
        this.camera.position.set(0, 0, 25);

        // Orbit controls for development/scenic viewing
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enabled = true;
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.minDistance = 12;
        this.controls.maxDistance = 100;
        this.controls.enablePan = false;

        // Ambient light - subtle fill
        const ambientLight = new THREE.AmbientLight(0x404060, 0.3);
        this.scene.add(ambientLight);

        // Sun light
        this.sunLight = new THREE.DirectionalLight(0xfff5e6, 2.5);
        this.sunLight.position.set(50, 30, 50);
        this.sunLight.castShadow = true;
        this.sunLight.shadow.mapSize.width = 4096;
        this.sunLight.shadow.mapSize.height = 4096;
        this.sunLight.shadow.camera.near = 1;
        this.sunLight.shadow.camera.far = 200;
        this.scene.add(this.sunLight);

        // Hemisphere light for natural sky/ground color
        const hemiLight = new THREE.HemisphereLight(0x87ceeb, 0x362312, 0.4);
        this.scene.add(hemiLight);

        this.updateLoadingProgress(20);
    }

    setupPostProcessing() {
        // Detect float render target support
        const gl = this.renderer.getContext();
        const isWebGL2 = this.renderer.capabilities.isWebGL2;
        const hasColorBufferFloat = !!gl.getExtension('EXT_color_buffer_float');
        const hasColorBufferHalfFloat = !!gl.getExtension('EXT_color_buffer_half_float');
        const supportsHalfFloat = hasColorBufferFloat || hasColorBufferHalfFloat;
        const pr = this.renderer.getPixelRatio();

        console.log('GL capabilities:', {
            isWebGL2,
            EXT_color_buffer_float: hasColorBufferFloat,
            EXT_color_buffer_half_float: hasColorBufferHalfFloat,
            pixelRatio: pr
        });

        if (supportsHalfFloat) {
            // Default constructor creates HalfFloatType target with correct pixel ratio
            this.composer = new EffectComposer(this.renderer);
        } else {
            // iOS/older GPU fallback: HalfFloat targets are unreliable without
            // EXT_color_buffer_float. Use UnsignedByte instead.
            console.warn('HalfFloat not supported, using UnsignedByte render target');
            const renderTarget = new THREE.WebGLRenderTarget(1, 1);
            this.composer = new EffectComposer(this.renderer, renderTarget);
        }

        // Ensure composer uses the correct pixel ratio regardless of branch
        this.composer.setPixelRatio(pr);
        this.composer.setSize(window.innerWidth, window.innerHeight);

        // Main render pass
        this.renderPass = new RenderPass(this.scene, this.camera);
        this.composer.addPass(this.renderPass);

        // Bloom for glowing effects (city lights, aurora)
        // Resolution must be in render pixels (CSS × pixelRatio), not CSS pixels,
        // otherwise bloom processes only a fraction of the frame on high-DPR devices
        this.bloomPass = new UnrealBloomPass(
            new THREE.Vector2(
                Math.floor(window.innerWidth * pr),
                Math.floor(window.innerHeight * pr)
            ),
            0.5,  // strength
            0.3,  // radius
            0.9   // threshold - bloom only brightest elements
        );
        this.composer.addPass(this.bloomPass);

        // Chromatic aberration for candy aesthetic - very subtle
        // Note: shader forces alpha=1.0 to prevent transparent objects from
        // bleeding low alpha through the pipeline
        this.chromaticPass = new ShaderPass(ChromaticAberrationShader);
        this.chromaticPass.uniforms.amount.value = 0.0005;
        this.composer.addPass(this.chromaticPass);

        // OutputPass applies tone mapping and color space conversion
        // (Removing this caused black screen — materials don't tone-map
        // when rendering to EffectComposer targets in r0.160.0)
        this.outputPass = new OutputPass();
        this.composer.addPass(this.outputPass);

        console.log('Post-processing setup:', {
            pixelRatio: pr,
            composerRT: [this.composer.readBuffer.width, this.composer.readBuffer.height],
            bloomRes: [this.bloomPass.resolution.x, this.bloomPass.resolution.y]
        });

        this.updateLoadingProgress(30);
    }

    async loadGameComponents() {
        // Initialize game state
        this.gameState = new GameState();

        this.updateLoadingProgress(35);

        // Create planet
        console.log('Loading: Planet...');
        this.planet = new Planet(this.scene);
        await this.planet.init();

        this.updateLoadingProgress(50);

        // Create city lights
        console.log('Loading: City Lights...');
        this.cityLights = new CityLights(this.scene, this.planet);
        await this.cityLights.init();

        this.updateLoadingProgress(60);

        // Create space environment (stars, ISS)
        console.log('Loading: Space Environment...');
        this.spaceEnv = new SpaceEnvironment(this.scene);
        await this.spaceEnv.init();

        this.updateLoadingProgress(70);

        // Create aurora borealis
        console.log('Loading: Aurora...');
        this.aurora = new AuroraBorealis(this.scene);
        await this.aurora.init();

        this.updateLoadingProgress(80);

        // Create trampoline network
        console.log('Loading: Trampolines...');
        this.trampolineNetwork = new TrampolineNetwork(this.scene, this.planet);
        await this.trampolineNetwork.init();

        this.updateLoadingProgress(85);

        // Create player
        console.log('Loading: Player...');
        this.player = new Player(this.scene, this.camera, this.gameState);
        await this.player.init();
        // Sync player camera with orbit controls initial state
        this.player.cameraEnabled = !this.controls.enabled;

        this.updateLoadingProgress(90);

        // Create package system
        console.log('Loading: Package System...');
        this.packageSystem = new PackageSystem(this.scene, this.gameState, this.trampolineNetwork);
        await this.packageSystem.init();

        console.log('Loading: Complete!');
        this.updateLoadingProgress(100);
    }

    setupInput() {
        // Keyboard controls
        this.keys = {};

        window.addEventListener('keydown', (e) => {
            this.keys[e.code] = true;
            this.handleKeyDown(e);
        });

        window.addEventListener('keyup', (e) => {
            this.keys[e.code] = false;
        });

        // Mouse/touch for trampoline selection
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();

        this.renderer.domElement.addEventListener('click', (e) => this.handleClick(e));
        this.renderer.domElement.addEventListener('mousemove', (e) => this.handleMouseMove(e));

        // Touch controls for mobile
        this.touchStartPos = null;
        this.renderer.domElement.addEventListener('touchstart', (e) => this.handleTouchStart(e), { passive: false });
        this.renderer.domElement.addEventListener('touchmove', (e) => this.handleTouchMove(e), { passive: false });
        this.renderer.domElement.addEventListener('touchend', (e) => this.handleTouchEnd(e), { passive: false });

        // Bounce indicator tap to bounce
        const bounceIndicator = this.getEl('bounce-indicator');
        if (bounceIndicator) {
            bounceIndicator.addEventListener('click', () => {
                this.player.bounce();
                if (this.audio) this.audio.playBounce(this.player.getBounceCharge());
            });
            bounceIndicator.addEventListener('touchend', (e) => {
                e.preventDefault();
                this.player.bounce();
                if (this.audio) this.audio.playBounce(this.player.getBounceCharge());
            });
        }
    }

    handleTouchStart(e) {
        if (e.touches.length === 1) {
            this.touchStartPos = {
                x: e.touches[0].clientX,
                y: e.touches[0].clientY,
                time: Date.now()
            };
        }
    }

    handleTouchMove(e) {
        if (!this.touchStartPos || e.touches.length !== 1) return;

        const dx = e.touches[0].clientX - this.touchStartPos.x;
        const dy = e.touches[0].clientY - this.touchStartPos.y;

        // Convert swipe to directional input
        const threshold = 10;
        if (Math.abs(dx) > threshold) {
            this.keys['KeyD'] = dx > 0;
            this.keys['KeyA'] = dx < 0;
        } else {
            this.keys['KeyD'] = false;
            this.keys['KeyA'] = false;
        }

        if (Math.abs(dy) > threshold) {
            this.keys['KeyW'] = dy < 0;
            this.keys['KeyS'] = dy > 0;
        } else {
            this.keys['KeyW'] = false;
            this.keys['KeyS'] = false;
        }
    }

    handleTouchEnd(e) {
        if (this.touchStartPos) {
            const elapsed = Date.now() - this.touchStartPos.time;
            // Quick tap = bounce
            if (elapsed < 200) {
                // Check if tap was on canvas (not UI)
                const touch = e.changedTouches[0];
                const target = document.elementFromPoint(touch.clientX, touch.clientY);
                if (target === this.renderer.domElement) {
                    this.player.bounce();
                    if (this.audio) this.audio.playBounce(this.player.getBounceCharge());
                }
            }
        }

        // Reset all touch-based movement
        this.keys['KeyW'] = false;
        this.keys['KeyS'] = false;
        this.keys['KeyA'] = false;
        this.keys['KeyD'] = false;
        this.touchStartPos = null;
    }

    handleKeyDown(e) {
        switch(e.code) {
            case 'Space':
                this.player.bounce();
                if (this.audio) this.audio.playBounce(this.player.getBounceCharge());
                break;
            case 'KeyE':
                this.player.interact();
                break;
            case 'Digit1':
                this.selectRoute('express');
                break;
            case 'Digit2':
                this.selectRoute('scenic');
                break;
            case 'Digit3':
                this.selectRoute('stealth');
                break;
            case 'KeyH':
                this.toggleGUI();
                break;
        }
    }

    handleClick(e) {
        this.mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
        this.mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;

        this.raycaster.setFromCamera(this.mouse, this.camera);

        // Check for trampoline intersections
        const trampolines = this.trampolineNetwork.getTrampolineMeshes();
        const intersects = this.raycaster.intersectObjects(trampolines);

        if (intersects.length > 0) {
            const trampoline = intersects[0].object.userData.trampoline;
            this.player.setTargetTrampoline(trampoline);
        }
    }

    handleMouseMove(e) {
        this.mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
        this.mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;

        // Highlight trampolines on hover
        this.raycaster.setFromCamera(this.mouse, this.camera);
        const trampolines = this.trampolineNetwork.getTrampolineMeshes();
        const intersects = this.raycaster.intersectObjects(trampolines);

        this.trampolineNetwork.clearHighlights();
        if (intersects.length > 0) {
            this.trampolineNetwork.highlightTrampoline(intersects[0].object.userData.trampoline);
        }
    }

    selectRoute(routeType) {
        this.gameState.selectedRoute = routeType;

        // Update UI
        document.querySelectorAll('.route-option').forEach(el => {
            el.classList.remove('selected');
            if (el.dataset.route === routeType) {
                el.classList.add('selected');
            }
        });

        // Update player trajectory preview
        this.player.setRouteType(routeType);
    }

    setupUI() {
        // Route selector clicks
        document.querySelectorAll('.route-option').forEach(el => {
            el.addEventListener('click', () => {
                this.selectRoute(el.dataset.route);
            });
        });
    }

    setupDebugPanel() {
        this.gui = new GUI({ title: 'Debug Panel' });

        // Component visibility toggles
        const visibility = this.gui.addFolder('Visibility');
        this.debugSettings = {
            showPlanet: true,
            showAtmosphere: true,
            showOuterAtmosphere: true,
            showClouds: true,
            showStars: true,
            showAurora: true,
            showCityLights: true,
            showTrampolines: true,
            showPlayer: true,
            showTrail: true,
            enableOrbitControls: true
        };

        visibility.add(this.debugSettings, 'showPlanet').name('Planet').onChange(v => {
            if (this.planet.planetMesh) this.planet.planetMesh.visible = v;
        });
        visibility.add(this.debugSettings, 'showAtmosphere').name('Inner Atmosphere').onChange(v => {
            if (this.planet.atmosphereMesh) this.planet.atmosphereMesh.visible = v;
        });
        visibility.add(this.debugSettings, 'showOuterAtmosphere').name('Outer Atmosphere').onChange(v => {
            if (this.planet.outerAtmosphereMesh) this.planet.outerAtmosphereMesh.visible = v;
        });
        visibility.add(this.debugSettings, 'showClouds').name('Clouds').onChange(v => {
            if (this.planet.cloudsMesh) this.planet.cloudsMesh.visible = v;
        });
        visibility.add(this.debugSettings, 'showStars').name('Stars').onChange(v => {
            if (this.spaceEnv.stars) this.spaceEnv.stars.visible = v;
        });
        visibility.add(this.debugSettings, 'showAurora').name('Aurora').onChange(v => {
            if (this.aurora.group) this.aurora.group.visible = v;
        });
        visibility.add(this.debugSettings, 'showCityLights').name('City Lights').onChange(v => {
            if (this.cityLights.group) this.cityLights.group.visible = v;
        });
        visibility.add(this.debugSettings, 'showTrampolines').name('Trampolines').onChange(v => {
            if (this.trampolineNetwork.group) this.trampolineNetwork.group.visible = v;
        });
        visibility.add(this.debugSettings, 'showPlayer').name('Player').onChange(v => {
            if (this.player.mesh) this.player.mesh.visible = v;
        });
        visibility.add(this.debugSettings, 'showTrail').name('Trail').onChange(v => {
            if (this.player.trail) this.player.trail.visible = v;
        });
        visibility.open();

        // Post Processing controls (fine-grained with subcomponents and scales)
        const postProc = this.gui.addFolder('Post Processing');
        this.postProcessSettings = {
            masterEnable: true,
            // Bloom
            enableBloom: true,
            bloomStrength: 0.5,
            bloomRadius: 0.3,
            bloomThreshold: 0.9,
            dynamicBloom: true,
            // Chromatic Aberration
            enableChromatic: true,
            chromaticAmount: 0.0005,
            dynamicChromatic: true,
            chromaticAngle: 0.0,
            // Tone Mapping
            exposure: 1.0,
            enableOutputPass: true,
            rendererToneMapping: true,
            // Scene
            backgroundColor: '#1a0a2e'
        };
        this.usePostProcessing = true;

        postProc.add(this.postProcessSettings, 'masterEnable').name('Master Enable').onChange(v => {
            this.usePostProcessing = v;
        });

        // Bloom subfolder
        const bloomFolder = postProc.addFolder('Bloom');
        bloomFolder.add(this.postProcessSettings, 'enableBloom').name('Enable').onChange(v => {
            this.bloomPass.enabled = v;
        });
        bloomFolder.add(this.postProcessSettings, 'bloomStrength', 0, 3, 0.01).name('Strength').onChange(v => {
            if (!this.postProcessSettings.dynamicBloom) {
                this.bloomPass.strength = v;
            }
        });
        bloomFolder.add(this.postProcessSettings, 'bloomRadius', 0, 1, 0.01).name('Radius').onChange(v => {
            this.bloomPass.radius = v;
        });
        bloomFolder.add(this.postProcessSettings, 'bloomThreshold', 0, 1, 0.01).name('Threshold').onChange(v => {
            this.bloomPass.threshold = v;
        });
        bloomFolder.add(this.postProcessSettings, 'dynamicBloom').name('Altitude Scaling');

        // Chromatic Aberration subfolder
        const chromaticFolder = postProc.addFolder('Chromatic Aberration');
        chromaticFolder.add(this.postProcessSettings, 'enableChromatic').name('Enable').onChange(v => {
            this.chromaticPass.enabled = v;
        });
        chromaticFolder.add(this.postProcessSettings, 'chromaticAmount', 0, 0.01, 0.0001).name('Base Amount').onChange(v => {
            if (!this.postProcessSettings.dynamicChromatic) {
                this.chromaticPass.uniforms.amount.value = v;
            }
        });
        chromaticFolder.add(this.postProcessSettings, 'dynamicChromatic').name('Speed Scaling');
        chromaticFolder.add(this.postProcessSettings, 'chromaticAngle', 0, 6.28, 0.01).name('Angle').onChange(v => {
            this.chromaticPass.uniforms.angle.value = v;
        });

        // Tone Mapping subfolder
        const toneFolder = postProc.addFolder('Tone Mapping');
        toneFolder.add(this.postProcessSettings, 'exposure', 0, 3, 0.05).name('Exposure').onChange(v => {
            this.renderer.toneMappingExposure = v;
        });
        toneFolder.add(this.postProcessSettings, 'enableOutputPass').name('OutputPass').onChange(v => {
            this.outputPass.enabled = v;
        });
        toneFolder.add(this.postProcessSettings, 'rendererToneMapping').name('Renderer TM').onChange(v => {
            this.renderer.toneMapping = v ? THREE.ACESFilmicToneMapping : THREE.NoToneMapping;
        });

        postProc.addColor(this.postProcessSettings, 'backgroundColor').name('Background').onChange(v => {
            this.scene.background = new THREE.Color(v);
            this.renderer.setClearColor(v, 1);
        });
        postProc.open();

        // Scene component toggles for isolating rendering issues
        const sceneFolder = postProc.addFolder('Scene Components');
        this.sceneComponentSettings = {
            innerAtmosphere: true,
            outerAtmosphere: true,
            clouds: true,
            aurora: true,
            cityLights: true,
            stars: true
        };
        sceneFolder.add(this.sceneComponentSettings, 'innerAtmosphere').name('Inner Atmo').onChange(v => {
            if (this.planet.atmosphereMesh) this.planet.atmosphereMesh.visible = v;
        });
        sceneFolder.add(this.sceneComponentSettings, 'outerAtmosphere').name('Outer Atmo').onChange(v => {
            if (this.planet.outerAtmosphereMesh) this.planet.outerAtmosphereMesh.visible = v;
        });
        sceneFolder.add(this.sceneComponentSettings, 'clouds').name('Clouds').onChange(v => {
            if (this.planet.cloudsMesh) this.planet.cloudsMesh.visible = v;
        });
        sceneFolder.add(this.sceneComponentSettings, 'aurora').name('Aurora').onChange(v => {
            if (this.aurora) {
                this.aurora.curtains.forEach(c => c.visible = v);
                if (this.aurora.particles) this.aurora.particles.visible = v;
            }
        });
        sceneFolder.add(this.sceneComponentSettings, 'cityLights').name('City Lights').onChange(v => {
            if (this.cityLights) {
                this.cityLights.cityMeshes.forEach(m => m.visible = v);
                this.cityLights.streetMeshes.forEach(m => m.visible = v);
            }
        });
        sceneFolder.add(this.sceneComponentSettings, 'stars').name('Stars').onChange(v => {
            if (this.spaceEnv) {
                if (this.spaceEnv.stars) this.spaceEnv.stars.visible = v;
                if (this.spaceEnv.iss) this.spaceEnv.iss.visible = v;
                this.spaceEnv.satellites.forEach(s => s.visible = v);
            }
        });

        // Controls
        const controlsFolder = this.gui.addFolder('Controls');
        controlsFolder.add(this.debugSettings, 'enableOrbitControls').name('Orbit Controls').onChange(v => {
            this.controls.enabled = v;
            this.player.cameraEnabled = !v;
        });

        // Camera settings
        const camera = this.gui.addFolder('Camera');
        this.debugCameraSettings = {
            lerpSpeed: 0.15,
            fov: 60,
            near: 0.1,
            far: 100000
        };

        camera.add(this.debugCameraSettings, 'lerpSpeed', 0.01, 0.5, 0.01).name('Lerp Speed').onChange(v => {
            // Will be used in player update
            this.player.cameraLerpSpeed = v;
        });
        camera.add(this.debugCameraSettings, 'fov', 30, 120, 1).name('FOV').onChange(v => {
            this.camera.fov = v;
            this.camera.updateProjectionMatrix();
        });
        camera.add(this.debugCameraSettings, 'near', 0.01, 10, 0.01).name('Near Clip').onChange(v => {
            this.camera.near = v;
            this.camera.updateProjectionMatrix();
        });
        camera.add(this.debugCameraSettings, 'far', 100, 500000, 100).name('Far Clip').onChange(v => {
            this.camera.far = v;
            this.camera.updateProjectionMatrix();
        });

        // Debug info display
        const info = this.gui.addFolder('Info');
        this.debugInfo = {
            fps: 0,
            cameraPos: '0, 0, 0',
            playerPos: '0, 0, 0',
            altitude: 0,
            velocity: 0
        };
        info.add(this.debugInfo, 'fps').name('FPS').listen();
        info.add(this.debugInfo, 'cameraPos').name('Camera Pos').listen();
        info.add(this.debugInfo, 'playerPos').name('Player Pos').listen();
        info.add(this.debugInfo, 'altitude').name('Altitude').listen();
        info.add(this.debugInfo, 'velocity').name('Velocity').listen();
        info.open();

        // FPS counter
        this.fpsFrames = 0;
        this.fpsTime = performance.now();

        // Mobile-friendly debug toggle button
        const debugToggle = this.getEl('debug-toggle');
        if (debugToggle) {
            debugToggle.addEventListener('click', () => this.toggleGUI());
            debugToggle.addEventListener('touchend', (e) => {
                e.preventDefault();
                this.toggleGUI();
            });
        }
    }

    updateUI() {
        // Update altitude display with smoothing to prevent flickering
        const targetAltitude = this.player.getAltitude();
        this.displayedAltitude += (targetAltitude - this.displayedAltitude) * this.altitudeSmoothFactor;
        const alt = this.getEl('altitude-value');
        if (alt) alt.textContent = this.displayedAltitude.toFixed(1);

        // Update score
        const score = this.getEl('score-value');
        if (score) score.textContent = this.gameState.deliveries;

        // Update package info
        const currentPackage = this.packageSystem.getCurrentPackage();
        if (currentPackage) {
            const pn = this.getEl('package-name');
            if (pn) pn.textContent = currentPackage.name;
            const pd = this.getEl('package-dest');
            if (pd) pd.textContent = `→ ${currentPackage.destination}`;

            // Update direction indicator
            this.updateDirectionIndicator(currentPackage);
        }

        // Update bounce indicator based on charge
        const bounceCharge = this.player.getBounceCharge();
        const bounceEl = this.getEl('bounce-charge');
        if (!bounceEl) return;
        if (bounceCharge >= 1) {
            bounceEl.textContent = '🚀';
        } else if (bounceCharge >= 0.5) {
            bounceEl.textContent = '⬆️';
        } else {
            bounceEl.textContent = '⏳';
        }
    }

    updateDirectionIndicator(currentPackage) {
        const destPos = this.packageSystem.getDestinationPosition(currentPackage.destination);
        if (!destPos) return;

        const playerPos = this.player.getPosition();

        // Project both positions to screen space
        const destScreen = destPos.clone().project(this.camera);
        const playerScreen = playerPos.clone().project(this.camera);

        // Calculate angle to destination
        const dx = destScreen.x - playerScreen.x;
        const dy = destScreen.y - playerScreen.y;
        const angle = Math.atan2(-dy, dx) * (180 / Math.PI) - 90;

        const arrow = this.getEl('dest-arrow');
        if (arrow) {
            arrow.style.transform = `rotate(${angle}deg)`;
        }
    }

    updateLoadingProgress(progress) {
        this.loadingProgress = progress;
        const bar = this.getEl('loading-progress');
        if (bar) bar.style.width = `${progress}%`;
    }

    hideLoadingScreen() {
        this.isLoading = false;
        const ls = this.getEl('loading-screen');
        if (ls) ls.classList.add('hidden');
    }

    onResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();

        this.renderer.setSize(window.innerWidth, window.innerHeight);

        const pr = this.renderer.getPixelRatio();
        this.composer.setPixelRatio(pr);
        this.composer.setSize(window.innerWidth, window.innerHeight);

        // Bloom resolution must be in render pixels, not CSS pixels
        this.bloomPass.resolution.set(
            Math.floor(window.innerWidth * pr),
            Math.floor(window.innerHeight * pr)
        );
    }

    animate(currentTime = 0) {
        requestAnimationFrame((t) => this.animate(t));

        // Calculate delta time for 90fps target
        this.deltaTime = Math.min((currentTime - this.lastFrameTime) / 1000, 0.1);
        this.lastFrameTime = currentTime;

        if (this.isLoading) return;

        // Update controls
        this.controls.update();

        // Update game time
        const time = currentTime * 0.001;

        // Update all game components
        this.planet.update(time, this.deltaTime, this.camera);
        this.cityLights.update(time, this.deltaTime, this.camera);
        this.spaceEnv.update(time, this.deltaTime);
        this.aurora.update(time, this.deltaTime, this.player.getPosition());
        this.trampolineNetwork.update(time, this.deltaTime);
        this.player.update(time, this.deltaTime, this.keys);
        this.packageSystem.update(time, this.deltaTime, this.player);

        // Dynamic post-processing adjustments (respects fine-grained toggles)
        const speed = this.player.getSpeed();
        const altitude = this.player.getAltitude();

        // Dynamic chromatic aberration scales with player speed
        if (this.postProcessSettings.dynamicChromatic && this.chromaticPass.enabled) {
            this.chromaticPass.uniforms.amount.value =
                this.postProcessSettings.chromaticAmount + speed * 0.0008;
        }

        // Dynamic bloom scales with altitude: 0.3 at ground → 0.7 in space
        if (this.postProcessSettings.dynamicBloom && this.bloomPass.enabled) {
            this.bloomPass.strength = Math.min(0.7, 0.3 + Math.min(altitude / 200, 0.4));
        }

        // Update audio based on game state
        if (this.audio) {
            this.audio.updateAltitude(altitude);
            this.audio.updateSpeed(speed);
        }

        // Update UI
        this.updateUI();

        // Update debug info
        if (this.debugInfo) {
            this.fpsFrames++;
            const now = performance.now();
            if (now - this.fpsTime >= 1000) {
                this.debugInfo.fps = Math.round(this.fpsFrames * 1000 / (now - this.fpsTime));
                this.fpsFrames = 0;
                this.fpsTime = now;
            }
            const cp = this.camera.position;
            const pp = this.player.getPosition();
            this.debugInfo.cameraPos = `${cp.x.toFixed(1)}, ${cp.y.toFixed(1)}, ${cp.z.toFixed(1)}`;
            this.debugInfo.playerPos = `${pp.x.toFixed(1)}, ${pp.y.toFixed(1)}, ${pp.z.toFixed(1)}`;
            this.debugInfo.altitude = altitude.toFixed(1);
            this.debugInfo.velocity = speed.toFixed(2);
        }

        // Render with or without post-processing
        if (this.usePostProcessing) {
            this.composer.render();
        } else {
            this.renderer.render(this.scene, this.camera);
        }
    }
}

// Start the game
const game = new GloballGame();

// Export for debugging
window.game = game;
