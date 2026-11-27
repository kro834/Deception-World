import sys
from PIL import Image
a, b, out = sys.argv[1:4]
A = Image.open(a).convert('RGB'); Bm = Image.open(b).convert('RGB')
w = Image.new('RGB', (A.width + Bm.width + 8, max(A.height, Bm.height)), 'white'); w.paste(A, (0, 0)); w.paste(Bm, (A.width + 8, 0)); w.save(out)
