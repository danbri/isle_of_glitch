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

import { Planet } from './components/Planet.js';
import { Player } from './components/Player.js';
import { TrampolineNetwork } from './systems/TrampolineNetwork.js';
import { AuroraBorealis } from './components/AuroraBorealis.js';
import { SpaceEnvironment } from './components/SpaceEnvironment.js';
import { CityLights } from './components/CityLights.js';
import { PackageSystem } from './systems/PackageSystem.js';
import { GameState } from './systems/GameState.js';
import { ChromaticAberrationShader } from './shaders/ChromaticAberration.js';
import { AtmosphericScatteringShader } from './shaders/AtmosphericScattering.js';

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

        this.init();
    }

    async init() {
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

        // Hide loading screen
        this.hideLoadingScreen();

        // Start game loop
        this.animate();
    }

    async checkWebGPU() {
        if (navigator.gpu) {
            try {
                const adapter = await navigator.gpu.requestAdapter();
                if (adapter) {
                    const device = await adapter.requestDevice();
                    this.isWebGPU = true;
                    console.log('🎮 WebGPU initialized for 90Hz gameplay');
                    return;
                }
            } catch (e) {
                console.warn('WebGPU adapter failed:', e);
            }
        }

        console.log('⚠️ WebGPU not available, using WebGL2 fallback');
        document.getElementById('webgpu-error').style.display = 'block';
        setTimeout(() => {
            document.getElementById('webgpu-error').style.display = 'none';
        }, 3000);
    }

    setupRenderer() {
        const container = document.getElementById('canvas-container');

        // Use WebGPURenderer if available, fallback to WebGLRenderer
        this.renderer = new THREE.WebGLRenderer({
            antialias: true,
            alpha: false,
            powerPreference: 'high-performance',
            preserveDrawingBuffer: true
        });

        // Set clear color to prevent flickering
        this.renderer.setClearColor(0x1a0a2e, 1);
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.2;
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
        this.composer = new EffectComposer(this.renderer);

        // Main render pass
        const renderPass = new RenderPass(this.scene, this.camera);
        this.composer.addPass(renderPass);

        // Bloom for glowing effects (city lights, aurora)
        this.bloomPass = new UnrealBloomPass(
            new THREE.Vector2(window.innerWidth, window.innerHeight),
            0.8,  // strength
            0.4,  // radius
            0.85  // threshold
        );
        this.composer.addPass(this.bloomPass);

        // Chromatic aberration for candy aesthetic
        this.chromaticPass = new ShaderPass(ChromaticAberrationShader);
        this.chromaticPass.uniforms.amount.value = 0.002;
        this.composer.addPass(this.chromaticPass);

        this.updateLoadingProgress(30);
    }

    async loadGameComponents() {
        // Initialize game state
        this.gameState = new GameState();

        this.updateLoadingProgress(35);

        // Create planet
        this.planet = new Planet(this.scene);
        await this.planet.init();

        this.updateLoadingProgress(50);

        // Create city lights
        this.cityLights = new CityLights(this.scene, this.planet);
        await this.cityLights.init();

        this.updateLoadingProgress(60);

        // Create space environment (stars, ISS)
        this.spaceEnv = new SpaceEnvironment(this.scene);
        await this.spaceEnv.init();

        this.updateLoadingProgress(70);

        // Create aurora borealis
        this.aurora = new AuroraBorealis(this.scene);
        await this.aurora.init();

        this.updateLoadingProgress(80);

        // Create trampoline network
        this.trampolineNetwork = new TrampolineNetwork(this.scene, this.planet);
        await this.trampolineNetwork.init();

        this.updateLoadingProgress(85);

        // Create player
        this.player = new Player(this.scene, this.camera, this.gameState);
        await this.player.init();

        this.updateLoadingProgress(90);

        // Create package system
        this.packageSystem = new PackageSystem(this.scene, this.gameState, this.trampolineNetwork);
        await this.packageSystem.init();

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
        document.getElementById('bounce-indicator').addEventListener('click', () => this.player.bounce());
        document.getElementById('bounce-indicator').addEventListener('touchend', (e) => {
            e.preventDefault();
            this.player.bounce();
        });
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

    updateUI() {
        // Update altitude display with smoothing to prevent flickering
        const targetAltitude = this.player.getAltitude();
        this.displayedAltitude += (targetAltitude - this.displayedAltitude) * this.altitudeSmoothFactor;
        document.getElementById('altitude-value').textContent = this.displayedAltitude.toFixed(1);

        // Update score
        document.getElementById('score-value').textContent = this.gameState.deliveries;

        // Update package info
        const currentPackage = this.packageSystem.getCurrentPackage();
        if (currentPackage) {
            document.getElementById('package-name').textContent = currentPackage.name;
            document.getElementById('package-dest').textContent = `→ ${currentPackage.destination}`;
        }

        // Update bounce indicator based on charge
        const bounceCharge = this.player.getBounceCharge();
        const bounceEl = document.getElementById('bounce-charge');
        if (bounceCharge >= 1) {
            bounceEl.textContent = '🚀';
        } else if (bounceCharge >= 0.5) {
            bounceEl.textContent = '⬆️';
        } else {
            bounceEl.textContent = '⏳';
        }
    }

    updateLoadingProgress(progress) {
        this.loadingProgress = progress;
        document.getElementById('loading-progress').style.width = `${progress}%`;
    }

    hideLoadingScreen() {
        this.isLoading = false;
        document.getElementById('loading-screen').classList.add('hidden');
    }

    onResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();

        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.composer.setSize(window.innerWidth, window.innerHeight);

        this.bloomPass.resolution.set(window.innerWidth, window.innerHeight);
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
        this.planet.update(time, this.deltaTime);
        this.cityLights.update(time, this.deltaTime, this.camera);
        this.spaceEnv.update(time, this.deltaTime);
        this.aurora.update(time, this.deltaTime, this.player.getPosition());
        this.trampolineNetwork.update(time, this.deltaTime);
        this.player.update(time, this.deltaTime, this.keys);
        this.packageSystem.update(time, this.deltaTime, this.player);

        // Update chromatic aberration based on player speed
        const speed = this.player.getSpeed();
        this.chromaticPass.uniforms.amount.value = 0.001 + speed * 0.005;

        // Update bloom based on altitude (more bloom in space, but clamped)
        const altitude = this.player.getAltitude();
        this.bloomPass.strength = Math.min(1.2, 0.6 + (altitude / 500) * 0.1);

        // Update UI
        this.updateUI();

        // Render with post-processing
        this.composer.render();
    }
}

// Start the game
const game = new GloballGame();

// Export for debugging
window.game = game;
