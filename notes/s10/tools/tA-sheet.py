# sheet.py out.png cols scale img1 img2 ... : a contact sheet (label = parent/filename)
import sys
from PIL import Image, ImageDraw
out, cols, sc = sys.argv[1], int(sys.argv[2]), float(sys.argv[3])
ims = []
for p in sys.argv[4:]:
    im = Image.open(p).convert('RGB'); im = im.resize((int(im.width*sc), int(im.height*sc)))
    ImageDraw.Draw(im).text((4, 4), '/'.join(p.split('/')[-2:]), fill=(255, 0, 0)); ims.append(im)
w = max(i.width for i in ims); h = max(i.height for i in ims); rows = (len(ims)+cols-1)//cols
S = Image.new('RGB', (w*cols, h*rows), 'white')
for k, im in enumerate(ims): S.paste(im, ((k % cols)*w, (k//cols)*h))
S.save(out)
