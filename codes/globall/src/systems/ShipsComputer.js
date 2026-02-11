/**
 * ShipsComputer — 2D navigation overlay ("Ship's Computer")
 *
 * Two views:
 *   NAV   — Equirectangular map showing airports, routes, player position, destination
 *   ORBIT — Top-down view of Earth-Moon system with Lagrange points and ISS
 *
 * Drawn on a 2D canvas overlay, toggled via a button.
 */

import * as THREE from 'three';

export class ShipsComputer {
    constructor() {
        this.visible = false;
        this.activeTab = 'NAV'; // 'NAV' or 'ORBIT'
        this.canvas = null;
        this.ctx = null;
        this.dpr = 1;
        this.w = 0;
        this.h = 0;

        // Data references (set during init)
        this.trampolineNetwork = null;
        this.orbital = null;
        this.player = null;
        this.packageSystem = null;

        // Map interaction
        this._lastDrawTime = 0;
    }

    init(trampolineNetwork, orbital, player, packageSystem) {
        this.trampolineNetwork = trampolineNetwork;
        this.orbital = orbital;
        this.player = player;
        this.packageSystem = packageSystem;

        this.canvas = document.getElementById('ships-computer-canvas');
        if (!this.canvas) return;

        this.ctx = this.canvas.getContext('2d');
        this.dpr = Math.min(window.devicePixelRatio || 1, 2);

        this.resize();
        window.addEventListener('resize', () => this.resize());
    }

    resize() {
        if (!this.canvas) return;
        // Fill most of the screen with padding
        const pad = 16;
        this.w = Math.min(window.innerWidth - pad * 2, 600);
        this.h = Math.min(window.innerHeight - pad * 2 - 80, 400); // leave room for tabs + header
        this.canvas.width = this.w * this.dpr;
        this.canvas.height = this.h * this.dpr;
        this.canvas.style.width = this.w + 'px';
        this.canvas.style.height = this.h + 'px';
    }

    toggle() {
        this.visible = !this.visible;
        const panel = document.getElementById('ships-computer');
        if (panel) panel.style.display = this.visible ? 'flex' : 'none';
    }

    setTab(tab) {
        this.activeTab = tab;
        // Update tab button styles
        const navBtn = document.getElementById('sc-tab-nav');
        const orbitBtn = document.getElementById('sc-tab-orbit');
        if (navBtn) navBtn.classList.toggle('active', tab === 'NAV');
        if (orbitBtn) orbitBtn.classList.toggle('active', tab === 'ORBIT');
    }

    update(time) {
        if (!this.visible || !this.ctx) return;
        // Redraw at ~15fps to save CPU
        if (time - this._lastDrawTime < 0.066) return;
        this._lastDrawTime = time;

        if (this.activeTab === 'NAV') {
            this.drawNavMap();
        } else {
            this.drawOrbitalView();
        }
    }

    // ─── NAV MAP (equirectangular projection) ─────────────────────────

    drawNavMap() {
        const { ctx, w, h, dpr } = this;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, w, h);

        // Background
        ctx.fillStyle = 'rgba(5, 8, 20, 0.95)';
        ctx.fillRect(0, 0, w, h);

        // Grid lines (every 30°)
        ctx.strokeStyle = 'rgba(68, 136, 255, 0.12)';
        ctx.lineWidth = 0.5;
        for (let lon = -180; lon <= 180; lon += 30) {
            const x = this.lonToX(lon);
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, h);
            ctx.stroke();
        }
        for (let lat = -90; lat <= 90; lat += 30) {
            const y = this.latToY(lat);
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(w, y);
            ctx.stroke();
        }

        // Equator + prime meridian
        ctx.strokeStyle = 'rgba(68, 136, 255, 0.25)';
        ctx.beginPath();
        ctx.moveTo(0, this.latToY(0));
        ctx.lineTo(w, this.latToY(0));
        ctx.moveTo(this.lonToX(0), 0);
        ctx.lineTo(this.lonToX(0), h);
        ctx.stroke();

        // Day/night terminator
        if (this.orbital) {
            this.drawTerminator();
        }

        // Routes (faint lines between connected hubs)
        if (this.trampolineNetwork) {
            this.drawRoutes();
        }

        // Airport dots
        if (this.trampolineNetwork) {
            this.drawAirports();
        }

        // Destination marker
        this.drawDestination();

        // Player position
        this.drawPlayer();

        // Legend
        this.drawNavLegend();
    }

    drawTerminator() {
        const { ctx, w, h } = this;
        const sd = this.orbital.sunDirection;

        // Simple terminator: points where sun dot normal = 0
        // For each longitude, find the latitude where the sun is on the horizon
        ctx.fillStyle = 'rgba(0, 0, 30, 0.35)';
        ctx.beginPath();

        // Night side fill — trace the terminator line
        const points = [];
        for (let px = 0; px <= w; px += 2) {
            const lon = (px / w) * 360 - 180;
            const lonRad = lon * Math.PI / 180;

            // Find latitude where sun elevation = 0
            // sun.dot(surfaceNormal) = 0
            // surfaceNormal at (lat, lon) = (-sin(phi)*cos(theta), cos(phi), sin(phi)*sin(theta))
            // where phi = (90-lat)*PI/180, theta = (lon+180)*PI/180
            const theta = (lon + 180) * Math.PI / 180;
            // Solve: sd.x*(-sin(phi)*cos(theta)) + sd.y*cos(phi) + sd.z*(sin(phi)*sin(theta)) = 0
            // sin(phi)*(-sd.x*cos(theta) + sd.z*sin(theta)) + sd.y*cos(phi) = 0
            // tan(phi) = sd.y / (sd.x*cos(theta) - sd.z*sin(theta))
            const denom = sd.x * Math.cos(theta) - sd.z * Math.sin(theta);
            if (Math.abs(denom) < 0.001) {
                points.push({ px, lat: 0 });
                continue;
            }
            const phi = Math.atan2(sd.y, denom);
            const lat = 90 - phi * 180 / Math.PI;
            points.push({ px, lat: Math.max(-90, Math.min(90, lat)) });
        }

        // Fill night side (below terminator if sun is above, or above if below)
        // Check if north pole is in darkness
        const northSunDot = sd.y; // surface normal at north pole is (0,1,0)
        const nightBelow = northSunDot > 0; // if sun illuminates north pole, night is below terminator

        ctx.beginPath();
        if (nightBelow) {
            ctx.moveTo(0, h);
            for (const p of points) {
                ctx.lineTo(p.px, this.latToY(p.lat));
            }
            ctx.lineTo(w, h);
        } else {
            ctx.moveTo(0, 0);
            for (const p of points) {
                ctx.lineTo(p.px, this.latToY(p.lat));
            }
            ctx.lineTo(w, 0);
        }
        ctx.closePath();
        ctx.fill();
    }

    drawRoutes() {
        const { ctx } = this;
        const tn = this.trampolineNetwork;
        if (!tn.routeGraph) return;

        ctx.strokeStyle = 'rgba(68, 136, 255, 0.08)';
        ctx.lineWidth = 0.5;

        // Only draw routes between hubs to avoid clutter
        const drawnPairs = new Set();
        for (const t of tn.trampolines) {
            if (!t.isHub) continue;
            const iata = t.airport.name;
            const connected = tn.routeGraph[iata];
            if (!connected) continue;

            const fromLL = this.posToLatLon(t.position);

            for (const dest of connected) {
                const pairKey = [iata, dest].sort().join('-');
                if (drawnPairs.has(pairKey)) continue;
                drawnPairs.add(pairKey);

                const destT = tn.iataIndex[dest];
                if (!destT || !destT.isHub) continue;

                const toLL = this.posToLatLon(destT.position);

                ctx.beginPath();
                ctx.moveTo(this.lonToX(fromLL.lon), this.latToY(fromLL.lat));
                // Handle wrap-around
                const dLon = toLL.lon - fromLL.lon;
                if (Math.abs(dLon) > 180) {
                    // Route crosses date line — skip for simplicity
                } else {
                    ctx.lineTo(this.lonToX(toLL.lon), this.latToY(toLL.lat));
                }
                ctx.stroke();
            }
        }
    }

    drawAirports() {
        const { ctx } = this;
        const tn = this.trampolineNetwork;

        for (const t of tn.trampolines) {
            const ll = this.posToLatLon(t.position);
            const x = this.lonToX(ll.lon);
            const y = this.latToY(ll.lat);

            if (t.isHub) {
                // Hub airports — larger, brighter
                ctx.fillStyle = 'rgba(68, 200, 255, 0.7)';
                ctx.beginPath();
                ctx.arc(x, y, 2.5, 0, Math.PI * 2);
                ctx.fill();

                // Label (only for hubs)
                ctx.fillStyle = 'rgba(200, 230, 255, 0.5)';
                ctx.font = '7px monospace';
                ctx.textAlign = 'center';
                ctx.fillText(t.airport.name, x, y - 4);
            } else {
                // Minor airports — tiny dots
                ctx.fillStyle = 'rgba(68, 136, 255, 0.2)';
                ctx.beginPath();
                ctx.arc(x, y, 0.8, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }

    drawDestination() {
        const { ctx } = this;
        if (!this.packageSystem) return;

        const pkg = this.packageSystem.currentPackage;
        if (!pkg || !pkg.destination) return;

        const destT = this.trampolineNetwork.iataIndex[pkg.destination.iata || pkg.destination.airport?.name];
        if (!destT) return;

        const ll = this.posToLatLon(destT.position);
        const x = this.lonToX(ll.lon);
        const y = this.latToY(ll.lat);

        // Pulsing target ring
        const pulse = Math.sin(performance.now() * 0.005) * 0.3 + 0.7;

        ctx.strokeStyle = `rgba(255, 100, 100, ${pulse})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(x, y, 6, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = '#ff6666';
        ctx.font = 'bold 8px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(destT.airport.name, x, y - 9);
        ctx.fillText(destT.airport.city || '', x, y + 14);
    }

    drawPlayer() {
        const { ctx } = this;
        if (!this.player) return;

        const pos = this.player.getPosition();
        const ll = this.posToLatLon(pos);
        const x = this.lonToX(ll.lon);
        const y = this.latToY(ll.lat);

        // Player dot with glow
        ctx.fillStyle = '#44ff88';
        ctx.shadowColor = '#44ff88';
        ctx.shadowBlur = 6;
        ctx.beginPath();
        ctx.arc(x, y, 3.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        // Velocity direction arrow
        const vel = this.player.velocity;
        if (vel && vel.length() > 0.5) {
            const velDir = vel.clone().normalize();
            // Project velocity to map direction (approximate)
            const endPos = pos.clone().add(velDir.multiplyScalar(0.5));
            const endLL = this.posToLatLon(endPos);
            const ex = this.lonToX(endLL.lon);
            const ey = this.latToY(endLL.lat);

            ctx.strokeStyle = '#44ff88';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x + (ex - x) * 20, y + (ey - y) * 20);
            ctx.stroke();
        }

        // Coordinates label
        ctx.fillStyle = 'rgba(68, 255, 136, 0.8)';
        ctx.font = '8px monospace';
        ctx.textAlign = 'left';
        ctx.fillText(`${Math.abs(ll.lat).toFixed(1)}°${ll.lat >= 0 ? 'N' : 'S'} ${Math.abs(ll.lon).toFixed(1)}°${ll.lon >= 0 ? 'E' : 'W'}`, x + 6, y - 2);
        const alt = this.player.getAltitude();
        ctx.fillText(`ALT ${alt.toFixed(0)}km`, x + 6, y + 8);
    }

    drawNavLegend() {
        const { ctx, w, h } = this;

        // Date/time from orbital
        if (this.orbital) {
            const d = this.orbital.gameDate;
            const dateStr = `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')} ${String(d.getUTCHours()).padStart(2,'0')}:${String(d.getUTCMinutes()).padStart(2,'0')} UTC`;
            ctx.fillStyle = 'rgba(255,255,255,0.4)';
            ctx.font = '8px monospace';
            ctx.textAlign = 'right';
            ctx.fillText(dateStr, w - 4, h - 4);

            if (this.orbital.timeWarp > 1) {
                ctx.fillStyle = '#ffaa44';
                ctx.fillText(`WARP x${this.orbital.timeWarp.toFixed(0)}`, w - 4, h - 14);
            }
        }
    }

    // ─── ORBITAL VIEW (top-down Earth-Moon system) ────────────────────

    drawOrbitalView() {
        const { ctx, w, h, dpr } = this;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, w, h);

        // Background
        ctx.fillStyle = 'rgba(5, 8, 20, 0.95)';
        ctx.fillRect(0, 0, w, h);

        // Scale: Moon is ~603 game units from Earth
        // Fit Earth-Moon system in the view with some padding
        const moonDist = this.orbital ? this.orbital.moonPosition.length() : 603;
        const viewRadius = moonDist * 1.3; // Show a bit beyond the Moon
        const cx = w / 2;
        const cy = h / 2;
        const scale = Math.min(w, h) / (viewRadius * 2.2);

        // Helper: project 3D game position to 2D orbital view (top-down, XZ plane)
        const project = (pos) => {
            return {
                x: cx + pos.x * scale,
                y: cy - pos.z * scale // Z maps to screen Y (inverted)
            };
        };

        // Earth
        const earthR = 10 * scale;
        ctx.fillStyle = '#1a4488';
        ctx.strokeStyle = '#4488cc';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(cx, cy, Math.max(earthR, 4), 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = 'rgba(200,230,255,0.7)';
        ctx.font = '9px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('EARTH', cx, cy + Math.max(earthR, 4) + 12);

        // ISS orbit circle (for reference)
        if (this.orbital) {
            const issR = 10.64 * scale;
            ctx.strokeStyle = 'rgba(255,255,100,0.15)';
            ctx.lineWidth = 0.5;
            ctx.setLineDash([2, 4]);
            ctx.beginPath();
            ctx.arc(cx, cy, Math.max(issR, 5), 0, Math.PI * 2);
            ctx.stroke();
            ctx.setLineDash([]);

            // ISS position
            const issP = project(this.orbital.issPosition);
            ctx.fillStyle = '#ffff44';
            ctx.beginPath();
            ctx.arc(issP.x, issP.y, 2, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = 'rgba(255,255,100,0.6)';
            ctx.font = '7px monospace';
            ctx.fillText('ISS', issP.x + 5, issP.y + 3);
        }

        // Moon
        if (this.orbital) {
            const moonP = project(this.orbital.moonPosition);
            const moonR = Math.max(this.orbital.moonRadius * scale, 3);

            ctx.fillStyle = '#999999';
            ctx.strokeStyle = '#cccccc';
            ctx.lineWidth = 0.5;
            ctx.beginPath();
            ctx.arc(moonP.x, moonP.y, moonR, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();

            ctx.fillStyle = 'rgba(200,200,200,0.7)';
            ctx.font = '9px monospace';
            ctx.textAlign = 'center';
            ctx.fillText('MOON', moonP.x, moonP.y + moonR + 12);

            // Moon phase indicator
            const phase = this.orbital.moonPhaseAngle;
            ctx.fillStyle = 'rgba(200,200,200,0.4)';
            ctx.font = '7px monospace';
            let phaseStr = 'New';
            if (phase > 10 && phase < 80) phaseStr = 'Waxing Crescent';
            else if (phase >= 80 && phase < 100) phaseStr = 'First Quarter';
            else if (phase >= 100 && phase < 170) phaseStr = 'Waxing Gibbous';
            else if (phase >= 170 && phase < 190) phaseStr = 'Full';
            else if (phase >= 190 && phase < 260) phaseStr = 'Waning Gibbous';
            else if (phase >= 260 && phase < 280) phaseStr = 'Third Quarter';
            else if (phase >= 280 && phase < 350) phaseStr = 'Waning Crescent';
            ctx.fillText(phaseStr, moonP.x, moonP.y + moonR + 22);
        }

        // Earth-Moon Lagrange points
        if (this.orbital) {
            const colors = {
                1: '#44ffaa', 2: '#44aaff', 3: '#ff44aa',
                4: '#ffaa44', 5: '#aaff44'
            };

            for (let i = 1; i <= 5; i++) {
                const pos = this.orbital.lagrangeEM[i];
                if (!pos) continue;

                const p = project(pos);
                const color = colors[i];

                // Diamond shape
                ctx.strokeStyle = color;
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(p.x, p.y - 5);
                ctx.lineTo(p.x + 4, p.y);
                ctx.lineTo(p.x, p.y + 5);
                ctx.lineTo(p.x - 4, p.y);
                ctx.closePath();
                ctx.stroke();

                // Label
                ctx.fillStyle = color;
                ctx.font = 'bold 8px monospace';
                ctx.textAlign = 'center';
                ctx.fillText(`L${i}`, p.x, p.y - 8);
            }
        }

        // Player position (if far from Earth surface)
        if (this.player) {
            const pos = this.player.getPosition();
            const pp = project(pos);
            ctx.fillStyle = '#44ff88';
            ctx.shadowColor = '#44ff88';
            ctx.shadowBlur = 4;
            ctx.beginPath();
            ctx.arc(pp.x, pp.y, 3, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;
        }

        // Sun direction indicator (arrow at edge of view)
        if (this.orbital) {
            const sd = this.orbital.sunDirection;
            const angle = Math.atan2(-sd.z, sd.x); // map to screen angle
            const edgeX = cx + Math.cos(angle) * (Math.min(w, h) / 2 - 15);
            const edgeY = cy - Math.sin(angle) * (Math.min(w, h) / 2 - 15);

            ctx.fillStyle = '#ffdd44';
            ctx.beginPath();
            ctx.arc(edgeX, edgeY, 5, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = 'rgba(255,220,68,0.6)';
            ctx.font = '7px monospace';
            ctx.textAlign = 'center';
            ctx.fillText('SUN', edgeX, edgeY + 10);
        }

        // Scale bar
        ctx.strokeStyle = 'rgba(255,255,255,0.3)';
        ctx.lineWidth = 1;
        const scaleBarKm = 100000; // 100,000 km
        const scaleBarGU = scaleBarKm / 637.1;
        const scaleBarPx = scaleBarGU * scale;
        if (scaleBarPx > 20 && scaleBarPx < w * 0.8) {
            ctx.beginPath();
            ctx.moveTo(8, h - 10);
            ctx.lineTo(8 + scaleBarPx, h - 10);
            ctx.stroke();
            ctx.fillStyle = 'rgba(255,255,255,0.4)';
            ctx.font = '7px monospace';
            ctx.textAlign = 'left';
            ctx.fillText('100,000 km', 8, h - 14);
        }

        // Date/time
        if (this.orbital) {
            const d = this.orbital.gameDate;
            const dateStr = `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')} ${String(d.getUTCHours()).padStart(2,'0')}:${String(d.getUTCMinutes()).padStart(2,'0')} UTC`;
            ctx.fillStyle = 'rgba(255,255,255,0.4)';
            ctx.font = '8px monospace';
            ctx.textAlign = 'right';
            ctx.fillText(dateStr, w - 4, h - 4);
        }
    }

    // ─── Coordinate helpers ───────────────────────────────────────────

    lonToX(lon) {
        return ((lon + 180) / 360) * this.w;
    }

    latToY(lat) {
        return ((90 - lat) / 180) * this.h;
    }

    posToLatLon(pos) {
        // Inverse of latLonToPosition
        const r = pos.length();
        const lat = 90 - Math.acos(pos.y / r) * 180 / Math.PI;
        const lon = Math.atan2(pos.z, -pos.x) * 180 / Math.PI - 180;
        return {
            lat,
            lon: lon < -180 ? lon + 360 : lon > 180 ? lon - 360 : lon
        };
    }
}
