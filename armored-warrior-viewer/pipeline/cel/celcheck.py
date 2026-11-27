"""Seam check: for padding texels that stand for the surface across a UV seam (celgeo ring_src), compare
the colour of the nearest texel of their own island with the colour of their partner on the other island,
before (source paint) and after (paintcel). Equal or smaller differences after = no seams introduced.
Also: share of covered texels changed, and the texels the method cannot filter with seam support.
Usage: python celcheck.py <short> [...]"""
import os, sys, numpy as np
from PIL import Image
from scipy import ndimage
import celflat as CF
for short in sys.argv[1:]:
    geo = np.load(os.path.join(CF.CACHE, f'geo_{short}.npz'))
    cover, rs = geo['cover'], geo['ring_src']
    _, (iy, ix) = ndimage.distance_transform_edt(~cover, return_indices=True)
    t = np.nonzero(rs >= 0)[0]
    own = (iy.ravel()[t] * cover.shape[1] + ix.ravel()[t])
    d = np.hypot(*np.unravel_index(t, cover.shape) - np.stack(np.unravel_index(own, cover.shape)))
    near = d <= 1.5                                   # ring texels right at the island border
    a, b = own[near], rs[t][near]
    for lab, fn in (('before', CF.SRC[short]), ('after', os.path.join(CF.OUT, f'paintcel_{short}_2560.webp')), ('stage2', os.path.join(CF.OUT, f'paintcel2_{short}_2560.webp'))):
        im = np.asarray(Image.open(fn).convert('RGB'), np.float32).reshape(-1, 3)
        dd = np.abs(im[a] - im[b]).max(1)
        print(f'{short} {lab:6s}: seam pairs {len(a)}  colour jump across seam mean {dd.mean():.1f}  p90 {np.percentile(dd, 90):.1f}  p99 {np.percentile(dd, 99):.1f} (of 255)')
