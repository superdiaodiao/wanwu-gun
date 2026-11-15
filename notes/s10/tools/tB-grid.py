# grid.py out.png cols scale img1 img2 ... : tile images with labels
import sys
from PIL import Image, ImageDraw
out, cols, scale = sys.argv[1], int(sys.argv[2]), float(sys.argv[3])
ims = [(p, Image.open(p).convert('RGB')) for p in sys.argv[4:]]
w = max(int(i.width*scale) for _, i in ims); h = max(int(i.height*scale) for _, i in ims)
rows = (len(ims)+cols-1)//cols
G = Image.new('RGB', (cols*w, rows*h), 'white'); d = ImageDraw.Draw(G)
for k, (p, i) in enumerate(ims):
    i = i.resize((int(i.width*scale), int(i.height*scale)))
    x, y = (k%cols)*w, (k//cols)*h
    G.paste(i, (x, y)); d.rectangle([x, y, x+150, y+14], fill='black'); d.text((x+2, y+1), '/'.join(p.split('/')[-2:])[-28:], fill='yellow')
G.save(out)
