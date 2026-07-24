#!/usr/bin/env python3
"""Clip + simplify Natural Earth 50m land to the Europe<->South Asia corridor
for the inline vector basemap. Output: data/basemap.json (compact GeoJSON-ish
polylines: list of rings, each [[lon,lat],...], rounded)."""
import json, sys

SRC = sys.argv[1]
OUT = "data/basemap.json"
# corridor: Britain to Bay of Bengal, includes Cape route? no - keep Suez-ish frame
LON = (-12.0, 125.0)
LAT = (-12.0, 62.0)

def clip_ring(ring):
    pts = [(x, y) for x, y in ring if LON[0] <= x <= LON[1] and LAT[0] <= y <= LAT[1]]
    return pts

def rdp(points, eps):
    """Ramer-Douglas-Peucker simplification."""
    if len(points) < 3:
        return points
    stack = [(0, len(points) - 1)]
    keep = [False] * len(points)
    keep[0] = keep[-1] = True
    while stack:
        i0, i1 = stack.pop()
        x0, y0 = points[i0]; x1, y1 = points[i1]
        dx, dy = x1 - x0, y1 - y0
        norm = (dx * dx + dy * dy) ** 0.5
        dmax, imax = 0.0, -1
        for i in range(i0 + 1, i1):
            x, y = points[i]
            if norm > 1e-9:
                d = abs(dy * (x - x0) - dx * (y - y0)) / norm
            else:  # degenerate chord (closed ring): distance to the point
                d = ((x - x0) ** 2 + (y - y0) ** 2) ** 0.5
            if d > dmax:
                dmax, imax = d, i
        if dmax > eps and imax > 0:
            keep[imax] = True
            stack.append((i0, imax)); stack.append((imax, i1))
    return [p for p, k in zip(points, keep) if k]

gj = json.load(open(SRC))
rings = []
for feat in gj["features"]:
    geom = feat["geometry"]
    polys = geom["coordinates"] if geom["type"] == "MultiPolygon" else [geom["coordinates"]]
    for poly in polys:
        outer = poly[0]
        # quick bbox reject
        xs = [p[0] for p in outer]; ys = [p[1] for p in outer]
        if max(xs) < LON[0] or min(xs) > LON[1] or max(ys) < LAT[0] or min(ys) > LAT[1]:
            continue
        pts = [(round(x, 2), round(y, 2)) for x, y in outer]
        pts = rdp(pts, 0.03)
        if len(pts) < 8:
            continue
        # clamp to frame rather than drop (keeps Eurasia landmass edge)
        pts = [(min(max(x, LON[0]), LON[1]), min(max(y, LAT[0]), LAT[1])) for x, y in pts]
        rings.append(pts)

out = {"bbox": [LON[0], LAT[0], LON[1], LAT[1]],
       "rings": [[[p[0], p[1]] for p in r] for r in rings]}
s = json.dumps(out, separators=(",", ":"))
open(OUT, "w").write(s)
print(f"rings: {len(rings)}, bytes: {len(s)}")
