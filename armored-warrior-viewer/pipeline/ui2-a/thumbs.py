# Thumbnails for the ui2-a view selector: 192x192 WebP crops of work/previews-v15/<view>.webp (<= 8 KB each).
import sys, os
from PIL import Image
src, dst = sys.argv[1], sys.argv[2]
crops = {  # view: (centre x, centre y, side) as fractions of the still
    'front': (.5, .47, .62), 'rear': (.5, .47, .62), 'side': (.5, .47, .62),
    'face': (.5, .5, .78), 'chest': (.5, .5, .78), 'belt': (.5, .5, .78), 'belt-rear': (.5, .5, .78),
}
for view, (cx, cy, side) in crops.items():
    im = Image.open(os.path.join(src, view + '.webp')).convert('RGB')
    w, h = im.size; s = side * w
    box = (round(cx * w - s / 2), round(cy * h - s / 2), round(cx * w + s / 2), round(cy * h + s / 2))
    t = im.crop(box).resize((192, 192), Image.LANCZOS)
    out = os.path.join(dst, view + '.webp')
    for q in (80, 72, 64, 56, 48, 40):
        t.save(out, 'WEBP', quality=q, method=6)
        if os.path.getsize(out) <= 8192: break
    print(view, q, os.path.getsize(out))
