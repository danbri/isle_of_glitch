/**
 * Planet Surface Shader
 * Combines procedural terrain with city lights and natural lighting
 */

export const PlanetSurfaceShader = {
    uniforms: {
        time: { value: 0 },
        sunDirection: { value: null },
        dayTexture: { value: null },
        nightTexture: { value: null },
        bumpMap: { value: null },
        specularMap: { value: null },
        cloudsTexture: { value: null },
        cityLightsTexture: { value: null },
        bumpScale: { value: 0.05 },
        cloudOpacity: { value: 0.4 },
        atmosphereColor: { value: null }
    },

    vertexShader: /* glsl */`
        varying vec2 vUv;
        varying vec3 vNormal;
        varying vec3 vPosition;
        varying vec3 vWorldNormal;
        varying vec3 vViewPosition;

        void main() {
            vUv = uv;
            vNormal = normal;
            vPosition = position;
            vWorldNormal = normalize(mat3(modelMatrix) * normal);

            vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
            vViewPosition = -mvPosition.xyz;

            gl_Position = projectionMatrix * mvPosition;
        }
    `,

    fragmentShader: /* glsl */`
        uniform float time;
        uniform vec3 sunDirection;
        uniform sampler2D dayTexture;
        uniform sampler2D nightTexture;
        uniform sampler2D bumpMap;
        uniform sampler2D cloudsTexture;
        uniform sampler2D cityLightsTexture;
        uniform float bumpScale;
        uniform float cloudOpacity;
        uniform vec3 atmosphereColor;

        varying vec2 vUv;
        varying vec3 vNormal;
        varying vec3 vPosition;
        varying vec3 vWorldNormal;
        varying vec3 vViewPosition;

        // Simplex noise for procedural details
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

            vec4 x = x_ *ns.x + ns.yyyy;
            vec4 y = y_ *ns.x + ns.yyyy;
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
            p0 *= norm.x;
            p1 *= norm.y;
            p2 *= norm.z;
            p3 *= norm.w;

            vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
            m = m * m;
            return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
        }

        void main() {
            // Calculate lighting
            float NdotL = dot(vWorldNormal, sunDirection);
            float dayFactor = smoothstep(-0.15, 0.15, NdotL);

            // Sample textures
            vec4 dayColor = texture2D(dayTexture, vUv);
            dayColor.rgb *= 1.05; // Subtle lift — Blue Marble is well-exposed
            vec4 nightColor = texture2D(nightTexture, vUv);
            vec4 cityLights = texture2D(cityLightsTexture, vUv);
            vec4 clouds = texture2D(cloudsTexture, vUv + vec2(time * 0.001, 0.0));

            // Fallback colors if textures failed to load (returns ~black)
            // Use procedural color based on UV coordinates
            vec3 fallbackDay = vec3(0.3, 0.5, 0.4) + vec3(
                sin(vUv.x * 6.28) * 0.1,
                cos(vUv.y * 3.14) * 0.1,
                sin(vUv.x * 3.14 + vUv.y * 6.28) * 0.1
            );
            vec3 fallbackNight = vec3(0.05, 0.05, 0.1);

            // If texture is nearly black (failed to load), use fallback
            if (dayColor.r + dayColor.g + dayColor.b < 0.05) {
                dayColor.rgb = fallbackDay;
            }
            if (nightColor.r + nightColor.g + nightColor.b < 0.02) {
                nightColor.rgb = fallbackNight;
            }

            // Generate procedural details
            float detail = snoise(vPosition * 20.0) * 0.1;
            float cityGlow = snoise(vPosition * 50.0 + time * 0.1) * 0.5 + 0.5;

            // Blend day and night
            vec3 surfaceColor = mix(nightColor.rgb, dayColor.rgb, dayFactor);

            // Ensure minimum brightness so planet is always visible
            surfaceColor = max(surfaceColor, vec3(0.12, 0.12, 0.18));

            // Add city lights on dark side (reduced intensity)
            float cityIntensity = (1.0 - dayFactor) * cityLights.r * cityGlow;
            vec3 cityColor = vec3(1.0, 0.9, 0.7) * cityIntensity * 0.8; // Reduced from 2.0

            // Candy-colored city variation
            vec3 candyCity = mix(
                vec3(1.0, 0.6, 0.8),  // Pink
                vec3(0.6, 0.8, 1.0),  // Cyan
                sin(vUv.x * 20.0 + time) * 0.5 + 0.5
            );
            cityColor = mix(cityColor, candyCity * cityIntensity, 0.5);

            surfaceColor += cityColor;

            // Add cloud layer (reduced brightness)
            float cloudShadow = 1.0 - clouds.r * cloudOpacity * 0.2; // Reduced from 0.3
            surfaceColor *= cloudShadow;

            vec3 cloudColor = vec3(0.9) * clouds.r * cloudOpacity * dayFactor * 0.5; // Reduced
            surfaceColor += cloudColor;

            // Fresnel rim lighting (reduced)
            vec3 viewDir = normalize(vViewPosition);
            float fresnel = pow(1.0 - max(0.0, dot(vWorldNormal, viewDir)), 3.0);
            vec3 rimColor = atmosphereColor * fresnel * 0.1; // Reduced from 0.5

            surfaceColor += rimColor;

            // Add subtle detail variation
            surfaceColor += detail * 0.05;

            gl_FragColor = vec4(surfaceColor, 1.0);
        }
    `
};

/**
 * Ocean Shader for water surfaces
 */
export const OceanShader = {
    uniforms: {
        time: { value: 0 },
        sunDirection: { value: null },
        deepColor: { value: null },
        shallowColor: { value: null },
        foamColor: { value: null }
    },

    vertexShader: /* glsl */`
        varying vec2 vUv;
        varying vec3 vNormal;
        varying vec3 vPosition;
        varying vec3 vWorldPosition;

        uniform float time;

        void main() {
            vUv = uv;
            vNormal = normal;
            vPosition = position;

            // Animated waves
            vec3 pos = position;
            float wave = sin(position.x * 10.0 + time) * cos(position.z * 10.0 + time) * 0.01;
            pos += normal * wave;

            vec4 worldPos = modelMatrix * vec4(pos, 1.0);
            vWorldPosition = worldPos.xyz;

            gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
        }
    `,

    fragmentShader: /* glsl */`
        uniform float time;
        uniform vec3 sunDirection;
        uniform vec3 deepColor;
        uniform vec3 shallowColor;
        uniform vec3 foamColor;

        varying vec2 vUv;
        varying vec3 vNormal;
        varying vec3 vPosition;
        varying vec3 vWorldPosition;

        void main() {
            // Calculate lighting
            float NdotL = max(0.0, dot(vNormal, sunDirection));

            // Depth-based color
            vec3 color = mix(deepColor, shallowColor, vUv.y);

            // Specular highlights
            vec3 viewDir = normalize(cameraPosition - vWorldPosition);
            vec3 halfDir = normalize(sunDirection + viewDir);
            float spec = pow(max(0.0, dot(vNormal, halfDir)), 64.0);

            // Animated caustics pattern
            float caustics = sin(vUv.x * 30.0 + time) * sin(vUv.y * 30.0 + time * 1.3);
            caustics = caustics * 0.5 + 0.5;

            color += spec * vec3(1.0, 0.95, 0.9) * 0.5;
            color += caustics * shallowColor * 0.1;

            gl_FragColor = vec4(color * (NdotL * 0.5 + 0.5), 0.9);
        }
    `
};
