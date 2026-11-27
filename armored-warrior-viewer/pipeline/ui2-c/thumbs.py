# 192x192 WebP plate thumbnails (<= 8 KB) from work/previews-v15 into ui2-c/thumbs/.
import os, io
from PIL import Image
SP = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
SRC = os.path.join(SP, 'work', 'previews-v15'); OUT = os.path.join(SP, 'ui2-c', 'thumbs')
os.makedirs(OUT, exist_ok=True)
# crop box as fractions (cx, cy, side) of the 1440 still
CROPS = {'front': (.5, .535, .9), 'rear': (.5, .535, .9), 'side': (.5, .535, .9),
         'face': (.5, .5, 1), 'chest': (.5, .5, 1), 'belt': (.5, .5, 1), 'belt-rear': (.5, .5, 1)}
for key, (cx, cy, side) in CROPS.items():
    im = Image.open(os.path.join(SRC, key + '.webp')).convert('RGB')
    W = im.width; s = side * W
    box = (round(cx * W - s / 2), round(cy * W - s / 2), round(cx * W + s / 2), round(cy * W + s / 2))
    box = (max(0, box[0]), max(0, box[1]), min(W, box[2]), min(W, box[3]))
    t = im.crop(box).resize((192, 192), Image.LANCZOS)
    for q in range(82, 20, -4):
        buf = io.BytesIO(); t.save(buf, 'WEBP', quality=q, method=6)
        if buf.tell() <= 8000: break
    open(os.path.join(OUT, key + '.webp'), 'wb').write(buf.getvalue())
    print(key, q, buf.tell())
