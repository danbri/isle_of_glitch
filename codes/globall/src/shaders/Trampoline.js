/**
 * Trampoline Shaders
 * Visual effects for trampoline pads and energy rings
 */

export const TrampolineSurfaceShader = {
    uniforms: {
        time: { value: 0 },
        bouncePhase: { value: 0 },
        baseColor: { value: null },
        energyColor: { value: null },
        rippleCenter: { value: null },
        rippleStrength: { value: 0 }
    },

    vertexShader: /* glsl */`
        uniform float time;
        uniform float bouncePhase;
        uniform vec2 rippleCenter;
        uniform float rippleStrength;

        varying vec2 vUv;
        varying float vElevation;

        void main() {
            vUv = uv;

            // Calculate distance from center
            vec2 center = vec2(0.5, 0.5);
            float dist = length(uv - center);

            // Trampoline bounce deformation
            float bounce = sin(bouncePhase) * 0.1 * (1.0 - dist * 2.0);
            bounce = max(bounce, 0.0);

            // Ripple effect
            float ripple = sin(dist * 20.0 - time * 5.0) * rippleStrength * (1.0 - dist);

            vElevation = bounce + ripple;

            vec3 pos = position;
            pos.z += vElevation;

            gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
        }
    `,

    fragmentShader: /* glsl */`
        uniform float time;
        uniform vec3 baseColor;
        uniform vec3 energyColor;
        uniform float rippleStrength;

        varying vec2 vUv;
        varying float vElevation;

        void main() {
            // Calculate distance from center
            vec2 center = vec2(0.5, 0.5);
            float dist = length(vUv - center);

            // Hexagonal grid pattern
            vec2 hexUv = vUv * 10.0;
            float hex = abs(sin(hexUv.x * 3.14159) * sin(hexUv.y * 3.14159));

            // Radial gradient
            float radial = 1.0 - smoothstep(0.0, 0.5, dist);

            // Animated energy rings
            float rings = sin(dist * 30.0 - time * 3.0) * 0.5 + 0.5;
            rings *= radial;

            // Combine colors
            vec3 color = mix(baseColor, energyColor, rings * 0.5 + hex * 0.2);

            // Add elevation glow
            color += energyColor * vElevation * 5.0;

            // Edge glow
            float edge = smoothstep(0.45, 0.5, dist);
            color += energyColor * edge * 0.5;

            // Transparency
            float alpha = radial * 0.9 + 0.1;

            gl_FragColor = vec4(color, alpha);
        }
    `
};

export const TrampolineEnergyRingShader = {
    uniforms: {
        time: { value: 0 },
        color: { value: null },
        pulseSpeed: { value: 1.0 },
        ringIndex: { value: 0 }
    },

    vertexShader: /* glsl */`
        uniform float time;
        uniform float pulseSpeed;
        uniform float ringIndex;

        varying vec2 vUv;
        varying float vPulse;

        void main() {
            vUv = uv;

            // Pulse animation
            vPulse = sin(time * pulseSpeed + ringIndex * 0.5) * 0.5 + 0.5;

            // Scale based on pulse
            vec3 pos = position;
            float scale = 1.0 + vPulse * 0.1;
            pos.xy *= scale;

            gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
        }
    `,

    fragmentShader: /* glsl */`
        uniform float time;
        uniform vec3 color;

        varying vec2 vUv;
        varying float vPulse;

        void main() {
            // Ring glow
            float glow = vPulse * 0.8 + 0.2;

            // Rotating energy pattern
            float angle = atan(vUv.y - 0.5, vUv.x - 0.5);
            float pattern = sin(angle * 8.0 + time * 2.0) * 0.5 + 0.5;

            vec3 finalColor = color * glow * (0.7 + pattern * 0.3);

            gl_FragColor = vec4(finalColor, glow * 0.6);
        }
    `
};

export const TrampolineLaunchShader = {
    uniforms: {
        time: { value: 0 },
        launchProgress: { value: 0 },
        color1: { value: null },
        color2: { value: null }
    },

    vertexShader: /* glsl */`
        attribute float particleIndex;
        attribute vec3 velocity;

        uniform float time;
        uniform float launchProgress;

        varying vec3 vColor;
        varying float vAlpha;

        void main() {
            // Animate particles upward during launch
            vec3 pos = position;
            float t = launchProgress;

            pos += velocity * t;
            pos.y += t * t * -2.0; // Gravity

            // Size attenuation
            vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
            gl_PointSize = 5.0 * (1.0 - t) * (300.0 / -mvPosition.z);

            vAlpha = 1.0 - t;

            gl_Position = projectionMatrix * mvPosition;
        }
    `,

    fragmentShader: /* glsl */`
        uniform vec3 color1;
        uniform vec3 color2;
        uniform float time;

        varying float vAlpha;

        void main() {
            // Circular particle
            float dist = length(gl_PointCoord - vec2(0.5));
            if (dist > 0.5) discard;

            float alpha = smoothstep(0.5, 0.0, dist) * vAlpha;

            // Color gradient
            vec3 color = mix(color1, color2, gl_PointCoord.y);

            gl_FragColor = vec4(color, alpha);
        }
    `
};

export const TrampolineConnectionShader = {
    uniforms: {
        time: { value: 0 },
        color1: { value: null },
        color2: { value: null },
        flowSpeed: { value: 1.0 },
        selected: { value: 0.0 }
    },

    vertexShader: /* glsl */`
        attribute float lineProgress;

        uniform float time;
        uniform float flowSpeed;

        varying float vProgress;
        varying float vFlow;

        void main() {
            vProgress = lineProgress;

            // Animated flow along the line
            vFlow = fract(lineProgress - time * flowSpeed);

            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,

    fragmentShader: /* glsl */`
        uniform vec3 color1;
        uniform vec3 color2;
        uniform float selected;

        varying float vProgress;
        varying float vFlow;

        void main() {
            // Gradient along line
            vec3 color = mix(color1, color2, vProgress);

            // Flow pulses
            float pulse = smoothstep(0.0, 0.1, vFlow) * smoothstep(0.3, 0.2, vFlow);

            // Brighten when selected
            color = mix(color, vec3(1.0), selected * 0.3);

            float alpha = 0.3 + pulse * 0.4 + selected * 0.3;

            gl_FragColor = vec4(color, alpha);
        }
    `
};
