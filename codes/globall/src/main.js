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
import { AudioSystem } from './systems/AudioSystem.js';
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

        // Defer audio initialization to avoid blocking
        this.audio = null;

        console.log('🎮 Globall starting...');
        this.init();
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
        const container = document.getElementById('canvas-container');

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
        this.renderer.toneMappingExposure = 1.0; // Reduced from 1.2 to prevent bleachout
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

        // Bloom for glowing effects (city lights, aurora) - reduced for mobile clarity
        this.bloomPass = new UnrealBloomPass(
            new THREE.Vector2(window.innerWidth, window.innerHeight),
            0.5,  // strength - reduced from 0.8
            0.3,  // radius - reduced from 0.4
            0.9   // threshold - raised from 0.85 to bloom only brightest elements
        );
        this.composer.addPass(this.bloomPass);

        // Chromatic aberration for candy aesthetic - very subtle
        this.chromaticPass = new ShaderPass(ChromaticAberrationShader);
        this.chromaticPass.uniforms.amount.value = 0.0005; // Much more subtle
        this.composer.addPass(this.chromaticPass);

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
        const bounceIndicator = document.getElementById('bounce-indicator');
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

            // Update direction indicator
            this.updateDirectionIndicator(currentPackage);
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

        const arrow = document.getElementById('dest-arrow');
        if (arrow) {
            arrow.style.transform = `rotate(${angle}deg)`;
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

        // Update chromatic aberration based on player speed - subtle effect
        const speed = this.player.getSpeed();
        this.chromaticPass.uniforms.amount.value = 0.0003 + speed * 0.0008;

        // Update bloom based on altitude - minimal at ground, subtle increase in space
        const altitude = this.player.getAltitude();
        // Ground level (0-5km): 0.3-0.4 strength
        // Space (50km+): max 0.7 strength
        this.bloomPass.strength = Math.min(0.7, 0.3 + Math.min(altitude / 200, 0.4));

        // Update audio based on game state
        if (this.audio) {
            this.audio.updateAltitude(altitude);
            this.audio.updateSpeed(speed);
        }

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
