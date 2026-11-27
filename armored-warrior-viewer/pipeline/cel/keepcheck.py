"""Keep-rule check: on painted/lit crystal, small bright peaks of the source (L - 1.5 mm surface mean
> 0.06) and near-white texels: how much of their contrast / whiteness survives in a given texture."""
import os, sys, numpy as np
from PIL import Image
import celflat as CF
short, fn = sys.argv[1], sys.argv[2]
g = np.load(os.path.join(CF.CACHE, f'geo_{short}.npz'))
cover, rs = g['cover'], g['ring_src']; tgt = np.nonzero(rs >= 0)[0]
V = cover.copy(); V.ravel()[tgt] = True
ys, xs = np.nonzero(V)
ctx = dict(P=g['P'], N=g['N'], V=V, cover=cover, tgt=tgt, srci=rs[tgt], texel=float(g['texel_m']),
           box=(max(ys.min() - 20, 0), ys.max() + 21, max(xs.min() - 20, 0), xs.max() + 21))
src = np.asarray(Image.open(CF.SRC[short]).convert('RGB'), np.float32)
out = np.asarray(Image.open(fn).convert('RGB'), np.float32)
cry = np.clip(CF.surface_gauss(CF.crystal_hue(src), 0.002, ctx) * 2, 0, 1) > 0.5
Ls, Lo = CF.luma255(src), CF.luma255(out)
bs, bo = CF.surface_gauss(Ls, 0.0015, ctx), CF.surface_gauss(Lo, 0.0015, ctx)
pk = cover & cry & (Ls - bs > 0.06)
wh = cover & cry & (src.min(2) > 0.8 * 255)
print(f'{short} {os.path.basename(fn)}: peaks {pk.sum()}  contrast kept {np.median((Lo - bo)[pk] / (Ls - bs)[pk]):.2f} (median)  '
      f'near-white texels {wh.sum()}  still >0.8 in all channels {np.mean(out[wh].min(1) > 0.8 * 255):.2f}')
