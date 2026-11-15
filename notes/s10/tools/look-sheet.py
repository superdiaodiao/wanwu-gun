# sheet.py: contact sheet(s). usage: python3 sheet.py out.png size scale "label=dir" ["label=dir" ...]  [--holes=9,10] [--cols=N] [--page]
# one row per hole, one column per dir (before/after side by side); or with a single dir, a grid of --cols
import sys
from PIL import Image, ImageDraw, ImageFont
a = [x for x in sys.argv[1:] if not x.startswith('--')]
opt = dict(x[2:].split('=', 1) if '=' in x else (x[2:], '1') for x in sys.argv[1:] if x.startswith('--'))
out, size, scale = a[0], a[1], float(a[2]); dirs = [d.split('=', 1) for d in a[3:]]
holes = [int(h) for h in opt.get('holes', '9,10,11,12,13,15,16,17,19,20,22,23,24,25,26,27,29,30,31,32,35').split(',')]
suf = '.page.png' if 'page' in opt else '.png'
try: F = ImageFont.truetype('/System/Library/Fonts/STHeiti Medium.ttc', 22)
except Exception: F = ImageFont.load_default()
cells = []
for h in holes:
    for lab, d in dirs:
        im = Image.open(f'{d}/zh-easy-{size}/h{h:02d}{suf}').convert('RGB')
        im = im.resize((int(im.width * scale), int(im.height * scale)), Image.LANCZOS)
        cells.append((f'{h + 1}洞 {lab}', im))
cols = int(opt.get('cols', len(dirs) if len(dirs) > 1 else 4))
if len(dirs) > 1 and 'cols' in opt: cols = int(opt['cols']) // len(dirs) * len(dirs)
w, hh = cells[0][1].size; pad, top = 8, 30
rows = (len(cells) + cols - 1) // cols
sh = Image.new('RGB', (cols * (w + pad) + pad, rows * (hh + top + pad) + pad), 'white'); dr = ImageDraw.Draw(sh)
for i, (lab, im) in enumerate(cells):
    x, y = pad + (i % cols) * (w + pad), pad + (i // cols) * (hh + top + pad)
    sh.paste(im, (x, y + top)); dr.text((x + 2, y + 2), lab, fill=(20, 110, 40) if 'after' in lab or '后' in lab else (60, 60, 60), font=F)
sh.save(out); print(out, sh.size)
