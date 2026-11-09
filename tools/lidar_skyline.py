"""Draw the homepage footer skyline from USGS LiDAR.

The view is from Treasure Island's southwest shore (eye about 5 m above the bay),
aimed at the Ferry Building clock tower, so Market Street runs away from the
camera through the middle of the frame.

Input is points.npz from tools/fetch_lidar.py: every LiDAR return in the view
wedge, in true metres east/north of the viewpoint. Points are projected with a
perspective camera, split into depth bands, and each band's upper envelope
becomes one filled path (far = light, near = dark). The Bay Bridge is drawn as
structure (towers, cables, deck, hangers) instead of a filled envelope, with
the Bay Lights on its suspenders.

usage: python3 tools/lidar_skyline.py points.npz index.html [preview.svg]
"""
import math
import re
import sys

import numpy as np
from pyproj import Transformer

EYE = 5.0
R_EARTH = 6371000.0
COL = 0.0004                 # radians per SVG unit
HALF = math.radians(30)
SHORE_D = 2800               # distance where the bay meets the city

# (near edge in metres, CSS class). Painted far to near.
BANDS = [(400, "b-near"), (2600, "b-front"), (3150, "b-1"), (3600, "b-2"),
         (4500, "b-3"), (13000, None)]
SIMPLIFY = 0.45              # how far (units) an outline may stray from the scan
FINE = 3                     # building outlines are traced at 1/FINE of a unit
BRIDGE_COLS = 700            # bridge occupies the left of the frame
BRIDGE_DEPTH = 3150          # ...and is nearer than downtown
CROP = (150, 2470)           # columns kept: bridge tower to past Coit Tower
VIEW = (37.8165, -122.3725)  # must match tools/fetch_lidar.py

# Landmarks are drawn from their own points: at each height, the scan gives the
# tower's width; those widths make a smooth, symmetric outline. (A straight trace
# of the top-most point per column turns the scanner's height bands into stairs.)
LANDMARKS = {
    "salesforce": (37.78978, -122.39692, 38),
    "transamerica": (37.795167, -122.40279, 38),
    "coit": (37.80239, -122.40583, 9),
    "ferry": (37.79554, -122.39352, 16),
}
# Sutro Tower: the scan only catches scattered returns off its open lattice ~10 km
# out, so it's drawn as a simple vector at its measured base. Real dimensions:
# 298 m tall, decks at 85 m and 215 m, three masts splaying out above the top deck.
SUTRO = (37.75523, -122.45277)
SUTRO_H = 298
# True to scale it's a small fork ~10 km out, half hidden behind 555 California.
# Drawn larger (the way it reads in zoomed-in photos) and nudged just clear of it.
SUTRO_SCALE = 1.6
SUTRO_NUDGE = 7              # units to the right
SKY = 14                     # units of sky above the tallest point
WATER = 0                    # units of bay below the shore (0: the city sits right on the footer bar)


def envelope(col, v, n):
    e = np.full(n, -np.inf)
    np.maximum.at(e, col, v)
    # Remove one-column spikes (birds, crane cables, stray returns).
    l, r = np.r_[e[0], e[:-1]], np.r_[e[1:], e[-1]]
    return np.minimum(np.maximum(l, e), np.maximum(e, r))


def roll(a, w, fn):
    pad = np.pad(a, w // 2, mode="edge")
    return fn(np.lib.stride_tricks.sliding_window_view(pad, w), axis=1)


def clean(y, w=3):
    """Drop rooftop clutter narrower than w columns, then a light median."""
    y = roll(roll(y, w, np.max), w, np.min)     # y is downward, so this is an opening
    return roll(y, 3, np.median)


def rdp(pts, eps):
    pts = np.asarray(pts, float)
    if len(pts) < 3:
        return pts
    a, b = pts[0], pts[-1]
    ab = b - a
    nrm = math.hypot(*ab) or 1.0
    dist = np.abs(np.cross(ab, pts - a)) / nrm
    i = int(np.argmax(dist))
    if dist[i] <= eps:
        return np.array([a, b])
    return np.vstack([rdp(pts[: i + 1], eps)[:-1], rdp(pts[i:], eps)])


def width_profile(off, z, ground, top, step=3.0, monotone=True, start=0.2):
    """Half-width and centre (metres) of a tower at each height, from its points."""
    h = top - ground
    zs, half, mid = [], [], []
    for zb in np.arange(ground + start * h, top, step):
        k = (z >= zb) & (z < zb + step)
        if k.sum() < 12:
            continue
        lo_, hi_ = np.percentile(off[k], [1.5, 98.5])
        zs.append(zb + step / 2)
        half.append((hi_ - lo_) / 2)
        mid.append((hi_ + lo_) / 2)
    half = np.array(half)
    # Towers only get narrower going up; take the running minimum, then smooth.
    if monotone:
        half = np.minimum.accumulate(half)
    half = np.convolve(np.pad(half, 1, mode="edge"), np.ones(3) / 3, mode="valid")
    return dict(z=np.array(zs), half=half, centre=float(np.median(mid[len(mid) // 4: 3 * len(mid) // 4 + 1])))


def fmt(x):
    s = f"{x:.1f}"
    return s[:-2] if s.endswith(".0") else s


def main(npz, html_path, preview=None):
    p = np.load(npz)
    east, north, z, az = p["east"], p["north"], p["z"], float(p["az"])
    fx, fy = math.sin(az), math.cos(az)
    d = east * fx + north * fy
    lat = east * fy - north * fx
    keep = d > BANDS[0][0]
    d, lat, z, east, north = d[keep], lat[keep], z[keep], east[keep], north[keep]
    u = np.arctan2(lat, d)
    v = np.arctan2(z - EYE - 0.87 * d * d / (2 * R_EARTH), d)
    n = int(round(2 * HALF / COL))
    col = np.floor((u + HALF) / COL).astype(np.int64)
    inb = (col >= 0) & (col < n)
    col, v, d, zz = col[inb], v[inb], d[inb], z[inb]
    east, north, u_all = east[inb], north[inb], u[inb]
    band = np.searchsorted([b[0] for b in BANDS], d, side="right") - 1
    curv = lambda dd: 0.87 * dd * dd / (2 * R_EARTH)

    # Measure each landmark from its own points, then cut them out of the skyline.
    to_m = Transformer.from_crs(4326, 3857, always_xy=True)
    vx, vy = to_m.transform(VIEW[1], VIEW[0])
    K = math.cos(math.radians(VIEW[0]))
    lm = {}
    cut = np.zeros(len(d), bool)
    for name, (la, lo, rad) in LANDMARKS.items():
        mx, my = to_m.transform(lo, la)
        le, ln = (mx - vx) * K, (my - vy) * K
        # Re-centre on the tower itself: the middle of its upper points.
        for _ in range(3):
            r2 = (east - le) ** 2 + (north - ln) ** 2
            near = r2 < (rad * 2) ** 2
            g0 = float(np.percentile(zz[near], 5))
            hi_ = near & (zz > g0 + 0.6 * (np.percentile(zz[near], 99.8) - g0))
            le, ln = float(np.median(east[hi_])), float(np.median(north[hi_]))
        r2 = (east - le) ** 2 + (north - ln) ** 2
        mine = r2 < rad * rad
        ground = float(np.percentile(zz[(r2 < (rad * 2.5) ** 2)], 5))
        top_z = float(np.percentile(zz[mine], 99.8))
        hgt = top_z - ground
        mid = mine & (zz > ground + 0.25 * hgt) & (zz < ground + 0.5 * hgt)
        c_lo, c_hi = np.percentile(col[mid], [3, 97]) if mid.sum() > 20 else (np.nan, np.nan)
        dl = le * fx + ln * fy
        cl = (math.atan2(le * fy - ln * fx, dl) + HALF) / COL
        lm[name] = dict(col=cl, d=dl, ground=ground, top=top_z, width=float(c_hi - c_lo + 1),
                        band=int(np.searchsorted([b[0] for b in BANDS], dl, side="right") - 1))
        own = mine & (zz > ground + 2)
        # Sideways offset from the landmark's centre line, in metres at its distance.
        ll = le * fy - ln * fx
        off = np.tan(u_all[own]) * dl - ll
        lm[name]["profile"] = width_profile(off, zz[own], ground, top_z, monotone=name != "transamerica",
                                          start=0.4 if name == "ferry" else 0.2)
        P = lm[name]["profile"]
        print(f"  {name} profile: centre {P['centre']:+.1f} m, half-width {P['half'][0]:.1f} m at {P['z'][0]:.0f} m"
              f" -> {P['half'][-1]:.1f} m at {P['z'][-1]:.0f} m")
        cut |= own
        print(f"{name}: col {cl:.0f}, {dl:.0f} m away, {hgt:.0f} m tall, {lm[name]['width']:.1f} units wide")
    mx, my = to_m.transform(SUTRO[1], SUTRO[0])
    se, sn = (mx - vx) * K, (my - vy) * K
    r2 = (east - se) ** 2 + (north - sn) ** 2
    s_ground = float(np.percentile(zz[r2 < 60 ** 2], 5))
    cut |= (r2 < 45 ** 2) & (zz > s_ground + 8)
    s_d = se * fx + sn * fy
    sutro = dict(col=(math.atan2(se * fy - sn * fx, s_d) + HALF) / COL, d=s_d, ground=s_ground,
                 band=int(np.searchsorted([b[0] for b in BANDS], s_d, side="right") - 1))
    print(f"sutro: col {sutro['col']:.0f}, {s_d:.0f} m away, base {s_ground:.0f} m")
    col, v, d, zz, band, u_all = col[~cut], v[~cut], d[~cut], zz[~cut], band[~cut], u_all[~cut]
    fcol = np.floor((u_all + HALF) / (COL / FINE)).astype(np.int64)

    shore = -EYE / SHORE_D
    tops = []
    for b in range(len(BANDS) - 1):
        m = band == b
        m &= ~((col < BRIDGE_COLS) & (d < BRIDGE_DEPTH))   # the bridge is drawn separately
        tops.append(np.maximum(envelope(col[m], v[m], n), shore))
    top_v = max(float(t[CROP[0]:CROP[1]].max()) for t in tops)
    top_v = max([top_v, math.atan2(sutro["ground"] + SUTRO_H * SUTRO_SCALE - EYE - curv(sutro["d"]), sutro["d"])]
                + [math.atan2(L["top"] - EYE - curv(L["d"]), L["d"]) for L in lm.values()])

    # SVG units: 1 unit = 1 column = COL radians. y grows downward.
    y_of = lambda vv: (top_v - vv) / COL + SKY
    shore_y = y_of(shore)
    H = shore_y + WATER
    x0, x1 = CROP

    paths = []
    nf = n * FINE

    def outline(fc, vv, lo=x0 * FINE, hi=x1 * FINE, closed=True):
        """Upper outline of some points at fine resolution, as a filled path."""
        e = envelope(fc, vv, nf)
        y = np.where(np.isfinite(e), (top_v - e) / COL + SKY, shore_y)
        if not closed:  # landmark: bridge sparse columns (lattice crowns, spires)
            y = roll(roll(y, 3, np.min), 3, np.max)
        y = np.minimum(clean(y, 3 if not closed else 2 * FINE + 1), shore_y)
        filled = np.nonzero(y[lo:hi] < shore_y - 0.01)[0]
        if not closed:
            if not len(filled):
                return ""
            lo, hi = lo + filled[0], lo + filled[-1] + 1
        pts = [(lo / FINE, shore_y)]
        for c in range(lo, hi):
            pts += [(c / FINE, y[c]), ((c + 1) / FINE, y[c])]
        pts.append((hi / FINE, shore_y))
        return "M" + " L".join(f"{fmt(a)} {fmt(b_)}" for a, b_ in rdp(pts, SIMPLIFY)) + "Z"

    def tower_path(L):
        P, dd = L["profile"], L["d"]
        cx = L["col"] + P["centre"] / dd / COL
        Y = lambda zv: y_of(math.atan2(zv - EYE - curv(dd), dd))
        hw = P["half"] / dd / COL
        left = [(cx - w, Y(zv)) for zv, w in zip(P["z"], hw)]
        right = [(cx + w, Y(zv)) for zv, w in reversed(list(zip(P["z"], hw)))]
        top = Y(L["top"])
        pts = ([(cx - hw[0], shore_y)] + left + [(cx - hw[-1] * .6, top), (cx + hw[-1] * .6, top)]
               + right + [(cx + hw[0], shore_y)])
        return "M" + " L".join(f"{fmt(a)} {fmt(b_)}" for a, b_ in rdp(pts, 0.15)) + "Z"

    def sutro_path():
        """Sutro Tower as solid shapes, proportions from a measured elevation drawing
        (metres from the base): three legs pinch in to a waist at 173 m, flare out to
        the wide top platform, then three masts end in thin antennas."""
        dd, g = sutro["d"], sutro["ground"]
        P = lambda x, h: (sutro["col"] + SUTRO_NUDGE + x * SUTRO_SCALE / dd / COL,
                          y_of(math.atan2(g + h * SUTRO_SCALE - EYE - curv(dd), dd)))
        polys = []

        def member(pts):                       # centreline [(x, h, width)] -> polygon
            left = [(x - w / 2, h) for x, h, w in pts]
            right = [(x + w / 2, h) for x, h, w in reversed(pts)]
            polys.append(left + right)

        def bar(x0, x1, h0, h1, inset=0.0):   # horizontal piece; inset narrows the bottom
            polys.append([(x0 + inset, h0), (x0, h1), (x1, h1), (x1 - inset, h0)])

        for s_ in (-1, 1):                     # outer legs and their masts
            member([(s_ * 25, 0, 6.5), (s_ * 8.5, 173, 4.2), (s_ * 15.5, 238, 3.8),
                    (s_ * 16.7, 244, 3.6), (s_ * 16.7, 277, 3.4)])
            member([(s_ * 16.7, 276, 1.4), (s_ * 16.7, SUTRO_H, 1.0)])
        member([(0, 0, 3.8), (0, 277, 3.4)])   # centre leg / mast
        member([(0, 276, 1.4), (0, SUTRO_H, 1.0)])
        bar(-20.5, 20.5, 52, 57)               # lower crossbars
        bar(-14.5, 14.5, 115, 120)
        bar(-9.5, 9.5, 171, 175)               # waist
        bar(-11.5, 11.5, 202, 207)             # middle platform
        bar(-34, 34, 234, 241, inset=5)        # top platform
        d_ = "".join("M" + " L".join(f"{fmt(a_)} {fmt(b_)}" for a_, b_ in (P(*q) for q in poly)) + "Z"
                     for poly in polys)
        return f'<path class="sutro" d="{d_}"/>'

    for b in reversed(range(len(BANDS) - 1)):
        m = (band == b) & ~((col < BRIDGE_COLS) & (d < BRIDGE_DEPTH))
        paths.append(f'<path class="{BANDS[b][1]}" d="{outline(fcol[m], v[m])}"/>')
        if sutro["band"] == b:
            paths.append(sutro_path())
        for name, L in lm.items():
            if L["band"] == b:
                paths.append(f'<path class="{BANDS[b][1]}" d="{tower_path(L)}"/>')


    # ----- Bay Bridge: measured from the scan, drawn as simple parts -----
    bm = (col < BRIDGE_COLS) & (d < BRIDGE_DEPTH) & (zz > 3)
    bc, bv, bd, bz = col[bm], v[bm], d[bm], zz[bm]
    cs = np.arange(x0, BRIDGE_COLS)
    top = np.full(len(cs), np.nan)
    deck_z = np.full(len(cs), np.nan)
    deck_d = np.full(len(cs), np.nan)
    order = np.argsort(bc)
    bc, bv, bd, bz = bc[order], bv[order], bd[order], bz[order]
    lo = np.searchsorted(bc, cs)
    hi = np.searchsorted(bc, cs, side="right")
    for i, (a, b) in enumerate(zip(lo, hi)):
        if b - a < 30:
            continue
        top[i] = np.percentile(bv[a:b], 99.7)
        dz = bz[a:b][(bz[a:b] > 15) & (bz[a:b] < 95)]
        if len(dz) < 30:
            continue
        h, e = np.histogram(dz, bins=np.arange(15, 96, 3))
        mode = e[int(np.argmax(h))] + 1.5
        near = np.abs(bz[a:b] - mode) < 4
        deck_z[i] = np.median(bz[a:b][near])
        deck_d[i] = np.median(bd[a:b][near])
    ok = np.isfinite(deck_z) & np.isfinite(top)
    end = cs[ok].max()                            # deck disappears behind Rincon Hill
    # Smooth the deck into a gentle curve.
    fz = np.polyval(np.polyfit(cs[ok], deck_z[ok], 3), cs)
    fd = np.polyval(np.polyfit(cs[ok], deck_d[ok], 2), cs)
    deck_v = np.arctan((fz - EYE) / fd)
    vz = lambda zz_, i: math.atan((zz_ - EYE) / fd[i])
    rise = (top - deck_v) / COL                   # cable height above deck, in units
    # Towers: clear local peaks well above the deck.
    towers = []
    for i in range(len(cs)):
        if ok[i] and rise[i] > 40 and top[i] >= np.nanmax(top[max(0, i - 30): i + 31]):
            if not towers or i - towers[-1] > 30:
                towers.append(i)
    # Cable ends: where the cable comes down to the deck between / after towers.
    anchors = []
    for t0, t1 in zip(towers, towers[1:]):
        anchors.append(t0 + int(np.nanargmin(rise[t0:t1])))
    if towers:
        after = [i for i in range(towers[-1], len(cs)) if ok[i] and rise[i] < 6]
        anchors.append(min(after[0] if after else len(cs) - 1, int(end - x0)))
    knots = sorted([0] + towers + anchors)
    parts = []
    # cable: a fitted curve per span
    cable = []
    for a, b in zip(knots, knots[1:]):
        idx = np.arange(a, b + 1)
        good = idx[np.isfinite(top[idx])]
        w = np.ones(len(good))
        w[(good == a) | (good == b)] = 50          # pass through towers / anchors
        fit = np.polyfit(good, top[good], 2, w=w)
        cv = np.polyval(fit, idx)
        if b in anchors:
            cv[-1] = deck_v[b]
        cable.append((idx, np.maximum(cv, deck_v[idx])))
    cpts = []
    for idx, cv in cable:
        for i, vv in zip(idx[::3], cv[::3]):
            cpts.append((cs[i] + 0.5, y_of(vv)))
        cpts.append((cs[idx[-1]] + 0.5, y_of(cv[-1])))
    parts.append('<path class="cable" d="M' + " L".join(f"{fmt(a)} {fmt(b)}" for a, b in rdp(cpts, 0.15)) + '"/>')
    # hangers
    hang = []
    for idx, cv in cable:
        for i, vv in zip(idx, cv):
            if (cs[i] - x0) % 9 == 0 and (vv - deck_v[i]) / COL > 2 and i not in towers:
                hang.append(f"M{cs[i] + .5} {fmt(y_of(vv))}V{fmt(y_of(deck_v[i]))}")
    parts.append('<path class="hanger" d="' + "".join(hang) + '"/>')
    # The Bay Lights: LEDs strung down every suspender of the West Span. Each hanger
    # gets its own dotted path so CSS can sweep a shimmer along the span (--x is 0..1).
    # The Bay Lights: individual LEDs down every suspender. A script on the page
    # animates them; each cable is one <g> of dots, top to bottom.
    lights, strips = [], []
    for h in hang:
        hx, rest = h[1:].split(" ", 1)
        ya, yb = (float(t) for t in rest.split("V"))
        k = max(int((yb - ya) / 5.5), 1)
        strips.append(f"M{hx} {fmt(ya)}V{fmt(yb)}")
        dots = "".join(f'<circle cx="{hx}" cy="{fmt(ya + (yb - ya) * (j + .5) / k)}" r="2"/>' for j in range(k))
        lights.append(f"<g>{dots}</g>")
    # deck: a truss band about 10 m deep
    last = int(end - x0)
    up = [(cs[i], y_of(deck_v[i])) for i in range(0, last + 1, 4)] + [(cs[last] + 1, y_of(deck_v[last]))]
    dn = [(cs[i], y_of(vz(fz[i] - 10, i))) for i in range(last, -1, -4)] + [(cs[0], y_of(vz(fz[0] - 10, 0)))]
    parts.append('<path d="M' + " L".join(f"{fmt(a)} {fmt(b)}" for a, b in rdp(up, 0.2)) + " L"
                 + " L".join(f"{fmt(a)} {fmt(b)}" for a, b in rdp(dn, 0.2)) + 'Z"/>')
    # towers and the centre anchorage
    for i in towers:
        tw = 7
        parts.append(f'<rect x="{fmt(cs[i] + .5 - tw / 2)}" y="{fmt(y_of(top[i]))}" width="{tw}" '
                     f'height="{fmt(shore_y - y_of(top[i]))}"/>')
        parts.append(f'<rect x="{fmt(cs[i] + .5 - tw / 2 - 1.5)}" y="{fmt(y_of(top[i]) + 2)}" width="{tw + 3}" height="2"/>')
    for k, i in enumerate(anchors):
        aw = 26 if k < len(anchors) - 1 else 16
        parts.append(f'<rect x="{fmt(cs[i] + .5 - aw / 2)}" y="{fmt(y_of(vz(fz[i] + 6, i)))}" width="{aw}" '
                     f'height="{fmt(shore_y - y_of(vz(fz[i] + 6, i)))}"/>')
    paths.append('<g class="bridge">' + "".join(parts) + "</g>")
    paths.append('<path class="ledstrip" d="' + "".join(strips) + '"/>')
    paths.append('<g class="baylights">' + "".join(lights) + "</g>")
    print(f"bridge: towers at {[int(cs[i]) for i in towers]}, anchors {[int(cs[i]) for i in anchors]}, deck ends {int(end)}")

    # Water with a few ripples, and a faint reflection under the Ferry Building.
    waves = []
    if WATER < 10:
        waves = None
    rng = np.random.default_rng(7)
    for _ in range(26 if waves is not None else 0):
        x = rng.uniform(x0, x1 - 40)
        y = shore_y + rng.uniform(5, WATER - 4)
        waves.append(f"M{x:.0f} {y:.0f}h{rng.uniform(12, 40):.0f}")
    water = "" if waves is None else (f'<rect class="water" x="{x0}" y="{fmt(shore_y)}" width="{x1 - x0}" height="{WATER}"/>'
             f'<path class="wave" d="{"".join(waves)}"/>')

    svg = (f'<svg class="skyline" viewBox="{x0} 0 {x1 - x0} {fmt(H)}" preserveAspectRatio="xMidYMax meet" '
           f'role="img" aria-label="San Francisco skyline from Treasure Island, looking down Market Street, '
           f'traced from USGS LiDAR">' + "".join(paths) + water + "</svg>")
    print(f"{len(svg) / 1024:.0f} KB of SVG, viewBox {x1 - x0} x {H:.0f}")

    if preview:
        css = re.search(r"(\.footer-band \{.*?)\n\s*\.site-footer \{", open(html_path).read(), re.S).group(1)
        open(preview, "w").write(
            f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{x0} 0 {x1 - x0} {fmt(H)}" width="{(x1 - x0)}" '
            f'height="{H:.0f}"><style>:root{{--bg:#f4f1ea;--ink-soft:#3d3a34;--accent:#a8452a;--card:#fffdf8}}'
            f'{css.replace(".skyline ", "")}</style><rect x="{x0}" width="100%" height="100%" fill="#f4f1ea"/>'
            + svg.split(">", 1)[1])
    html = open(html_path).read()
    html, k = re.subn(r'<svg class="skyline".*?</svg>', lambda _: svg, html, count=1, flags=re.S)
    assert k == 1, "no skyline svg found in page"
    open(html_path, "w").write(html)


if __name__ == "__main__":
    main(*sys.argv[1:])
