"""
Trace the studio logo into SVG paths, one per animated piece.

    python scripts/trace-logo.py

Reads scripts/brand/the-nerds.webp (white lettering on transparent, the
rocket drawn in black so it reads as a cut-out through the R) and writes
src/content/logo.js: a path for each letter (so they can jump one by one),
the R with its rocket-shaped counter, the trail, the rocket itself, where it
docks, and a flight path that follows the trail up into the R.

Outlines come from marching squares over the anti-aliased pixels (so edges
are sub-pixel smooth), simplified with Ramer-Douglas-Peucker. Pillow is the
only dependency.
"""
import math
import os
from collections import deque

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'scripts', 'brand', 'the-nerds.webp')
OUT = os.path.join(ROOT, 'src', 'content', 'logo.js')
SCALE = 0.25        # source px -> SVG units
TOLERANCE = 0.4     # simplification, source px

im = Image.open(SRC).convert('RGBA')
W, H = im.size
px = im.load()


def classify(x, y):
    """0 transparent, 1 white (lettering), 2 dark (the rocket)."""
    r, g, b, a = px[x, y]
    if a < 128:
        return 0
    return 1 if (r * 299 + g * 587 + b * 114) // 1000 >= 128 else 2


grid = [[classify(x, y) for x in range(W)] for y in range(H)]


def components(kind, min_area=40):
    seen = [[False] * W for _ in range(H)]
    out = []
    for y in range(H):
        for x in range(W):
            if grid[y][x] != kind or seen[y][x]:
                continue
            q = deque([(x, y)])
            seen[y][x] = True
            pts = []
            while q:
                cx, cy = q.popleft()
                pts.append((cx, cy))
                for nx, ny in ((cx + 1, cy), (cx - 1, cy), (cx, cy + 1), (cx, cy - 1)):
                    if 0 <= nx < W and 0 <= ny < H and not seen[ny][nx] and grid[ny][nx] == kind:
                        seen[ny][nx] = True
                        q.append((nx, ny))
            if len(pts) >= min_area:
                xs = [p[0] for p in pts]
                ys = [p[1] for p in pts]
                out.append({'pts': pts, 'box': (min(xs), min(ys), max(xs), max(ys))})
    return out


def field(comps, dark=False, grow=3):
    """Coverage of a piece (0..1) over its box: whiteness, or darkness for the
    rocket — only near the piece's own pixels, so neighbours don't leak in."""
    x0 = max(0, min(c['box'][0] for c in comps) - grow)
    y0 = max(0, min(c['box'][1] for c in comps) - grow)
    x1 = min(W - 1, max(c['box'][2] for c in comps) + grow)
    y1 = min(H - 1, max(c['box'][3] for c in comps) + grow)
    w, h = x1 - x0 + 1, y1 - y0 + 1
    near = [[False] * w for _ in range(h)]
    for c in comps:
        for (x, y) in c['pts']:
            for dy in range(-grow, grow + 1):
                for dx in range(-grow, grow + 1):
                    jx, jy = x - x0 + dx, y - y0 + dy
                    if 0 <= jx < w and 0 <= jy < h:
                        near[jy][jx] = True
    # one row/column of zeros all round so every outline closes
    F = [[0.0] * (w + 2) for _ in range(h + 2)]
    for j in range(h):
        for i in range(w):
            if not near[j][i]:
                continue
            r, g, b, a = px[x0 + i, y0 + j]
            lum = (r * 0.299 + g * 0.587 + b * 0.114) / 255
            F[j + 1][i + 1] = (a / 255) * ((1 - lum) if dark else lum)
    return F, x0 - 1, y0 - 1


def march(F, iso=0.5):
    """Closed outlines of F >= iso, in F's grid coordinates."""
    h, w = len(F), len(F[0])
    links = {}

    def link(a, b):
        links.setdefault(a, []).append(b)
        links.setdefault(b, []).append(a)

    for i in range(h - 1):
        for j in range(w - 1):
            tl, tr = F[i][j] >= iso, F[i][j + 1] >= iso
            br, bl = F[i + 1][j + 1] >= iso, F[i + 1][j] >= iso
            case = tl << 3 | tr << 2 | br << 1 | bl
            if case in (0, 15):
                continue
            T, R, B, L = ('h', i, j), ('v', i, j + 1), ('h', i + 1, j), ('v', i, j)
            centre = (F[i][j] + F[i][j + 1] + F[i + 1][j + 1] + F[i + 1][j]) / 4 >= iso
            table = {
                1: [(L, B)], 2: [(B, R)], 3: [(L, R)], 4: [(T, R)],
                5: [(L, T), (B, R)] if centre else [(T, R), (L, B)],
                6: [(T, B)], 7: [(L, T)], 8: [(L, T)], 9: [(T, B)],
                10: [(T, R), (L, B)] if centre else [(L, T), (B, R)],
                11: [(T, R)], 12: [(L, R)], 13: [(B, R)], 14: [(L, B)],
            }
            for a, b in table[case]:
                link(a, b)

    def point(e):
        kind, i, j = e
        if kind == 'h':
            a, b = F[i][j], F[i][j + 1]
            return (j + (iso - a) / (b - a), i)
        a, b = F[i][j], F[i + 1][j]
        return (j, i + (iso - a) / (b - a))

    loops, used = [], set()
    for start in links:
        if start in used:
            continue
        loop, prev, cur = [], None, start
        while True:
            used.add(cur)
            loop.append(point(cur))
            nxt = [n for n in links[cur] if n != prev and n not in used]
            if not nxt:
                break
            prev, cur = cur, nxt[0]
        if len(loop) > 8:
            loops.append(loop)
    return loops


def rdp(pts, eps):
    if len(pts) < 3:
        return pts
    (ax, ay), (bx, by) = pts[0], pts[-1]
    dx, dy = bx - ax, by - ay
    norm = math.hypot(dx, dy) or 1e-9
    best, idx = -1, 0
    for k in range(1, len(pts) - 1):
        px_, py_ = pts[k]
        d = abs(dy * (px_ - ax) - dx * (py_ - ay)) / norm
        if d > best:
            best, idx = d, k
    if best <= eps:
        return [pts[0], pts[-1]]
    return rdp(pts[:idx + 1], eps)[:-1] + rdp(pts[idx:], eps)


def simplify_closed(loop, eps):
    # split at the point farthest from the first, simplify both halves
    far = max(range(len(loop)), key=lambda k: math.dist(loop[0], loop[k]))
    a = rdp(loop[:far + 1], eps)
    b = rdp(loop[far:] + [loop[0]], eps)
    return a[:-1] + b[:-1]


def outlines(comps, dark=False, outer_only=False):
    F, ox, oy = field(comps, dark)
    loops = march(F)
    out = []
    for loop in loops:
        pts = [(ox + x + 0.5, oy + y + 0.5) for (x, y) in loop]
        out.append(simplify_closed(pts, TOLERANCE))
    if outer_only:
        # the outer outline is the one enclosing the largest area
        def area(p):
            return abs(sum(p[k][0] * p[k - 1][1] - p[k - 1][0] * p[k][1] for k in range(len(p)))) / 2
        out = [max(out, key=area)]
    return out


# ---------------------------------------------------------------- pieces
white = components(1)
dark = components(2)
rocket = max(dark, key=lambda c: len(c['pts']))


def pick(x0, x1, y0, y1):
    """White pieces whose box lies within x0..x1, y0..y1 (source px)."""
    return [c for c in white if c['box'][0] >= x0 and c['box'][2] <= x1 and c['box'][1] >= y0 and c['box'][3] <= y1]


top = sorted([c for c in white if c['box'][3] < 210], key=lambda c: c['box'][0])   # T H E
assert len(top) == 3, [c['box'] for c in top]
big = [c for c in white if c['box'][1] >= 210]
trail = max(big, key=lambda c: c['box'][3])                                         # reaches lowest
porthole = min((c for c in big if c is not trail), key=lambda c: len(c['pts']))
rest = sorted([c for c in big if c is not trail and c is not porthole], key=lambda c: c['box'][0])
# N | E's three bars (share one column) | R | D | S
letters_big, i = [], 0
while i < len(rest):
    group = [rest[i]]
    while i + 1 < len(rest) and abs(rest[i + 1]['box'][0] - rest[i]['box'][0]) < 8:
        i += 1
        group.append(rest[i])
    letters_big.append(group)
    i += 1
assert len(letters_big) == 5, [[c['box'] for c in g] for g in letters_big]

all_boxes = [c['box'] for c in white] + [rocket['box']]
OX = min(b[0] for b in all_boxes) - 6
OY = min(b[1] for b in all_boxes) - 6
VW = (max(b[2] for b in all_boxes) + 7 - OX) * SCALE
VH = (max(b[3] for b in all_boxes) + 7 - OY) * SCALE


def u(v, o):
    return round((v - o) * SCALE, 1)


def d(loops):
    parts = []
    for loop in loops:
        parts.append('M' + ' '.join(f'{u(x, OX):g} {u(y, OY):g}' for x, y in loop) + 'Z')
    return ''.join(parts)


letters = [('T', [top[0]]), ('H', [top[1]]), ('E', [top[2]])]
letters += list(zip(['N', 'E', 'R', 'D', 'S'], letters_big))
letter_paths = []
for name, comps in letters:
    loops = []
    for c in comps:
        loops += outlines([c])
    letter_paths.append((name, d(loops)))

trail_d = d(outlines([trail]))
porthole_d = d(outlines([porthole]))
rocket_loops = outlines([rocket], dark=True)
plug_loops = outlines([rocket], dark=True, outer_only=True)
rocket_d = d(rocket_loops)
plug_d = d(plug_loops)

# ------------------------------------------------- dock and flight path
rx = [p[0] + 0.5 for p in rocket['pts']]
ry = [p[1] + 0.5 for p in rocket['pts']]
cx, cy = sum(rx) / len(rx), sum(ry) / len(ry)
# the nose: the rocket's farthest point from its centre (upper right);
# the axis through it, from principal components so the fins don't skew it
sxx = sum((x - cx) ** 2 for x in rx) / len(rx)
syy = sum((y - cy) ** 2 for y in ry) / len(ry)
sxy = sum((x - cx) * (y - cy) for x, y in zip(rx, ry)) / len(rx)
axis = 0.5 * math.atan2(2 * sxy, sxx - syy)
nose = max(zip(rx, ry), key=lambda p: math.dist(p, (cx, cy)))
if math.cos(axis) * (nose[0] - cx) + math.sin(axis) * (nose[1] - cy) < 0:
    axis += math.pi
ux, uy = math.cos(axis), math.sin(axis)
proj = [(x - cx) * ux + (y - cy) * uy for x, y in zip(rx, ry)]
nose_len, tail_len = max(proj), -min(proj)

# the trail's centre line, column by column, smoothed
cols = {}
for (x, y) in trail['pts']:
    cols.setdefault(x, []).append(y)
xs = sorted(cols)
line = [(x + 0.5, sum(cols[x]) / len(cols[x]) + 0.5) for x in xs[::4]]
for _ in range(3):
    line = [line[0]] + [((a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3) for a, b, c in zip(line, line[1:], line[2:])] + [line[-1]]
# lead in from outside the word, along the trail's opening direction
(sx, sy), (tx, ty) = line[0], line[min(6, len(line) - 1)]
k = math.hypot(tx - sx, ty - sy)
lead = [(sx - (tx - sx) / k * s, sy - (ty - sy) / k * s) for s in (120, 80, 40)]
# then from the trail's end up into the R, arriving along the rocket's own axis
ex, ey = line[-1]
approach = [(cx - ux * s, cy - uy * s) for s in (36, 18)]
path = lead + line[:-1] + [(ex, ey)] + approach + [(cx, cy)]
# keep it even (a point every ~10 px) so progress along it is smooth
even, acc = [path[0]], 0.0
for a, b in zip(path, path[1:]):
    seg = math.dist(a, b)
    acc += seg
    if acc >= 10 or b == path[-1]:
        even.append(b)
        acc = 0.0

trail_x1 = max(p[0] for p in trail['pts']) + 1

js = f"""/*
 * The studio logo as SVG, generated by scripts/trace-logo.py from
 * scripts/brand/the-nerds.webp — re-run that rather than editing these.
 *
 * One path per letter (they jump one by one), the R with its rocket-shaped
 * counter, the trail, and the rocket itself: where it docks in the R, which
 * way its nose points, and a flight path that rides the trail up into it.
 * The smoke layer sits behind the letters; fx/LogoRocket.js puffs into it.
 */
export const LOGO = {{
  width: {VW:g},
  height: {VH:g},
  letters: [
{chr(10).join(f"    {{ name: '{n}', d: '{p}' }}," for n, p in letter_paths)}
  ],
  trail: '{trail_d}',
  porthole: '{porthole_d}',
  rocket: '{rocket_d}',
  plug: '{plug_d}',
  /* Docked: the rocket's centre, nose direction (degrees, y down), and how
     far nose and tail reach from the centre along it. */
  dock: {{ x: {u(cx, OX):g}, y: {u(cy, OY):g}, angle: {math.degrees(axis):.2f}, nose: {nose_len * SCALE:.1f}, tail: {tail_len * SCALE:.1f} }},
  /* Where the trail ends on the right (it's drawn in from the left). */
  trailEnd: {u(trail_x1, OX):g},
  flight: [{', '.join(f'[{u(x, OX):g}, {u(y, OY):g}]' for x, y in even)}]
}};

/* The rocket's exhaust clouds: the tricolour, saffron, white and green. */
export const SMOKE = ['#FF9933', '#FFFFFF', '#138808'];

/**
 * The logo's markup. `id` keeps its clip path unique when there's more than
 * one on the page. Letters and the trail use currentColor; the travelling
 * rocket is drawn by fx/LogoRocket.js.
 */
export function logoSvg({{ id = 'logo', className = 'logo-mark' }} = {{}}) {{
  const {{ width, height }} = LOGO;
  const letters = LOGO.letters
    .map((l, i) => i === 5
      ? `<g class="logo-letter logo-r"><path d="${{l.d}}" fill-rule="evenodd"/><path class="logo-plug" d="${{LOGO.plug}}" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><path class="logo-porthole" d="${{LOGO.porthole}}"/></g>`
      : `<path class="logo-letter" d="${{l.d}}" fill-rule="evenodd"/>`)
    .join('');
  return `<svg class="${{className}}" viewBox="0 0 ${{width}} ${{height}}" fill="currentColor" aria-hidden="true" focusable="false">`
    + `<defs><clipPath id="${{id}}-trail"><rect class="logo-trail-clip" x="0" y="0" width="${{width}}" height="${{height}}"/></clipPath>`
    + SMOKE.map((c, i) => `<radialGradient id="${{id}}-smoke-${{i}}"><stop offset="0" stop-color="${{c}}" stop-opacity="0.95"/><stop offset="0.55" stop-color="${{c}}" stop-opacity="0.55"/><stop offset="1" stop-color="${{c}}" stop-opacity="0"/></radialGradient>`).join('')
    + `</defs>`
    + `<path class="logo-trail" d="${{LOGO.trail}}" clip-path="url(#${{id}}-trail)"/>`
    + `<g class="logo-smoke" data-fill="${{id}}-smoke"></g>`
    + letters
    + `<path class="logo-rocket" d="${{LOGO.rocket}}" fill-rule="evenodd"/>`
    + `</svg>`;
}}
"""
with open(OUT, 'w', encoding='utf-8') as f:
    f.write(js)
print(f'wrote {os.path.relpath(OUT, ROOT)}: {len(js) // 1024} KB, viewBox {VW:g} x {VH:g}, '
      f'dock ({u(cx, OX):g}, {u(cy, OY):g}) at {math.degrees(axis):.1f} deg, flight {len(even)} points')
