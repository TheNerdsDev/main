"""
Fetch and prepare the planet textures for the closing planet shower.

    python scripts/planet-textures.py

Sources
  - Solar System Scope texture library (CC BY 4.0, solarsystemscope.com/textures),
    via the copy redistributed in Qt 3D's source tree (their site blocks scripts).
  - NASA Earth Observatory "Black Marble" night lights (public domain).

Writes public/textures/planets/2k/* (desktop) and 1k/* (phones), plus CREDITS.txt.
Downloads are cached in .texture-cache/ (git-ignored). Pillow is the only dependency.
"""
import math
import os
import random
import shutil
import urllib.request

from PIL import Image, ImageChops, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(ROOT, '.texture-cache')
OUT = os.path.join(ROOT, 'public', 'textures', 'planets')
QT = 'https://raw.githubusercontent.com/qt/qt3d/dev/tests/manual/planets-qml/images/solarsystemscope/'
SOURCES = {
    'earthmap2k.jpg': QT + 'earthmap2k.jpg',
    'earthnormal2k.jpg': QT + 'earthnormal2k.jpg',
    'earthspec2k.jpg': QT + 'earthspec2k.jpg',
    'earthcloudmapspec.jpg': QT + 'earthcloudmapspec.jpg',
    'moonmap2k.jpg': QT + 'moonmap2k.jpg',
    'moonnormal2k.jpg': QT + 'moonnormal2k.jpg',
    'mercurymap.jpg': QT + 'mercurymap.jpg',
    'mercurynormal.jpg': QT + 'mercurynormal.jpg',
    'marsmap2k.jpg': QT + 'marsmap2k.jpg',
    'marsnormal2k.jpg': QT + 'marsnormal2k.jpg',
    'jupitermap.jpg': QT + 'jupitermap.jpg',
    'saturnmap.jpg': QT + 'saturnmap.jpg',
    'saturnringcolortrans.png': QT + 'saturnringcolortrans.png',
    'uranusmap.jpg': QT + 'uranusmap.jpg',
    'neptunemap.jpg': QT + 'neptunemap.jpg',
    'earth_night.jpg': 'https://eoimages.gsfc.nasa.gov/images/imagerecords/79000/79765/dnb_land_ocean_ice.2012.3600x1800.jpg',
}


def fetch(name):
    os.makedirs(CACHE, exist_ok=True)
    path = os.path.join(CACHE, name)
    if not os.path.exists(path):
        print('downloading', name)
        req = urllib.request.Request(SOURCES[name], headers={'User-Agent': 'planet-textures/1.0'})
        with urllib.request.urlopen(req, timeout=120) as r, open(path, 'wb') as f:
            shutil.copyfileobj(r, f)
    return Image.open(path)


def save(img, name, sizes=((2, 2048), (1, 1024)), quality=88):
    """Write a 2:1 map at each size (never upscaled)."""
    for tag, width in sizes:
        d = os.path.join(OUT, f'{tag}k')
        os.makedirs(d, exist_ok=True)
        w = min(width, img.width)
        im = img.resize((w, w // 2), Image.LANCZOS) if img.width != w else img
        path = os.path.join(d, name)
        if name.endswith('.png'):
            im.save(path, optimize=True)
        else:
            im.convert('RGB' if im.mode != 'L' else 'L').save(path, quality=quality, optimize=True, progressive=True)


def periodic_noise(w, h, scale, stretch, seed):
    """Smooth noise that tiles horizontally: a small random field tripled
    side by side, enlarged, and the middle third kept."""
    rnd = random.Random(seed)
    # fewer columns than rows: features drawn out along the latitude lines
    sw = max(2, int(w / (scale * stretch)))
    sh = max(2, int(h / scale))
    small = Image.new('L', (sw, sh))
    small.putdata([rnd.randint(0, 255) for _ in range(sw * sh)])
    wide = Image.new('L', (sw * 3, sh))
    for i in range(3):
        wide.paste(small, (i * sw, 0))
    big = wide.resize((w * 3, h), Image.BICUBIC)
    return big.crop((w, 0, 2 * w, h))


def venus_clouds(w=2048, h=1024):
    """Venus is all cloud from outside: soft, streaky, pale yellow-orange,
    swept into bands by the winds. Built from layered horizontal noise."""
    layers = [(220, 2.2, 0.38), (90, 2.8, 0.3), (36, 3.4, 0.2), (14, 3.0, 0.12)]
    acc = Image.new('L', (w, h), 128)
    for i, (scale, stretch, weight) in enumerate(layers):
        n = periodic_noise(w, h, scale, stretch, 70 + i)
        acc = Image.blend(acc, n, weight / (weight + 0.35))
    # gentle latitude banding and darker, hazier poles
    col = Image.new('L', (1, h))
    col.putdata([int(128 + 40 * math.sin(y / h * math.pi * 7) * math.sin(y / h * math.pi)) for y in range(h)])
    acc = Image.blend(acc, col.resize((w, h)), 0.32)
    acc = acc.filter(ImageFilter.GaussianBlur(1.2))
    lo = (186, 140, 78)
    hi = (250, 228, 170)
    lut = []
    for c in range(3):
        lut += [int(lo[c] + (hi[c] - lo[c]) * min(1, max(0, (v - 70) / 130))) for v in range(256)]
    rgb = Image.merge('RGB', (acc, acc, acc)).point(lut)
    pole = Image.new('L', (1, h))
    pole.putdata([int(255 * (0.78 + 0.22 * math.sin(y / h * math.pi))) for y in range(h)])
    return ImageChops.multiply(rgb, Image.merge('RGB', [pole.resize((w, h))] * 3))


def ring_strip(disc):
    """The ring file is a picture of the whole ring seen from above; read its
    radial profile (averaged round the circle) into a strip, inner edge on
    the left, for a RingGeometry with radial UVs."""
    cx, cy = disc.width / 4, disc.height / 2
    rmax = int(min(cx, cy)) - 1
    px = disc.convert('RGBA').load()
    prof = []
    for r in range(rmax):
        acc = [0, 0, 0, 0]
        n = 0
        for k in range(180):
            a = k / 180 * 2 * math.pi
            x = int(cx + math.cos(a) * r)
            y = int(cy + math.sin(a) * r)
            p = px[x, y]
            for c in range(4):
                acc[c] += p[c]
            n += 1
        prof.append(tuple(v // n for v in acc))
    on = [i for i, p in enumerate(prof) if p[3] > 10]
    inner, outer = on[0], on[-1]
    strip = prof[inner:outer + 1]
    img = Image.new('RGBA', (len(strip), 4))
    img.putdata(strip * 4)
    print(f'saturn ring: inner/outer = {inner / outer:.4f}')
    return img.resize((1024, 4), Image.BICUBIC), inner / outer


def uranus_rings(w=512):
    """Uranus' rings are narrow and dark: a few faint thin bands."""
    bands = [(0.12, 0.012, 60), (0.26, 0.01, 50), (0.38, 0.014, 70), (0.55, 0.01, 55), (0.7, 0.012, 60), (0.93, 0.03, 120)]
    data = []
    for x in range(w):
        u = x / (w - 1)
        a = 0
        for c, wd, al in bands:
            a = max(a, al * math.exp(-((u - c) / wd) ** 2))
        data.append((190, 200, 205, int(a)))
    img = Image.new('RGBA', (w, 4))
    img.putdata(data * 4)
    return img


def main():
    os.makedirs(OUT, exist_ok=True)

    # Earth -------------------------------------------------------------------
    save(fetch('earthmap2k.jpg'), 'earth_day.jpg')
    save(fetch('earthnormal2k.jpg'), 'earth_normal.jpg')
    # roughness: oceans glossy (low), land matte (high) — the inverse of the
    # spec map, where white marks water
    spec = fetch('earthspec2k.jpg').convert('L')
    save(spec.point(lambda v: int(222 - v / 255 * 150)), 'earth_rough.jpg')
    save(fetch('earthcloudmapspec.jpg').convert('L'), 'earth_clouds.jpg')
    # city lights only: drop the dim blue land/ocean base, keep warm lights
    night = fetch('earth_night.jpg').convert('L').point(lambda v: 0 if v < 46 else min(255, int((v - 46) * 1.6)))
    night = Image.merge('RGB', (night, night.point(lambda v: int(v * 0.8)), night.point(lambda v: int(v * 0.5))))
    save(night, 'earth_night.jpg')

    # Rocky worlds and the Moon -------------------------------------------------
    for src, dst in [('moonmap2k.jpg', 'moon.jpg'), ('moonnormal2k.jpg', 'moon_normal.jpg'),
                     ('mercurymap.jpg', 'mercury.jpg'), ('mercurynormal.jpg', 'mercury_normal.jpg'),
                     ('marsmap2k.jpg', 'mars.jpg'), ('marsnormal2k.jpg', 'mars_normal.jpg')]:
        save(fetch(src), dst)
    save(venus_clouds(), 'venus_clouds.jpg')

    # Giants ----------------------------------------------------------------------
    for src, dst in [('jupitermap.jpg', 'jupiter.jpg'), ('saturnmap.jpg', 'saturn.jpg'),
                     ('uranusmap.jpg', 'uranus.jpg'), ('neptunemap.jpg', 'neptune.jpg')]:
        save(fetch(src), dst)
    strip, ratio = ring_strip(fetch('saturnringcolortrans.png'))
    for tag in ('2k', '1k'):
        d = os.path.join(OUT, tag)
        strip.save(os.path.join(d, 'saturn_ring.png'), optimize=True)
        uranus_rings().save(os.path.join(d, 'uranus_ring.png'), optimize=True)

    with open(os.path.join(OUT, 'CREDITS.txt'), 'w', encoding='utf-8') as f:
        f.write(
            'Planet textures\n'
            '- Solar System Scope texture library, https://www.solarsystemscope.com/textures\n'
            '  Licence: Creative Commons Attribution 4.0 (https://creativecommons.org/licenses/by/4.0/)\n'
            '  Changes: resized; Earth roughness derived from the specular map; Saturn ring\n'
            '  read into a radial strip.\n'
            '- Earth night lights: NASA Earth Observatory, "Earth at Night" (Black Marble 2012),\n'
            '  public domain. Changes: background removed, warm tint.\n'
            '- Venus cloud layer and Uranus rings: generated (scripts/planet-textures.py).\n'
            f'\nSaturn ring inner/outer radius ratio: {ratio:.4f}\n'
        )
    print('done ->', OUT)


if __name__ == '__main__':
    main()
