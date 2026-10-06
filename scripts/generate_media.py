"""
Generates abstract placeholder imagery so the WebGL planes have real
textures to sample. Swap these files for real project shots later —
keep the same paths and nothing else needs touching.
"""
import math, os, colorsys
import numpy as np
from PIL import Image, ImageFilter, ImageDraw

OUT = "public"

PROJECTS = [
    ("nikunj-salon",   "#C8702F"),
    ("harbour-coffee", "#2F6FC8"),
    ("mesa-kitchen",   "#B8343C"),
    ("atlas-fitness",  "#1F8F6A"),
    ("verde-grocer",   "#6B8F1F"),
]

def hex_rgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i+2], 16) for i in (0, 2, 4))

def shift(rgb, dh=0.0, ds=1.0, dv=1.0):
    r, g, b = [c / 255 for c in rgb]
    h, s, v = colorsys.rgb_to_hsv(r, g, b)
    h = (h + dh) % 1.0
    s = min(1.0, max(0.0, s * ds))
    v = min(1.0, max(0.0, v * dv))
    r, g, b = colorsys.hsv_to_rgb(h, s, v)
    return (int(r * 255), int(g * 255), int(b * 255))

def value_noise(w, h, res, rng):
    """Smooth noise by upscaling a small random grid."""
    gw, gh = max(2, w // res), max(2, h // res)
    grid = rng.random((gh, gw)).astype(np.float32)
    img = Image.fromarray((grid * 255).astype(np.uint8), "L").resize((w, h), Image.BICUBIC)
    return np.asarray(img, dtype=np.float32) / 255.0

def fbm(w, h, rng, octaves=5, base=220):
    total = np.zeros((h, w), dtype=np.float32)
    amp, norm, res = 1.0, 0.0, base
    for _ in range(octaves):
        total += value_noise(w, h, max(2, int(res)), rng) * amp
        norm += amp
        amp *= 0.52
        res = max(2, res / 2.0)
    return total / norm

def radial_mask(w, h, cx, cy, radius, softness=1.0):
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    d = np.sqrt(((xx - cx) / radius) ** 2 + ((yy - cy) / radius) ** 2)
    m = np.clip(1.0 - d, 0.0, 1.0)
    return m ** softness

def compose(w, h, accent, seed, variant=0):
    rng = np.random.default_rng(seed)

    deep  = np.array(shift(accent, dh=-0.03, ds=0.92, dv=0.34), dtype=np.float32)
    mid   = np.array(shift(accent, dh=0.01,  ds=0.78, dv=1.00), dtype=np.float32)
    light = np.array(shift(accent, dh=0.04,  ds=0.22, dv=1.80), dtype=np.float32)

    # Base vertical gradient.
    grad = np.linspace(0.0, 1.0, h, dtype=np.float32)[:, None]
    grad = np.repeat(grad, w, axis=1)
    if variant % 2:
        gx = np.linspace(0.0, 1.0, w, dtype=np.float32)[None, :]
        grad = np.clip(grad * 0.6 + np.repeat(gx, h, axis=0) * 0.4, 0, 1)

    img = deep[None, None, :] * (1 - grad[..., None]) + mid[None, None, :] * grad[..., None]

    # Large soft light pools.
    for i in range(3):
        cx = rng.uniform(0.1, 0.9) * w
        cy = rng.uniform(0.1, 0.9) * h
        r  = rng.uniform(0.35, 0.8) * max(w, h)
        m  = radial_mask(w, h, cx, cy, r, softness=rng.uniform(1.4, 2.6))[..., None]
        tint = light if i % 2 == 0 else mid
        img = img * (1 - m * 0.68) + tint[None, None, :] * (m * 0.68)

    # Cloudy structure.
    n = fbm(w, h, rng, octaves=5, base=max(60, w // 6))
    n = (n - n.min()) / max(1e-5, (n.max() - n.min()))
    img = img * (0.74 + 0.58 * n[..., None])

    # A couple of bright specular pools so the grade has real highlights.
    for _ in range(2):
        cx = rng.uniform(0.15, 0.85) * w
        cy = rng.uniform(0.1, 0.7) * h
        r  = rng.uniform(0.12, 0.3) * max(w, h)
        m  = radial_mask(w, h, cx, cy, r, softness=2.2)[..., None]
        img = img + (255.0 - img) * m * rng.uniform(0.35, 0.62)

    # Banding ripples for a printed feel.
    yy = np.mgrid[0:h, 0:w][0].astype(np.float32)
    band = 0.5 + 0.5 * np.sin(yy / max(5.0, h / 46.0) + n * 7.5)
    img = img * (0.94 + 0.10 * band[..., None])

    img = np.clip(img, 0, 255).astype(np.uint8)
    pil = Image.fromarray(img, "RGB")

    # Geometry layer.
    draw = ImageDraw.Draw(pil, "RGBA")
    ink = (244, 243, 238)
    for _ in range(rng.integers(2, 5)):
        kind = rng.integers(0, 3)
        a = int(rng.integers(16, 46))
        if kind == 0:
            r = rng.uniform(0.12, 0.34) * min(w, h)
            cx, cy = rng.uniform(0, w), rng.uniform(0, h)
            draw.ellipse([cx - r, cy - r, cx + r, cy + r], outline=ink + (a + 30,), width=max(1, w // 420))
        elif kind == 1:
            x0, y0 = rng.uniform(0, w), rng.uniform(0, h)
            draw.line([x0, 0, x0 + rng.uniform(-w / 3, w / 3), h], fill=ink + (a,), width=max(1, w // 560))
        else:
            bw, bh = rng.uniform(0.14, 0.4) * w, rng.uniform(0.1, 0.3) * h
            x0, y0 = rng.uniform(0, w - bw), rng.uniform(0, h - bh)
            draw.rectangle([x0, y0, x0 + bw, y0 + bh], outline=ink + (a,), width=max(1, w // 560))

    pil = pil.filter(ImageFilter.GaussianBlur(radius=max(0.6, w / 1400)))

    # Fine grain.
    arr = np.asarray(pil, dtype=np.float32)
    grain = rng.normal(0.0, 5.0, (h, w, 1)).astype(np.float32)
    arr = np.clip(arr + grain, 0, 255).astype(np.uint8)
    return Image.fromarray(arr, "RGB")

def save(img, path, quality=86):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.save(path, "JPEG", quality=quality, optimize=True, progressive=True)
    print("  ✓", path)

print("Project imagery…")
for i, (slug, accent) in enumerate(PROJECTS):
    rgb = hex_rgb(accent)
    base = abs(hash(slug)) % 100000
    save(compose(1600, 988, rgb, base, 0), f"{OUT}/media/{slug}/featured.jpg")
    save(compose(1600, 760, rgb, base + 11, 1), f"{OUT}/media/{slug}/01.jpg")
    save(compose(1100, 900, rgb, base + 22, 2), f"{OUT}/media/{slug}/02.jpg")
    save(compose(1100, 900, rgb, base + 33, 3), f"{OUT}/media/{slug}/03.jpg")

print("Studio portrait…")
save(compose(1200, 1440, hex_rgb("#6E8FD6"), 7777, 1), f"{OUT}/media/studio/portrait.jpg")

print("Textures…")
rng = np.random.default_rng(42)

# Grain texture.
grain = (rng.random((512, 512)) * 255).astype(np.uint8)
os.makedirs(f"{OUT}/textures", exist_ok=True)
Image.fromarray(grain, "L").save(f"{OUT}/textures/noise.png")
print(f"  ✓ {OUT}/textures/noise.png")

# Planet surface — soft fractal detail, horizontally tileable enough to spin.
surf = fbm(1024, 512, rng, octaves=6, base=180)
surf = (surf - surf.min()) / max(1e-5, surf.max() - surf.min())
blend = np.linspace(0, 1, 96, dtype=np.float32)[None, :]
surf[:, :96] = surf[:, :96] * blend + surf[:, -96:] * (1 - blend)
surf_img = Image.fromarray((np.clip(surf, 0, 1) * 255).astype(np.uint8), "L").convert("RGB")
surf_img = surf_img.filter(ImageFilter.GaussianBlur(radius=1.1))
save(surf_img, f"{OUT}/textures/surface.jpg", quality=88)

print("Done.")
