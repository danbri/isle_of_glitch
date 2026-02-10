/**
 * AudioSystem - Moody synthetic ambient sounds
 * Initializes immediately, mutes when page is hidden
 */

export class AudioSystem {
    constructor() {
        this.ctx = null;
        this.masterGain = null;
        this.isInitialized = false;
        this.isMuted = false;

        // Oscillators for ambient drone
        this.drones = [];
        this.lfo = null;

        // Sound parameters
        this.baseFreq = 55; // A1
        this.ambientVolume = 0.15;

        this.init();
    }

    init() {
        try {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
            this.masterGain = this.ctx.createGain();
            this.masterGain.gain.value = this.ambientVolume;
            this.masterGain.connect(this.ctx.destination);

            // Start ambient soundscape
            this.createAmbientDrone();

            // Handle visibility changes
            document.addEventListener('visibilitychange', () => this.handleVisibility());

            // Resume on user interaction (required by browsers)
            const resume = () => {
                if (this.ctx.state === 'suspended') {
                    this.ctx.resume();
                }
            };
            document.addEventListener('click', resume, { once: true });
            document.addEventListener('touchstart', resume, { once: true });
            document.addEventListener('keydown', resume, { once: true });

            this.isInitialized = true;
        } catch (e) {
            console.warn('WebAudio not available:', e);
        }
    }

    createAmbientDrone() {
        if (!this.ctx) return;

        // Create multiple detuned oscillators for rich drone
        const frequencies = [
            this.baseFreq,           // Root
            this.baseFreq * 1.5,     // Fifth
            this.baseFreq * 2,       // Octave
            this.baseFreq * 3,       // Octave + fifth
        ];

        frequencies.forEach((freq, i) => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            const filter = this.ctx.createBiquadFilter();

            // Alternate between sine and triangle for texture
            osc.type = i % 2 === 0 ? 'sine' : 'triangle';
            osc.frequency.value = freq;

            // Slight detune for width
            osc.detune.value = (Math.random() - 0.5) * 10;

            // Low-pass filter for warmth
            filter.type = 'lowpass';
            filter.frequency.value = 400 + i * 100;
            filter.Q.value = 1;

            // Volume varies by harmonic
            gain.gain.value = 0.3 / (i + 1);

            osc.connect(filter);
            filter.connect(gain);
            gain.connect(this.masterGain);

            osc.start();

            this.drones.push({ osc, gain, filter });
        });

        // LFO for subtle movement
        this.lfo = this.ctx.createOscillator();
        this.lfoGain = this.ctx.createGain();
        this.lfo.type = 'sine';
        this.lfo.frequency.value = 0.1; // Very slow
        this.lfoGain.gain.value = 50;

        this.lfo.connect(this.lfoGain);
        // Modulate filter frequencies
        this.drones.forEach(d => {
            this.lfoGain.connect(d.filter.frequency);
        });
        this.lfo.start();

        // Pad synth layer
        this.createPadLayer();
    }

    createPadLayer() {
        if (!this.ctx) return;

        // Ethereal pad with slow attack
        const padOsc = this.ctx.createOscillator();
        const padOsc2 = this.ctx.createOscillator();
        const padGain = this.ctx.createGain();
        const padFilter = this.ctx.createBiquadFilter();
        const reverb = this.createReverb();

        padOsc.type = 'sine';
        padOsc2.type = 'sine';
        padOsc.frequency.value = this.baseFreq * 4; // Two octaves up
        padOsc2.frequency.value = this.baseFreq * 4 * 1.01; // Slight detune

        padFilter.type = 'lowpass';
        padFilter.frequency.value = 800;
        padFilter.Q.value = 2;

        padGain.gain.value = 0.08;

        padOsc.connect(padFilter);
        padOsc2.connect(padFilter);
        padFilter.connect(padGain);
        padGain.connect(reverb);
        reverb.connect(this.masterGain);

        padOsc.start();
        padOsc2.start();

        this.padOsc = padOsc;
        this.padOsc2 = padOsc2;
        this.padGain = padGain;
        this.padFilter = padFilter;
    }

    createReverb() {
        const convolver = this.ctx.createConvolver();
        const length = this.ctx.sampleRate * 2;
        const impulse = this.ctx.createBuffer(2, length, this.ctx.sampleRate);

        for (let channel = 0; channel < 2; channel++) {
            const channelData = impulse.getChannelData(channel);
            for (let i = 0; i < length; i++) {
                channelData[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 2);
            }
        }

        convolver.buffer = impulse;
        return convolver;
    }

    // Play bounce sound - pitched based on charge
    playBounce(charge = 1) {
        if (!this.ctx || this.isMuted) return;

        const t = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const filter = this.ctx.createBiquadFilter();

        // Higher pitch for more charge — "boing" with pitch sweep
        const baseNote = 220 * (1 + charge * 0.5);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(baseNote, t);
        osc.frequency.exponentialRampToValueAtTime(baseNote * 2, t + 0.08);
        osc.frequency.exponentialRampToValueAtTime(baseNote * 0.5, t + 0.25);

        filter.type = 'lowpass';
        filter.frequency.value = 2500;

        gain.gain.setValueAtTime(0.2 * charge, t);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.3);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterGain);
        osc.start();
        osc.stop(t + 0.35);
    }

    // Charge sound — rising pitch oscillator, call startCharge/stopCharge
    startCharge() {
        if (!this.ctx || this.isMuted) return;
        this.stopCharge(); // Clean up any existing

        this._chargeOsc = this.ctx.createOscillator();
        this._chargeGain = this.ctx.createGain();
        this._chargeFilter = this.ctx.createBiquadFilter();

        this._chargeOsc.type = 'sine';
        this._chargeOsc.frequency.value = 150;
        this._chargeFilter.type = 'lowpass';
        this._chargeFilter.frequency.value = 800;
        this._chargeGain.gain.value = 0.06;

        this._chargeOsc.connect(this._chargeFilter);
        this._chargeFilter.connect(this._chargeGain);
        this._chargeGain.connect(this.masterGain);
        this._chargeOsc.start();
    }

    updateCharge(progress) {
        // progress: 0-1 over the charge duration
        if (!this._chargeOsc) return;
        const freq = 150 + progress * 600; // 150Hz → 750Hz
        this._chargeOsc.frequency.setTargetAtTime(freq, this.ctx.currentTime, 0.05);
        this._chargeGain.gain.setTargetAtTime(0.06 + progress * 0.08, this.ctx.currentTime, 0.05);
        this._chargeFilter.frequency.setTargetAtTime(800 + progress * 1500, this.ctx.currentTime, 0.05);
    }

    stopCharge() {
        if (this._chargeOsc) {
            try { this._chargeOsc.stop(); } catch(e) {}
            this._chargeOsc = null;
            this._chargeGain = null;
            this._chargeFilter = null;
        }
    }

    // Delivery chime — ascending arpeggio C5-E5-G5-C6
    playDeliver() {
        if (!this.ctx || this.isMuted) return;
        const notes = [523, 659, 784, 1047];
        notes.forEach((freq, i) => {
            const t = this.ctx.currentTime + i * 0.08;
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'sine';
            osc.frequency.value = freq;
            gain.gain.setValueAtTime(0.12, t);
            gain.gain.exponentialRampToValueAtTime(0.01, t + 0.18);
            osc.connect(gain);
            gain.connect(this.masterGain);
            osc.start(t);
            osc.stop(t + 0.22);
        });
    }

    // Combo chime — higher pitch based on combo level
    playCombo(level) {
        if (!this.ctx || this.isMuted) return;
        const baseFreq = 660 + level * 110; // Higher for bigger combos
        const t = this.ctx.currentTime;
        for (let i = 0; i < 2; i++) {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.value = baseFreq * (1 + i * 0.5);
            gain.gain.setValueAtTime(0.1, t + i * 0.06);
            gain.gain.exponentialRampToValueAtTime(0.01, t + i * 0.06 + 0.15);
            osc.connect(gain);
            gain.connect(this.masterGain);
            osc.start(t + i * 0.06);
            osc.stop(t + i * 0.06 + 0.2);
        }
    }

    // Timer warning — low urgent buzz
    playTimerWarning() {
        if (!this.ctx || this.isMuted) return;
        const t = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'square';
        osc.frequency.value = 180;
        gain.gain.setValueAtTime(0.06, t);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.12);
        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start(t);
        osc.stop(t + 0.15);
    }

    // Landing impact — low thud
    playLanding(impactSpeed) {
        if (!this.ctx || this.isMuted) return;
        const t = this.ctx.currentTime;
        const intensity = Math.min(1, impactSpeed / 15);
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(80 + intensity * 40, t);
        osc.frequency.exponentialRampToValueAtTime(40, t + 0.15);
        gain.gain.setValueAtTime(0.15 * intensity, t);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.2);
        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start(t);
        osc.stop(t + 0.25);
    }

    // Proximity ping — soft crystalline tone
    playProximity() {
        if (!this.ctx || this.isMuted) return;
        const t = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = 880;
        gain.gain.setValueAtTime(0.08, t);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.3);
        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start(t);
        osc.stop(t + 0.35);
    }

    // Altitude affects ambient sound
    updateAltitude(altitude) {
        if (!this.ctx || !this.drones.length) return;

        // Higher altitude = higher filter freq, more spacey
        const normalizedAlt = Math.min(altitude / 500, 1);

        this.drones.forEach((d, i) => {
            const baseFreq = 300 + i * 100;
            d.filter.frequency.setTargetAtTime(
                baseFreq + normalizedAlt * 600,
                this.ctx.currentTime,
                0.5
            );
        });

        // Pad gets brighter in space
        if (this.padFilter) {
            this.padFilter.frequency.setTargetAtTime(
                600 + normalizedAlt * 1200,
                this.ctx.currentTime,
                0.5
            );
        }
    }

    // Speed affects intensity
    updateSpeed(speed) {
        if (!this.ctx) return;

        const intensity = Math.min(speed / 20, 1);

        // LFO speeds up with movement
        if (this.lfo) {
            this.lfo.frequency.setTargetAtTime(
                0.1 + intensity * 0.4,
                this.ctx.currentTime,
                0.3
            );
        }
    }

    handleVisibility() {
        if (document.hidden) {
            this.mute();
        } else {
            this.unmute();
        }
    }

    mute() {
        if (!this.masterGain) return;
        this.isMuted = true;
        this.masterGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1);
    }

    unmute() {
        if (!this.masterGain) return;
        this.isMuted = false;
        this.masterGain.gain.setTargetAtTime(this.ambientVolume, this.ctx.currentTime, 0.1);
    }

    setVolume(volume) {
        this.ambientVolume = volume;
        if (this.masterGain && !this.isMuted) {
            this.masterGain.gain.setTargetAtTime(volume, this.ctx.currentTime, 0.1);
        }
    }
}
