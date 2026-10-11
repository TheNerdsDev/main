"""
Lighter copies of the projects' images, which the page generator uses when
they exist.

    python scripts/media-variants.py

Goes by src/content/projects.json (what the CMS edits), so it covers every
thumbnail and screenshot listed there, whatever it's called:

  - each thumbnail, e.g. featured.jpg → featured-960.webp beside it: the home
    page reel offers it through srcset, so phones and most laptops decode ~1/3
    of the pixels; the original stays for large high-DPI screens and for the
    WebGL pages;
  - each screenshot, e.g. 01.jpg → 01.webp: the same picture at the same size,
    a good deal lighter for no visible change.

Re-run after adding or replacing images (an existing copy is remade).
Pillow is the only dependency.
"""
import json
import os

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WIDTH = 960

with open(os.path.join(ROOT, 'src', 'content', 'projects.json'), encoding='utf-8') as f:
    projects = json.load(f)['projects']


def local(url):
    """/media/x/y.jpg → its file under public/."""
    return os.path.join(ROOT, 'public', *url.lstrip('/').split('/'))


def report(src, dst):
    print(f'{os.path.relpath(dst, ROOT)}  {os.path.getsize(src) // 1024} KB -> {os.path.getsize(dst) // 1024} KB')


for p in projects:
    thumb = p.get('thumbnail')
    if thumb and os.path.exists(local(thumb)):
        src = local(thumb)
        dst = os.path.splitext(src)[0] + f'-{WIDTH}.webp'
        im = Image.open(src).convert('RGB')
        if im.width > WIDTH:
            im = im.resize((WIDTH, round(im.height * WIDTH / im.width)), Image.LANCZOS)
        im.save(dst, 'WEBP', quality=82, method=6)
        report(src, dst)

    for shot in p.get('shots') or []:
        src = local(shot)
        if shot.lower().endswith('.webp') or not os.path.exists(src):
            continue
        dst = os.path.splitext(src)[0] + '.webp'
        Image.open(src).convert('RGB').save(dst, 'WEBP', quality=86, method=6)
        report(src, dst)
