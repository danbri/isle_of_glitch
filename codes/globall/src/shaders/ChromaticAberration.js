/**
 * Chromatic Aberration Shader
 * Creates a candy-colored edge effect that intensifies with speed
 */

export const ChromaticAberrationShader = {
    uniforms: {
        tDiffuse: { value: null },
        amount: { value: 0.002 },
        angle: { value: 0.0 }
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
        uniform float amount;
        uniform float angle;

        varying vec2 vUv;

        void main() {
            vec2 offset = amount * vec2(cos(angle), sin(angle));

            // Sample RGB channels at slightly different positions
            vec4 cr = texture2D(tDiffuse, vUv + offset);
            vec4 cg = texture2D(tDiffuse, vUv);
            vec4 cb = texture2D(tDiffuse, vUv - offset);

            // Combine with slight color enhancement
            gl_FragColor = vec4(cr.r, cg.g, cb.b, cg.a);

            // Add subtle vignette
            vec2 center = vUv - 0.5;
            float vignette = 1.0 - dot(center, center) * 0.5;
            gl_FragColor.rgb *= vignette;
        }
    `
};
