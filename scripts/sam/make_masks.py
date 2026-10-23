#!/usr/bin/env python3
"""SAM 2.1 masks for the scroll suit-ups' armour plates.

Owner (2026-10-23): 「SAMを用いて、切り抜きが甘い部分などをブラッシュアップする事で
装着を改善して」 — the plates were cut along hand-traced polygons that do not follow
the real plate edges (fringes of the neighbouring plate, straight chords across
curved armour, slivers and holes). This script segments the owner's artwork with
Segment Anything 2.1 (hiera-large), prompted by those polygons, and writes the
plates' masks as versioned design files. The Node builds read the PNGs, so they
stay reproducible without SAM:

  design/rexonance-suit/sam-masks-20261023/          (scripts/build-rexonance-suit.mjs)
  design/far-from-suit-20261022/sam-masks-20261023/  (scripts/build-far-from-suit.mjs)

Each folder holds prompts.json (the build's polygons, written by
`node scripts/build-<suit>.mjs --sam-prompts`), and, written here, plates/<id>.png
(each plate's share of its layer, 8 bit, the art's full frame), Rexonance's
layer masks (base.png: what the base figure shows; ornaments.png: the tail and
ribbons' zone) and manifest.json — the model, the pictures' hashes and, per SAM
call, the exact crop, box and points, the candidate chosen and its scores.

Setup (outside the repository; nothing here is needed at build time):

  /usr/bin/python3 -m venv <tools>/sam/venv
  <tools>/sam/venv/bin/pip install -r scripts/sam/requirements.txt
  <tools>/sam/venv/bin/python -I -c "from huggingface_hub import snapshot_download; \
    snapshot_download('facebook/sam2.1-hiera-large', revision='665f8e2ad61cf5f53d65644ff27c8ee525124610', \
    allow_patterns=['config.json','model.safetensors','preprocessor_config.json','processor_config.json'], \
    local_dir='<tools>/sam/models/sam2.1-hiera-large')"

Run (from the repository root):

  node scripts/build-rexonance-suit.mjs --sam-prompts
  <tools>/sam/venv/bin/python -I scripts/sam/make_masks.py --site rexonance \
      --model <tools>/sam/models/sam2.1-hiera-large [--device mps] [--debug <dir>]
  node scripts/build-rexonance-suit.mjs            # (and the same for --site far-from)

How the masks are made (per suit):

1. Layers. Rexonance has two pictures in one frame: the full artwork (its
   ornaments — tail and ribbons — are cut from it) and the base figure without
   ornaments (the armour is cut from it, whole); both under the owner's cut-out
   alpha. FAR FROM has one: the owner's transparent ミドル cut-out; its driver
   keeps its traced outline (scripts/far-from-belt-outline.mjs) and claims first.
2. Regions. Each region of the build (helmet, chest, shoulder-l, …) is prompted
   on its layer's picture at full resolution: a crop around its polygon (padded,
   never thinner than 1:2, so SAM's 1024 px input is at or above the art's own
   resolution for every part but the longest ribbons), a box (the polygon's
   bounds, padded), positives (farthest-point samples inside the polygon, on lit
   art; EXTRA adds a few by hand) and negatives (samples inside the neighbouring
   polygons; for an ornament, also on the armour its polygon reaches over). Of
   SAM's three candidates the one that best agrees with its prior (the polygon),
   its own IoU estimate and the points is kept; a region SAM is unsure of
   (WEAK_IOU) is left to its polygon. Large regions are refined in 288 px
   windows along their edge (points from the first mask, its logits as the mask
   prompt), so their edges are cut at full resolution too.
3. Rexonance's two layers. The base figure shows its armour where SAM segments
   armour in it (closed, small pockets filled), where it shows the same lit
   pixel as the artwork, and, for a dark pixel both pictures share and neither
   SAM mask claims, where the armour reaches it before an ornament does (so no
   black plate goes missing, the base's old flood fill took them); the rest of
   the figure is the ornaments' zone, plus, over the armour, what SAM segments as
   ornament where the two pictures differ.
4. Partition. Every pixel of a layer goes to the region whose SAM probability
   plus a weak polygon prior is highest (front first on ties), the scores
   smoothed edge-aware (a guided filter on the picture) so a boundary SAM leaves
   ragged settles on the art's own edge; what no mask claims goes to the nearest
   region (on Rexonance's armour, a real area of bodysuit — BODY_OPEN — would
   stay the bodysuit; the art has none). Islands merge into their neighbours,
   small holes are filled.
5. Plates. A region splits into its plates by the build's clips (first claims),
   each straight cut moved, within BAND px, onto the cheapest path along the
   art's edges and round SAM's sub-parts (a grid of point prompts over the
   region finds its spikes, trims, gems — a cut never splits one when it can go
   round); a disc clip is SAM's own mask of the medallion when SAM sees one
   there, else its rim moved the same way. Plates meet hard, a pixel each (soft
   shared pixels would leave a hairline between composited plates); the
   silhouette's softness is the owner's alpha (the builds multiply by it and
   decontaminate its edge colours), and Rexonance's two layers are soft and
   complementary where one gives way to the other.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import sys
import time
from pathlib import Path

import cv2
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

MODEL_ID = "facebook/sam2.1-hiera-large"
MODEL_REVISION = "665f8e2ad61cf5f53d65644ff27c8ee525124610"
VERSION = "20261023"
ROOT = Path(__file__).resolve().parents[2]
SITES = {
    "rexonance": ROOT / "design/rexonance-suit" / f"sam-masks-{VERSION}",
    "far-from": ROOT / "design/far-from-suit-20261022" / f"sam-masks-{VERSION}",
    # ILLUSIONCULUM (2026-10-23, owner: 「イリュージョンとメタにも装甲切り出しは
    # SAMを用いて」): one picture, its driver by its outline, as FAR FROM.
    "illusionculum": ROOT / "design/illusionculum-saga-20261023" / "sam-masks",
}
# How far (frame px) a plate's boundary may leave its straight clip.
BAND = {"rexonance": 40, "far-from": 32, "illusionculum": 32}
# The polygon prior's weight against SAM's probability (0..1) in the partition.
PRIOR = 0.3
# The edge-aware smoothing of the partition's scores (guided filter radius, px).
SMOOTH = 5
# Points added to a region's prompt by hand (frame px), where the polygon's
# own samples miss a thin part of it: the reactor's pink pendant below the
# coil (a sliver of the polygon the sampling, deepest first, never reaches).
EXTRA = {
    "rexonance": {"core": {"pos": [[527, 632], [527, 652]], "neg": []}},
    "far-from": {},
    "illusionculum": {},
}
# Plates the polygon build left empty, kept empty: their pixels go to the next
# plate of their region (FAR FROM's plume root stays behind the shoulder pad
# with the plume's first section, as it was; a plate of its own there landed
# last, after the wings).
MERGE = {"rexonance": {}, "far-from": {"tail-0": "tail-1"}, "illusionculum": {}}
# Below this IoU estimate SAM's best candidate for a region is not trusted.
WEAK_IOU = 0.3
# SAM's sub-parts (atoms) count from this IoU estimate up.
ATOM_IOU = 0.75
# Rexonance's bodysuit: leftovers that survive an opening of this radius (px)
# — a real area of bodysuit between the plates, two tiles across or more (in
# the scroll scene a smaller one would be tiles no plate lands). The owner's art
# has none: every pixel SAM leaves is a plate's dark corner, given to the
# plate beside it.
BODY_OPEN = 24
# Windows of the edge refinement (frame px) and the region size that needs it.
WINDOW = 288
WINDOW_STRIDE = 208
REFINE_ABOVE = 360


# --------------------------------------------------------------------------- io
def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def load_rgba(path: Path) -> np.ndarray:
    return np.asarray(Image.open(path).convert("RGBA"))


def placed(path: Path, size, at, frame, mode="RGB") -> np.ndarray:
    """The picture resized to `size` (Lanczos) and pasted at `at` on a black frame."""
    image = Image.open(path).convert(mode).resize(tuple(size), Image.LANCZOS)
    canvas = Image.new(mode, tuple(frame), (0, 0, 0, 0) if mode == "RGBA" else (0, 0, 0))
    canvas.paste(image, tuple(at))
    return np.asarray(canvas)


def save_u8(path: Path, field: np.ndarray) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(np.clip(np.round(field * 255), 0, 255).astype(np.uint8), "L").save(path, optimize=True)


# ----------------------------------------------------------------- geometry
def poly_mask(poly, shape) -> np.ndarray:
    mask = np.zeros(shape, np.uint8)
    if poly:
        pts = np.round(np.asarray(poly, np.float64) * 4).astype(np.int32)
        cv2.fillPoly(mask, [pts], 1, lineType=cv2.LINE_8, shift=2)
    return mask.astype(bool)


def disk(radius: int) -> np.ndarray:
    return cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * radius + 1, 2 * radius + 1))


def dilate(mask, radius):
    return cv2.dilate(mask.astype(np.uint8), disk(radius)).astype(bool) if radius > 0 else mask.copy()


def erode(mask, radius):
    return cv2.erode(mask.astype(np.uint8), disk(radius)).astype(bool) if radius > 0 else mask.copy()


def bbox(mask):
    ys, xs = np.nonzero(mask)
    if not len(xs):
        return None
    return int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1


def farthest_points(candidates: np.ndarray, k: int, seeds=(), min_depth=2.0):
    """Up to k points spread over `candidates`: the deepest first, then each the
    farthest from those chosen, weighted by its depth (deterministic)."""
    if not candidates.any() or k <= 0:
        return []
    depth = cv2.distanceTransform(candidates.astype(np.uint8), cv2.DIST_L2, 5)
    ys, xs = np.nonzero(depth >= min(min_depth, depth.max()))
    if not len(xs):
        return []
    d = depth[ys, xs]
    chosen = []
    far = np.full(len(xs), np.inf)
    for sx, sy in seeds:
        far = np.minimum(far, np.hypot(xs - sx, ys - sy))
    for _ in range(k):
        score = d * (np.minimum(far, 4 * d.max()) if np.isfinite(far).any() else 1)
        i = int(np.argmax(score))
        if chosen and far[i] < 2.5 * min_depth:
            break
        chosen.append((int(xs[i]), int(ys[i])))
        far = np.minimum(far, np.hypot(xs - xs[i], ys - ys[i]))
    return chosen


def claimed(polys, shape):
    """Front-first claims: each polygon keeps only what no polygon before it has."""
    taken = np.zeros(shape, bool)
    out = []
    for poly in polys:
        mask = poly_mask(poly, shape) & ~taken
        taken |= mask
        out.append(mask)
    return out


def components(mask):
    labels, count = ndi.label(mask, structure=np.ones((3, 3), bool))
    return labels, count


def nearest_fill(labels: np.ndarray, todo: np.ndarray, allowed: np.ndarray | None = None):
    """Gives every `todo` pixel the label of the nearest labelled pixel (>= 0)."""
    source = labels >= 0
    if allowed is not None:
        source &= allowed
    if not source.any() or not todo.any():
        return labels
    _, (iy, ix) = ndi.distance_transform_edt(~source, return_indices=True)
    out = labels.copy()
    out[todo] = labels[iy[todo], ix[todo]]
    return out


def merge_islands(labels, support, min_area, keep_largest=True):
    """Components of a label smaller than min_area (not its largest) go to the
    neighbouring label they share most border with."""
    out = labels.copy()
    for value in np.unique(out[out >= 0]):
        mask = out == value
        comp, count = components(mask)
        if count <= 1:
            continue
        sizes = ndi.sum(mask, comp, index=np.arange(1, count + 1))
        largest = int(np.argmax(sizes)) + 1
        for c in range(1, count + 1):
            if (keep_largest and c == largest) or sizes[c - 1] >= min_area:
                continue
            island = comp == c
            ring = dilate(island, 1) & ~island & support
            neighbours = out[ring]
            neighbours = neighbours[(neighbours >= 0) & (neighbours != value)]
            if not len(neighbours):
                continue
            out[island] = np.bincount(neighbours).argmax()
    return out


def fill_holes(labels, support, max_area):
    """A small patch of other labels enclosed by one label joins it."""
    out = labels.copy()
    for value in np.unique(out[out >= 0]):
        mask = out == value
        filled = ndi.binary_fill_holes(mask)
        holes = filled & ~mask & support
        comp, count = components(holes)
        if not count:
            continue
        sizes = ndi.sum(holes, comp, index=np.arange(1, count + 1))
        for c in range(1, count + 1):
            if sizes[c - 1] <= max_area:
                out[comp == c] = value
    return out


def merge_small(mask, support, min_area):
    """A mask without its specks (components under min_area) and with its pinholes
    (holes under min_area) filled."""
    comp, count = components(mask)
    if count:
        sizes = ndi.sum(mask, comp, index=np.arange(1, count + 1))
        small = np.isin(comp, np.nonzero(sizes < min_area)[0] + 1)
        mask = mask & ~small
    holes, count = components(~mask & support)
    if count:
        sizes = ndi.sum(~mask & support, holes, index=np.arange(1, count + 1))
        small = np.isin(holes, np.nonzero(sizes < min_area)[0] + 1)
        mask = mask | small
    return mask


def guided_filter(guide: np.ndarray, src: np.ndarray, radius: int, eps: float) -> np.ndarray:
    """He et al.'s guided filter (grey guide), box radius `radius`."""
    k = (2 * radius + 1, 2 * radius + 1)
    mean = lambda a: cv2.boxFilter(a, cv2.CV_32F, k, borderType=cv2.BORDER_REFLECT)
    mean_i = mean(guide)
    mean_p = mean(src)
    cov = mean(guide * src) - mean_i * mean_p
    var = mean(guide * guide) - mean_i * mean_i
    a = cov / (var + eps)
    b = mean_p - a * mean_i
    return mean(a) * guide + mean(b)


# --------------------------------------------------------------------- cuts
def clip_shape(clip):
    """A build clip as ('rect', x0, y0, x1, y1), ('circle', cx, cy, r) or ('poly', points)."""
    if clip is None:
        return None
    pts = np.asarray(clip, np.float64)
    if len(pts) == 4:
        xs, ys = sorted(set(pts[:, 0])), sorted(set(pts[:, 1]))
        if len(xs) == 2 and len(ys) == 2:
            return ("rect", xs[0], ys[0], xs[1], ys[1])
    if len(pts) >= 12:
        c = pts.mean(0)
        d = np.hypot(*(pts - c).T)
        if d.std() < 0.03 * d.mean():
            return ("circle", float(c[0]), float(c[1]), float(d.mean()))
    return ("poly", clip)


def cut_cost(grey, region, owner):
    """What a cut costs, pixel by pixel: cheap along the art's own edges (the
    gaps between plates, the scales' rims), dear through the inside of one of
    SAM's parts (a cut never splits a spike, a trim or a gem when it can go
    round), free outside the region."""
    g = cv2.GaussianBlur(grey, (0, 0), 1.0)
    mag = np.hypot(cv2.Sobel(g, cv2.CV_32F, 1, 0, ksize=3), cv2.Sobel(g, cv2.CV_32F, 0, 1, ksize=3))
    ref = np.percentile(mag[region], 95) if region.any() else 1.0
    cost = 1.0 - 0.75 * np.clip(mag / (ref + 1e-6), 0, 1)
    inner = owner >= 0
    for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0)):
        inner &= np.roll(owner, (dy, dx), (0, 1)) == owner
    cost = cost + 30.0 * inner
    cost[~region] = 0.15
    return cost.astype(np.float32)


def dp_path(cost, centre, band, slope=0.25, pull=0.3):
    """The cheapest left-to-right path through `cost` (rows = positions) that
    stays within `band` of row `centre`, moving at most one row per column:
    a row index per column."""
    rows, cols = cost.shape
    lo, hi = max(0, int(round(centre - band))), min(rows - 1, int(round(centre + band)))
    ys = np.arange(lo, hi + 1)
    prior = pull * ((ys - centre) / max(band, 1)) ** 2
    acc = cost[ys, 0] + prior
    back = np.zeros((cols, len(ys)), np.int8)
    inf = np.float32(1e9)
    for x in range(1, cols):
        up = np.concatenate([[inf], acc[:-1]]) + slope
        down = np.concatenate([acc[1:], [inf]]) + slope
        stack = np.stack([up, acc, down])
        k = np.argmin(stack, 0)
        acc = stack[k, np.arange(len(ys))] + cost[ys, x] + prior
        back[x] = k - 1
    idx = int(np.argmin(acc))
    path = np.zeros(cols, np.int32)
    for x in range(cols - 1, -1, -1):
        path[x] = ys[idx]
        if x:
            idx += int(back[x][idx])
    return path


def circle_path(cost, cx, cy, r0, band):
    """The cheapest closed path round (cx, cy) within `band` of radius r0:
    the radius at each of n angles (0 = +x, counter-clockwise on screen y-down
    as atan2(y, x))."""
    # A disc's rim moves less than a straight cut (a fifth of its radius): it
    # settles on the medallion's own outer edge, not on the crystal inside it.
    band = max(2, min(band, 0.2 * r0))
    n = max(64, int(round(2 * math.pi * r0)))
    radii = np.arange(max(1.0, r0 - band), r0 + band + 1, 1.0)
    theta = np.arange(n) * 2 * math.pi / n
    mx = (cx + np.outer(radii, np.cos(theta))).astype(np.float32)
    my = (cy + np.outer(radii, np.sin(theta))).astype(np.float32)
    polar = cv2.remap(cost, mx, my, cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT, borderValue=0.15)
    twice = np.concatenate([polar, polar, polar], axis=1)
    idx = dp_path(twice, (len(radii) - 1) / 2, len(radii), slope=0.25, pull=0.3)
    return radii[idx[n : 2 * n]], n


def snapped_clips(clips, region, grey, owner, band, crop, discs=None):
    """The clips' cuts moved onto the art (within `band` px): each clip's
    internal edges (a rect's sides inside the region, a circle's rim) become the
    cheapest paths through cut_cost — or, for a circle SAM sees as one part (a
    medallion), SAM's own mask of it (`discs`: clip index -> mask in the crop's
    frame). Masks in the crop's frame."""
    x0, y0, x1, y1 = crop
    reg = region[y0:y1, x0:x1]
    h, w = reg.shape
    cost = cut_cost(grey[y0:y1, x0:x1], reg, owner)
    rb = bbox(reg)
    yy, xx = np.mgrid[0:h, 0:w]
    lines = {}

    def line(axis, c):
        key = (axis, c)
        if key not in lines:
            lines[key] = dp_path(cost, c, band) if axis == "h" else dp_path(cost.T, c, band)
        return lines[key]

    out = []
    for clip in clips:
        shape = clip_shape(clip)
        if shape is None:
            out.append(np.ones((h, w), bool))
            continue
        if shape[0] == "rect":
            _, rx0, ry0, rx1, ry1 = shape
            m = np.ones((h, w), bool)
            # (crop px) an edge is internal when it runs through the region.
            ex0, ey0, ex1, ey1 = rx0 - x0, ry0 - y0, rx1 - x0, ry1 - y0
            if rb[0] + 1 < ex0 < rb[2] - 1:
                m &= xx >= line("v", ex0)[yy]
            elif ex0 > 0:
                m &= xx >= ex0
            if rb[0] + 1 < ex1 < rb[2] - 1:
                m &= xx < line("v", ex1)[yy]
            elif ex1 < w:
                m &= xx < ex1
            if rb[1] + 1 < ey0 < rb[3] - 1:
                m &= yy >= line("h", ey0)[xx]
            elif ey0 > 0:
                m &= yy >= ey0
            if rb[1] + 1 < ey1 < rb[3] - 1:
                m &= yy < line("h", ey1)[xx]
            elif ey1 < h:
                m &= yy < ey1
            out.append(m)
        elif shape[0] == "circle" and discs and len(out) in discs:
            out.append(discs[len(out)])
        elif shape[0] == "circle":
            _, cx, cy, r0 = shape
            radius, n = circle_path(cost, cx - x0, cy - y0, r0, band)
            ang = (np.arctan2(yy - (cy - y0), xx - (cx - x0)) % (2 * math.pi)) * n / (2 * math.pi)
            k0 = np.floor(ang).astype(np.int32) % n
            k1 = (k0 + 1) % n
            t = ang - np.floor(ang)
            rr = radius[k0] * (1 - t) + radius[k1] * t
            out.append(np.hypot(xx - (cx - x0), yy - (cy - y0)) < rr)
        else:
            # Any other clip (a traced outline) is kept as drawn.
            out.append(poly_mask([[px - x0, py - y0] for px, py in shape[1]], (h, w)))
    return out


# ---------------------------------------------------------------------- SAM
class Sam:
    def __init__(self, model_dir: str, device: str, cache: Path | None = None):
        import torch
        from transformers import Sam2Model, Sam2Processor

        self.torch = torch
        self.device = device
        self.proc = Sam2Processor.from_pretrained(model_dir)
        self.model = Sam2Model.from_pretrained(model_dir).to(device).eval()
        self.cache_key = None
        self.cache = None
        self.calls = 0
        self.encodes = 0
        # Results of earlier runs (only to iterate faster; never committed).
        self.disk = cache
        if cache:
            cache.mkdir(parents=True, exist_ok=True)

    def predict(self, image: np.ndarray, crop, box=None, pos=(), neg=(), mask_logits=None, name=""):
        """SAM's three candidates for one prompt on image[crop]: their logits at
        the crop's size and their IoU estimates. Points and box in frame px."""
        torch = self.torch
        x0, y0, x1, y1 = crop
        stored = None
        if self.disk is not None:
            h = hashlib.sha1(json.dumps([name, list(map(int, crop)), box and list(map(int, box)), [list(map(int, p)) for p in pos], [list(map(int, p)) for p in neg]]).encode())
            if mask_logits is not None:
                h.update(np.ascontiguousarray(np.round(mask_logits, 1)).tobytes())
            stored = self.disk / f"{h.hexdigest()}.npz"
            if stored.exists():
                hit = np.load(stored)
                self.calls += 1
                return hit["logits"].astype(np.float32), hit["iou"]
        key = (name or id(image), tuple(crop))
        points = [[float(x - x0), float(y - y0)] for x, y in list(pos) + list(neg)]
        labels = [1] * len(pos) + [0] * len(neg)
        kwargs = {}
        if points:
            kwargs["input_points"] = [[points]]
            kwargs["input_labels"] = [[labels]]
        if box is not None:
            kwargs["input_boxes"] = [[[float(box[0] - x0), float(box[1] - y0), float(box[2] - x0), float(box[3] - y0)]]]
        with torch.no_grad():
            if key != self.cache_key:
                sub = Image.fromarray(np.ascontiguousarray(image[y0:y1, x0:x1]))
                inputs = self.proc(images=sub, return_tensors="pt", **kwargs).to(self.device)
                embeddings = self.model.get_image_embeddings(inputs["pixel_values"])
                self.cache_key, self.cache = key, (embeddings, inputs["original_sizes"])
                self.encodes += 1
            else:
                embeddings, sizes = self.cache
                inputs = self.proc(original_sizes=sizes.cpu(), return_tensors="pt", **kwargs).to(self.device)
            embeddings, sizes = self.cache
            extra = {}
            if mask_logits is not None:
                low = cv2.resize(mask_logits.astype(np.float32), (256, 256), interpolation=cv2.INTER_AREA)
                extra["input_masks"] = torch.from_numpy(low)[None, None].to(self.device)
            out = self.model(
                image_embeddings=embeddings,
                input_points=inputs.get("input_points"),
                input_labels=inputs.get("input_labels"),
                input_boxes=inputs.get("input_boxes"),
                multimask_output=True,
                **extra,
            )
            masks = self.proc.post_process_masks(out.pred_masks.cpu(), sizes.cpu(), binarize=False)[0]
        self.calls += 1
        logits = masks[0].float().numpy()  # (3, h, w)
        iou = out.iou_scores.float().cpu().numpy().reshape(-1)
        if stored is not None:
            np.savez_compressed(stored, logits=logits.astype(np.float16), iou=iou)
        return logits, iou


    def grid(self, image: np.ndarray, crop, points, name="", batch=64):
        """One positive point each (frame px), batched on one crop: SAM's three
        low-resolution (256 x 256 over the crop) candidates and IoU estimates
        per point — the automatic mask generator's step, on our own grid."""
        torch = self.torch
        x0, y0, x1, y1 = crop
        with torch.no_grad():
            key = (name or id(image), tuple(crop))
            if key != self.cache_key:
                sub = Image.fromarray(np.ascontiguousarray(image[y0:y1, x0:x1]))
                inputs = self.proc(images=sub, return_tensors="pt").to(self.device)
                self.cache_key = key
                self.cache = (self.model.get_image_embeddings(inputs["pixel_values"]), inputs["original_sizes"])
                self.encodes += 1
            embeddings, sizes = self.cache
            for k in range(0, len(points), batch):
                chunk = [[[float(x - x0), float(y - y0)]] for x, y in points[k : k + batch]]
                inputs = self.proc(
                    original_sizes=sizes.cpu(), input_points=[chunk], input_labels=[[[1]] * len(chunk)], return_tensors="pt"
                ).to(self.device)
                out = self.model(
                    image_embeddings=embeddings,
                    input_points=inputs["input_points"],
                    input_labels=inputs["input_labels"],
                    multimask_output=True,
                )
                self.calls += 1
                # (n, 3, 256, 256) logits and (n, 3) IoU estimates, a batch at a time.
                yield out.pred_masks[0].float().cpu().numpy(), out.iou_scores[0].float().cpu().numpy()


def sigmoid(x):
    return 1.0 / (1.0 + np.exp(-np.clip(x, -30, 30)))


def square_crop(box, frame_w, frame_h, pad_frac=0.22, pad_min=28, aspect=2.0):
    x0, y0, x1, y1 = box
    w, h = x1 - x0, y1 - y0
    pad = max(pad_min, int(round(pad_frac * max(w, h))))
    x0, y0, x1, y1 = x0 - pad, y0 - pad, x1 + pad, y1 + pad
    w, h = x1 - x0, y1 - y0
    # Never thinner than 1:aspect (SAM squashes its crop to 1024 x 1024).
    if w * aspect < h:
        grow = int(math.ceil((h / aspect - w) / 2))
        x0, x1 = x0 - grow, x1 + grow
    elif h * aspect < w:
        grow = int(math.ceil((w / aspect - h) / 2))
        y0, y1 = y0 - grow, y1 + grow
    return max(0, x0), max(0, y0), min(frame_w, x1), min(frame_h, y1)


def choose(logits, iou, prior, support, pos, neg, crop):
    """The candidate that agrees best with its prior, its IoU estimate and the points."""
    x0, y0, _, _ = crop
    best, best_score, scores = 0, -9.0, []
    for k in range(logits.shape[0]):
        m = (logits[k] > 0) & support
        union = (m | prior).sum()
        agree = (m & prior).sum() / union if union else 0.0
        hit_pos = np.mean([logits[k][y - y0, x - x0] > 0 for x, y in pos]) if pos else 1.0
        hit_neg = np.mean([logits[k][y - y0, x - x0] > 0 for x, y in neg]) if neg else 0.0
        score = 0.3 * float(iou[k]) + 0.5 * float(agree) + 0.2 * float(hit_pos) - 0.6 * float(hit_neg)
        scores.append(
            {"k": k, "iou": round(float(iou[k]), 4), "prior": round(float(agree), 4), "pos": round(float(hit_pos), 3), "neg": round(float(hit_neg), 3), "score": round(score, 4)}
        )
        if score > best_score:
            best, best_score = k, score
    return best, scores


# --------------------------------------------------------------- the masks
class Maker:
    def __init__(self, site: str, sam: Sam | None, debug: Path | None):
        self.site = site
        self.dir = SITES[site]
        self.prompts = json.loads((self.dir / "prompts.json").read_text())
        self.sam = sam
        self.debug = debug
        self.W, self.H = self.prompts["frame"]
        self.shape = (self.H, self.W)
        self.log = {"targets": []}
        self.images = {}
        self.load()

    # pictures ------------------------------------------------------------
    def load(self):
        p = self.prompts["images"]
        frame = (self.W, self.H)
        if self.site == "rexonance":
            full = ROOT / p["full"]
            self.full = np.asarray(Image.open(full).convert("RGB"))
            self.base = placed(ROOT / p["base"]["src"], p["base"]["size"], p["base"]["at"], frame)
            cut = placed(ROOT / p["cutout"]["src"], p["cutout"]["size"], p["cutout"]["at"], frame, "RGBA")
            self.alpha = cut[..., 3].astype(np.float32) / 255
            self.images = {"full": str(p["full"]), "base": p["base"]["src"], "cutout": p["cutout"]["src"]}
            self.pictures = {"full": self.full, "base": self.base}
        else:
            rgba = load_rgba(ROOT / p["full"])
            self.alpha = rgba[..., 3].astype(np.float32) / 255
            # On black, as the Rexonance art (the transparent pixels' bytes are nothing).
            self.full = (rgba[..., :3].astype(np.float32) * (self.alpha[..., None] > 0.08)).astype(np.uint8)
            self.base = None
            self.images = {"full": str(p["full"])}
            self.pictures = {"full": self.full}
        self.hashes = {name: sha256(ROOT / src) for name, src in self.images.items()}
        self.solid = self.alpha > 0.5

    # one SAM target ------------------------------------------------------------
    def segment(self, name, picture, prior, support, pos, neg, box=None, crop=None, refine=True, judge_by_prior=False):
        """SAM's probability (frame) for one target, its edge refined in windows."""
        image = self.pictures[picture]
        b = bbox(prior & support) or bbox(prior)
        if box is None:
            pad = max(8, int(0.07 * max(b[2] - b[0], b[3] - b[1])))
            box = (max(0, b[0] - pad), max(0, b[1] - pad), min(self.W, b[2] + pad), min(self.H, b[3] + pad))
        if crop is None:
            crop = square_crop(box, self.W, self.H)
        x0, y0, x1, y1 = crop
        inside = lambda pts: [(x, y) for x, y in pts if x0 <= x < x1 and y0 <= y < y1]
        pos, neg = inside(pos), inside(neg)
        logits, iou = self.sam.predict(image, crop, box, pos, neg, name=picture)
        k, scores = choose(logits, iou, prior[y0:y1, x0:x1], support[y0:y1, x0:x1], pos, neg, crop)
        field = np.full(self.shape, -12.0, np.float32)
        field[y0:y1, x0:x1] = logits[k]
        # SAM unsure of every candidate (a region that is only what its
        # neighbours leave, as the chest between the reactor, the pauldrons and
        # the belt): its polygon speaks instead (logit +-1.1, probability 0.75
        # inside, 0.25 outside), so its confident neighbours cut it.
        # (A disc is judged by how well it matches its circle instead: SAM's IoU
        # estimate runs low on a small crop with a single point.)
        weak = float(iou[k]) < WEAK_IOU and not judge_by_prior
        if weak:
            field = np.where(prior, 1.1, -1.1).astype(np.float32)
        entry = {
            "name": name,
            "crop": [int(v) for v in crop],
            "box": [int(v) for v in box],
            "pos": [list(map(int, p)) for p in pos],
            "neg": [list(map(int, p)) for p in neg],
            "chosen": k,
            "candidates": scores,
            "weak": weak,
        }
        if refine and not weak and max(x1 - x0, y1 - y0) > REFINE_ABOVE:
            field, windows = self.refine(picture, field, support)
            entry["windows"] = windows
        self.log["targets"].append(entry)
        return field

    def refine(self, picture, field, support):
        """Re-runs SAM in WINDOW px windows along the mask's edge, each prompted by
        points inside and outside the coarse mask and its logits, so the edge is
        found at the art's own resolution; the windows' logits are blended."""
        image = self.pictures[picture]
        mask = field > 0
        band = dilate(mask, 6) & ~erode(mask, 6)
        b = bbox(band)
        if b is None:
            return field, []
        acc = np.zeros(self.shape, np.float32)
        weight = np.zeros(self.shape, np.float32)
        windows = []
        ys = list(range(b[1], max(b[1] + 1, b[3] - WINDOW + WINDOW_STRIDE), WINDOW_STRIDE))
        xs = list(range(b[0], max(b[0] + 1, b[2] - WINDOW + WINDOW_STRIDE), WINDOW_STRIDE))
        ramp = np.minimum(np.arange(WINDOW) + 1, np.arange(WINDOW)[::-1] + 1).astype(np.float32)
        ramp = np.minimum(ramp / 40.0, 1.0)
        for wy in ys:
            for wx in xs:
                x0, y0 = min(max(0, wx), self.W - WINDOW), min(max(0, wy), self.H - WINDOW)
                x1, y1 = x0 + WINDOW, y0 + WINDOW
                if band[y0:y1, x0:x1].mean() < 0.01:
                    continue
                inner = erode(mask, 5)[y0:y1, x0:x1] & support[y0:y1, x0:x1]
                outer = ~dilate(mask, 5)[y0:y1, x0:x1]
                pos = [(x + x0, y + y0) for x, y in farthest_points(inner, 3, min_depth=3)]
                neg = [(x + x0, y + y0) for x, y in farthest_points(outer, 3, min_depth=3)]
                if not pos:
                    continue
                logits, iou = self.sam.predict(image, (x0, y0, x1, y1), None, pos, neg, mask_logits=field[y0:y1, x0:x1], name=picture)
                coarse = mask[y0:y1, x0:x1]
                best, best_agree = 0, -1.0
                for k in range(3):
                    m = logits[k] > 0
                    union = (m | coarse).sum()
                    agree = (m & coarse).sum() / union if union else 0
                    s = 0.7 * agree + 0.3 * float(iou[k])
                    if s > best_agree:
                        best, best_agree = k, s
                # A window that disagrees wildly with the coarse mask is a
                # misread (a whole other part): it is dropped.
                if best_agree < 0.62:
                    windows.append({"window": [x0, y0, x1, y1], "dropped": round(float(best_agree), 3)})
                    continue
                w2 = np.outer(ramp, ramp)
                acc[y0:y1, x0:x1] += logits[best] * w2
                weight[y0:y1, x0:x1] += w2
                windows.append({"window": [x0, y0, x1, y1], "pos": [list(p) for p in pos], "neg": [list(p) for p in neg], "chosen": best, "agree": round(float(best_agree), 3)})
        covered = weight > 0.05
        out = field.copy()
        # Within the band the windows decide; elsewhere the coarse logits stand.
        blend = np.clip(weight / 0.5, 0, 1)
        out[covered] = (1 - blend[covered]) * field[covered] + blend[covered] * (acc[covered] / weight[covered])
        return out, windows

    # prompts from the polygons ---------------------------------------------------
    def points(self, prior, support, k=None, avoid=None):
        cand = erode(prior & support, 3)
        if avoid is not None:
            cand &= ~avoid
        if not cand.any():
            cand = prior & support
        area = cand.sum()
        if k is None:
            k = int(np.clip(round(math.sqrt(area) / 45), 2, 7))
        return farthest_points(cand, k, min_depth=3)

    def negatives(self, region_prior, others, support, cap=10):
        near = dilate(region_prior, 60) & ~dilate(region_prior, 8)
        neg = []
        for other in others:
            cand = other & support & near
            if cand.sum() < 30:
                continue
            neg += farthest_points(erode(cand, 2) if erode(cand, 2).any() else cand, 2, min_depth=2)
        # Spread them: the deepest and farthest apart first.
        if len(neg) > cap:
            keep = [neg[0]]
            rest = neg[1:]
            while len(keep) < cap and rest:
                d = [min(math.hypot(x - a, y - b) for a, b in keep) for x, y in rest]
                keep.append(rest.pop(int(np.argmax(d))))
            neg = keep
        return neg

    # SAM's sub-parts --------------------------------------------------------------
    def atoms(self, picture, region, spacing):
        """SAM's sub-parts of a region (its spikes, trims, discs, cuffs): a grid of
        single-point prompts over the region, each point's confident candidates
        (IoU estimate >= ATOM_IOU, stable to +-1 logit), near-duplicates merged,
        the smallest first, each pixel to the smallest part that holds it.
        Returns (crop, owner index per pixel of the crop, the number of parts)."""
        b = bbox(region)
        crop = (max(0, b[0] - 16), max(0, b[1] - 16), min(self.W, b[2] + 16), min(self.H, b[3] + 16))
        x0, y0, x1, y1 = crop
        reg = region[y0:y1, x0:x1]
        ys, xs = np.mgrid[y0 + spacing // 2 : y1 : spacing, x0 + spacing // 2 : x1 : spacing]
        pts = [(int(x), int(y)) for x, y in zip(xs.ravel(), ys.ravel()) if region[y, x] and self.solid[y, x]]
        h, w = y1 - y0, x1 - x0
        owner = np.full((h, w), -1, np.int32)
        if not pts:
            return crop, owner, 0
        stored = None
        if self.sam.disk is not None:
            key = hashlib.sha1(json.dumps(["atoms", picture, list(map(int, crop)), pts, ATOM_IOU]).encode())
            key.update(np.packbits(reg).tobytes())
            stored = self.sam.disk / f"atoms-{key.hexdigest()}.npz"
            if stored.exists():
                hit = np.load(stored)
                self.log.setdefault("atoms", []).append({"crop": list(crop), "points": len(pts), "spacing": spacing, "parts": int(hit["count"])})
                return crop, hit["owner"].astype(np.int32), int(hit["count"])
        area_r = reg.sum()
        kept = []
        for low, iou in self.sam.grid(self.pictures[picture], crop, pts, name=picture):
            for n in range(low.shape[0]):
                options = []
                for k in range(3):
                    if iou[n, k] < ATOM_IOU:
                        continue
                    l = low[n, k]
                    lo = (l > -1).sum()
                    if not lo or (l > 1).sum() / lo < 0.85:
                        continue
                    options.append((int((l > 0).sum()), k))
                # The two finest of its confident candidates (the whole object is
                # the region itself).
                for _, k in sorted(options)[:2]:
                    mask = (cv2.resize(low[n, k], (w, h), interpolation=cv2.INTER_LINEAR) > 0) & reg
                    a = int(mask.sum())
                    if a < 40 or a > 0.55 * area_r:
                        continue
                    ys_, xs_ = np.nonzero(mask)
                    kept.append((a, mask, (xs_.min(), ys_.min(), xs_.max() + 1, ys_.max() + 1)))
        kept.sort(key=lambda t: t[0])
        parts = []
        for a, mask, b in kept:
            dup = False
            for pa, pm, pb in parts:
                ix0, iy0, ix1, iy1 = max(b[0], pb[0]), max(b[1], pb[1]), min(b[2], pb[2]), min(b[3], pb[3])
                if ix0 >= ix1 or iy0 >= iy1:
                    continue
                if (mask[iy0:iy1, ix0:ix1] & pm[iy0:iy1, ix0:ix1]).sum() > 0.85 * max(a, pa):
                    dup = True
                    break
            if not dup:
                parts.append((a, mask, b))
        for index, (a, mask, b) in enumerate(parts):
            free = mask & (owner < 0)
            owner[free] = index
        if stored is not None:
            np.savez_compressed(stored, owner=owner.astype(np.int16), count=len(parts))
        self.log.setdefault("atoms", []).append({"crop": list(crop), "points": len(pts), "spacing": spacing, "parts": len(parts)})
        return crop, owner, len(parts)

    # partition -------------------------------------------------------------------
    def grey(self, picture):
        return (self.pictures[picture].astype(np.float32) @ np.array([0.299, 0.587, 0.114], np.float32)) / 255

    def partition(self, names, probs, priors, support, picture, order_bonus=1e-3):
        """Every support pixel to the region of the highest score: SAM's
        probability plus a weak polygon prior (front first on ties), the scores
        smoothed edge-aware (a guided filter on the picture), so a boundary SAM
        leaves ragged settles on the art's own edge nearby."""
        stack = np.stack([sigmoid(p) for p in probs])  # (R, H, W)
        prior = np.stack([pr.astype(np.float32) for pr in priors])
        score = stack + PRIOR * prior - order_bonus * np.arange(len(names))[:, None, None]
        grey = self.grey(picture)
        for r in range(len(names)):
            score[r] = guided_filter(grey, score[r], SMOOTH, 1e-3)
        best = np.argmax(score, axis=0)
        p_best = np.take_along_axis(stack, best[None], 0)[0]
        q_best = np.take_along_axis(prior, best[None], 0)[0]
        ok = (p_best >= 0.5) | ((q_best >= 0.5) & (p_best >= 0.12))
        labels = np.where(support & ok, best, -1).astype(np.int32)
        return labels, stack

    # soft weights ------------------------------------------------------------------
    def soften(self, labels, support, picture, radius=0, eps=2e-3):
        """Each label's share of its layer: its indicator — or (radius > 0) its
        indicator guided-filtered by the picture (grey, 0..1), renormalised over
        the labels present. The plates meet hard (radius 0): two plates that
        share soft pixels leave a hairline of what lies beneath when both are
        composited, and every soft pixel is stored twice; the edges the cuts
        follow are already the art's (the scores and the cuts are edge-aware),
        and the silhouette's softness is the owner's alpha."""
        if radius <= 0:
            return {v: (labels == v).astype(np.float32) for v in np.unique(labels) if v >= 0}
        grey = (self.pictures[picture].astype(np.float32) @ np.array([0.299, 0.587, 0.114], np.float32)) / 255
        values = [v for v in np.unique(labels) if v >= 0]
        shares = {}
        total = np.zeros(self.shape, np.float32)
        for v in values:
            mask = labels == v
            b = bbox(mask)
            x0, y0 = max(0, b[0] - 8), max(0, b[1] - 8)
            x1, y1 = min(self.W, b[2] + 8), min(self.H, b[3] + 8)
            src = mask[y0:y1, x0:x1].astype(np.float32)
            soft = np.clip(guided_filter(grey[y0:y1, x0:x1], src, radius, eps), 0, 1)
            soft[soft < 0.02] = 0
            shares[v] = ((x0, y0, x1, y1), soft)
            total[y0:y1, x0:x1] += soft
        out = {}
        for v, ((x0, y0, x1, y1), soft) in shares.items():
            t = total[y0:y1, x0:x1]
            frame = np.zeros(self.shape, np.float32)
            frame[y0:y1, x0:x1] = np.where(t > 1e-4, soft / np.maximum(t, 1e-4), 0)
            # Inside the layer every pixel is fully shared out: one label alone
            # keeps its pixel whole.
            out[v] = frame
        # Pixels whose filtered shares vanished (thin parts) keep their label.
        for v in values:
            lost = (labels == v) & (total < 1e-4)
            out[v][lost] = 1
        return out


def run_site(site: str, sam: Sam | None, debug: Path | None, only=None):
    started = time.time()
    m = Maker(site, sam, debug)
    P = m.prompts
    regions = P["regions"]
    ornament_groups = set(P["ornamentGroups"])
    shape = m.shape
    support_any = m.alpha > 0.02
    plates_out = {}
    layers = []
    if site == "rexonance":
        # The ornaments over the full art, the armour over the base figure.
        orn = [r for r in regions if r["group"] in ornament_groups]
        arm = [r for r in regions if r["group"] not in ornament_groups]
        differs = np.abs(m.full.astype(np.int16) - m.base.astype(np.int16)).max(-1) > 40
        lit_full = m.full.max(-1) > 30
        lit_base = m.base.max(-1) > 24
        m.armour_visible = m.solid & ~differs & lit_full
        layers.append(("ornaments", orn, "full", m.solid & differs & lit_full))
        layers.append(("armour", arm, "base", m.solid & lit_base))
    else:
        belt = np.zeros(shape, bool)
        for shape_poly in P["belt"]["outline"]:
            belt |= poly_mask(shape_poly, shape)
        m.belt = belt
        rest = [r for r in regions if r["id"] != P["belt"]["region"]]
        lit = m.full.max(-1) > 24
        layers.append(("armour", rest, "full", m.solid & lit & ~dilate(belt, 2)))

    results = {}
    for layer, regs, picture, positive_support in layers:
        priors = claimed([r["poly"] for r in regs], shape)
        if site != "rexonance":
            priors = [p & ~m.belt for p in priors]
        probs = []
        for i, r in enumerate(regs):
            if only and r["id"] not in only:
                probs.append(np.where(priors[i], 2.0, -12.0).astype(np.float32))
                continue
            others = [priors[j] for j in range(len(regs)) if j != i]
            pos = m.points(priors[i], positive_support)
            neg = m.negatives(priors[i], others, positive_support)
            extra = EXTRA[site].get(r["id"], {})
            pos += [tuple(p) for p in extra.get("pos", [])]
            neg += [tuple(p) for p in extra.get("neg", [])]
            # A hand-placed positive outweighs a sampled negative beside it.
            neg = [q for q in neg if all(math.hypot(q[0] - x, q[1] - y) > 30 for x, y in extra.get("pos", []))]
            if site != "rexonance":
                neg += farthest_points(erode(m.belt, 3) & dilate(priors[i], 50), 1, min_depth=3)
            if layer == "ornaments":
                # The armour the ornament's polygon reaches over (the art shows
                # the plate there, not the ornament).
                neg += farthest_points(erode(priors[i] & m.armour_visible, 4), 4, min_depth=4)
            t = time.time()
            field = m.segment(f"{layer}:{r['id']}", picture, priors[i], m.solid, pos, neg)
            probs.append(field)
            print(f"  {layer}:{r['id']}: {time.time() - t:.1f}s", flush=True)
        results[layer] = (regs, priors, probs, picture)

    # ---- Rexonance: the ornament zone and the base figure's silhouette ----
    if site == "rexonance":
        regs, priors, probs, picture = results["ornaments"]
        orn = np.max(np.stack([sigmoid(p) for p in probs]), axis=0) > 0.5
        regs_a, priors_a, probs_a, _ = results["armour"]
        arm = np.max(np.stack([sigmoid(p) for p in probs_a]), axis=0) > 0.5
        diff = np.abs(m.full.astype(np.int16) - m.base.astype(np.int16)).max(-1)
        # Where the two pictures differ (a 3 x 3 majority: the JPEGs' grain is
        # no difference), an ornament is painted over the base figure.
        differs = ndi.uniform_filter((diff > 40).astype(np.float32), 3) > 0.5
        base_lit = m.base.max(-1) > 30
        # The base figure's armour: what SAM segments as armour in it (its
        # pinholes closed, small enclosed pockets filled — never the big gaps
        # between the arms and the body), and wherever it shows the same lit
        # pixel as the artwork (a part SAM missed).
        closed = cv2.morphologyEx(arm.astype(np.uint8), cv2.MORPH_CLOSE, disk(3)).astype(bool)
        armour_area = merge_small(closed, support_any, 2500) | arm
        seen = support_any & (armour_area | (base_lit & ~differs))
        # Dark pixels the two pictures share and neither SAM mask claims (a black
        # plate SAM left out, or an ornament's dark face over the black ground)
        # go to whichever they reach first through such pixels: the armour or
        # an ornament (what SAM segments as one, or what the pictures paint
        # differently) — so no black plate goes missing from the armour, and no
        # ribbon's dark strand is taken for one.
        ornament_seed = support_any & ~seen & (orn | differs)
        ambiguous = support_any & ~seen & ~ornament_seed
        a_front, o_front = seen.copy(), ornament_seed.copy()
        kernel = np.ones((3, 3), np.uint8)
        for _ in range(400):
            grow_a = cv2.dilate(a_front.astype(np.uint8), kernel).astype(bool) & ambiguous & ~a_front & ~o_front
            grow_o = cv2.dilate(o_front.astype(np.uint8), kernel).astype(bool) & ambiguous & ~a_front & ~o_front & ~grow_a
            if not grow_a.any() and not grow_o.any():
                break
            a_front |= grow_a
            o_front |= grow_o
        # Untouched pockets (enclosed by neither) stay with the armour.
        base_in = merge_small(seen | (a_front & ambiguous) | (ambiguous & ~o_front), support_any, 80)
        # The ornaments: everything of the figure that is not the base figure's
        # armour (tail, ribbons, their dark rims over the base's black ground),
        # and, over the armour, what SAM segments as ornament where the two
        # pictures differ (a ribbon over the arm) — not the hairlines the two
        # pictures' registration leaves along every armour edge.
        over = support_any & armour_area & orn & differs
        over = cv2.morphologyEx(over.astype(np.uint8), cv2.MORPH_OPEN, disk(2)).astype(bool)
        zone = merge_small((support_any & ~base_in) | over, support_any, 60)
        m.zone, m.base_in = zone, base_in

    # ---- partitions per layer ----
    for layer, (regs, priors, probs, picture) in results.items():
        if site == "rexonance" and layer == "ornaments":
            support = m.zone
        elif site == "rexonance":
            support = m.base_in
        else:
            support = support_any
        labels, stack = m.partition([r["id"] for r in regs], probs, priors, support, picture)
        left = support & (labels < 0)
        if site == "rexonance" and layer == "armour":
            body_poly = dilate(poly_mask(P["body"], shape), 4)
            # Only a real area of bodysuit (BODY_OPEN, inside the body polygon)
            # stays the bodysuit; the rest goes to the plates beside it.
            real = cv2.morphologyEx(left.astype(np.uint8), cv2.MORPH_OPEN, disk(BODY_OPEN)).astype(bool) & body_poly
            labels = nearest_fill(labels, left & ~real)
            labels[real] = len(regs)  # the bodysuit
        else:
            labels = nearest_fill(labels, left)
        labels = merge_islands(labels, support, 220 if site == "rexonance" else 160)
        labels = fill_holes(labels, support, 900 if site == "rexonance" else 600)
        results[layer] = (regs, priors, probs, picture, labels, support)
        print(f"  {layer}: partition done ({int((labels == len(regs)).sum())} body px) at {time.time() - started:.0f}s", flush=True)
        if debug:
            preview(debug / f"{site}-{layer}-regions.jpg", m.pictures[picture], labels, [r["id"] for r in regs] + ["body"])

    # ---- plates ----
    splits = P["splits"]
    for layer, (regs, priors, probs, picture, labels, support) in results.items():
        plate_labels = np.full(shape, -1, np.int32)
        plate_names = []
        band = BAND[site]
        for i, r in enumerate(regs):
            region = labels == i
            plates = splits[r["id"]]
            clips = [p["clip"] for p in plates]
            # First claims, as the build's clips (null = the rest).
            left = region.copy()
            pri = []
            for clip in clips:
                pm = (poly_mask(clip, shape) & left) if clip else left.copy()
                left &= ~pm
                pri.append(pm)
            ids = [p["id"] for p in plates]
            if len(plates) > 1 and region.any() and not (only and r["id"] not in only):
                # The clips' cuts, moved onto the art: SAM's sub-parts (a grid of
                # point prompts over the region) are obstacles a cut goes round
                # when it can, and between them it runs along the art's own
                # edges — at most BAND px off the straight clip.
                spacing = int(np.clip(round(math.sqrt(region.sum()) / 26), 8, 18))
                crop, owner, count = m.atoms(picture, region, spacing)
                x0, y0, x1, y1 = crop
                win = (slice(y0, y1), slice(x0, x1))
                reg = region[win]
                # A disc clip (a medallion, the reactor's disc): SAM prompted at its
                # centre; the candidate closest to the circle, if close enough, is
                # the plate — the medallion whole, ring and all.
                discs = {}
                for j, clip in enumerate(clips):
                    shape_j = clip_shape(clip)
                    if not shape_j or shape_j[0] != "circle":
                        continue
                    _, cx, cy, r0 = shape_j
                    disk_prior = poly_mask(clip, shape)
                    pad = int(r0 * 0.45) + 8
                    box = (max(0, int(cx - r0 - pad)), max(0, int(cy - r0 - pad)), min(m.W, int(cx + r0 + pad)), min(m.H, int(cy + r0 + pad)))
                    ring = [(int(cx + 1.55 * r0 * math.cos(t)), int(cy + 1.55 * r0 * math.sin(t))) for t in np.arange(8) * math.pi / 4]
                    ring = [(x, y) for x, y in ring if 0 <= x < m.W and 0 <= y < m.H and m.solid[y, x]]
                    field = m.segment(f"{layer}:{ids[j]}:disc", picture, disk_prior, m.solid, [(int(cx), int(cy))], ring, box=box, crop=square_crop(box, m.W, m.H, pad_frac=0.15, pad_min=16), refine=False, judge_by_prior=True)
                    entry = m.log["targets"][-1]
                    pick = entry["candidates"][entry["chosen"]]
                    disc = (field > 0) & region & (np.hypot(*np.mgrid[0 : m.H, 0 : m.W][::-1] - np.array([cx, cy])[:, None, None]) <= r0 + band)
                    entry["used"] = bool(pick["prior"] >= 0.7 and disc.sum() > 0.5 * (disk_prior & region).sum())
                    if entry["used"]:
                        discs[j] = disc[y0:y1, x0:x1]
                shapes = snapped_clips(clips, region, m.grey(picture), owner, band, crop, discs)
                label = np.full(reg.shape, -1, np.int32)
                rest = reg.copy()
                for j, sm in enumerate(shapes):
                    take = sm & rest
                    label[take] = j
                    rest &= ~take
                subw = merge_islands(label, reg, 120 if site == "rexonance" else 90)
                sub = np.full(shape, -1, np.int32)
                sub[win] = subw
                moved = int(sum(((sub == j) & ~pm).sum() for j, pm in enumerate(pri)))
                # A plate the cut emptied keeps its clip.
                for j, pm in enumerate(pri):
                    if pm.sum() > 40 and (sub == j).sum() < 0.25 * pm.sum():
                        sub[pm] = j
                m.log.setdefault("cuts", {})[r["id"]] = {"parts": count, "movedPx": moved, "spacing": spacing}
            else:
                sub = np.full(shape, -1, np.int32)
                for j, pm in enumerate(pri):
                    sub[pm] = j
            for j, pid in enumerate(ids):
                if pid in MERGE[site]:
                    sub[sub == j] = ids.index(MERGE[site][pid])
            base_index = len(plate_names)
            plate_labels[sub >= 0] = sub[sub >= 0] + base_index
            plate_names += ids
        if site == "rexonance" and layer == "armour":
            plate_labels[labels == len(regs)] = len(plate_names)
            plate_names.append("body")
        # The plates' shares reach a few px past the layer's own (binary) support,
        # into its soft edge: wherever the layer's alpha is above zero, some
        # plate of the layer holds it (no gap between the two layers).
        plate_labels = nearest_fill(plate_labels, dilate(support, 4) & ~support)
        weights = m.soften(plate_labels, support, picture)
        for v, field in weights.items():
            plates_out[plate_names[v]] = (layer, field)
        layers_info = {"plates": plate_names}
        m.log.setdefault("layers", {})[layer] = layers_info
        print(f"  {layer}: {len(plate_names)} plates", flush=True)
        if debug:
            preview(debug / f"{site}-{layer}-plates.jpg", m.pictures[picture], plate_labels, plate_names)

    # ---- outputs ----
    out = m.dir
    (out / "plates").mkdir(parents=True, exist_ok=True)
    for f in (out / "plates").glob("*.png"):
        f.unlink()
    manifest_plates = {}
    for pid, (layer, field) in plates_out.items():
        if pid == "body":
            continue
        save_u8(out / "plates" / f"{pid}.png", field)
        b = bbox(field > 0.03)
        manifest_plates[pid] = {"layer": layer, "box": list(b) if b else None, "area": round(float(field.sum()), 1)}
    if site == "rexonance":
        # Soft where the art is soft (the same guided filter as the plates), and
        # complementary: where the base figure gives way to an ornament alone,
        # the ornament takes exactly what the base leaves (no faint gap between
        # the two layers); over the armour, its own share.
        soft = lambda mask, picture: np.clip(guided_filter(m.grey(picture), mask.astype(np.float32), 2, 2e-3), 0, 1)
        base_soft = soft(m.base_in, "base")
        over = m.zone & m.base_in
        zone_soft = np.maximum(np.where(dilate(m.zone & ~m.base_in, 3), 1 - base_soft, 0), soft(over, "full") * dilate(over, 3))
        save_u8(out / "ornaments.png", np.clip(zone_soft, 0, 1))
        save_u8(out / "base.png", base_soft)
    manifest = {
        "generatedBy": "scripts/sam/make_masks.py",
        "site": site,
        "version": VERSION,
        "model": {"id": MODEL_ID, "revision": MODEL_REVISION, "device": sam.device if sam else None},
        "images": {name: {"src": src, "sha256": m.hashes[name]} for name, src in m.images.items()},
        "prompts": {"src": "prompts.json", "sha256": sha256(m.dir / "prompts.json")},
        "frame": [m.W, m.H],
        "params": {"band": BAND[site], "prior": PRIOR, "window": WINDOW, "stride": WINDOW_STRIDE, "refineAbove": REFINE_ABOVE},
        "plates": {pid: {**info, **m.log.get("plates", {}).get(pid, {})} for pid, info in manifest_plates.items()},
        "layers": m.log.get("layers", {}),
        "cuts": m.log.get("cuts", {}),
        "atoms": m.log.get("atoms", []),
        "calls": {"sam": sam.calls if sam else 0, "encodes": sam.encodes if sam else 0, "seconds": round(time.time() - started, 1)},
        "targets": m.log["targets"],
    }
    (out / "manifest.json").write_text(json.dumps(manifest, indent=1) + "\n")
    print(f"{site}: {len(manifest_plates)} plates, {manifest['calls']}", flush=True)


def preview(path: Path, picture, labels, names):
    path.parent.mkdir(parents=True, exist_ok=True)
    rng = np.random.default_rng(7)
    colours = rng.integers(60, 255, size=(len(names) + 1, 3))
    img = picture.astype(np.float32) * 0.5
    for v in range(len(names)):
        mask = labels == v
        img[mask] = img[mask] * 0.55 + colours[v] * 0.45
    edges = np.zeros(labels.shape, bool)
    edges[1:, :] |= labels[1:, :] != labels[:-1, :]
    edges[:, 1:] |= labels[:, 1:] != labels[:, :-1]
    img[edges] = (255, 255, 255)
    Image.fromarray(np.clip(img, 0, 255).astype(np.uint8)).save(path, quality=88)


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--site", choices=sorted(SITES), required=True)
    ap.add_argument("--model", required=True, help="the sam2.1-hiera-large snapshot folder")
    ap.add_argument("--device", default=None, help="mps, cuda or cpu (default: mps when available)")
    ap.add_argument("--debug", default=None, help="a folder for preview pictures (not committed)")
    ap.add_argument("--only", default=None, help="comma-separated region ids to segment (the rest keep their polygons)")
    ap.add_argument("--cache", default=None, help="a folder caching SAM's answers between runs (not committed)")
    args = ap.parse_args()
    import torch

    device = args.device or ("mps" if torch.backends.mps.is_available() else "cuda" if torch.cuda.is_available() else "cpu")
    sam = Sam(args.model, device, Path(args.cache) if args.cache else None)
    run_site(args.site, sam, Path(args.debug) if args.debug else None, set(args.only.split(",")) if args.only else None)


if __name__ == "__main__":
    sys.exit(main())
