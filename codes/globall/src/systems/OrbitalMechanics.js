/**
 * OrbitalMechanics — real-time astronomical positions via astronomy-engine
 *
 * Single source of truth for sun, moon, ISS, and Lagrange point positions.
 * All positions are in game units (Earth radius = 10 game units).
 *
 * Scale reference:
 *   Real Earth radius: 6,371 km
 *   Game unit: 1 unit = 637.1 km
 *   1 AU = 149,597,870 km = 234,800 game units
 *   Moon distance: ~384,400 km = ~603 game units
 *   ISS altitude: ~408 km = ~0.64 game units above surface (radius 10.64)
 *   Kármán line: 100 km = ~0.157 game units above surface (radius 10.157)
 *   Everest: 8.8 km = 0.014 game units
 */

import * as THREE from 'three';
import {
    Body, MakeTime, GeoMoon, SunPosition, LagrangePoint,
    GeoVector, MoonPhase, Illumination
} from 'astronomy-engine';

// Conversion: 1 AU in game units
const EARTH_RADIUS_KM = 6371;
const GAME_UNIT_KM = EARTH_RADIUS_KM / 10; // 637.1 km per game unit
const AU_KM = 149597870.7;
const AU_GAME = AU_KM / GAME_UNIT_KM;
const MOON_RADIUS_KM = 1737.4;
const MOON_RADIUS_GAME = MOON_RADIUS_KM / GAME_UNIT_KM; // ~2.73 game units

export class OrbitalMechanics {
    constructor() {
        // Current positions in game coordinates (updated each frame)
        this.sunDirection = new THREE.Vector3(1, 0.3, 0.5).normalize(); // fallback
        this.sunDistance = AU_GAME; // ~234,800 game units

        this.moonPosition = new THREE.Vector3(400, 0, 0); // fallback
        this.moonPhaseAngle = 0; // 0=new, 90=first quarter, 180=full, 270=third quarter
        this.moonRadius = MOON_RADIUS_GAME;

        // ISS — 51.6° inclination, ~408km altitude, ~92min period
        this.issPosition = new THREE.Vector3(10.64, 0, 0);
        this.issVelocity = new THREE.Vector3();

        // Lagrange points: Earth-Moon system
        this.lagrangeEM = [null, null, null, null, null, null]; // [_, L1, L2, L3, L4, L5]
        // Lagrange points: Sun-Earth system
        this.lagrangeSE = [null, null, null, null, null, null];

        // Game time — set in June 2045, advances in real time (can be accelerated for transit)
        this.gameDate = new Date('2045-06-15T12:00:00Z');
        this.timeWarp = 1.0; // 1x = realtime
        this.maxTimeWarp = 100000; // 100,000x for interplanetary transit

        // Update throttle — astronomy calcs are expensive, run at 2Hz
        this._lastAstroUpdate = 0;
        this._astroUpdateInterval = 500; // ms
    }

    init() {
        // Initial computation
        this.updateAstronomy(performance.now(), true);
    }

    /**
     * Convert astronomy-engine geocentric AU vector to game coordinates.
     * astronomy-engine uses equatorial J2000 (EQJ):
     *   x → vernal equinox, y → 90° east in equatorial plane, z → north celestial pole
     *
     * Game coordinates (Three.js):
     *   y → up (north pole), x/z → equatorial plane
     *
     * Mapping: game.x = astro.x, game.y = astro.z, game.z = -astro.y
     * (rotated so north pole aligns with +Y)
     */
    auToGame(astroVec) {
        return new THREE.Vector3(
            astroVec.x * AU_GAME,
            astroVec.z * AU_GAME,   // celestial north → game Y
            -astroVec.y * AU_GAME   // right-hand rule
        );
    }

    /** Same conversion but for already-known km distances */
    kmToGame(km) {
        return km / GAME_UNIT_KM;
    }

    update(time, deltaTime) {
        // Advance game clock (supports time warp)
        const realMs = deltaTime * 1000;
        this.gameDate = new Date(this.gameDate.getTime() + realMs * this.timeWarp);

        // Throttle expensive astronomy calculations
        if (time - this._lastAstroUpdate > this._astroUpdateInterval / 1000) {
            this.updateAstronomy(time, false);
            this._lastAstroUpdate = time;
        }

        // ISS orbits at ~0.0011 rad/s (92 min period) — update every frame for smooth motion
        this.updateISS(deltaTime);
    }

    updateAstronomy(time, force) {
        try {
            const astroTime = MakeTime(this.gameDate);

            // --- Sun position ---
            const sunPos = SunPosition(astroTime);
            // SunPosition returns ecliptic coords (elon, elat, dist in AU)
            // Convert ecliptic lon/lat to direction vector
            const sunElonRad = sunPos.elon * Math.PI / 180;
            const sunElatRad = sunPos.elat * Math.PI / 180;
            // Ecliptic to equatorial approximation (obliquity ~23.44°)
            const obliquity = 23.44 * Math.PI / 180;
            const cosObl = Math.cos(obliquity);
            const sinObl = Math.sin(obliquity);
            const sx = Math.cos(sunElatRad) * Math.cos(sunElonRad);
            const sy = Math.cos(sunElatRad) * Math.sin(sunElonRad);
            const sz = Math.sin(sunElatRad);
            // Rotate from ecliptic to equatorial
            const eqX = sx;
            const eqY = sy * cosObl - sz * sinObl;
            const eqZ = sy * sinObl + sz * cosObl;
            // Map to game coords: x=eqX, y=eqZ (north), z=-eqY
            this.sunDirection.set(eqX, eqZ, -eqY).normalize();
            this.sunDistance = sunPos.dist * AU_GAME;

            // --- Moon position (geocentric, AU) ---
            const moonVec = GeoMoon(astroTime);
            // moonVec is in equatorial J2000 (EQJ), units = AU
            this.moonPosition.set(
                moonVec.x * AU_GAME,
                moonVec.z * AU_GAME,   // celestial north → game Y
                -moonVec.y * AU_GAME
            );

            // --- Moon phase ---
            this.moonPhaseAngle = MoonPhase(astroTime);

            // --- Earth-Moon Lagrange points ---
            for (let i = 1; i <= 5; i++) {
                try {
                    const lp = LagrangePoint(i, astroTime, Body.Earth, Body.Moon);
                    this.lagrangeEM[i] = new THREE.Vector3(
                        lp.x * AU_GAME,
                        lp.z * AU_GAME,
                        -lp.y * AU_GAME
                    );
                } catch (e) {
                    // LagrangePoint may not support all points for all body pairs
                    this.lagrangeEM[i] = null;
                }
            }

            // --- Sun-Earth Lagrange points ---
            for (let i = 1; i <= 5; i++) {
                try {
                    const lp = LagrangePoint(i, astroTime, Body.Sun, Body.EMB);
                    // These are relative to the Sun — convert to geocentric
                    // by subtracting Earth's heliocentric position
                    const earthHelio = GeoVector(Body.Sun, astroTime, true);
                    // GeoVector(Sun) gives Sun's position from Earth = -Earth from Sun
                    this.lagrangeSE[i] = new THREE.Vector3(
                        (lp.x + earthHelio.x) * AU_GAME,
                        (lp.z + earthHelio.z) * AU_GAME,
                        -(lp.y + earthHelio.y) * AU_GAME
                    );
                } catch (e) {
                    this.lagrangeSE[i] = null;
                }
            }
        } catch (e) {
            console.warn('Astronomy update failed:', e.message);
        }
    }

    updateISS(deltaTime) {
        // ISS orbital parameters
        const altitude = 408; // km
        const radius = this.kmToGame(EARTH_RADIUS_KM + altitude); // ~10.64 game units
        const inclination = 51.6 * Math.PI / 180;
        const period = 92.68 * 60; // seconds
        const angularVelocity = (2 * Math.PI) / period; // rad/s

        // Advance orbital angle (respects time warp)
        if (!this._issAngle) this._issAngle = 0;
        if (!this._issRAAN) this._issRAAN = 0; // right ascension of ascending node

        this._issAngle += angularVelocity * deltaTime * this.timeWarp;
        // RAAN precesses ~5°/day due to Earth's oblateness
        this._issRAAN += (5 * Math.PI / 180 / 86400) * deltaTime * this.timeWarp;

        // Position in orbital plane, then rotate for inclination + RAAN
        const xOrbit = radius * Math.cos(this._issAngle);
        const yOrbit = radius * Math.sin(this._issAngle);

        // Apply inclination (tilt orbital plane)
        const cosI = Math.cos(inclination);
        const sinI = Math.sin(inclination);
        const cosR = Math.cos(this._issRAAN);
        const sinR = Math.sin(this._issRAAN);

        // Rotate: first by inclination around x-axis, then by RAAN around y-axis
        const x1 = xOrbit;
        const y1 = yOrbit * cosI;
        const z1 = yOrbit * sinI;

        this.issPosition.set(
            x1 * cosR - z1 * sinR,
            z1 * cosR + x1 * sinR,  // This becomes the "up" component
            y1
        );

        // Swap to match game coordinates (y = up = north pole)
        // Actually let's be more careful:
        // orbital plane: x1, y1 in equatorial plane, z1 toward north
        // After RAAN rotation around polar axis:
        this.issPosition.set(
            x1 * cosR + y1 * sinR,
            z1,
            -x1 * sinR + y1 * cosR
        );
    }

    /** Set time warp factor (1 = realtime) */
    setTimeWarp(factor) {
        this.timeWarp = Math.max(1, Math.min(this.maxTimeWarp, factor));
    }

    /** Get game-world scale info */
    getScaleInfo() {
        return {
            earthRadiusGame: 10,
            moonDistanceGame: this.moonPosition.length(),
            moonRadiusGame: this.moonRadius,
            karmanLineGame: this.kmToGame(100) + 10, // radius from center
            issAltitudeGame: this.kmToGame(408),
            auGame: AU_GAME,
            gameUnitKm: GAME_UNIT_KM
        };
    }
}
