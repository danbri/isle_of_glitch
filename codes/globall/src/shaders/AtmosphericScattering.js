/**
 * Atmospheric Scattering Shader
 * Creates realistic atmosphere glow and scattering effects
 */

export const AtmosphericScatteringShader = {
    uniforms: {
        tDiffuse: { value: null },
        sunPosition: { value: null },
        planetCenter: { value: null },
        planetRadius: { value: 10.0 },
        atmosphereRadius: { value: 10.5 },
        rayleighCoefficient: { value: null },
        mieCoefficient: { value: 0.005 },
        sunIntensity: { value: 20.0 }
    },

    vertexShader: /* glsl */`
        varying vec2 vUv;
        varying vec3 vWorldPosition;

        void main() {
            vUv = uv;
            vec4 worldPosition = modelMatrix * vec4(position, 1.0);
            vWorldPosition = worldPosition.xyz;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,

    fragmentShader: /* glsl */`
        uniform sampler2D tDiffuse;
        uniform vec3 sunPosition;
        uniform vec3 planetCenter;
        uniform float planetRadius;
        uniform float atmosphereRadius;
        uniform vec3 rayleighCoefficient;
        uniform float mieCoefficient;
        uniform float sunIntensity;

        varying vec2 vUv;
        varying vec3 vWorldPosition;

        #define PI 3.14159265359

        // Rayleigh phase function
        float rayleighPhase(float cosTheta) {
            return 0.75 * (1.0 + cosTheta * cosTheta);
        }

        // Mie phase function (Henyey-Greenstein)
        float miePhase(float cosTheta, float g) {
            float g2 = g * g;
            return (1.0 - g2) / (4.0 * PI * pow(1.0 + g2 - 2.0 * g * cosTheta, 1.5));
        }

        void main() {
            vec4 texColor = texture2D(tDiffuse, vUv);

            // Calculate view direction
            vec3 viewDir = normalize(vWorldPosition - cameraPosition);
            vec3 sunDir = normalize(sunPosition);

            float cosTheta = dot(viewDir, sunDir);

            // Atmospheric scattering contribution
            float rayleigh = rayleighPhase(cosTheta);
            float mie = miePhase(cosTheta, 0.76);

            vec3 scattering = rayleighCoefficient * rayleigh + vec3(mieCoefficient) * mie;
            scattering *= sunIntensity;

            // Blend with original color
            gl_FragColor = vec4(texColor.rgb + scattering * 0.1, texColor.a);
        }
    `
};

/**
 * Atmosphere Glow Shader Material
 * For the planet's atmospheric rim
 */
export const AtmosphereGlowMaterial = {
    uniforms: {
        time: { value: 0 },
        sunDirection: { value: null },
        glowColor: { value: null },
        glowIntensity: { value: 1.0 }
    },

    vertexShader: /* glsl */`
        varying float intensity;
        varying vec3 vNormal;
        varying vec3 vPosition;

        void main() {
            vNormal = normalize(normalMatrix * normal);
            vPosition = position;

            // Fresnel-like effect for glow — computed in world space
            vec3 worldPos = (modelMatrix * vec4(position, 1.0)).xyz;
            vec3 worldNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
            vec3 viewDir = normalize(cameraPosition - worldPos);

            intensity = pow(1.0 - abs(dot(worldNormal, viewDir)), 2.5);

            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,

    fragmentShader: /* glsl */`
        uniform vec3 glowColor;
        uniform float glowIntensity;
        uniform vec3 sunDirection;
        uniform float time;

        varying float intensity;
        varying vec3 vNormal;
        varying vec3 vPosition;

        void main() {
            // Day/night variation
            float dayFactor = max(0.0, dot(normalize(vPosition), sunDirection));

            // Create gradient from cyan to magenta for candy effect
            vec3 dayColor = vec3(0.4, 0.7, 1.0);    // Cyan-ish
            vec3 nightColor = vec3(0.8, 0.3, 0.9);  // Magenta-ish
            vec3 color = mix(nightColor, dayColor, dayFactor);

            // Add subtle animation
            float pulse = sin(time * 0.5) * 0.1 + 0.9;

            gl_FragColor = vec4(color * intensity * glowIntensity * pulse, intensity * 0.8);
        }
    `
};
