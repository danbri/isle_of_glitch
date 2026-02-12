/**
 * GLO-BALL GOPHER - Bounce the globe. Deliver the goods.
 * Main game entry point
 */

import * as THREE from 'three';
import { TrackballControls } from 'three/addons/controls/TrackballControls.js';
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
import { CountryOutlines } from './components/CountryOutlines.js';
import { ChromaticAberrationShader } from './shaders/ChromaticAberration.js';
import { AtmosphericScatteringShader } from './shaders/AtmosphericScattering.js';
import { OrbitalMechanics } from './systems/OrbitalMechanics.js';
import { ShipsComputer } from './systems/ShipsComputer.js';
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

        // Game session — 3-minute timed rounds
        this.session = {
            timeLimit: 180, // seconds
            startTime: 0,
            started: false,
            ended: false,
            bestCombo: 0,
            bestDelivery: 0
        };

        // Analog touch steering (replaces binary keys)
        this.steerX = 0; // -1 to 1
        this.steerY = 0; // -1 to 1
        this.steerMomentum = 0.85; // decay factor when finger lifts

        // Defer audio initialization to avoid blocking
        this.audio = null;

        console.log('🎮 Glo-ball Gopher starting...');
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

    setupFPSGraph() {
        const canvas = this.getEl('fps-graph');
        if (!canvas) return;

        // High-DPI canvas
        const dpr = window.devicePixelRatio || 1;
        const w = 140, h = 60;
        canvas.width = w * dpr;
        canvas.height = h * dpr;
        canvas.style.width = w + 'px';
        canvas.style.height = h + 'px';

        this.fpsGraph = {
            canvas,
            ctx: canvas.getContext('2d'),
            dpr,
            w, h,
            history: [],       // raw FPS samples (1 per frame)
            maxSamples: 140,   // one pixel per sample
            avg1s: 0,
            avg5s: 0,
            avg15s: 0,
            lastDraw: 0
        };
    }

    updateFPSGraph(now) {
        if (!this.fpsGraph || !this._debugVisible) return;

        // Record frame time as FPS
        const dt = now - (this._lastFrameTimeFPS || now);
        this._lastFrameTimeFPS = now;
        if (dt <= 0 || dt > 2000) return; // skip garbage frames

        const fps = Math.min(120, 1000 / dt);
        const g = this.fpsGraph;
        g.history.push(fps);
        if (g.history.length > g.maxSamples) g.history.shift();

        // Compute smoothed averages
        const len = g.history.length;
        const avg = (n) => {
            const slice = g.history.slice(Math.max(0, len - n));
            return slice.reduce((a, b) => a + b, 0) / slice.length;
        };
        g.avg1s = avg(60);    // ~1 second at 60fps
        g.avg5s = avg(300);   // ~5 seconds
        g.avg15s = avg(900);  // ~15 seconds

        // Redraw at ~10Hz to save CPU
        if (now - g.lastDraw < 100) return;
        g.lastDraw = now;

        const { ctx, dpr, w, h } = g;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        // Background
        ctx.fillStyle = 'rgba(0,0,0,0.75)';
        ctx.clearRect(0, 0, w, h);
        ctx.fillRect(0, 0, w, h);

        // 60fps reference line
        const maxFPS = 90;
        const yFor = (f) => h - 12 - (Math.min(f, maxFPS) / maxFPS) * (h - 16);

        ctx.strokeStyle = 'rgba(255,255,255,0.15)';
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(0, yFor(60));
        ctx.lineTo(w, yFor(60));
        ctx.stroke();

        // Sparkline graph
        if (g.history.length > 1) {
            ctx.beginPath();
            const step = w / g.maxSamples;
            const offset = g.maxSamples - g.history.length;
            for (let i = 0; i < g.history.length; i++) {
                const x = (offset + i) * step;
                const y = yFor(g.history[i]);
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            // Color based on current FPS
            const curFps = g.history[g.history.length - 1];
            ctx.strokeStyle = curFps >= 55 ? '#44ff88' : curFps >= 30 ? '#ffaa44' : '#ff4444';
            ctx.lineWidth = 1;
            ctx.stroke();
        }

        // Text labels
        ctx.font = '9px monospace';
        ctx.textBaseline = 'top';
        const curFps = Math.round(g.history[g.history.length - 1] || 0);
        ctx.fillStyle = curFps >= 55 ? '#44ff88' : curFps >= 30 ? '#ffaa44' : '#ff4444';
        ctx.fillText(`${curFps} fps`, 2, 1);

        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.fillText(`1s:${Math.round(g.avg1s)} 5s:${Math.round(g.avg5s)} 15s:${Math.round(g.avg15s)}`, 2, h - 10);
    }

    setupShipsComputer() {
        // Toggle button
        const toggleBtn = this.getEl('computer-toggle');
        if (toggleBtn) {
            const toggle = () => {
                this.shipsComputer.toggle();
                const icon = this.getEl('computer-icon');
                if (icon) icon.style.opacity = this.shipsComputer.visible ? '1' : '';
                toggleBtn.style.background = this.shipsComputer.visible
                    ? 'rgba(68,136,255,0.3)' : 'rgba(0,0,0,0.4)';
                if (navigator.vibrate) navigator.vibrate(10);
            };
            toggleBtn.addEventListener('click', toggle);
            toggleBtn.addEventListener('touchend', (e) => { e.preventDefault(); toggle(); });
        }

        // Close button
        const closeBtn = this.getEl('sc-close');
        if (closeBtn) {
            const close = () => this.shipsComputer.toggle();
            closeBtn.addEventListener('click', close);
            closeBtn.addEventListener('touchend', (e) => { e.preventDefault(); close(); });
        }

        // Tab buttons
        const navTab = this.getEl('sc-tab-nav');
        const orbitTab = this.getEl('sc-tab-orbit');
        if (navTab) {
            navTab.addEventListener('click', () => this.shipsComputer.setTab('NAV'));
            navTab.addEventListener('touchend', (e) => { e.preventDefault(); this.shipsComputer.setTab('NAV'); });
        }
        if (orbitTab) {
            orbitTab.addEventListener('click', () => this.shipsComputer.setTab('ORBIT'));
            orbitTab.addEventListener('touchend', (e) => { e.preventDefault(); this.shipsComputer.setTab('ORBIT'); });
        }

        // Keyboard shortcut: M for map
        // (added to existing keydown handler)
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

            // Ship's Computer — 2D nav map + orbital view overlay
            this.shipsComputer = new ShipsComputer();
            this.shipsComputer.init(
                this.trampolineNetwork, this.orbital,
                this.player, this.packageSystem
            );
            this.setupShipsComputer();

            // Initialize audio (deferred, non-blocking)
            try {
                this.audio = new AudioSystem();
                console.log('🔊 Audio initialized');
            } catch (e) {
                console.warn('Audio init failed:', e);
                this.audio = { playBounce: () => {}, updateAltitude: () => {}, updateSpeed: () => {} };
            }

            // Request screen wake lock (mobile)
            this.requestWakeLock();

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

        this.updateLoadingProgress(10, 'Initializing renderer...');
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

        // Trackball controls for free rotation (debug only — player camera is default)
        this.controls = new TrackballControls(this.camera, this.renderer.domElement);
        this.controls.enabled = false;
        this.controls.rotateSpeed = 2.0;
        this.controls.zoomSpeed = 1.5;
        this.controls.panSpeed = 0.0; // Disable panning — just rotate and zoom
        this.controls.noPan = true;
        this.controls.noZoom = false;
        this.controls.staticMoving = false;
        this.controls.dynamicDampingFactor = 0.15;
        this.controls.minDistance = 11;
        this.controls.maxDistance = 80;

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

        this.updateLoadingProgress(20, 'Configuring optics...');
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

        this.updateLoadingProgress(30, 'Preparing world...');
    }

    async loadGameComponents() {
        // Initialize game state
        this.gameState = new GameState();

        this.updateLoadingProgress(33, 'Computing orbits...');

        // Orbital mechanics — real sun/moon/ISS positions via astronomy-engine
        console.log('Loading: Orbital Mechanics...');
        this.orbital = new OrbitalMechanics();
        this.orbital.init();

        this.updateLoadingProgress(35, 'Generating planet...');

        // Create planet — pass orbital so it uses real sun direction
        console.log('Loading: Planet...');
        this.planet = new Planet(this.scene, this.orbital);
        await this.planet.init();

        this.updateLoadingProgress(50, 'Illuminating cities...');

        // Create city lights
        console.log('Loading: City Lights...');
        this.cityLights = new CityLights(this.scene, this.planet);
        await this.cityLights.init();

        this.updateLoadingProgress(60, 'Scattering starlight...');

        // Create space environment (stars, ISS)
        console.log('Loading: Space Environment...');
        this.spaceEnv = new SpaceEnvironment(this.scene);
        await this.spaceEnv.init();

        this.updateLoadingProgress(70, 'Charging aurora...');

        // Create aurora borealis
        console.log('Loading: Aurora...');
        this.aurora = new AuroraBorealis(this.scene);
        await this.aurora.init();

        this.updateLoadingProgress(80, 'Drawing borders...');

        // Create country outlines
        console.log('Loading: Country Outlines...');
        this.countryOutlines = new CountryOutlines(this.scene);
        await this.countryOutlines.init();

        this.updateLoadingProgress(82, 'Magnetizing 7,900 airports...');

        // Create trampoline network (loads ~7900 airports)
        console.log('Loading: Airports...');
        this.trampolineNetwork = new TrampolineNetwork(this.scene, this.planet);
        await this.trampolineNetwork.init();

        this.updateLoadingProgress(88, 'Deploying delivery pod...');

        // Create player
        console.log('Loading: Player...');
        this.player = new Player(this.scene, this.camera, this.gameState);
        await this.player.init();
        // Sync player camera with orbit controls initial state
        this.player.cameraEnabled = !this.controls.enabled;
        // Wire up magnetic attraction to trampoline network
        this.player.setTrampolineNetwork(this.trampolineNetwork);

        this.updateLoadingProgress(90, 'Assigning first package...');

        // Create package system
        console.log('Loading: Package System...');
        this.packageSystem = new PackageSystem(this.scene, this.gameState, this.trampolineNetwork);
        await this.packageSystem.init();

        // Trajectory preview arc during charge — bright and clear
        const trajGeo = new THREE.BufferGeometry();
        trajGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(51 * 3), 3));
        const trajMat = new THREE.LineDashedMaterial({
            color: 0x88ddff, dashSize: 0.4, gapSize: 0.12,
            transparent: true, opacity: 0.85, linewidth: 1,
            depthWrite: false
        });
        this.trajectoryLine = new THREE.Line(trajGeo, trajMat);
        this.trajectoryLine.visible = false;
        this.trajectoryLine.renderOrder = 100; // Draw on top
        this.scene.add(this.trajectoryLine);

        // Proximity tracking
        this._lastProximityPing = 0;
        this._timerWarningTime = 0;

        console.log('Loading: Complete!');
        this.updateLoadingProgress(100);
    }

    setupInput() {
        // Keyboard controls
        this.keys = {};

        // Hold-to-charge bounce state
        this.bounceCharging = false;
        this.bounceHoldStart = 0;

        window.addEventListener('keydown', (e) => {
            this.keys[e.code] = true;
            this.handleKeyDown(e);
        });

        window.addEventListener('keyup', (e) => {
            this.keys[e.code] = false;
            this.handleKeyUp(e);
        });

        // Mouse/touch for trampoline selection
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();

        this.renderer.domElement.addEventListener('click', (e) => this.handleClick(e));
        this.renderer.domElement.addEventListener('mousemove', (e) => this.handleMouseMove(e));

        // Touch controls for mobile
        this.touchStartPos = null;
        this.touchMoved = false;
        this.renderer.domElement.addEventListener('touchstart', (e) => this.handleTouchStart(e), { passive: false });
        this.renderer.domElement.addEventListener('touchmove', (e) => this.handleTouchMove(e), { passive: false });
        this.renderer.domElement.addEventListener('touchend', (e) => this.handleTouchEnd(e), { passive: false });

        // Bounce button: hold-to-charge on touch, release to bounce
        const bounceIndicator = this.getEl('bounce-indicator');
        if (bounceIndicator) {
            const startCharge = () => {
                this.bounceCharging = true;
                this.bounceHoldStart = Date.now();
                // Haptic feedback on charge start
                if (navigator.vibrate) navigator.vibrate(30);
                // Start charge sound
                if (this.audio && this.audio.startCharge) this.audio.startCharge();
                // Start charge pulse animation
                bounceIndicator.style.transform = 'scale(1.05)';
                this._chargeInterval = setInterval(() => {
                    if (!this.bounceCharging) return;
                    const holdMs = Date.now() - this.bounceHoldStart;
                    // Escalating haptic pulses
                    if (navigator.vibrate) {
                        if (holdMs > 600) navigator.vibrate(20);
                        else if (holdMs > 200) navigator.vibrate(10);
                    }
                    // Pulse animation
                    const pulse = 1.05 + Math.sin(holdMs * 0.01) * 0.05;
                    bounceIndicator.style.transform = `scale(${pulse})`;
                }, 100);
            };
            const releaseCharge = () => {
                if (this.bounceCharging) {
                    this.bounceCharging = false;
                    const holdMs = Date.now() - this.bounceHoldStart;
                    clearInterval(this._chargeInterval);
                    bounceIndicator.style.transform = 'scale(1)';
                    // Stop charge sound
                    if (this.audio && this.audio.stopCharge) this.audio.stopCharge();
                    // Strong haptic on release
                    if (navigator.vibrate) navigator.vibrate(50);
                    // Hide trajectory preview
                    if (this.trajectoryLine) this.trajectoryLine.visible = false;
                    this.doBounce(holdMs);
                }
            };

            bounceIndicator.addEventListener('touchstart', (e) => {
                e.preventDefault();
                e.stopPropagation();
                startCharge();
            }, { passive: false });
            bounceIndicator.addEventListener('touchend', (e) => {
                e.preventDefault();
                e.stopPropagation();
                releaseCharge();
            }, { passive: false });
            bounceIndicator.addEventListener('touchcancel', (e) => {
                this.bounceCharging = false;
                clearInterval(this._chargeInterval);
                bounceIndicator.style.transform = 'scale(1)';
                if (this.audio && this.audio.stopCharge) this.audio.stopCharge();
                if (this.trajectoryLine) this.trajectoryLine.visible = false;
            }, { passive: false });
            // Desktop mouse fallback
            bounceIndicator.addEventListener('mousedown', startCharge);
            bounceIndicator.addEventListener('mouseup', releaseCharge);
        }
    }

    handleTouchStart(e) {
        if (e.touches.length === 1) {
            this.touchStartPos = {
                x: e.touches[0].clientX,
                y: e.touches[0].clientY,
                time: Date.now()
            };
            this.touchMoved = false;
            // Canvas touch is for steering/targeting only — bounce button handles bouncing
        }
    }

    handleTouchMove(e) {
        if (!this.touchStartPos || e.touches.length !== 1) return;

        const dx = e.touches[0].clientX - this.touchStartPos.x;
        const dy = e.touches[0].clientY - this.touchStartPos.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        // If finger moved significantly, it's a swipe not a hold
        if (dist > 25) {
            this.touchMoved = true;
            this.bounceCharging = false;
        }

        // Analog steering: swipe distance maps to force (0-1), with deadzone
        const deadzone = 8;
        const maxSwipe = 80; // pixels for full force

        if (Math.abs(dx) > deadzone) {
            this.steerX = Math.sign(dx) * Math.min(1, (Math.abs(dx) - deadzone) / maxSwipe);
        } else {
            this.steerX = 0;
        }

        if (Math.abs(dy) > deadzone) {
            this.steerY = Math.sign(dy) * Math.min(1, (Math.abs(dy) - deadzone) / maxSwipe);
        } else {
            this.steerY = 0;
        }
    }

    handleTouchEnd(e) {
        // Canvas touch = airport target selection only (never bounces)
        if (this.touchStartPos && !this.touchMoved) {
            const touch = e.changedTouches[0];
            this.selectAirportAtScreen(touch.clientX, touch.clientY);
        }

        // Steer decays with momentum (don't zero instantly)
        // The decay is applied each frame in animate()
        this.touchStartPos = null;
    }

    handleKeyDown(e) {
        switch(e.code) {
            case 'Space':
                e.preventDefault();
                if (!this.bounceCharging) {
                    this.bounceCharging = true;
                    this.bounceHoldStart = Date.now();
                    if (this.audio && this.audio.startCharge) this.audio.startCharge();
                }
                break;
            case 'KeyE':
                this.player.interact();
                break;
            case 'KeyH':
                this._debugVisible = !this._debugVisible;
                this.toggleGUI();
                const fpsC = this.getEl('fps-graph');
                if (fpsC) fpsC.style.display = this._debugVisible ? 'block' : 'none';
                break;
            case 'KeyM':
                if (this.shipsComputer) this.shipsComputer.toggle();
                break;
        }
    }

    handleKeyUp(e) {
        if (e.code === 'Space' && this.bounceCharging) {
            this.bounceCharging = false;
            const holdMs = Date.now() - this.bounceHoldStart;
            if (this.audio && this.audio.stopCharge) this.audio.stopCharge();
            if (this.trajectoryLine) this.trajectoryLine.visible = false;
            this.doBounce(holdMs);
        }
    }

    doBounce(holdMs) {
        if (this.session.ended) return; // Can't bounce after game over

        // --- RAPID-TAP ACCELERATION ---
        // Quick taps (<200ms hold) while airborne boost speed or unstick
        if (!this.player.isOnGround && holdMs < 200) {
            const speed = this.player.velocity.length();
            const up = this.player.position.clone().normalize();
            this._rapidTapCount = (this._rapidTapCount || 0) + 1;

            if (speed > 0.3) {
                // Boost in current travel direction — 20% speed, scaling with tap count
                const boostDir = this.player.velocity.clone().normalize();
                const tapMultiplier = Math.min(1 + this._rapidTapCount * 0.15, 2.0);
                const boostForce = Math.min(speed * 0.2 * tapMultiplier, 5);
                this.player.velocity.add(boostDir.multiplyScalar(boostForce));
            } else {
                // Unstick: nearly stationary in air — kick upward + forward
                const aimDir = this.player._aimDirection || up;
                const kickDir = up.clone().multiplyScalar(0.6)
                    .add(aimDir.clone().multiplyScalar(0.4)).normalize();
                this.player.velocity.add(kickDir.multiplyScalar(3));
            }

            // Feedback — rising pitch per tap
            if (this.audio && this.audio.playBoost) {
                this.audio.playBoost(this._rapidTapCount);
            } else if (this.audio) {
                this.audio.playBounce(0.3 + this._rapidTapCount * 0.1);
            }
            if (navigator.vibrate) navigator.vibrate(15);

            // Show boost feedback
            const el = this.getEl('target-notification');
            if (el) {
                const boostLabels = ['BOOST!', 'BOOST x2!', 'BOOST x3!', 'TURBO!'];
                el.textContent = boostLabels[Math.min(this._rapidTapCount - 1, 3)];
                el.style.color = '#88ddff';
                el.style.opacity = '1';
                clearTimeout(this._targetNotifTimeout);
                this._targetNotifTimeout = setTimeout(() => {
                    el.style.opacity = '0';
                    this._rapidTapCount = 0;
                }, 800);
            }

            // Small visual pulse (lighter than full bounce effect)
            this.player.createBounceEffect();
            return; // Don't do a full bounce
        }

        // Reset rapid tap counter on full bounces
        this._rapidTapCount = 0;

        // Hold duration determines bounce type:
        //   Quick tap (<200ms) = Scenic Hop (gentle, low arc)
        //   Medium hold (200-600ms) = Express Arc (high, powerful)
        //   Long hold (>600ms) = Night Glide (low, far, fast)
        let routeType;
        if (holdMs < 200) {
            routeType = 'scenic';
        } else if (holdMs < 600) {
            routeType = 'express';
        } else {
            routeType = 'stealth';
        }

        this.player.setRouteType(routeType);

        // Chain launch bonus: bounce within 3s of delivery = 1.3x force
        const timeSinceDelivery = this._lastDeliveryTime ? (Date.now() - this._lastDeliveryTime) : Infinity;
        if (timeSinceDelivery < 3000) {
            this.player.bounceForceMultiplier = 1.3;
        } else {
            this.player.bounceForceMultiplier = 1.0;
        }

        this.player.bounce();
        if (this.audio) this.audio.playBounce(this.player.getBounceCharge());

        // Chain launch power chord on top of normal bounce
        if (timeSinceDelivery < 3000 && this.audio && this.audio.playChainLaunch) {
            this.audio.playChainLaunch();
        }

        // Show bounce type feedback + chain launch indicator
        const labels = { scenic: 'Quick Pulse', express: 'Mag Launch', stealth: 'Long Range' };
        const el = this.getEl('target-notification');
        if (el) {
            const chainText = timeSinceDelivery < 3000 ? ' CHAIN!' : '';
            el.textContent = labels[routeType] + chainText;
            el.style.color = chainText ? '#44ff88' : '#4488ff';
            el.style.opacity = '1';
            clearTimeout(this._targetNotifTimeout);
            this._targetNotifTimeout = setTimeout(() => {
                el.style.opacity = '0';
                el.style.color = '#4488ff';
            }, 800);
        }
    }

    handleClick(e) {
        this.selectAirportAtScreen(e.clientX, e.clientY);
    }

    selectAirportAtScreen(screenX, screenY) {
        this.mouse.x = (screenX / window.innerWidth) * 2 - 1;
        this.mouse.y = -(screenY / window.innerHeight) * 2 + 1;
        this.raycaster.setFromCamera(this.mouse, this.camera);

        // Try detailed trampoline meshes first (precise hit)
        const trampolines = this.trampolineNetwork.getTrampolineMeshes();
        const intersects = this.raycaster.intersectObjects(trampolines, true);
        if (intersects.length > 0) {
            let trampData = intersects[0].object.userData.trampoline;
            if (!trampData && intersects[0].object.parent) {
                trampData = intersects[0].object.parent.userData.trampoline;
            }
            if (trampData) {
                this.player.setTargetTrampoline(trampData);
                this.showTargetNotification(trampData);
                if (this.audio && this.audio.playSelectAirport) this.audio.playSelectAirport();
                return true;
            }
        }

        // Fallback: raycast planet sphere, find nearest airport to hit point
        if (this.planet && this.planet.planetMesh) {
            const planetHits = this.raycaster.intersectObject(this.planet.planetMesh);
            if (planetHits.length > 0) {
                const hitPoint = planetHits[0].point;
                const { trampoline, distance } = this.trampolineNetwork.getNearestTrampoline(hitPoint);
                if (trampoline && distance < 2.5) {
                    this.player.setTargetTrampoline(trampoline);
                    this.showTargetNotification(trampoline);
                    return true;
                }
            }
        }

        return false;
    }

    showTargetNotification(trampData) {
        const name = trampData.airport ? `${trampData.airport.name} (${trampData.airport.city})` : 'Unknown';
        const el = this.getEl('target-notification');
        if (el) {
            el.textContent = `Target: ${name}`;
            el.style.opacity = '1';
            clearTimeout(this._targetNotifTimeout);
            this._targetNotifTimeout = setTimeout(() => { el.style.opacity = '0'; }, 2000);
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

    setupUI() {
        // Location display is updated in updateUI each frame
    }

    setupDebugPanel() {
        // Only show debug UI if ?debug in URL or H key is pressed
        this._debugVisible = new URLSearchParams(window.location.search).has('debug');

        this.gui = new GUI({ title: 'Debug Panel' });

        // Start closed and hidden unless debug mode
        this.gui.close();
        if (!this._debugVisible) this.gui.hide();

        // Position to not block scores/altitude (bottom-left) and make draggable
        const el = this.gui.domElement;
        el.style.position = 'fixed';
        el.style.top = 'auto';
        el.style.right = 'auto';
        el.style.bottom = '120px';
        el.style.left = '8px';
        el.style.zIndex = '1000';
        el.style.maxHeight = '60vh';
        el.style.overflow = 'auto';
        el.style.opacity = '0.9';

        // Draggable via title bar
        const titleBar = el.querySelector('.title');
        if (titleBar) {
            titleBar.style.cursor = 'grab';
            let dragging = false, startX, startY, origLeft, origBottom;
            const onDown = (e) => {
                dragging = true;
                titleBar.style.cursor = 'grabbing';
                const pt = e.touches ? e.touches[0] : e;
                startX = pt.clientX; startY = pt.clientY;
                origLeft = parseInt(el.style.left) || 8;
                origBottom = parseInt(el.style.bottom) || 120;
                e.preventDefault();
            };
            const onMove = (e) => {
                if (!dragging) return;
                const pt = e.touches ? e.touches[0] : e;
                el.style.left = (origLeft + pt.clientX - startX) + 'px';
                el.style.bottom = (origBottom - (pt.clientY - startY)) + 'px';
            };
            const onUp = () => { dragging = false; titleBar.style.cursor = 'grab'; };
            titleBar.addEventListener('mousedown', onDown);
            titleBar.addEventListener('touchstart', onDown, { passive: false });
            window.addEventListener('mousemove', onMove);
            window.addEventListener('touchmove', onMove, { passive: false });
            window.addEventListener('mouseup', onUp);
            window.addEventListener('touchend', onUp);
        }

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
            enableOrbitControls: false
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
        controlsFolder.add(this.debugSettings, 'enableOrbitControls').name('Trackball Controls').onChange(v => {
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

        // Ship & Scale — live tuning for camera distance, ship size, pad size
        const scaleFolder = this.gui.addFolder('Ship & Scale');
        this.scaleSettings = {
            shipScale: this.player.shipScale,
            groundOffset: this.player.groundOffset,
            groundedHeight: 1.0,
            flightHeightBase: 1.5,
            behindGround: 0.7,
            behindFlight: 0.5,
            padScale: this.trampolineNetwork.padScale
        };
        scaleFolder.add(this.scaleSettings, 'shipScale', 0.01, 0.5, 0.01).name('Ship Scale').onChange(v => {
            this.player.shipScale = v;
        });
        scaleFolder.add(this.scaleSettings, 'groundOffset', 0.01, 0.5, 0.01).name('Ground Offset').onChange(v => {
            this.player.groundOffset = v;
        });
        scaleFolder.add(this.scaleSettings, 'groundedHeight', 0.3, 4, 0.1).name('Cam Grounded H').onChange(v => {
            this.player._debugGroundedHeight = v;
        });
        scaleFolder.add(this.scaleSettings, 'flightHeightBase', 0.5, 6, 0.1).name('Cam Flight H').onChange(v => {
            this.player._debugFlightHeight = v;
        });
        scaleFolder.add(this.scaleSettings, 'behindGround', 0.1, 3, 0.05).name('Behind (ground)').onChange(v => {
            this.player._debugBehindGround = v;
        });
        scaleFolder.add(this.scaleSettings, 'behindFlight', 0.1, 3, 0.05).name('Behind (flight)').onChange(v => {
            this.player._debugBehindFlight = v;
        });
        scaleFolder.add(this.scaleSettings, 'padScale', 0.1, 2, 0.05).name('Pad Scale').onChange(v => {
            this.trampolineNetwork.padScale = v;
            this.trampolineNetwork.detailedPool.forEach(g => {
                if (g.visible) g.scale.setScalar(v);
            });
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

        // Orbital mechanics controls
        const orbitalFolder = this.gui.addFolder('Orbital Mechanics');
        this.orbitalSettings = {
            timeWarp: 1,
            gameDate: '',
            moonDist: '',
            sunAz: ''
        };
        orbitalFolder.add(this.orbitalSettings, 'timeWarp', 1, 100000, 1).name('Time Warp').onChange(v => {
            if (this.orbital) this.orbital.setTimeWarp(v);
        });
        orbitalFolder.add(this.orbitalSettings, 'gameDate').name('Date/Time').listen();
        orbitalFolder.add(this.orbitalSettings, 'moonDist').name('Moon dist').listen();
        orbitalFolder.add(this.orbitalSettings, 'sunAz').name('Sun dir').listen();

        // FPS counter
        this.fpsFrames = 0;
        this.fpsTime = performance.now();

        // Settings toggle — always visible, opens debug panel + FPS graph
        const settingsToggle = this.getEl('settings-toggle');
        if (settingsToggle) {
            const toggleSettings = () => {
                this._debugVisible = !this._debugVisible;
                this.toggleGUI();
                // Toggle FPS graph
                const fpsCanvas = this.getEl('fps-graph');
                if (fpsCanvas) fpsCanvas.style.display = this._debugVisible ? 'block' : 'none';
                // Visual feedback
                const icon = this.getEl('settings-icon');
                if (icon) icon.style.opacity = this._debugVisible ? '1' : '';
                settingsToggle.style.opacity = this._debugVisible ? '0.9' : '0.5';
                if (navigator.vibrate) navigator.vibrate(10);
            };
            settingsToggle.addEventListener('click', toggleSettings);
            settingsToggle.addEventListener('touchend', (e) => {
                e.preventDefault();
                toggleSettings();
            });
        }

        // FPS graph setup
        this.setupFPSGraph();

        // Audio mute toggle
        const audioToggle = this.getEl('audio-toggle');
        if (audioToggle) {
            const toggleAudio = () => {
                if (!this.audio) return;
                const icon = this.getEl('audio-icon');
                if (this.audio.isMuted) {
                    this.audio.unmute();
                    if (icon) icon.textContent = '🔊';
                } else {
                    this.audio.mute();
                    if (icon) icon.textContent = '🔇';
                }
            };
            audioToggle.addEventListener('click', toggleAudio);
            audioToggle.addEventListener('touchend', (e) => {
                e.preventDefault();
                toggleAudio();
            });
        }

        // Free camera toggle — lets user spin/zoom the globe
        const cameraToggle = this.getEl('camera-toggle');
        if (cameraToggle) {
            const toggleCamera = () => {
                const icon = this.getEl('camera-icon');
                const freeLook = !this.controls.enabled;
                this.controls.enabled = freeLook;
                this.player.cameraEnabled = !freeLook;
                this.debugSettings.enableOrbitControls = freeLook;
                if (icon) icon.textContent = freeLook ? '🎮' : '🌍';
                // Brief haptic
                if (navigator.vibrate) navigator.vibrate(15);
            };
            cameraToggle.addEventListener('click', toggleCamera);
            cameraToggle.addEventListener('touchend', (e) => {
                e.preventDefault();
                toggleCamera();
            });
        }

    }

    updateUI() {
        // Update altitude display with smoothing to prevent flickering
        const targetAltitude = this.player.getAltitude();
        this.displayedAltitude += (targetAltitude - this.displayedAltitude) * this.altitudeSmoothFactor;
        const alt = this.getEl('altitude-value');
        if (alt) alt.textContent = this.displayedAltitude.toFixed(1);

        // Update score (actual score value, not just deliveries)
        const score = this.getEl('score-value');
        if (score) score.textContent = this.gameState.score.toLocaleString();
        const delCount = this.getEl('deliveries-count');
        if (delCount) delCount.textContent = `${this.gameState.deliveries} deliveries`;

        // --- DELIVERY CHOICE UI ---
        this.updateDeliveryChoiceUI();

        // Update package info
        const currentPackage = this.packageSystem.getCurrentPackage();
        if (currentPackage) {
            const pn = this.getEl('package-name');
            const hops = currentPackage.hopsCompleted || 0;
            if (pn) pn.textContent = `${currentPackage.type.name}${hops > 0 ? ` (hop ${hops})` : ''}`;
            const pd = this.getEl('package-dest');
            if (pd) pd.textContent = `→ ${currentPackage.destinationName}`;

            // Auto-target: use nav target (next hop), not final destination
            if (!this.player.targetTrampoline) {
                const navTarget = this.packageSystem.getNavTarget();
                if (navTarget) {
                    this.player.setTargetTrampoline(navTarget);
                }
            }

            // Update direction indicator
            this.updateDirectionIndicator();
        } else if (this.packageSystem.awaitingChoice || this.packageSystem.awaitingHop) {
            const pn = this.getEl('package-name');
            const pd = this.getEl('package-dest');
            if (this.packageSystem.awaitingHop) {
                if (pn) pn.textContent = 'Pick next hop...';
                if (pd) pd.textContent = 'Choose your route below';
            } else {
                if (pn) pn.textContent = 'Choose delivery...';
                if (pd) pd.textContent = 'Tap an option below';
            }

            // Hide direction display when choosing
            const dirContainer = this.getEl('direction-display');
            if (dirContainer) dirContainer.style.opacity = '0';
        }

        // Simplify HUD during flight — fade secondary panels so task is clear
        const isAirborne = this.player.getAltitude() > 0.5;
        const hasDelivery = !!currentPackage;
        const secondaryOpacity = (isAirborne && hasDelivery) ? '0.3' : '1';
        const altPanel = this.getEl('altitude-display');
        const pkgPanel = this.getEl('package-info');
        const locPanel = this.getEl('location-info');
        if (altPanel) altPanel.style.opacity = secondaryOpacity;
        if (pkgPanel) pkgPanel.style.opacity = secondaryOpacity;
        if (locPanel) locPanel.style.opacity = secondaryOpacity;

        // Update nearest airport + target location
        const playerPos = this.player.getPosition();
        const { trampoline: nearest } = this.trampolineNetwork.getNearestTrampoline(playerPos);
        const nearEl = this.getEl('nearest-airport');
        if (nearEl && nearest) {
            nearEl.textContent = `${nearest.airport.name} ${nearest.airport.city}`;
        }
        const targetEl = this.getEl('target-airport');
        if (targetEl) {
            if (this.player.targetTrampoline) {
                const t = this.player.targetTrampoline;
                targetEl.textContent = `\u2192 ${t.airport.name} ${t.airport.city}`;
                targetEl.style.color = '#77bbff';
            } else {
                targetEl.textContent = 'Hold launch \u2022 Tap airport to target';
                targetEl.style.color = 'rgba(255,255,255,0.4)';
            }
        }

        // Update timer and combo
        this.updateTimerDisplay();
        this.updateComboDisplay();

        // Update bounce indicator — show charge type during hold
        const bounceEl = this.getEl('bounce-charge');
        const bounceBtn = this.getEl('bounce-indicator');
        if (!bounceEl) return;
        if (this.bounceCharging) {
            const holdMs = Date.now() - this.bounceHoldStart;
            if (holdMs < 200) {
                bounceEl.textContent = '🧲';
                if (bounceBtn) bounceBtn.style.background =
                    'conic-gradient(from 0deg, #88aaff, #4488ff, #88aaff)';
            } else if (holdMs < 600) {
                bounceEl.textContent = '⚡';
                if (bounceBtn) bounceBtn.style.background =
                    'conic-gradient(from 0deg, #66ddff, #3399ff, #66ddff)';
            } else {
                bounceEl.textContent = '🔮';
                if (bounceBtn) bounceBtn.style.background =
                    'conic-gradient(from 0deg, #aa88ff, #6644cc, #aa88ff)';
            }
        } else {
            // Reset button color
            if (bounceBtn) bounceBtn.style.background =
                'conic-gradient(from 0deg, #4488ff, #6644ff, #88aaff, #4488ff)';
            bounceEl.textContent = '⚡';
        }
    }

    updateDirectionIndicator() {
        // Use nav target (next hop) for arrow + distance, final dest for name
        const navPos = this.packageSystem.getNavTargetPosition();
        const destPos = this.packageSystem.getDestinationPosition();
        const arrowEl = this.getEl('direction-arrow-large');
        const distEl = this.getEl('direction-distance');
        const container = this.getEl('direction-display');
        const destNameEl = this.getEl('direction-dest-name');
        const progressBar = this.getEl('direction-progress-bar');
        if (!arrowEl || !distEl || !container) return;

        // Use navPos (next hop) for direction, fall back to destPos
        const targetPos = navPos || destPos;
        if (!targetPos) {
            container.style.opacity = '0';
            if (destNameEl) destNameEl.textContent = '';
            return;
        }

        container.style.opacity = '1';
        const playerPos = this.player.getPosition();
        const dist = playerPos.distanceTo(targetPos);

        // Show nav context: "HOP → NRT" or final "→ KIX Kyoto"
        if (destNameEl) {
            const pkg = this.packageSystem.currentPackage;
            if (pkg) {
                const navTarget = this.packageSystem.getNavTarget();
                const isHop = navTarget && navTarget !== pkg.destinationAirport;
                const hopName = navTarget ? `${navTarget.airport.name} ${navTarget.airport.city || ''}` : '';
                const hops = pkg.hopsCompleted || 0;
                if (isHop) {
                    destNameEl.textContent = `Hop ${hops + 1}: ${hopName}`;
                } else if (hops > 0) {
                    destNameEl.textContent = `Final: ${pkg.destinationName}`;
                } else {
                    destNameEl.textContent = pkg.destinationName;
                }
            } else {
                destNameEl.textContent = '';
            }
        }

        // Distance display (1 unit ≈ 637km)
        const kmDist = dist * 637;
        if (kmDist > 1000) {
            distEl.textContent = `${(kmDist / 1000).toFixed(1)}k km`;
        } else {
            distEl.textContent = `${Math.round(kmDist)} km`;
        }

        // Progress bar — track how far from start to destination
        if (progressBar) {
            // Use initial distance as baseline (store on first call per delivery)
            if (!this._deliveryStartDist || dist > this._deliveryStartDist * 1.1) {
                this._deliveryStartDist = dist;
            }
            const progress = Math.max(0, Math.min(100, (1 - dist / this._deliveryStartDist) * 100));
            progressBar.style.width = `${progress}%`;

            // Color phases: far = blue, close = green, very close = gold pulse
            progressBar.classList.remove('close', 'very-close');
            if (dist < 1.0) {
                progressBar.classList.add('very-close');
            } else if (dist < 2.5) {
                progressBar.classList.add('close');
            }
        }

        // Arrow direction — project nav target to screen space
        const screenPos = targetPos.clone().project(this.camera);
        let dx = screenPos.x;
        let dy = screenPos.y;
        if (screenPos.z > 1) { dx = -dx; dy = -dy; }
        const angle = Math.atan2(dx, dy) * (180 / Math.PI);

        // Arrow grows and changes color as you approach
        let arrowColor, arrowSize;
        if (dist < 1.0) {
            arrowColor = '#ffdd44'; arrowSize = 'clamp(3rem, 14vw, 5rem)';
        } else if (dist < 2.5) {
            arrowColor = '#44ff88'; arrowSize = 'clamp(2.6rem, 12vw, 4rem)';
        } else {
            arrowColor = '#4488ff'; arrowSize = 'clamp(2.2rem, 10vw, 3.5rem)';
        }
        arrowEl.style.transform = `rotate(${angle}deg)`;
        arrowEl.style.color = arrowColor;
        arrowEl.style.fontSize = arrowSize;
        arrowEl.style.textShadow = `0 0 20px ${arrowColor}80, 0 0 40px ${arrowColor}40`;
    }

    updateTimerDisplay() {
        const timerInfo = this.packageSystem.getTimerInfo();
        const timerBar = this.getEl('timer-bar');
        const timerText = this.getEl('timer-text');
        if (!timerBar) return;

        if (!timerInfo) {
            timerBar.style.width = '100%';
            timerBar.className = '';
            if (timerText) timerText.textContent = '';
            return;
        }

        timerBar.style.width = `${timerInfo.ratio * 100}%`;

        if (timerInfo.ratio < 0.2) {
            timerBar.className = 'urgent';
        } else if (timerInfo.ratio < 0.45) {
            timerBar.className = 'warning';
        } else {
            timerBar.className = '';
        }

        if (timerText) {
            timerText.textContent = `${Math.ceil(timerInfo.remaining)}s`;
        }

        // Urgency vignette
        const vignette = this.getEl('screen-vignette');
        if (vignette) {
            if (timerInfo.ratio < 0.2) {
                vignette.className = 'urgent';
                // Accelerating countdown beeps — faster as time runs out
                const now = Date.now();
                const urgency = Math.max(0, 1 - timerInfo.ratio / 0.2); // 0→1 as ratio goes 0.2→0
                const beepInterval = Math.max(200, 2000 * (1 - urgency * 0.9)); // 2s → 200ms
                if (now - this._timerWarningTime > beepInterval) {
                    this._timerWarningTime = now;
                    if (this.audio && this.audio.playCountdownBeep) {
                        this.audio.playCountdownBeep(urgency);
                    } else if (this.audio && this.audio.playTimerWarning) {
                        this.audio.playTimerWarning();
                    }
                }
            } else {
                // Check proximity to nav target (next hop or final dest)
                const vignettePos = this.packageSystem.getNavTargetPosition() || this.packageSystem.getDestinationPosition();
                if (vignettePos) {
                    const dist = this.player.getPosition().distanceTo(vignettePos);
                    vignette.className = dist < 3 ? 'proximity' : '';
                } else {
                    vignette.className = '';
                }
            }
        }

        // Expire package if time ran out
        if (timerInfo.expired) {
            this.packageSystem.expirePackage();
            // Penalty feedback is handled by expiry detection in animate loop
            if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
            // Clear — player must choose next delivery
            this.player.setCarrying(false);
            this.player.setTargetTrampoline(null);
        }
    }

    updateComboDisplay() {
        const combo = this.packageSystem.getCombo();
        const comboEl = this.getEl('combo-display');
        if (!comboEl) return;

        if (combo > 1) {
            comboEl.classList.add('active');
            const multiplierEl = this.getEl('combo-multiplier');
            if (multiplierEl) multiplierEl.textContent = `x${combo}`;

            // Combo timer bar — shows time remaining to maintain combo
            const comboFill = this.getEl('combo-timer-fill');
            if (comboFill && this.packageSystem.lastDeliveryTime) {
                const elapsed = Date.now() - this.packageSystem.lastDeliveryTime;
                const remaining = Math.max(0, 1 - elapsed / this.packageSystem.comboTimeout);
                comboFill.style.width = `${remaining * 100}%`;

                // Flash when about to expire
                if (remaining < 0.3 && remaining > 0) {
                    comboEl.classList.add('expiring');
                    comboFill.style.background = 'linear-gradient(90deg, #ff8800, #ffaa00)';
                } else {
                    comboEl.classList.remove('expiring');
                    comboFill.style.background = 'linear-gradient(90deg, #88ddff, #4488ff)';
                }
            }
        } else {
            comboEl.classList.remove('active');
            comboEl.classList.remove('expiring');
        }
    }

    updateDeliveryChoiceUI() {
        const choiceEl = this.getEl('delivery-choice');
        if (!choiceEl) return;

        // Show hop choices when awaiting a hop
        if (this.packageSystem.awaitingHop && this.packageSystem.pendingHops.length > 0) {
            this._showHopChoiceUI(choiceEl);
            return;
        }

        if (!this.packageSystem.awaitingChoice || this.packageSystem.pendingChoices.length === 0) {
            choiceEl.style.display = 'none';
            return;
        }

        // Only rebuild if choices changed
        const choiceKey = this.packageSystem.pendingChoices.map(c => c.destName).join(',');
        if (this._lastChoiceKey === choiceKey) return;
        this._lastChoiceKey = choiceKey;

        choiceEl.style.display = 'block';
        // Set header for delivery choice
        const header = choiceEl.querySelector('.choice-header');
        if (header) header.textContent = 'Choose Delivery';

        const container = this.getEl('delivery-options');
        if (!container) return;
        container.innerHTML = '';

        this.packageSystem.pendingChoices.forEach((choice, idx) => {
            const opt = document.createElement('div');
            opt.className = `delivery-option ${choice.bias}`;

            const hopsLabel = choice.estHops ? `~${choice.estHops} hops` : '';
            opt.innerHTML = `
                <span class="opt-icon">${choice.type.icon}</span>
                <div class="opt-info">
                    <div class="opt-dest">${choice.destName}</div>
                    <div class="opt-meta">
                        <span>${choice.distKm > 1000 ? (choice.distKm / 1000).toFixed(1) + 'k' : choice.distKm} km</span>
                        <span>${hopsLabel}</span>
                    </div>
                </div>
                <div class="opt-value">+${choice.value}</div>
            `;

            const selectChoice = (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.packageSystem.acceptDelivery(idx);
                this._lastChoiceKey = null;
                this._lastHopKey = null;
                this._deliveryStartDist = null;

                // Don't target the final destination directly —
                // hop UI will appear immediately (acceptDelivery triggers offerHopChoices)
                this.player.setCarrying(true);

                // Start session on first choice
                if (!this.session.started) {
                    this.session.started = true;
                    this.session.startTime = Date.now();
                    this.session.ended = false;
                    this.session.bestCombo = 0;
                    this.session.bestDelivery = 0;
                    const tut = this.getEl('tutorial-hint');
                    if (tut) tut.classList.add('hidden');
                }

                if (navigator.vibrate) navigator.vibrate(25);
            };

            opt.addEventListener('click', selectChoice);
            opt.addEventListener('touchend', selectChoice, { passive: false });
            container.appendChild(opt);
        });
    }

    _showHopChoiceUI(choiceEl) {
        const hopKey = this.packageSystem.pendingHops.map(h => h.iata).join(',');
        if (this._lastHopKey === hopKey) {
            choiceEl.style.display = 'block';
            return;
        }
        this._lastHopKey = hopKey;

        choiceEl.style.display = 'block';

        // Update header to show routing context
        const header = choiceEl.querySelector('.choice-header');
        const pkg = this.packageSystem.getCurrentPackage();
        if (header && pkg) {
            const hops = pkg.hopsCompleted || 0;
            header.textContent = hops === 0
                ? `Route to ${pkg.destinationName}`
                : `Hop ${hops + 1} → ${pkg.destinationName}`;
        }

        const container = this.getEl('delivery-options');
        if (!container) return;
        container.innerHTML = '';

        this.packageSystem.pendingHops.forEach((hop, idx) => {
            const opt = document.createElement('div');
            // Color: green if final dest, blue if toward dest, dim if away
            const biasClass = hop.isFinalDest ? 'short' : (hop.towardDest ? 'medium' : 'long');
            opt.className = `delivery-option ${biasClass}`;

            const dirIcon = hop.isFinalDest ? '🎯' : (hop.towardDest ? '→' : '↗');
            const label = hop.isFinalDest ? 'DESTINATION!'
                : (hop.towardDest ? 'Toward dest' : 'Detour');

            const distStr = hop.distKm > 1000
                ? `${(hop.distKm / 1000).toFixed(1)}k km`
                : `${hop.distKm} km`;

            opt.innerHTML = `
                <span class="opt-icon">${dirIcon}</span>
                <div class="opt-info">
                    <div class="opt-dest">${hop.iata} ${hop.city}</div>
                    <div class="opt-meta">
                        <span>${distStr}</span>
                        <span>${label}</span>
                    </div>
                </div>
            `;

            const selectHop = (e) => {
                e.preventDefault();
                e.stopPropagation();
                const targetTrampoline = this.packageSystem.acceptHop(idx);
                this._lastHopKey = null;
                this._deliveryStartDist = null;
                choiceEl.style.display = 'none';

                if (targetTrampoline) {
                    this.player.setTargetTrampoline(targetTrampoline);
                }

                if (this.audio && this.audio.playSelectDestination) this.audio.playSelectDestination();
                if (navigator.vibrate) navigator.vibrate(25);
            };

            opt.addEventListener('click', selectHop);
            opt.addEventListener('touchend', selectHop, { passive: false });
            container.appendChild(opt);
        });
    }

    endSession() {
        this.session.ended = true;

        // High score persistence
        const currentScore = this.gameState.score;
        let highScore = parseInt(localStorage.getItem('globall_highscore') || '0');
        const isNewHighScore = currentScore > highScore;
        if (isNewHighScore) {
            highScore = currentScore;
            localStorage.setItem('globall_highscore', String(highScore));
        }
        // Also track best deliveries
        let bestDeliveries = parseInt(localStorage.getItem('globall_best_deliveries') || '0');
        if (this.gameState.deliveries > bestDeliveries) {
            bestDeliveries = this.gameState.deliveries;
            localStorage.setItem('globall_best_deliveries', String(bestDeliveries));
        }
        // Track total games
        const gamesPlayed = parseInt(localStorage.getItem('globall_games') || '0') + 1;
        localStorage.setItem('globall_games', String(gamesPlayed));

        // Populate game over screen
        const goScore = this.getEl('go-score');
        const goDeliveries = this.getEl('go-deliveries');
        const goBestCombo = this.getEl('go-best-combo');
        const goBestDelivery = this.getEl('go-best-delivery');
        const goRank = this.getEl('go-rank');
        const goHighScore = this.getEl('go-highscore');

        if (goScore) goScore.textContent = currentScore.toLocaleString();
        if (goDeliveries) goDeliveries.textContent = this.gameState.deliveries;
        if (goBestCombo) goBestCombo.textContent = `x${this.session.bestCombo || 1}`;
        if (goBestDelivery) goBestDelivery.textContent = this.session.bestDelivery.toLocaleString();

        // High score display
        if (goHighScore) {
            if (isNewHighScore && gamesPlayed > 1) {
                goHighScore.textContent = 'NEW HIGH SCORE!';
                goHighScore.style.color = '#88ddff';
                goHighScore.style.fontWeight = '600';
                goHighScore.style.opacity = '1';
            } else {
                goHighScore.textContent = `Best: ${highScore.toLocaleString()} pts · ${bestDeliveries} deliveries`;
                goHighScore.style.color = '';
                goHighScore.style.fontWeight = '';
                goHighScore.style.opacity = '0.6';
            }
        }

        // Rank based on score
        if (goRank) {
            const s = currentScore;
            let rankText, rankColor;
            if (s >= 10000) { rankText = 'LEGENDARY COURIER'; rankColor = '#88ddff'; }
            else if (s >= 5000) { rankText = 'EXPERT COURIER'; rankColor = '#aa88ff'; }
            else if (s >= 2000) { rankText = 'SKILLED COURIER'; rankColor = '#4488ff'; }
            else if (s >= 500) { rankText = 'NOVICE COURIER'; rankColor = '#88aaff'; }
            else { rankText = 'TRAINEE COURIER'; rankColor = 'rgba(255,255,255,0.6)'; }
            goRank.textContent = rankText;
            goRank.style.color = rankColor;
        }

        // Show game over screen
        const screen = this.getEl('game-over-screen');
        if (screen) screen.style.display = 'block';

        // Wire up play again button
        const btn = this.getEl('play-again-btn');
        if (btn) {
            const handler = () => {
                btn.removeEventListener('click', handler);
                btn.removeEventListener('touchend', handler);
                this.restartSession();
            };
            btn.addEventListener('click', handler);
            btn.addEventListener('touchend', (e) => {
                e.preventDefault();
                handler();
            });
        }

        // Haptic
        if (navigator.vibrate) navigator.vibrate([100, 100, 200]);
    }

    restartSession() {
        // Hide game over
        const screen = this.getEl('game-over-screen');
        if (screen) screen.style.display = 'none';

        // Reset game state
        this.gameState.score = 0;
        this.gameState.deliveries = 0;

        // Reset session
        this.session.started = false;
        this.session.ended = false;
        this.session.bestCombo = 0;
        this.session.bestDelivery = 0;

        // Reset timer display
        const timerEl = this.getEl('session-time');
        if (timerEl) {
            timerEl.textContent = '3:00';
            timerEl.style.color = 'white';
        }

        // Reset package system — offer choices
        this.packageSystem.comboCount = 0;
        this.packageSystem.lastDeliveryTime = 0;
        this.packageSystem.currentPackage = null;
        this.packageSystem.pendingHops = [];
        this.packageSystem.awaitingHop = false;
        this.packageSystem._lastHubIata = null;
        this.packageSystem.offerDeliveryChoices();
        this._lastChoiceKey = null;
        this._lastHopKey = null;
        this.player.setTargetTrampoline(null);
        this.player.setCarrying(false);

        // Update UI
        const scoreEl = this.getEl('score-value');
        if (scoreEl) scoreEl.textContent = '0';
        const delEl = this.getEl('deliveries-count');
        if (delEl) delEl.textContent = '0 deliveries';
    }

    updateLoadingProgress(progress, status) {
        this.loadingProgress = progress;
        const bar = this.getEl('loading-progress');
        if (bar) bar.style.width = `${progress}%`;
        if (status) {
            const statusEl = this.getEl('loading-status');
            if (statusEl) statusEl.textContent = status;
        }
    }

    async requestWakeLock() {
        if ('wakeLock' in navigator) {
            try {
                this._wakeLock = await navigator.wakeLock.request('screen');
                // Re-acquire on visibility change
                document.addEventListener('visibilitychange', async () => {
                    if (document.visibilityState === 'visible' && !this._wakeLock) {
                        try { this._wakeLock = await navigator.wakeLock.request('screen'); } catch (e) {}
                    }
                });
                this._wakeLock.addEventListener('release', () => { this._wakeLock = null; });
            } catch (e) {
                console.log('Wake lock not available:', e.message);
            }
        }
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

        // TrackballControls needs explicit resize notification
        if (this.controls && this.controls.handleResize) {
            this.controls.handleResize();
        }

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

        // Game session timer
        if (this.session.started && !this.session.ended) {
            const elapsed = (Date.now() - this.session.startTime) / 1000;
            const remaining = Math.max(0, this.session.timeLimit - elapsed);
            const mins = Math.floor(remaining / 60);
            const secs = Math.floor(remaining % 60);
            const timerEl = this.getEl('session-time');
            if (timerEl) {
                timerEl.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
                // Urgency color when < 30s
                timerEl.style.color = remaining < 30 ? '#ff4444' : remaining < 60 ? '#ffaa00' : 'white';
                // Countdown pulse for last 10 seconds
                if (remaining <= 10 && remaining > 0) {
                    timerEl.classList.add('countdown');
                } else {
                    timerEl.classList.remove('countdown');
                }
            }
            if (remaining <= 0) {
                this.endSession();
            }
        }

        // Apply analog steering to player (decay when no touch)
        if (!this.touchStartPos) {
            this.steerX *= this.steerMomentum;
            this.steerY *= this.steerMomentum;
            if (Math.abs(this.steerX) < 0.01) this.steerX = 0;
            if (Math.abs(this.steerY) < 0.01) this.steerY = 0;
        }
        // Feed analog steer as virtual key pressure for Player.handleInput
        this.keys['_steerX'] = this.steerX;
        this.keys['_steerY'] = this.steerY;

        // Update orbital mechanics (sun, moon, ISS, Lagrange points)
        this.orbital.update(time, this.deltaTime);

        // Update all game components
        this.planet.update(time, this.deltaTime);
        this.cityLights.update(time, this.deltaTime, this.camera);
        this.spaceEnv.update(time, this.deltaTime, this.orbital);
        this.aurora.update(time, this.deltaTime, this.player.getPosition());
        this.trampolineNetwork.update(time, this.deltaTime, this.player.getPosition());
        this.player.update(time, this.deltaTime, this.keys);

        // Trajectory preview during charge hold
        if (this.bounceCharging && this.trajectoryLine) {
            const holdMs = Date.now() - this.bounceHoldStart;
            const points = this.player.predictTrajectory(holdMs);
            if (points.length > 1) {
                const positions = this.trajectoryLine.geometry.attributes.position;
                for (let i = 0; i < points.length && i < 51; i++) {
                    positions.setXYZ(i, points[i].x, points[i].y, points[i].z);
                }
                positions.needsUpdate = true;
                this.trajectoryLine.geometry.setDrawRange(0, Math.min(points.length, 51));
                this.trajectoryLine.computeLineDistances();
                this.trajectoryLine.visible = true;
            }
            // Update charge sound pitch
            const progress = Math.min(1, holdMs / 800);
            if (this.audio && this.audio.updateCharge) this.audio.updateCharge(progress);

            // Update charge meter ring
            const ring = document.getElementById('charge-meter-ring');
            if (ring) {
                // 283 = 2*PI*45 (circumference of svg circle)
                ring.style.strokeDashoffset = String(283 * (1 - progress));

                // Power indicator: color shows if charge matches nav target distance
                const destPos = this.packageSystem.getNavTargetPosition() || this.packageSystem.getDestinationPosition();
                const tick = document.getElementById('charge-ideal-tick');
                if (destPos) {
                    const dist = this.player.getPosition().distanceTo(destPos);
                    // Ideal hold: ~100ms per unit of distance (rough heuristic)
                    const idealMs = Math.min(800, dist * 100);
                    const ratio = holdMs / Math.max(50, idealMs);
                    if (ratio < 0.6) {
                        ring.style.stroke = '#4488ff'; // Under — blue "too short"
                    } else if (ratio < 1.4) {
                        ring.style.stroke = '#44ff88'; // Good — green "dialed in"
                    } else {
                        ring.style.stroke = '#ff8844'; // Over — orange "too long"
                    }

                    // Show ideal charge tick mark on ring
                    if (tick) {
                        const idealProgress = Math.min(1, idealMs / 800);
                        // SVG ring starts at top (-90deg), goes clockwise
                        const tickAngle = idealProgress * 360;
                        tick.setAttribute('transform', `rotate(${tickAngle}, 50, 50)`);
                        tick.setAttribute('opacity', '0.9');
                    }
                } else {
                    // No target: just show progress color
                    if (progress < 0.25) ring.style.stroke = '#4488ff';
                    else if (progress < 0.75) ring.style.stroke = '#6644ff';
                    else ring.style.stroke = '#88ddff';
                    if (tick) tick.setAttribute('opacity', '0');
                }
            }
            // Camera judder during charge — barely controlled power
            const judderIntensity = progress * progress * 0.01; // Escalating shake (scaled for close camera)
            if (judderIntensity > 0.005) {
                this.camera.position.x += (Math.random() - 0.5) * judderIntensity;
                this.camera.position.y += (Math.random() - 0.5) * judderIntensity;
                this.camera.position.z += (Math.random() - 0.5) * judderIntensity;
            }
        } else {
            // Reset charge meter when not charging
            const ring = document.getElementById('charge-meter-ring');
            if (ring) ring.style.strokeDashoffset = '283';
            const tick = document.getElementById('charge-ideal-tick');
            if (tick) tick.setAttribute('opacity', '0');
        }

        // Landing sound
        if (this.player.lastImpactSpeed > 3) {
            if (this.audio && this.audio.playLanding) this.audio.playLanding(this.player.lastImpactSpeed);
            this.player.lastImpactSpeed = 0;
        }

        // Proximity feedback — ping when approaching destination
        const destPos = this.packageSystem.getDestinationPosition();
        if (destPos) {
            const distToDest = this.player.getPosition().distanceTo(destPos);
            const now = Date.now();
            if (distToDest < 3 && now - this._lastProximityPing > 1500) {
                this._lastProximityPing = now;
                if (this.audio && this.audio.playProximity) this.audio.playProximity();
                if (navigator.vibrate) navigator.vibrate(15);
            }
        }

        const prevDeliveries = this.gameState.deliveries;
        this.packageSystem.update(time, this.deltaTime, this.player);

        // --- MISS FEEDBACK ---
        const miss = this.packageSystem.getLastMiss();
        if (miss && miss.time !== this._lastMissTime) {
            this._lastMissTime = miss.time;
            const el = this.getEl('target-notification');
            if (el) {
                el.textContent = `${miss.type}! ${miss.detail}`;
                el.style.color = '#ff8800';
                el.style.fontSize = '0.95rem';
                el.style.opacity = '1';
                clearTimeout(this._targetNotifTimeout);
                this._targetNotifTimeout = setTimeout(() => {
                    el.style.opacity = '0';
                    el.style.color = '#4488ff';
                    el.style.fontSize = '0.9rem';
                }, 2500);
            }
            if (this.audio && this.audio.playMiss) this.audio.playMiss();
            if (navigator.vibrate) navigator.vibrate([30, 30, 30]);
        }

        // --- EXPIRY PENALTY FEEDBACK ---
        const expiry = this.packageSystem.getLastExpiry();
        if (expiry && expiry.time !== this._lastExpiryTime) {
            this._lastExpiryTime = expiry.time;
            const celebEl = this.getEl('delivery-celebration');
            const textEl = this.getEl('delivery-text');
            const scoreEl = this.getEl('delivery-score');
            if (celebEl && textEl && scoreEl) {
                textEl.textContent = 'EXPIRED';
                scoreEl.textContent = `-${expiry.penalty}`;
                textEl.style.color = '#ff4444';
                celebEl.classList.remove('active');
                void celebEl.offsetWidth;
                celebEl.classList.add('active');
                clearTimeout(this._celebTimeout);
                this._celebTimeout = setTimeout(() => {
                    celebEl.classList.remove('active');
                    textEl.style.color = '#4488ff';
                }, 2000);
            }
            if (this.audio && this.audio.playExpiry) this.audio.playExpiry();
        }

        // --- DELIVERY CELEBRATION ---
        if (this.gameState.deliveries > prevDeliveries) {
            const delivery = this.packageSystem.getLastDelivery();
            const celebEl = this.getEl('delivery-celebration');
            const scoreEl = this.getEl('delivery-score');
            const textEl = this.getEl('delivery-text');

            if (celebEl) {
                if (textEl) {
                    textEl.style.color = '#4488ff'; // Reset from possible expiry red
                    // Show accuracy + combo info
                    if (delivery && delivery.accuracy === 'BULLSEYE') {
                        textEl.textContent = 'BULLSEYE!';
                        textEl.style.color = '#88ddff';
                    } else if (delivery && delivery.accuracy === 'PRECISE') {
                        textEl.textContent = 'PRECISE!';
                        textEl.style.color = '#aa88ff';
                    } else if (delivery && delivery.comboMultiplier > 1) {
                        textEl.textContent = `x${delivery.comboMultiplier} COMBO!`;
                    } else {
                        textEl.textContent = 'DELIVERED!';
                    }
                }
                if (scoreEl && delivery) {
                    const mult = delivery.accuracyMultiplier > 1 ? ` (${delivery.accuracy} ${delivery.accuracyMultiplier}x)` : '';
                    scoreEl.textContent = `+${delivery.score}${mult}`;
                }
                celebEl.classList.remove('active');
                void celebEl.offsetWidth;
                celebEl.classList.add('active');
                clearTimeout(this._celebTimeout);
                this._celebTimeout = setTimeout(() => {
                    celebEl.classList.remove('active');
                }, 2000);
            }

            // Track session bests
            if (delivery) {
                if (delivery.comboMultiplier > this.session.bestCombo) this.session.bestCombo = delivery.comboMultiplier;
                if (delivery.score > this.session.bestDelivery) this.session.bestDelivery = delivery.score;
            }

            // Delivery chime + combo sound
            if (this.audio) {
                if (this.audio.playDeliver) this.audio.playDeliver();
                if (delivery && delivery.comboMultiplier > 1 && this.audio.playCombo) {
                    this.audio.playCombo(delivery.comboMultiplier);
                }
            }

            // Camera punch — scales with accuracy
            this.player.cameraShake.intensity = delivery && delivery.accuracyMultiplier >= 3 ? 0.04 : 0.02;

            // Brief flash — hide cargo, then show for new package
            this.player.setCarrying(false);

            // Haptic — stronger for bullseye
            if (navigator.vibrate) {
                if (delivery && delivery.accuracyMultiplier >= 3) {
                    navigator.vibrate([80, 40, 80, 40, 120, 40, 200]);
                } else {
                    navigator.vibrate([50, 50, 100, 50, 150]);
                }
            }

            // Record delivery time for chain launch bonus
            this._lastDeliveryTime = Date.now();

            // Clear target — player will choose next delivery
            this.player.setTargetTrampoline(null);
            // Choice UI will appear via updateDeliveryChoiceUI
        }

        // Dynamic post-processing adjustments (respects fine-grained toggles)
        const speed = this.player.getSpeed();
        const altitude = this.player.getAltitude();

        // Dynamic chromatic aberration scales with player speed
        if (this.postProcessSettings.dynamicChromatic && this.chromaticPass.enabled) {
            this.chromaticPass.uniforms.amount.value =
                this.postProcessSettings.chromaticAmount + speed * 0.0008;
        }

        // Dynamic bloom: gentle near surface (0.15), ramps up in space (max 0.5)
        // Both reviewers flagged bloom washout at low/mid altitude
        if (this.postProcessSettings.dynamicBloom && this.bloomPass.enabled) {
            this.bloomPass.strength = Math.min(0.5, 0.15 + Math.min(altitude / 300, 0.35));
        }

        // Update audio based on game state
        if (this.audio) {
            this.audio.updateAltitude(altitude);
            this.audio.updateSpeed(speed);

            // Aim tick — play a subtle click when aim angle changes significantly
            if (this.player.isOnGround && this.player._aimDirection) {
                const currentAngle = this.player.aimAngle;
                if (this._lastAimTickAngle === undefined) this._lastAimTickAngle = currentAngle;
                const angleDelta = Math.abs(currentAngle - this._lastAimTickAngle);
                if (angleDelta > 0.25) { // ~15 degrees
                    this._lastAimTickAngle = currentAngle;
                    if (this.audio.playAimTick) this.audio.playAimTick();
                }
            }

            // Altitude warning — accelerating beeps when falling fast toward ground
            const verticalSpeed = this.player.velocity.dot(
                this.player.position.clone().normalize()
            );
            const altGameUnits = altitude / 100; // Convert back to game units
            if (verticalSpeed < -3 && altGameUnits < 1.5 && !this.player.isOnGround) {
                const urgency = Math.min(1, Math.abs(verticalSpeed) / 12) *
                    Math.max(0, 1 - altGameUnits / 1.5);
                const now = Date.now();
                const beepInterval = Math.max(100, 500 * (1 - urgency));
                if (!this._lastAltWarningTime) this._lastAltWarningTime = 0;
                if (now - this._lastAltWarningTime > beepInterval) {
                    this._lastAltWarningTime = now;
                    if (this.audio.playAltitudeWarning) this.audio.playAltitudeWarning(urgency);
                }
            }
        }

        // Update UI
        this.updateUI();

        // Update Ship's Computer (2D overlay)
        if (this.shipsComputer) this.shipsComputer.update(time);

        // Update debug info + FPS graph
        const now = performance.now();
        this.updateFPSGraph(now);
        if (this.debugInfo) {
            this.fpsFrames++;
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

            // Orbital info
            if (this.orbitalSettings && this.orbital) {
                const d = this.orbital.gameDate;
                this.orbitalSettings.gameDate = `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')} ${String(d.getUTCHours()).padStart(2,'0')}:${String(d.getUTCMinutes()).padStart(2,'0')}`;
                this.orbitalSettings.moonDist = `${this.orbital.moonPosition.length().toFixed(0)} gu`;
                const sd = this.orbital.sunDirection;
                this.orbitalSettings.sunAz = `${sd.x.toFixed(2)}, ${sd.y.toFixed(2)}, ${sd.z.toFixed(2)}`;
            }
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
