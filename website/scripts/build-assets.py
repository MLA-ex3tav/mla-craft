from pathlib import Path
from shutil import copy2
from PIL import Image

SRC = Path(r"E:\MLA Craft\public")
OUT = Path(r"E:\MLA Craft\website\assets\img")
OUT.mkdir(parents=True, exist_ok=True)

# Keep the exact landscape used by the desktop app.
copy2(SRC / 'backgrounds' / 'complementary-forest.jpg', OUT / 'complementary-forest.jpg')
copy2(SRC / 'backgrounds' / 'complementary-forest-source.md', OUT / 'complementary-forest-source.md')

# Logos (keep alpha)
for name, out in (("mla-server-ms-stone.png", "logo"), ("mla-craft-logo-v2.png", "logo-flat")):
    logo = Image.open(SRC / "branding" / name).convert("RGBA")
    for size in (512, 192, 96):
        logo.resize((size, size), Image.LANCZOS).save(OUT / f"{out}-{size}.png", optimize=True)

# Favicon: crop flat logo tight then downscale
flat = Image.open(SRC / "branding" / "mla-craft-logo-v2.png").convert("RGBA")
bbox = flat.getbbox()
flat.crop(bbox).resize((64, 64), Image.LANCZOS).save(OUT / "favicon.png", optimize=True)

# Minecraft blocks used as decorative props
blocks = OUT / "blocks"
blocks.mkdir(exist_ok=True)
for block in ("grass_block.png", "oak_log.png", "birch_log.png", "cobblestone.png", "bricks.png", "furnace.png"):
    Image.open(SRC / "blocks" / block).save(blocks / block, optimize=True)

for path in sorted(OUT.rglob("*")):
    if path.is_file():
        print(f"{path.relative_to(OUT)}  {path.stat().st_size / 1024:.1f} kB")
