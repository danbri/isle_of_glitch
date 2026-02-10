/**
 * Custom Tone Mapping + Color Space Shader
 * Replaces OutputPass to avoid double tone mapping when built-in materials
 * also apply tone mapping during RenderPass.
 *
 * Pipeline: ACES Filmic Tone Mapping → Linear-to-sRGB → Alpha = 1.0
 */

export const ToneMappingShader = {
    uniforms: {
        tDiffuse: { value: null },
        exposure: { value: 1.0 }
    },

    vertexShader: /* glsl */`
        varying vec2 vUv;

        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,

    fragmentShader: /* glsl */`
        uniform sampler2D tDiffuse;
        uniform float exposure;

        varying vec2 vUv;

        // ACES Filmic Tone Mapping (same curve as Three.js ACESFilmicToneMapping)
        vec3 ACESFilmic(vec3 x) {
            float a = 2.51;
            float b = 0.03;
            float c = 2.43;
            float d = 0.59;
            float e = 0.14;
            return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
        }

        // Linear to sRGB (IEC 61966-2-1 transfer function)
        vec3 linearToSRGB(vec3 color) {
            vec3 lo = color * 12.92;
            vec3 hi = pow(color, vec3(1.0 / 2.4)) * 1.055 - 0.055;
            return mix(lo, hi, step(vec3(0.0031308), color));
        }

        void main() {
            vec4 texel = texture2D(tDiffuse, vUv);
            vec3 color = texel.rgb * exposure;

            // Tone map HDR → LDR
            color = ACESFilmic(color);

            // Linear → sRGB for display
            color = linearToSRGB(color);

            // Force alpha = 1.0 to prevent transparent objects from bleeding
            // low alpha through the pipeline
            gl_FragColor = vec4(color, 1.0);
        }
    `
};
