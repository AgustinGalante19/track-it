"""Package the original Track-It logo into PWA assets (requires Pillow).
Run from any directory: python scripts/generate-icons.py
"""
from pathlib import Path
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / 'public'
SOURCE = ROOT / 'assets' / 'brand' / 'track-it-original.png'
BACKGROUND = '#f5f6f8'


def icon(logo, size, fraction=0.88, opaque=False):
    canvas = Image.new('RGBA', (size, size), BACKGROUND if opaque else (0, 0, 0, 0))
    mark = ImageOps.contain(logo, (round(size * fraction), round(size * fraction)), Image.Resampling.LANCZOS)
    canvas.alpha_composite(mark, ((size - mark.width) // 2, (size - mark.height) // 2))
    return canvas.convert('RGB') if opaque else canvas


def main():
    with Image.open(SOURCE) as original:
        logo = original.convert('RGBA')
    # Ignore nearly invisible pixels when centering the supplied transparent logo.
    bounds = logo.getchannel('A').point(lambda alpha: 255 if alpha > 8 else 0).getbbox()
    if bounds is None:
        raise ValueError('The source logo is empty')
    logo = logo.crop(bounds)
    for size in (192, 512):
        icon(logo, size).save(PUBLIC / f'icon-{size}.png', optimize=True)
    # A centered 56% square fits inside the maskable 40%-radius safe circle.
    icon(logo, 512, fraction=0.56, opaque=True).save(PUBLIC / 'icon-maskable.png', optimize=True)
    icon(logo, 180, opaque=True).save(PUBLIC / 'apple-touch-icon.png', optimize=True)
    for size in (16, 32):
        icon(logo, size).save(PUBLIC / f'favicon-{size}.png', optimize=True)
    icon(logo, 256).save(PUBLIC / 'favicon.ico', sizes=[(16, 16), (32, 32), (48, 48), (256, 256)])


if __name__ == '__main__':
    main()
