"""Builds the Android app's launcher icons from the web app icons.

    python3 scripts/make-android-icons.py

Needs Pillow. Reads web/public/icon-512.png and icon-maskable-512.png and writes
android/app/src/main/res/mipmap-*/. Run it again after make-brand-assets.py.
"""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
PUB = ROOT / 'web' / 'public'
RES = ROOT / 'android' / 'app' / 'src' / 'main' / 'res'
DENSITIES = {'mdpi': 1, 'hdpi': 1.5, 'xhdpi': 2, 'xxhdpi': 3, 'xxxhdpi': 4}

plain = Image.open(PUB / 'icon-512.png').convert('RGBA')
maskable = Image.open(PUB / 'icon-maskable-512.png').convert('RGBA')

for name, scale in DENSITIES.items():
    out = RES / f'mipmap-{name}'
    out.mkdir(parents=True, exist_ok=True)
    # Older Androids (before 8.0) show this one as is.
    legacy = round(48 * scale)
    plain.resize((legacy, legacy), Image.LANCZOS).save(out / 'ic_launcher.png', optimize=True)
    # Adaptive icon layers are 108dp, but only the middle ~72dp shows. Size the
    # maskable icon so its 80% safe circle matches Android's 66dp safe circle.
    layer = round(108 * scale)
    art = round(layer * 82 / 108)
    bg = Image.new('RGBA', (layer, layer), maskable.getpixel((256, 256 + 250)))
    bg.paste(maskable.resize((art, art), Image.LANCZOS), ((layer - art) // 2,) * 2)
    bg.save(out / 'ic_launcher_background.png', optimize=True)
    Image.new('RGBA', (layer, layer), (0, 0, 0, 0)).save(out / 'ic_launcher_foreground.png', optimize=True)
print('Android icons written to', RES)
