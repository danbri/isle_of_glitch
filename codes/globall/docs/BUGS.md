# Known Bugs — Glo-ball Gopher

Last updated: 2026-02-11

---

## BUG-1: Blue Marble texture intermittently fails to load

**Severity:** Critical — breaks sense of place (P0 goal)

**Status: FIXED** — Game now starts with procedural texture immediately, loads Blue Marble in background with retry (3 attempts, exponential backoff), and swaps it in when ready. No more 8-second hard timeout blocking game start.

**Symptoms:**
- Planet renders with dark/gray procedural texture instead of NASA Blue Marble photo
- Coastlines unrecognizable — user reported "This coast doesn't look like Boston"
- Country outlines appear to float "in the sea" (see BUG-2)

**Root cause:**
Blue Marble texture was loaded from CDN (`unpkg.com/three-globe@2.31.0`) with an 8-second timeout. When CDN was slow or failed, `loadEarthTexture()` in `Planet.js` fell back to `generateDayTexture()` permanently.

**Fix:** `loadEarthTextureInBackground()` — non-blocking background load with retry, swaps texture into material uniform when ready.

**Affected file:** `src/components/Planet.js`

**Possible fixes:**
1. Bundle texture locally (eliminates CDN dependency, adds ~1.4MB to repo)
2. Increase timeout + retry logic
3. Try multiple CDN sources in sequence before falling back
4. Use a more reliable CDN (e.g. NASA SVS direct, Wikimedia Commons)
5. Higher-res option found: Wikimedia Solar System Scope 8K (8192x4096, 4.35MB, CC BY 4.0)

---

## BUG-2: Country outlines appear in the sea (procedural fallback)

**Severity:** High — visually confusing

**Symptoms:**
- GeoJSON country border lines appear over areas that look like ocean
- Observed at CXI Kiritimati (Christmas Island, Pacific) and other locations

**Root cause:**
Country outlines use real GeoJSON lat/lon data (correct positions). But when the Blue Marble texture fails to load (BUG-1), the procedural fallback texture defines "land" using hardcoded ellipsoidal zones that don't match actual continent shapes. So correctly-placed outlines sit over procedural "ocean".

**Affected files:**
- `src/components/Planet.js` — `generateDayTexture()` defines procedural continents
- `src/components/CountryOutlines.js` — uses GeoJSON data (correct)

**Fix:** Resolve BUG-1 (reliable Blue Marble loading). The procedural texture is inherently inaccurate and should only be a last-resort fallback.

---

## BUG-3: Coastlines not recognizable at close zoom

**Severity:** Medium — undermines "this is Earth" feel

**Symptoms:**
- User reported coastline near Boston/FSP Saint-Pierre area didn't look right
- At close zoom on mobile, texture appears blurry or abstract

**Root cause:**
Blue Marble texture is 4096x2048 (1.39MB). At close zoom levels on mobile devices, individual texels become visible. May also be compounded by BUG-1 (procedural fallback being used instead).

**Possible fixes:**
1. Use higher-res texture: Wikimedia Solar System Scope 8K (8192x4096, CC BY 4.0)
2. Add LOD texture switching (low-res at distance, high-res at close zoom)
3. Ensure BUG-1 is fixed first — may resolve the issue if procedural fallback was active

---

## BUG-4: Deep field galaxy sprites too prominent

**Severity:** Low — visual distraction

**Symptoms:**
- Colored circles (pink, orange, yellow) from distant galaxy sprites appear large and bubble-like
- Visible in screenshots as prominent colored dots around the planet

**Affected file:** `src/components/SpaceEnvironment.js` — `createDeepFieldObjects()`

**Possible fixes:**
1. Reduce sprite size
2. Reduce opacity
3. Only show at high altitude
4. Use smaller point sprites instead of billboard sprites

---

## Status

| Bug | Status | Blocking |
|-----|--------|----------|
| BUG-1 | Fixed | P0 — sense of place |
| BUG-2 | Mitigated | Caused by BUG-1 (now only brief flash before texture loads) |
| BUG-3 | Mitigated | Partly caused by BUG-1 |
| BUG-4 | Open | Low priority |
