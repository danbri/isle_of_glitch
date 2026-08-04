//! The portable core of the mazeballs world, mirroring `../src/*.js`.
//!
//! WHY THIS EXISTS TWICE. The simulation runs on the GPU in WGSL and the CPU
//! decides birth, death, mutation and allocation. That CPU logic needs to run in
//! Deno, in a browser, and eventually in a native build — and the usual answer,
//! "we will keep the copies in step", is one nobody manages for long. This
//! project has already watched three copies drift, each producing a wrong result
//! that was believed for a while.
//!
//! So the equivalence is tested rather than intended: `test/equivalence_test.js`
//! runs both implementations over thousands of inputs and fails on disagreement.
//!
//! THE INTERFACE IS FLAT ON PURPOSE. Only integers, floats and pointers into
//! linear memory cross the boundary. No wasm-bindgen, no generated glue, no
//! bundler: the artifact is a `.wasm` that `WebAssembly.instantiate` accepts
//! anywhere. Structured values would need a serialisation format on both sides,
//! which is another pair of things to keep in step.

#![no_std]

use core::panic::PanicInfo;

#[panic_handler]
fn panic(_: &PanicInfo) -> ! {
    loop {}
}

/* ------------------------------------------------------------------- rng */

/// One step of the 32-bit LCG. Must match `rng.js` exactly, including the
/// wrapping, which is why this is `wrapping_mul` rather than plain arithmetic.
#[no_mangle]
pub extern "C" fn rng_next(r: u32) -> u32 {
    r.wrapping_mul(1664525).wrapping_add(1013904223)
}

/// A float in [0,1). The divisor is 2^32 so the mapping matches the JS exactly.
#[no_mangle]
pub extern "C" fn rng_unit(r: u32) -> f32 {
    (rng_next(r) as f32) / 4294967296.0
}

/* ----------------------------------------------------------------- field */

/// Deterministic integer hash. Mirrors `hash2` in both `field.js` and WGSL_FIELD.
#[no_mangle]
pub extern "C" fn hash2(ix: i32, iy: i32, seed: u32) -> f32 {
    let mut h: u32 = (ix as u32).wrapping_mul(374761393)
        ^ (iy as u32).wrapping_mul(668265263)
        ^ seed.wrapping_mul(1274126177);
    h = (h ^ (h >> 13)).wrapping_mul(1274126177);
    ((h ^ (h >> 16)) as f32) / 4294967296.0
}

#[inline]
fn smooth3(t: f32) -> f32 {
    t * t * (3.0 - 2.0 * t)
}

#[inline]
fn mix(a: f32, b: f32, t: f32) -> f32 {
    a + (b - a) * t
}

#[no_mangle]
pub extern "C" fn vnoise(x: f32, y: f32, seed: u32) -> f32 {
    let ix = libm_floor(x) as i32;
    let iy = libm_floor(y) as i32;
    let u = smooth3(x - ix as f32);
    let v = smooth3(y - iy as f32);
    mix(
        mix(hash2(ix, iy, seed), hash2(ix + 1, iy, seed), u),
        mix(hash2(ix, iy + 1, seed), hash2(ix + 1, iy + 1, seed), u),
        v,
    )
}

// `no_std` has no floor, and pulling in libm for one function is not worth a
// dependency. Rounding toward negative infinity is what matters: the noise
// lattice must behave the same either side of zero, and truncation does not.
#[inline]
fn libm_floor(x: f32) -> f32 {
    let t = x as i32 as f32;
    if x < t { t - 1.0 } else { t }
}

/// Fractional-octave fbm. The fractional weight is what makes zoom continuous
/// rather than stepping as levels of detail cross a threshold.
#[no_mangle]
pub extern "C" fn fbm_oct(x: f32, y: f32, seed: u32, oct_f: f32) -> f32 {
    let (mut f, mut amp, mut norm) = (0.0f32, 1.0f32, 0.0f32);
    let (mut qx, mut qy) = (x, y);
    for o in 0..6u32 {
        let w = (oct_f - o as f32).clamp(0.0, 1.0);
        f += amp * w * vnoise(qx, qy, seed.wrapping_add(o.wrapping_mul(1013)));
        norm += amp * w;
        amp *= 0.5;
        qx *= 2.0;
        qy *= 2.0;
    }
    f / if norm > 1e-6 { norm } else { 1e-6 }
}

#[no_mangle]
pub extern "C" fn fbm(x: f32, y: f32, seed: u32) -> f32 {
    fbm_oct(x, y, seed, 4.0)
}

/// Squared so the good ground is scarce and patchy: a fitness landscape needs
/// somewhere worth being and somewhere not worth being.
#[no_mangle]
pub extern "C" fn resource_field(
    x: f32, y: f32, scale: f32, seed: u32,
    t: f32, drift_x: f32, drift_y: f32, morph_rate: f32,
) -> f32 {
    let qx = x * scale + t * drift_x;
    let qy = y * scale + t * drift_y;
    let a = fbm(qx, qy, seed);
    let b = fbm(qx, qy, seed.wrapping_add(7777));
    let w = 0.5 + 0.5 * sin_approx(t * morph_rate);
    let r = mix(a, b, w);
    r * r
}

// Bhaskara-style sine, accurate to ~0.002 over a period. The morph rate is a
// slow crossfade and does not need better; `no_std` does not have sin, and the
// JS side agrees to well inside the tolerance the equivalence test uses.
fn sin_approx(x: f32) -> f32 {
    const TAU: f32 = 6.283_185_5;
    let mut t = x % TAU;
    if t < 0.0 { t += TAU; }
    let (sign, u) = if t > 3.141_592_7 { (-1.0f32, t - 3.141_592_7) } else { (1.0f32, t) };
    sign * (16.0 * u * (3.141_592_7 - u)) / (49.348_022 - 4.0 * u * (3.141_592_7 - u))
}

/* ---------------------------------------------------------------- genome */

pub const TAU_MIN: f32 = 0.24;
pub const TAU_MAX: f32 = 1.89;

/// Which parent cell a child cell descends from when the body has changed size.
/// Proportional rather than truncating, so gaining a cell interpolates the
/// parent's plan instead of losing the tail of it.
#[no_mangle]
pub extern "C" fn source_of(i: u32, child_n: u32, parent_n: u32) -> u32 {
    let v = (i as u64 * parent_n as u64) / child_n as u64;
    let m = (parent_n - 1) as u64;
    (if v < m { v } else { m }) as u32
}

#[no_mangle]
pub extern "C" fn clamp_tau(t: f32) -> f32 {
    t.clamp(TAU_MIN, TAU_MAX)
}
