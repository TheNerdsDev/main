"""
Smaller copies of each project's featured photo, for the home page reel.

    python scripts/media-variants.py

For every public/media/<project>/featured.jpg, writes featured-960.webp
beside it. The page generator offers it through srcset (it's used when it
exists), so phones and most laptops decode ~1/3 of the pixels; the original
stays for large high-DPI screens and for the WebGL pages. Re-run after
replacing a featured photo. Pillow is the only dependency.
"""
import glob
import os

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WIDTH = 960

for src in sorted(glob.glob(os.path.join(ROOT, 'public', 'media', '*', 'featured.jpg'))):
    dst = os.path.join(os.path.dirname(src), f'featured-{WIDTH}.webp')
    im = Image.open(src).convert('RGB')
    if im.width > WIDTH:
        im = im.resize((WIDTH, round(im.height * WIDTH / im.width)), Image.LANCZOS)
    im.save(dst, 'WEBP', quality=82, method=6)
    print(f'{os.path.relpath(dst, ROOT)}  {im.width}x{im.height}  {os.path.getsize(dst) // 1024} KB')
