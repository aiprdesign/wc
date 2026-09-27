# Contact sheet of rendered frames: python3 tools/sheet.py <dir> <out.png> [cols]
import sys, glob
from PIL import Image, ImageDraw
d, out = sys.argv[1], sys.argv[2]
cols = int(sys.argv[3]) if len(sys.argv) > 3 else 3
fs = sorted(glob.glob(f'{d}/*.png'))
ims = [Image.open(f).convert('RGB') for f in fs]
w, h = ims[0].size
W, H = w // 2, h // 2
rows = (len(ims) + cols - 1) // cols
sheet = Image.new('RGB', (W * cols, H * rows), (40, 40, 40))
for i, (f, im) in enumerate(zip(fs, ims)):
    x, y = (i % cols) * W, (i // cols) * H
    sheet.paste(im.resize((W, H)), (x, y))
    ImageDraw.Draw(sheet).text((x + 6, y + 4), f.split('/')[-1][2:-4], fill=(255, 80, 80))
sheet.save(out)
print(out)
