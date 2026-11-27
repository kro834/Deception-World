# 装甲戦士 3D viewer brush-up — shared contract (v1)

Everyone working on this reads this file first. `SP` below is the scratchpad root:
`/tmp/claude-0/-home-user-Deception-World/e3b46e06-f0d8-552d-88dc-50400a3b44dc/scratchpad`

## Goal

The owner's site is a static three.js viewer of one character ("装甲戦士", a Tripo-generated mesh with PBR
textures). The owner wants it to look like **a 3D model that appears in an anime**: cel-shaded,
"painterly 2.5D", as elaborate as the two character sheets in `refs/` (front.png, back.jpg). Those two
sheets are the target look. Geometry stays as it is (do not try to reshape the mesh; the belt buckle
differs from the sheet and that is out of scope).

What the sheets show (lead's reading, with measured colours in `refs/palette.json`):
- Thin dark ink outlines on the silhouette and between plates/scales.
- Armour: near-black (#030304 → #14141b → #2d2b34), glossy, with small controlled grey highlights. Never grey-blue.
- Trim: bronze gold (#643a1e → #9b663d → #e3aa70), with hard-edged banded highlights (anime metal).
- Crystal blades and gems: saturated royal blue (#152d74 → #3159c8 → #6899f2) running to violet (#c077ec) and
  pink (#f07cbf) at the tips, with lighter facet lines, star sparkles and a soft glow. Bright but never blown
  out to white except the hot core of the orbs.
- Flat, clean, high-contrast, saturated. No photographic reflections, no muddy gradients.

Primary device: iPhone (Safari, WebGL2), portrait. Desktop second. Nothing here can be tested on a real
phone, so stay conservative about GPU memory and shader cost, and say what is unverified.

## Directories

| Path | What | Who writes |
|---|---|---|
| `site/` | Pristine download of the live site. **Read-only.** | nobody |
| `refs/` | `front.png`, `back.jpg`, `palette.json` | lead |
| `work/` | The new site, the deploy root. `http://localhost:8765/work/` | see ownership |
| `ui-work/` | UI sandbox copy (old `viewer.js`, symlinked assets). `http://localhost:8765/ui-work/` | UI |
| `pipeline/` | Blender / Python / Node scripts and intermediates | asset agents (own subfolder each) |
| `tools/shot.cjs` | Screenshot harness | lead |
| `shots/` | Screenshots (use your own subfolder: `shots/<you>-NN/`) | everyone |
| `venv/` | `$SP/venv/bin/python` has `bpy` (Blender as a module), numpy, scipy, opencv, pillow | read-only |
| `node/` | `node/node_modules`: `@gltf-transform/cli`, `meshoptimizer`, full `three@0.180.0` (addons in `three/examples/jsm`) | read-only |

A static server is already running on port 8765 with `SP` as its root. Do not start another on that
port; do not kill it. The machine has 4 CPU cores shared by everyone — keep heavy jobs to 2 threads.

## File ownership (do not edit files you do not own; ask the lead instead)

- **look-dev**: `work/viewer.js`, `work/look/**` (code, shaders, placeholder textures), additions under `work/vendor/`.
- **UI**: `ui-work/index.html`, `ui-work/viewer.css`, optional `ui-work/ui.js`. The lead copies them into `work/`.
- **bake**: `pipeline/bake/**`; delivers `work/model-v15/**` (style, toonNormal and mask maps) and is the
  only writer of `work/model-v15/manifest.json`.
- **linework**: `pipeline/lines/**`; delivers `work/model-v15/lines_*.webp` and a sidecar
  `work/model-v15/lines.json` (same shape as the manifest's `maps`, with only the `lines` /
  `linesSpread` keys). The viewer merges `lines.json` over `manifest.json`.
- **lighting**: `pipeline/light/**`; delivers `work/look/matcaps/**` and `work/look/lightrig.json`.
- **deploy**: `tools/deploy/**`, `work/vercel.json`.
- **lead**: `tools/shot.cjs`, `docs/`, `refs/`, integration, the judge loop, publishing.

Deliver finished files atomically (write to a temp name in the same folder, then `mv`), because other
people may be loading the page at that moment.

The original model files stay where they are and are not re-encoded:
`work/model-v10/standard-v14.glb` (525k triangles, textures embedded) and `work/model-v10/detail-v14.gltf`
(+ `detail-v14.bin`, 2560² textures; meshopt + quantization + webp extensions).

## DOM contract between `viewer.js` and the page

Existing hooks, all kept with the same meaning:
`#stage` (viewer appends its `<canvas>` here), `#poster` (img; viewer sets `src`, `alt`, `hidden`),
`#status` (`role=status`; viewer sets text and `hidden`), `#quality` (button; viewer sets text, `disabled`,
`aria-pressed`), `#reset` (button; viewer sets `disabled`), `[data-view]` buttons with the keys
`front rear side face chest belt belt-rear` (viewer sets `aria-pressed`), `#hint`.

New hooks the viewer sets (the page may style on them, CSS only):
- `document.documentElement.dataset.viewer` = `loading | ready | error | lost`
- `document.documentElement.dataset.mode` = `standard | detail`
- `#stage` custom property `--load-progress` (0 → 1) while a model downloads
- optional element `#progress` (decorative, `aria-hidden`): while a model downloads the viewer sets its
  `textContent` to the whole-number percentage, e.g. `42%`; otherwise it is empty. The viewer must not
  fail when the element is absent. (Added after UI round 1: the judge wants the number visible.)

Posters: the lead regenerates all seven from the new renderer at the end — square, 1440², drawn on the
same backdrop as the stage (edge colour = `--stage-edge`), framed like the matching 3D view.

Stage backdrop: the viewer draws its own opaque backdrop inside the canvas. Its outer edge must fade to
one flat colour, exposed to CSS as `--stage-edge` (default `#0b0d14`), with `--stage-center` (default
`#232a40`) behind the figure. The page paints the same two colours behind the poster so nothing jumps
when the canvas appears. If look-dev changes these values it reports the new ones to the lead.

## Test hooks (viewer.js exposes these; the harness uses them)

`window.__viewer = { whenSettled(), setOrbit(azimuthDeg, polarDeg), state() }`
- `whenSettled()` → Promise that resolves once the final-quality frame for the current camera is on screen.
- `setOrbit(azimuthDeg, polarDeg = 82)` → place the camera on the fitted full-body orbit. Azimuth turns
  about +Y from +Z towards +X: 0 = front, 90 = the `side` view, 180 = rear. Polar is measured from +Y.
- `state()` → small plain object for logs (mode, pipeline tier, render-target sizes, anything useful).

## Screenshot harness

```
cd $SP && node tools/shot.cjs --url http://localhost:8765/work/ --out shots/<you>-01 \
  [--size 900x1100] [--dpr 1] [--mode standard|detail] [--clip stage|page] \
  [--views front,rear,side,face,chest,belt,belt-rear] [--orbits q34:35:82,rear34:215:82] [--mobile]
```
It renders with software GL (SwiftShader): correct pictures, meaningless frame times. Read the PNGs with
the Read tool to look at your own work. `shots/r00-baseline/` holds the untouched site.

## Asset contract (everything optional at runtime — the viewer must work without it)

`work/model-v15/manifest.json`
```json
{ "version": 1,
  "maps": { "<glTF material name>": {
      "standard": { "style": "style_body_1024.webp", "toonNormal": "toonnormal_body_1024.webp" },
      "detail":   { "style": "style_body_2048.webp", "toonNormal": "toonnormal_body_2048.webp" } } } }
```
- `style` — linear data (not sRGB), `flipY = false`, sampled with the mesh's existing `TEXCOORD_0`:
  **R** ambient occlusion (1 open, 0 occluded) · **G** curvature (0.5 flat, above = convex edge, below =
  concave crease) · **B** ink (1 = painted line; 0 when not produced).
- `toonNormal` — object-space *smoothed* unit normal, `rgb = n * 0.5 + 0.5`, in the mesh node's local
  space. For clean cel shadow shapes on a lumpy AI-generated mesh.

### Added after look round 1 (judge: 52/100 — shading shapes came from the texture's baked light, giving blotches)

The original base-colour textures carry baked highlights, reflections and noise, so they must stop
driving tone. Two more optional maps per material and mode, listed in the same `manifest.json` under the
keys `mask` and `lines` (same conventions as `style`: linear data, `flipY = false`, `TEXCOORD_0`):

- `mask` (RGBA, **bake** agent) — which paint each texel is:
  **R** gold (bronze trim) · **G** crystal (everything that should be the glowing blue → violet → pink
  material) · **B** device (the silver-white mechanical buckle / clasp parts) · armour (near-black) is
  what is left. Each of R, G, B is stored as a distance field around that class's boundary:
  `0.5` = the boundary, above = inside, below = outside, so the shader can rebuild a crisp antialiased edge
  at any zoom with `smoothstep(0.5 - w, 0.5 + w, v)`.
  **A** crystal gradient position: 0 = royal blue (root) → 0.5 violet → 1 = pink (tip), smooth and
  low-frequency, following the layout painted in the original texture.
- `lines` (RGB, **linework** agent) — drawn lines as distance fields: value `1.0` on the line centre
  falling to `0` at the stated spread, so a constant-width antialiased stroke can be drawn at any zoom.
  **R** armour lines (scale rows, plate seams) · **G** crystal facet lines · **B** spare (0).
  Neither channel is pre-multiplied by a class; the shader gates R by armour and G by crystal.

The spread (in texels, per file) is recorded in the manifest entry as `"maskSpread"` / `"linesSpread"`.

`work/look/matcaps/{gold,armor,crystal}.webp` — 512², sRGB, standard matcap convention (sample with
view-space normal `xy * 0.5 + 0.5`, +Y up). `work/look/lightrig.json` —
`{ "key": {"dir":[x,y,z],"color":"#rrggbb","intensity":n}, "fill": {…}, "rim": {…} }` in view space
(x right, y up, z towards the viewer).

### Changed after look round 2 (judge: 52/100 again — flat class colours lost the painted design)

**Direction now: painted-texture-first.** The base-colour texture *is* the character sheet's painting
projected onto the mesh (banded gold, drawn scales, crystal gradients, emblems, ink lines). The viewer
shows it essentially unlit and adds light-handed layers (grade, sharpening, cel form shade, sheen, glow,
silhouette ink, brush finish), each with its own strength in `work/look/tunables.js`. `mask`, `lines` and
`style.B` are no longer used for colour; they stay in the manifest as optional helpers.

More optional manifest keys (per material and mode), all sRGB colour, `flipY = false`, `TEXCOORD_0`:
- `paint` — a replacement for the material's embedded base colour (same painting, sharper or corrected).
  By default the viewer uses it only where the embedded texture is sparse on the surface
  (`sharpPaintBelow`); with `"paintForce": true` in the same entry it is always used. `paintsrc_*` =
  pure resample of the detail base colour; `paintfix_*` = the same with pointwise colour corrections
  (bake agent; rear of the helmet, horns).
- `paintRepaired` — the bake agent's earlier region repair (off by default; `repair` tunable).
- `conf` — single-channel reliability of the painting (1 = faces a sheet, 0 = smeared); off by default.

Code layout: `work/look/toon.js` was renamed `work/look/material.js`. Dev parameters: `?plain=1`
(every layer off), `?plain=1&keep=grade,form`, `?set=path:value`, `?tier=`, `?debug=N`, `?capture=N|WxH`.
`window.__viewer.setOrbit(azimuthDeg, polarDeg, zoom?, height?)` takes two optional extra arguments.

## Reporting

Say plainly what you verified and how, what failed, and what you could not check. Give file paths.
Do not claim performance on real devices from software-GL timings.
