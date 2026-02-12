/**
 * Aurora Borealis Shader
 * Creates beautiful, animated northern lights effect
 */

export const AuroraShader = {
    uniforms: {
        time: { value: 0 },
        color1: { value: null },
        color2: { value: null },
        color3: { value: null },
        intensity: { value: 1.0 },
        speed: { value: 1.0 },
        playerAltitude: { value: 0 }
    },

    vertexShader: /* glsl */`
        #include <logdepthbuf_pars_vertex>

        varying vec2 vUv;
        varying vec3 vPosition;
        varying vec3 vNormal;
        varying float vElevation;

        uniform float time;
        uniform float speed;

        // Simplex noise function
        vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
        vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
        vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
        vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

        float snoise(vec3 v) {
            const vec2 C = vec2(1.0/6.0, 1.0/3.0);
            const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);

            vec3 i = floor(v + dot(v, C.yyy));
            vec3 x0 = v - i + dot(i, C.xxx);

            vec3 g = step(x0.yzx, x0.xyz);
            vec3 l = 1.0 - g;
            vec3 i1 = min(g.xyz, l.zxy);
            vec3 i2 = max(g.xyz, l.zxy);

            vec3 x1 = x0 - i1 + C.xxx;
            vec3 x2 = x0 - i2 + C.yyy;
            vec3 x3 = x0 - D.yyy;

            i = mod289(i);
            vec4 p = permute(permute(permute(
                i.z + vec4(0.0, i1.z, i2.z, 1.0))
                + i.y + vec4(0.0, i1.y, i2.y, 1.0))
                + i.x + vec4(0.0, i1.x, i2.x, 1.0));

            float n_ = 0.142857142857;
            vec3 ns = n_ * D.wyz - D.xzx;

            vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
            vec4 x_ = floor(j * ns.z);
            vec4 y_ = floor(j - 7.0 * x_);

            vec4 x = x_ * ns.x + ns.yyyy;
            vec4 y = y_ * ns.x + ns.yyyy;
            vec4 h = 1.0 - abs(x) - abs(y);

            vec4 b0 = vec4(x.xy, y.xy);
            vec4 b1 = vec4(x.zw, y.zw);

            vec4 s0 = floor(b0)*2.0 + 1.0;
            vec4 s1 = floor(b1)*2.0 + 1.0;
            vec4 sh = -step(h, vec4(0.0));

            vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
            vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;

            vec3 p0 = vec3(a0.xy, h.x);
            vec3 p1 = vec3(a0.zw, h.y);
            vec3 p2 = vec3(a1.xy, h.z);
            vec3 p3 = vec3(a1.zw, h.w);

            vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
            p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;

            vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
            m = m * m;
            return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
        }

        void main() {
            vUv = uv;
            vNormal = normal;
            vPosition = position;

            // Create flowing curtain effect
            float t = time * speed;

            // Multiple octaves of noise for organic movement
            float noise1 = snoise(vec3(position.x * 2.0 + t * 0.3, position.y * 0.5, t * 0.1));
            float noise2 = snoise(vec3(position.x * 4.0 - t * 0.2, position.y * 1.0, t * 0.15)) * 0.5;
            float noise3 = snoise(vec3(position.x * 8.0 + t * 0.1, position.y * 2.0, t * 0.05)) * 0.25;

            float totalNoise = noise1 + noise2 + noise3;

            // Displace vertices for flowing effect
            vec3 displaced = position;
            displaced.z += totalNoise * 0.3;
            displaced.x += sin(position.y * 3.0 + t) * 0.1;

            vElevation = totalNoise;

            gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
            #include <logdepthbuf_vertex>
        }
    `,

    fragmentShader: /* glsl */`
        #include <logdepthbuf_pars_fragment>

        uniform float time;
        uniform vec3 color1;  // Green
        uniform vec3 color2;  // Cyan
        uniform vec3 color3;  // Pink/Magenta
        uniform float intensity;
        uniform float playerAltitude;

        varying vec2 vUv;
        varying vec3 vPosition;
        varying vec3 vNormal;
        varying float vElevation;

        void main() {
            // Create color gradient based on UV and noise
            float t = vUv.y + vElevation * 0.3;

            // Blend between aurora colors
            vec3 color;
            if (t < 0.33) {
                color = mix(color1, color2, t * 3.0);
            } else if (t < 0.66) {
                color = mix(color2, color3, (t - 0.33) * 3.0);
            } else {
                color = mix(color3, color1, (t - 0.66) * 3.0);
            }

            // Vertical fade for curtain effect
            float verticalFade = smoothstep(0.0, 0.3, vUv.y) * smoothstep(1.0, 0.7, vUv.y);

            // Horizontal variation
            float horizontalVariation = sin(vUv.x * 20.0 + time) * 0.5 + 0.5;
            horizontalVariation = pow(horizontalVariation, 2.0);

            // Ray effect - vertical streaks
            float rays = sin(vUv.x * 50.0 + vElevation * 10.0) * 0.5 + 0.5;
            rays = pow(rays, 3.0);

            // Combine all effects
            float alpha = verticalFade * (0.3 + horizontalVariation * 0.4 + rays * 0.3);
            alpha *= intensity;

            // Increase visibility at higher altitudes
            float altitudeBoost = smoothstep(50.0, 200.0, playerAltitude);
            alpha *= 0.5 + altitudeBoost * 0.5;

            // Shimmer effect
            float shimmer = sin(time * 5.0 + vUv.x * 30.0) * 0.1 + 0.9;
            color *= shimmer;

            // Add glow
            color += color * rays * 0.5;

            gl_FragColor = vec4(color, alpha * 0.6);
            #include <logdepthbuf_fragment>
        }
    `
};

/**
 * Aurora Particle Shader
 * For additional sparkle effects
 */
export const AuroraParticleShader = {
    uniforms: {
        time: { value: 0 },
        color: { value: null },
        pointSize: { value: 3.0 }
    },

    vertexShader: /* glsl */`
        #include <logdepthbuf_pars_vertex>

        uniform float time;
        uniform float pointSize;

        attribute float size;
        attribute vec3 customColor;

        varying vec3 vColor;
        varying float vAlpha;

        void main() {
            vColor = customColor;

            // Animate particles
            vec3 pos = position;
            pos.y += sin(time + position.x * 10.0) * 0.1;
            pos.x += cos(time * 0.5 + position.z * 10.0) * 0.05;

            vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);

            // Size attenuation
            gl_PointSize = size * pointSize * (300.0 / -mvPosition.z);

            // Fade based on distance
            vAlpha = smoothstep(500.0, 100.0, -mvPosition.z);

            gl_Position = projectionMatrix * mvPosition;
            #include <logdepthbuf_vertex>
        }
    `,

    fragmentShader: /* glsl */`
        #include <logdepthbuf_pars_fragment>

        uniform float time;

        varying vec3 vColor;
        varying float vAlpha;

        void main() {
            // Circular point
            float dist = length(gl_PointCoord - vec2(0.5));
            if (dist > 0.5) discard;

            // Soft edge
            float alpha = smoothstep(0.5, 0.2, dist) * vAlpha;

            // Twinkle
            float twinkle = sin(time * 10.0 + gl_PointCoord.x * 20.0) * 0.3 + 0.7;

            gl_FragColor = vec4(vColor * twinkle, alpha * 0.8);
            #include <logdepthbuf_fragment>
        }
    `
};
