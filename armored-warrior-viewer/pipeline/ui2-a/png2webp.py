# Converts the placeholder PNG crops to exact 5:8 WebP stills (width kept, height = width * 1.6).
import sys, os, glob
from PIL import Image
src, dst = sys.argv[1], sys.argv[2]
os.makedirs(dst, exist_ok=True)
for f in sorted(glob.glob(os.path.join(src, '*.png'))):
    im = Image.open(f).convert('RGB')
    w = im.width - im.width % 5
    im = im.resize((w, w * 8 // 5), Image.LANCZOS)
    out = os.path.join(dst, os.path.basename(f)[:-4] + '.webp')
    im.save(out, 'WEBP', quality=82, method=6)
    print(out, im.size, os.path.getsize(out))
