"""Fetch USGS LiDAR points (CA_SanFrancisco_1_B23 EPT) inside the view wedge from Treasure Island.

Level of detail falls off with distance: finer octree depth for downtown, coarser for the hills.
usage: python3 tools/fetch_lidar.py /tmp/sky/points.npz   (caches ~1.5 GB of tiles beside it)

Writes points.npz with true-metre east/north offsets from the viewpoint, elevation and class.
"""
import io
import json
import math
import os
import sys
from concurrent.futures import ThreadPoolExecutor

import laspy
import numpy as np
import requests
from pyproj import Transformer

BASE = "https://s3-us-west-2.amazonaws.com/usgs-lidar-public/CA_SanFrancisco_1_B23"
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = sys.argv[1] if len(sys.argv) > 1 else "points.npz"
CACHE = os.path.join(os.path.dirname(os.path.abspath(OUT)), "ept-cache")
os.makedirs(CACHE, exist_ok=True)

VIEW = (37.8165, -122.3725)        # Treasure Island SW shore
AIM = (37.79554, -122.39352)       # Ferry Building clock tower
HALF_FOV = math.radians(34)
MAX_DIST = 11500                   # metres, past Twin Peaks / Sutro

to3857 = Transformer.from_crs(4326, 3857, always_xy=True)
vx, vy = to3857.transform(VIEW[1], VIEW[0])
ax, ay = to3857.transform(AIM[1], AIM[0])
K = math.cos(math.radians(VIEW[0]))  # 3857 metres -> true metres
az = math.atan2(ax - vx, ay - vy)

ept = requests.get(f"{BASE}/ept.json").json()
B = ept["bounds"]
SPAN = B[3] - B[0]
sess = requests.Session()


def lod_depth(dist):
    if dist < 4200:
        return 8
    if dist < 6000:
        return 7
    return 6


def box_hits(d, x, y):
    """Return nearest true distance if the node's XY box touches the wedge, else None."""
    s = SPAN / 2 ** d
    x0, y0 = B[0] + x * s, B[1] + y * s
    xs = np.linspace(x0, x0 + s, 9)
    ys = np.linspace(y0, y0 + s, 9)
    gx, gy = np.meshgrid(xs, ys)
    dx, dy = (gx - vx) * K, (gy - vy) * K
    dist = np.hypot(dx, dy)
    ang = np.arctan2(dx, dy) - az
    ang = (ang + np.pi) % (2 * np.pi) - np.pi
    inside = (np.abs(ang) <= HALF_FOV) & (dist <= MAX_DIST)
    # viewpoint inside the box counts too
    if x0 <= vx <= x0 + s and y0 <= vy <= y0 + s:
        return 0.0
    if not inside.any():
        return None
    return float(dist[inside].min())


hier_cache = {}


def hierarchy(key):
    if key not in hier_cache:
        p = os.path.join(CACHE, f"h-{key}.json")
        if not os.path.exists(p):
            open(p, "w").write(sess.get(f"{BASE}/ept-hierarchy/{key}.json").text)
        hier_cache[key] = json.load(open(p))
    return hier_cache[key]


selected = []


def walk(key, h):
    d, x, y, z = map(int, key.split("-"))
    count = h.get(key)
    if count is None:
        return
    if count == -1:
        h = hierarchy(key)
        count = h[key]
    dist = box_hits(d, x, y)
    if dist is None or d > lod_depth(dist):
        return
    if count > 0:
        selected.append(key)
    for cx in (0, 1):
        for cy in (0, 1):
            for cz in (0, 1):
                walk(f"{d+1}-{2*x+cx}-{2*y+cy}-{2*z+cz}", h)


walk("0-0-0-0", hierarchy("0-0-0-0"))
print(f"{len(selected)} nodes", file=sys.stderr)


def load(key):
    p = os.path.join(CACHE, f"{key}.laz")
    if not os.path.exists(p):
        r = sess.get(f"{BASE}/ept-data/{key}.laz", timeout=120)
        r.raise_for_status()
        open(p, "wb").write(r.content)
    las = laspy.read(p)
    keep = ~np.isin(np.asarray(las.classification), [7, 18])
    return (np.asarray(las.x)[keep], np.asarray(las.y)[keep], np.asarray(las.z)[keep],
            np.asarray(las.classification)[keep].astype(np.uint8))


with ThreadPoolExecutor(16) as ex:
    parts = list(ex.map(load, selected))
X = np.concatenate([p[0] for p in parts]); Y = np.concatenate([p[1] for p in parts])
Z = np.concatenate([p[2] for p in parts]); C = np.concatenate([p[3] for p in parts])
east, north = (X - vx) * K, (Y - vy) * K
np.savez_compressed(OUT, east=east.astype(np.float32),
                    north=north.astype(np.float32), z=Z.astype(np.float32), cls=C, az=az)
print(f"{len(Z):,} points, azimuth {math.degrees(az):.1f}", file=sys.stderr)
