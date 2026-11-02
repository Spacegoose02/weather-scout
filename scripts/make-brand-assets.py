"""Builds every Rocky / Weather Scout image from the master art.

    python3 scripts/make-brand-assets.py docs/brand/rocky-master.png

Needs Pillow. Writes into web/public/ (app icons, favicon, Rocky art) and docs/brand/.
"""
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
PUB = ROOT / 'web' / 'public'
SRC = Path(sys.argv[1] if len(sys.argv) > 1 else ROOT / 'docs' / 'brand' / 'rocky-master.png')

# Crop boxes in the 1024x1024 master. Raccoon.jsx uses the same BODY box.
BODY = (220, 60, 930, 970)   # whole Rocky, standing
HEAD = (270, 70, 750, 470)   # head and shoulders, for icons

BLUE_TOP, BLUE_BOTTOM = (79, 152, 255), (35, 96, 214)
SUN = (255, 205, 64)

master = Image.open(SRC).convert('RGBA')
# The master has faint alpha noise around the edges; drop it so crops stay clean.
r, g, b, a = master.split()
a = a.point(lambda v: 0 if v < 24 else v)
master = Image.merge('RGBA', (r, g, b, a))


def save_png(im, path, colors=None):
    path.parent.mkdir(parents=True, exist_ok=True)
    if colors:
        im = im.quantize(colors=colors, method=Image.Quantize.FASTOCTREE)
    im.save(path, optimize=True)


def sky(size, radius_frac=0.22):
    """Rounded blue sky tile with a little sun, the app icon background."""
    s = size * 4
    grad = Image.new('RGBA', (s, s))
    d = ImageDraw.Draw(grad)
    for y in range(s):
        t = y / (s - 1)
        d.line([(0, y), (s, y)], fill=tuple(round(BLUE_TOP[i] + (BLUE_BOTTOM[i] - BLUE_TOP[i]) * t) for i in range(3)) + (255,))
    d.ellipse([s * 0.66, s * 0.08, s * 0.92, s * 0.34], fill=SUN + (255,))
    mask = Image.new('L', (s, s), 0)
    if radius_frac:
        ImageDraw.Draw(mask).rounded_rectangle([0, 0, s - 1, s - 1], radius=int(s * radius_frac), fill=255)
    else:
        mask.paste(255, [0, 0, s, s])
    grad.putalpha(mask)
    return grad, mask


def icon(size, scale=0.88, radius_frac=0.22):
    bg, mask = sky(size, radius_frac)
    s = bg.size[0]
    head = master.crop(HEAD)
    w = int(s * scale)
    h = int(head.height * w / head.width)
    head = head.resize((w, h), Image.LANCZOS)
    # soft shadow so Rocky lifts off the sky
    shadow = Image.new('RGBA', head.size, (10, 30, 80, 0))
    shadow.putalpha(head.getchannel('A').point(lambda v: v * 0.35))
    shadow = shadow.filter(ImageFilter.GaussianBlur(s * 0.012))
    x, y = (s - w) // 2, s - h
    bg.alpha_composite(shadow, (x, y + int(s * 0.012)))
    bg.alpha_composite(head, (x, y))
    out = Image.new('RGBA', bg.size, (0, 0, 0, 0))
    out.paste(bg, (0, 0), mask)
    return out.resize((size, size), Image.LANCZOS)


# Rocky art used by the app (standing, transparent)
body = master.crop(BODY)
body_web = body.resize((560, round(560 * body.height / body.width)), Image.LANCZOS)
body_web.save(PUB / 'rocky' / 'rocky.webp', quality=88, method=6)
save_png(body_web, PUB / 'rocky' / 'rocky.png', colors=256)
face = master.crop(HEAD).resize((240, 200), Image.LANCZOS)
face.save(PUB / 'rocky' / 'rocky-face.webp', quality=90, method=6)
save_png(face, PUB / 'rocky' / 'rocky-face.png', colors=256)

# App icons
for size, name in [(512, 'icon-512.png'), (192, 'icon-192.png')]:
    save_png(icon(size), PUB / name, colors=256)
save_png(icon(32, scale=1.0), PUB / 'favicon-32.png')
save_png(icon(180, radius_frac=0), PUB / 'apple-touch-icon.png', colors=256)   # iOS rounds it itself
# Maskable: full-bleed sky, Rocky inside the 80% safe circle
save_png(icon(512, scale=0.72, radius_frac=0), PUB / 'icon-maskable-512.png', colors=256)
icon(256, scale=1.0).save(PUB / 'favicon.ico', sizes=[(16, 16), (32, 32), (48, 48)])

# Brand sheet copies for the README / Unraid
save_png(icon(256), ROOT / 'docs' / 'brand' / 'weather-scout-icon.png', colors=256)
save_png(body.resize((360, round(360 * body.height / body.width)), Image.LANCZOS), ROOT / 'docs' / 'brand' / 'rocky.png', colors=256)
print('ok')
