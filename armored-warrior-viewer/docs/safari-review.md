# iPhone Safari review of `work/` (static review + Chromium experiments)

Reviewer: safari agent. Date: 2026-11-27, 04:35 UTC. Read-only: nothing under `work/` was edited.

**Revision reviewed** (md5, first 12 hex): `index.html` b16b2f012622 · `viewer.js` 49f9493dcd8a ·
`look/look.js` 45892f2cf60e · `look/material.js` 5ec6c616bd08 · `look/post.js` d76971bc2468 ·
`look/tunables.js` 74585eb07eb6 · `model-v15/manifest.json` e7193805309d. three r180 (vendored).
Look-dev may still be changing tunables. Line numbers refer to this revision.

**How things were checked.** Everything below is one of three kinds of evidence, and each finding says which:
- *Static*: read from the code (and from three r180's source in `node/node_modules/three`).
- *Forced*: reproduced in headless Chromium + SwiftShader by forcing the failure (monkey-patched WebGL calls,
  request interception or network throttling). This shows what **the page** does when the failure happens.
  It does not show that the failure happens on an iPhone.
- *Remembered*: WebKit / ANGLE-Metal behaviour I remember. I could not check live WebKit documentation. Each one
  says how sure I am.

No result here comes from WebKit, a real GPU or a phone. Software-GL frame times are not reported.

---

## 1. Findings, ranked by likelihood on a real iPhone × damage

### F1. On iOS 15.0–16.3, 3D never starts and the status says "loading" forever (import maps)
- **Where:** `index.html:21-23` (`<script type="importmap">`). Every module imports the bare name `'three'`
  (`viewer.js:1-5`, `look/*.js`, the vendored addons).
- **What the visitor sees:** The square poster, with the status "3Dモデルを読み込み中" that never changes. The quality
  button stays disabled, and the view buttons do nothing because `viewer.js`, which wires them up, never runs.
  `data-viewer` is never set, so no error styling appears either.
- **Confidence:** High.
  - *Remembered, high confidence:* Safari added import maps in 16.4. Earlier versions ignore the map, and
    `import 'three'` then fails to resolve.
  - *Forced:* `pipeline/safari/nomap.cjs` serves `index.html` without the import map. Result: page error
    "Failed to resolve module specifier "three"", `window.__viewer` undefined, and the status text stuck. See
    `shots/safari-01/no-importmap.png`.
  - The `try/catch` around `startViewer()` (`viewer.js:106-112`) cannot catch a module-resolution failure.
- **Likelihood:** Certain on iOS 15.x–16.3. These are a small and shrinking share of visitors, but they are inside
  the stated 15–18 range.
- **Smallest fix:**
  - *Honest failure:* add a classic inline script before the module script. If
    `!(HTMLScriptElement.supports && HTMLScriptElement.supports('importmap'))`, set `data-viewer="error"` and put
    the existing no-3D message (`viewer.js:111`) in `#status`. The posters stay. The view buttons stay dead unless
    that script also wires them to swap `#poster`, which is about 5 lines.
  - *Full fix:* vendor es-module-shims (an addition under `vendor/`, so look-dev's call), or rewrite the bare
    imports to relative paths, which also means the vendored addons.
  - This is the only JavaScript feature I found that rules out Safari 15/16. I grepped the shipped JS for
    `Array.at` / `Object.hasOwn` / `findLast` / `structuredClone`; the only `.at(` hits are three's `Ray.at`.

### F2. On a slow phone connection the standard model can never load: a 45 s cap on the whole download
- **Where:** `viewer.js:301`: `setTimeout(() => controller.abort(), 45_000)`. The signal is passed to the GLB fetch
  (`viewer.js:278`), and the timer runs whether or not bytes are arriving.
- **What the visitor sees:** At effective throughput below about **4.6 Mbit/s** (25.8 MB × 8 / 45 s), progress
  climbs and then the page switches to "3Dを読み込めませんでした…" with "3D表示を再試行". Retrying starts again
  from zero and fails the same way.
- **Confidence:** High.
  - *Forced:* `pipeline/safari/slow.cjs 4` throttles the link to 4 Mbit/s with 80 ms latency. Result: `AbortError`
    at 47.7 s, `data-viewer=error`. See `shots/safari-01/slow-4mbit.png`.
- **Likelihood:** Moderate. Congested LTE, rural cells, train/metro and iOS Low Data Mode all reach this.
  - Detail mode is barely affected: the signal only covers the 21 KB `.gltf`. The `.bin` and textures are fetched
    by GLTFLoader without that signal.
- **Smallest fix:** Turn the total timeout into a stall timeout. Re-arm the timer on every chunk in the read loop
  (`viewer.js:285-291`), for example abort after 20 s without a byte. Keep a separate cap on parsing if you want one.

### F3. If the context is lost while the model is downloading, the restored stage is empty but says "ready"
- **Where:**
  - `viewer.js:335-340`: `fitView()` only runs `if (!contextLost)`.
  - `viewer.js:370-378`: the restore handler reveals the canvas and calls `requestRender(true)`, but never frames
    the camera.
- **What the visitor sees:** The poster disappears and the canvas shows the backdrop seen from the default camera
  at the origin: a horizon split and no figure. The UI says ready. Tapping a view button or reset recovers, because
  that calls `fitView`. Dragging does not.
- **Confidence:**
  - *Forced, high:* `probe.cjs lostmid` calls `loseContext()` at 30 % progress and `restoreContext()` 4 s later.
    Result: `viewer: ready`, `tier: full`, empty stage. See `shots/safari-01/lostmid.png`.
  - *Remembered, medium:* iOS Safari drops WebGL contexts of backgrounded tabs under memory pressure.
- **Likelihood:** Moderate. On a phone the download takes 10–60 s (F2), and switching apps while waiting is
  ordinary. Whether iOS actually drops the context in that window depends on memory pressure.
- **Smallest fix:** In `load()`, call `fitView()` before the `if (!contextLost)` block, so `viewer.js:336` moves up
  two lines. `frame()` only positions the camera; its `renderFull()` already returns early while the context is
  lost.

### F4. The PBR maps the shader never reads are still downloaded and decoded (detail: 38 MB more, and a large memory spike)
- **Where:**
  - `viewer.js:133`: GLTFLoader loads every texture each material references.
  - `look.js:183` drops `normalMap` / `metalnessMap` / `roughnessMap` / `aoMap` only after they are loaded and
    decoded.
- **What the visitor sees, detail switch:**
  - It downloads **61.97 MB in 22 requests**. **37.91 MB of that is the 10 normal and metallic-roughness maps
    (2560², lossless WebP)** that are thrown away.
  - On Safari ≥ 17, GLTFLoader uses `ImageBitmapLoader` (`GLTFLoader.js:2676`; Safari < 17 uses `TextureLoader`).
    `createImageBitmap` decodes eagerly, so those 10 maps become about **262 MB of decoded bitmaps** that exist
    briefly. That happens while the standard model is still alive (it is disposed only after `prepareModel`,
    `viewer.js:321-325`). This is the most likely moment for an iPhone to kill the tab or drop the context.
  - Standard mode: 12.82 MB of the 25.82 MB GLB is these maps. With the body's base colour, which `paintsrc` replaces,
    13.56 MB of the GLB (52.5 %) is never shown. On Safari ≥ 17 that is about 65 MB of short-lived decoding.
- **Confidence:**
  - *Measured:* the bytes and request counts (`load.json`, `strip.cjs`).
  - *Static:* the decode path.
  - *Remembered, medium-high:* WebKit's `createImageBitmap` from a Blob decodes up front.
  - The peak memory is an estimate (§3).
- **Smallest fix:** A 5-line GLTFLoader plugin registered at `viewer.js:133`. Its `beforeRoot()` deletes
  `normalTexture`, `occlusionTexture` and `pbrMetallicRoughness.metallicRoughnessTexture` from `parser.json.materials`.
  No model is re-encoded. Verified in Chromium:
  - `strip.cjs`: the detail switch drops to **24.06 MB in 12 requests**, with a pixel-identical settled frame
    (max channel difference 0).
  - `plugin.cjs` serves a patched `viewer.js` through interception: standard and detail settle pixel-identical,
    with no errors.
  - For the GLB this saves the decoding but not the bytes. Saving the 13.6 MB would need a new, stripped GLB
    (a derived file, not a re-encode of the original), which is the lead's or owner's call. It is the single
    largest loading win available: first-render bytes would go from 31.1 to about 17.6 MB.

### F5. A shader that fails to compile in the material or the final pass gives an empty stage, and the fallback does not notice
- **Where:**
  - `look.js:63-67`: `onShaderError` sets `shaderFailed`.
  - `look.js:326-341`: `render()` resets that flag on every attempt and lowers one tier at a time.
  - The painted material, backdrop and final pass are shared by every tier, and the forward tier draws the same
    painted material.
- **Why the fallback misses it:** three calls `onShaderError` only the first time a broken program is used. The next
  tier's attempt therefore "succeeds" with the same broken program, and the page settles on `lite` with
  `data-viewer=ready`.
- **What the visitor sees:**

| Forced compile error in… | Tier the page ends on | Picture | Shot |
|---|---|---|---|
| painted material (`sh-material`) | lite, "ready" | backdrop only, **no figure** | `sh-material.png` |
| final pass (`sh-final`) | lite, "ready" | **blank stage** (canvas never written) | `sh-final.png` |
| backdrop (`sh-backdrop`) | lite | figure on black (acceptable) | `sh-backdrop.png` |
| brush (`sh-brush`) | lite | correct (works as designed) | `sh-brush.png` |
| star / bloom (`sh-star`, `sh-bloom`) | lite | figure without stars / glow (those passes still run in lite) | `sh-star.png`, `sh-bloom.png` |

- **Confidence:**
  - *Forced, high:* `probe.cjs sh-*` appends `#error` to the matching source in `shaderSource`, which is a real
    compile failure.
  - *Static, medium:* the likelihood is **low**. These are plain GLSL ES 3.00 shaders, all highp, with no
    construct I know ANGLE-Metal to reject (§4). The damage is the worst possible, though, and nothing tells the
    visitor.
- **Smallest fix:** After the first full render, check
  `renderer.info.programs.some((p) => p.diagnostics && !p.diagnostics.runnable)` (three fills in `diagnostics`
  while `debug.checkShaderErrors` is true, the default). Alternatively, make `onShaderError` record which material
  failed.
  - If it is the painted material or the final pass: treat it as fatal in `viewer.js` and keep the poster with
    `revealModel(false)`, `setState('error')` and the no-3D status.
  - If it is star, bloom or backdrop: go to `forward`.
  - Keep a sticky "a program failed" flag rather than resetting `shaderFailed` on each attempt.

### F6. A render between the context loss and its event leaves the page on the forward tier for good
- **Where:**
  - `post.js:499`: on a lost context `checkFramebufferStatus` does not return COMPLETE, so `look.js:340` drops
    straight to `forward`.
  - `look.js:371`: `onContextRestored()` resets the targets but never restores the tier.
- **What the visitor sees:** After the restore, no outline, bloom or stars for the rest of the visit. It looks like
  a flatter picture, not a broken one.
- **Confidence:** *Forced, high:* `probe.cjs lostrace` calls `loseContext()` and a render in the same task, giving
  tier `forward` with notes "geometry target incomplete -> lite -> forward", still `forward` after the restore.
  Likelihood is low to moderate: a ResizeObserver callback or rAF can run between the real loss and the queued event.
- **Smallest fix:**
  - `look.render()` (`look.js:323`): return immediately when `renderer.getContext().isContextLost()`.
  - `onContextRestored()`: put `tier` back to its initial value.

### F7. GPU memory is about 1.4× look-dev's estimate once targets, canvas and geometry are counted (details in §3)
- **The numbers** (estimate; see §3 for what is soft):
  - Standard on a phone: about **255–270 MB GPU-side**.
  - Detail on a phone: about **390–410 MB GPU-side**.
  - On Safari ≥ 17, retained ImageBitmaps add about 78 MB (standard) or 183 MB (detail) of CPU-side copies.
  - The detail switch has the transient peak of F4.
  - iPhones have unified memory, so all of it comes from the same RAM.
  - Look-dev's 185 MB / 300 MB is correct **for textures alone** (I get 184.6 / 302.0 MB).
- **Visible effect on the phone:** A tab reload (jetsam) or a context loss, most likely during the detail switch,
  on 3–4 GB iPhones.
- **Confidence:** *Static estimate.* I do not know the thresholds.
- **Smallest mitigations, in order:**
  1. F4: strip the unused maps.
  2. Lower `pixels.mobile` from `2.1e6` to about `1.2e6` at `tunables.js:143`. That is DPR ≈ 2.25 instead of 2.98
     on a 390×600 stage, saving about 15 MB of targets, about 10 MB of canvas and about 40 % of the per-pixel work.
     The ink width is specified in CSS px, so the line weight stays the same.
  3. Product decision: do not offer detail mode on coarse-pointer devices, or warn before switching. On a phone,
     detail adds about 117 MB of textures for 2560² maps on a stage about 1160 device px wide.

### F8. The poster's portrait set is missing: a 404 and a poster flicker on every portrait phone
- **Where:** `viewer.js:10`, `POSTERS.portrait.folder: 'previews-v15p'`, which does not exist in `work/`.
  `updatePoster()` switches `#poster` to it on any stage with width / height < 0.85.
- **What the visitor sees:** The square poster, already fetched from the HTML (156 KB), is replaced by a broken
  request. The `error` handler then switches back. That is one extra round-trip of blank poster at the most visible
  moment.
- **Confidence:** *Measured:* `404 /work/previews-v15p/front.webp` in `load.json` and in the throttled run.
- **Smallest fix:** Set `portrait: null` until the portrait set exists, or deliver the set. This belongs to the lead /
  UI, because the posters are regenerated at the end.

### F9. If the context is never restored, the page says "recovering" forever
- **Where:** `viewer.js:361-369`.
- **What the visitor sees:** The poster, with "3D表示を復旧中。…" and no way forward.
- **Confidence:** *Remembered, low-medium:* WebKit may decline to restore a page that lost its context repeatedly
  or caused a GPU-process reset.
- **Smallest fix:** If no `webglcontextrestored` arrives within about 10 s, change the status to the error message
  and set `data-viewer=error`.

### F10. Smaller costs worth taking (no correctness risk)
- **The redundant frame after every interaction on phones.** `viewer.js:183`: when `!look.paintable` (all touch
  devices), `settle()` calls `renderFull()`, which re-renders a frame identical to the last drag frame (G pass and
  all post passes).
  - Fix: when `!look.paintable`, only `flushWaiters()`.
  - Careful: `renderFast` renders with `full:false`, and `look.render` only lowers `full → lite` on `full` frames.
    Keep one `full` render after load / programmatic jumps (already done through `renderFull`).
- **The star passes are the most expensive post pass on a phone.** `post.js:529-535`: the arm is
  `sparkle.length * pixelRatio / 2`, which is 23 taps per side at DPR 2.98, so 47 taps per half-res pixel, done
  twice, on every drag frame.
  - Fix: run the stars on `downs[1]` (quarter res) with the step in that level's texels. That is 4× fewer pixels and
    half the taps for the same reach.
  - This is a look decision (thinner, softer rays); look-dev should judge it.
- **Helper maps load after the GLB instead of alongside it.** `look.js:163-227`: `prepareModel` starts the
  helper-map fetches only after the 25.8 MB GLB has been downloaded and parsed (measured: GLB ends at 331 ms, helper
  maps start at 568 ms on localhost). That puts 4.1 MB serially on the critical path.
  - Fix: start fetching the manifest's `standard` helper URLs in `look.ready`, keyed by material name, and have
    `prepareModel` await those promises.

---

## 2. Does the automatic tier fallback catch phone-only failures?

| Forced failure (Chromium) | Detected? | Page ends | Evidence |
|---|---|---|---|
| `checkFramebufferStatus` → INCOMPLETE always | yes | `forward`, figure visible, no outline/bloom | `fbo.json/png` |
| compile error, brush pass | yes | `lite`, correct picture | `sh-brush` |
| compile error, star / bloom up | partly | says `lite`, but the broken pass still runs: no stars / glow | `sh-star`, `sh-bloom` |
| compile error, backdrop | partly | `lite`, figure on black | `sh-backdrop` |
| compile error, painted material | **no** | `lite`, "ready", **no figure** | `sh-material` (F5) |
| compile error, final pass | **no** | `lite`, "ready", **blank stage** | `sh-final` (F5) |
| `getExtension` → null for everything, `MAX_DRAW_BUFFERS`/`MAX_COLOR_ATTACHMENTS` → 1 | n/a | `full`, correct | `noext` |
| context lost + restored (normal) | yes | `full` again, **0 requests** after the restore (no re-download) | `lost` |
| context lost, render before the event | wrong | `forward` for good (F6) | `lostrace` |
| context lost during the download | wrong | "ready", empty stage (F3) | `lostmid` |
| model download blocked | yes (robust.cjs) | error + retry | `pipeline/lookdev/robust.cjs` §8 |

Notes:
- In the `noext` run the page asked for `EXT_color_buffer_float`, `EXT_color_buffer_half_float`,
  `OES_texture_float_linear`, `EXT_texture_filter_anisotropic`, `KHR_parallel_shader_compile` and others. That is
  three probing at start-up; nothing depends on them. The page never reads `MAX_DRAW_BUFFERS`. WebGL2 guarantees
  ≥ 4 draw buffers and the page uses 2, so that limit cannot bite.
- Only the G target's completeness is checked (`post.js:499`). The other targets are plain RGBA8 2D textures, which
  are always complete in WebGL2, so I see no need for more checks.
- A program that compiles but computes garbage on Metal (NaN, precision) is not detectable by any of this.

---

## 3. Cost on a phone

### 3.1 Memory (MB = 10⁶ bytes; RGBA8; full mip chain = ×4/3)

Phone case as measured in the emulated iPhone context (390×844 css, DPR 3):
- `coarse: true`, so the brush pass is off.
- Pixel ratio 2.98 (budget-limited).
- Targets 1162×1806 = 2.10 Mpx.

Textures, counted from `gltfinfo.cjs` / the manifest / the code paths that actually load them:

| Texture set (standard mode) | Size | MB |
|---|---|---|
| body paint (`paintsrc_body_2048`, replaces the GLB base colour, `look.js:215`) | 2048² | 22.37 |
| base colour: buckle, clasp, chest, helmet (GLB) | 4 × 1280² | 34.95 |
| emissive: body 2048², buckle 1024², clasp 1024², chest 2048², helmet 1536² | 5 | 68.50 |
| helpers: toonNormal + style, 5 materials | 10 × 1024² | 55.92 |
| matcaps gold + armor | 2 × 512² | 2.80 |
| **standard textures** | | **184.6** |
| detail: base colour 5 × 2560² (body keeps its own: the paint gate `texelsPerUnit < 1500` fails at 2560 → 1540) | | 174.8 |
| detail: emissive, helpers (1024² set, `detailHelpers: 0`), matcaps unchanged | | 127.2 |
| **detail textures** | | **302.0** |

Render targets (`post.js:449-469`):

| Target | Phone, full = lite (brush off) | Notes |
|---|---|---|
| G: 2 × RGBA8 + depth texture | 16.79 + 8.39 = 25.18 | depth `DEPTH_COMPONENT24`; on iOS Metal it is probably stored as Depth32Float (no 24-bit depth on iOS GPUs; remembered, medium), so 4 B/px |
| bloom down, 5 levels (DPR 2.98 → `4 + round(log2(2.98/1.5))` = 5) | 2.80 | 1/2 … 1/32 |
| bloom up, 4 levels | 2.79 | |
| star H + V, half res | 4.20 | |
| tensor A/B + painted | 0 on phones | desktop only: 2 × ¼ + 1 × full res |
| **targets, phone** | **35.0** | forward tier: 0 (targets disposed) |
| desktop full at the 3.2 Mpx budget, for comparison | ≈ 72 | lite ≈ 53 |

Other memory:

| Item | Standard | Detail |
|---|---|---|
| Drawing buffer: colour 8.4 + depth/stencil 8.4–10.5 + 1–2 display buffers (WebKit IOSurface swap; remembered, medium) | 25–36 | 25–36 |
| Geometry (decoded accessors: int16 position, int8 normal, uint16 UV, indices) | 9.9 (317k verts, 525k tris) | 28.3 (816k verts, 1.49 M tris*) |
| Possible ANGLE-Metal vertex conversion (6- and 3-byte strides are not 4-byte aligned; remembered, medium) | +≈4 | +≈10 |
| **GPU-side total** | **≈ 255–270** | **≈ 390–410** |
| CPU-side, Safari ≥ 17 (ImageBitmaps kept by three for re-upload after context loss) | 77.6 | 182.5 |
| CPU-side geometry arrays (three keeps them) | 9.9 | 28.3 |
| Transient during load (Safari ≥ 17): decoded maps that are then dropped | ≈ 72 | ≈ 262 (F4) |

\* The contract says 2.2 M triangles for detail. The index accessors give 1,488,755.

**Where the estimate is soft:**
- WebKit's swap-chain depth.
- Whether ANGLE pads RGB-ish data or converts vertex formats.
- Depth32Float vs 24-bit depth.
- Whether WebKit purges decoded `HTMLImageElement` data (Safari 15–16 path) or keeps it.
- Allocator slack and three's per-object overhead.
- The detail-switch peak depends on GC timing: about old model (≈ 270 GPU + 78 CPU) + new decoded images
  (≈ 445) + geometry. That is **roughly 0.8 GB for a few seconds**, unverified.

### 3.2 Per-frame work on a phone (brush off). Per-pixel counts are at 2.1 Mpx

**Every frame, including drag frames** (`look.js:326-336`):
- **G pass**: 525k triangles into 2 × RGBA8 + depth, plus the backdrop as a full-screen quad.
  - The material samples about 10 textures per fragment: map ×3 (crisp + 2 `textureLod` taps), emissive, toonNormal,
    style, conf (a 1×1 stand-in, still a fetch), matcap ×2. Anisotropy 8 on all of them.
  - Overdraw is unknown.
- **Bloom**:
  - prefilter: ¼ area, 8 taps;
  - 4 downsamples: 5 taps each;
  - 4 upsamples: 9 taps each, on small levels.
  - About 3 fetches per screen pixel in total.
- **Stars**: 2 passes at ¼ area × 47 taps. About **23.5 fetches per screen pixel**: the heaviest post pass on a phone.
- **Final**: full res; colour 1 + depth 10 (figure test, centre, 8 neighbours) + bloom 1 + star 2 = **14 fetches
  per pixel**. The brush branch is skipped because `uPaint = 0`.
- **Full-screen-equivalent passes per frame:** about 2.6 (backdrop + final + ¼-res passes), plus the geometry.

**Only at rest:**
- On phones: nothing new. One redundant identical frame after each interaction (F10).
- On desktop (Mac Safari, also ANGLE-Metal):
  - tensor (¼ res, 8 taps) + 2 blurs (¼ res, 5 taps).
  - The Kuwahara pass at full res. With radius `min(5, 2.4·DPR)` → ellipse axes up to 2× radius, the dynamic loops
    run up to (2·⌊2r⌋+1)², i.e. up to 361 iterations per pixel at DPR 2. Each iteration does 1 fetch and about 60
    ALU ops for the 8 sector weights.
  - Then about 15 re-runs of the final pass for the 240 ms cross-fade.
  - The Kuwahara pass is by far the heaviest shader in the project. It only runs once per rest, but on an Intel-GPU
    Mac it may take 100+ ms (unmeasured).

---

## 4. Loading (Playwright request log, `probe.cjs load`, emulated iPhone, Safari 17 UA, local server)

Standard mode, everything fetched up to the settled first frame. **31.13 MB in 41 requests**, in this order:

1. `index.html` 4.3 KB → `viewer.css` 23.6 KB (render-blocking, the only blocker of first paint) → poster
   `previews-v15/front.webp` 156 KB (`fetchpriority=high`) → `viewer.js` 17.7 KB, `ui.js`.
2. Module graph, 3 levels deep: three.module.min 339 KB + three.core.min 381 KB + GLTFLoader 115 KB + OrbitControls
   39 KB + BufferGeometryUtils 36 KB + meshopt 29 KB + look/*.js 68 KB. About 1.0 MB uncompressed; Vercel compresses
   JS. This delays the GLB request by three dependent round trips. `<link rel="modulepreload">` for `three.core.min.js`
   and the addons would remove two of them (minor).
3. In parallel: `lightrig.json`, `manifest.json`, matcaps gold + armor (21 KB), and the 404
   `previews-v15p/front.webp` (F8).
4. **`standard-v14.glb` 25.82 MB (83 % of the total)**. 13.56 MB of it is never shown (F4). The progress bar covers
   only this file and the GLTF assets, not the helper maps.
5. After the GLB is parsed: the helper maps, 4.07 MB (body paint 0.96 MB, toonNormal ×5, style ×5) (F10).
6. First frame: about 10 program compiles (ANGLE-Metal compiles MSL on first use), 15 texture uploads with mip
   generation and the geometry upload, all in one frame. Expect a one-time stall on the phone; its length is unknown.

Fetched but never used: 13.56 MB inside the GLB (F4), the 404 poster (F8). Not fetched (good): `crystal.webp`,
`mask_*`, `lines_*`, `conf_*`, `paint_*` (repaired) and the `paintsrc` copies for buckle, clasp and helmet (their
texel density is above the gate).

**Switching to detail adds 61.97 MB in 22 requests:** `.gltf` 21.5 KB, `.bin` 9.03 MB, 5 base colours 8.35 MB,
5 emissives 6.66 MB, **10 normal + metallic-roughness maps 37.91 MB (never used)**. The helper maps are not fetched
again (same URLs). With the F4 fix: **24.06 MB in 12 requests**, and the picture is identical.

Cache: `vercel.json` marks all of `/model-vNN/**` `immutable` for a year. That includes `model-v15/manifest.json`
and `lines.json`, which other agents still edit. A later change to those files under the same name will not reach
returning visitors. This is a deploy note, not a Safari one.

---

## 5. Checked and found fine

- **Precision.**
  - three r180 prefixes every ShaderMaterial (GLSL1-style and GLSL3) with `precision highp float/int/sampler2D…`
    (`WebGLProgram.generatePrecision`). iPhones report highp fragment support, so `capabilities.precision` is
    `highp`. Depth linearisation (`post.js:285-288`), the 1e-10 / 1e-24 epsilons, the hashes on `gl_FragCoord` and
    sparkle cells, and the texel maths all run in fp32. I found no explicit `mediump` anywhere.
  - `normalMatrix` is declared in both stages (`material.js:38`) with matching precision, so there is no link-time
    precision mismatch. This would become a real iOS link error if anyone forced `precision: 'mediump'` on the
    renderer; so would underflow of the 1e-24 / 1e-10 constants.
- **GLSL ES 3.00 constructs.**
  - All shaders compile as `#version 300 es`.
  - Dynamic loops are bounded: stars `n ≤ 48` from a uniform; Kuwahara `≤ 21×21`, desktop only.
  - Local arrays are indexed only in constant-trip loops.
  - No sampler or uniform arrays, no `texelFetch`, one `textureSize`, no integer bit operations, no `discard`.
  - Derivatives (`fwidth`, `dFdx/dFdy`) are taken in uniform control flow. Implicit-LOD texture reads inside
    branches are only in uniform branches (`uHasToonNormal`, `uRepair`, `uPaint`). The non-uniform branches
    (`lit > 0.5`, the Kuwahara ellipse test) use `textureLod` or no textures at all.
- **MRT.**
  - `count: 2`, both RGBA8, plus a depth texture.
  - Both programs drawn into it (backdrop, painted material) write `location 0` and `location 1`, and `renderer.clear`
    clears both attachments.
  - Neither pass blends; the bloom/star/final passes draw into single-attachment targets.
  - The forward tier draws the 2-output material into the default framebuffer, where `location 1` is legally ignored.
- **Depth texture.** `UnsignedIntType` → `DEPTH_COMPONENT24`, `NearestFilter`, no compare mode. It is sampled only
  by the final pass while drawing to the canvas.
- **Feedback loops.** I checked every pass's read/write pair and found none: tensor A→B→A, the bloom chain reads
  other levels, and the G target is never bound for sampling while attached.
- **Formats.** No float or half-float anywhere (`post.js:356-367`; `noext` run renders `full` with every extension
  missing). Every render target has `generateMipmaps: false`.
- **Colour space.**
  - Targets are `NoColorSpace` RGBA8.
  - The material converts to display values itself (`toDisplay`), and ShaderMaterials do not include
    `colorspace_fragment`, so `outputColorSpace = SRGB` cannot double-encode.
  - Data maps are `NoColorSpace`, so three uploads them with `UNPACK_COLORSPACE_CONVERSION_WEBGL = NONE`, which is
    exact. Colour maps are `SRGB8_ALPHA8`.
- **Canvas and textures.**
  - `antialias:false` and no `samples`, so there is no MSAA and no resolve. `alpha:false`; the final pass writes
    alpha 1.
  - Textures are mipmapped, which the `textureLod` blur needs. NPOT with mips and REPEAT is legal in WebGL2.
  - `flipY`: glTF textures `false`, which the ImageBitmap path (Safari ≥ 17) ignores harmlessly. Helper maps
    `false` (HTMLImage path, every browser). Matcaps `true`, the same everywhere.
  - WebP: iOS 14+. Largest texture 2560², well under iOS's 4096+.
- **Wasm.** The meshopt decoder uses SIMD only where `WebAssembly.validate` accepts it (Safari 16.4+) and falls back
  otherwise.
- **Pixel ratio and layout.**
  - `devicePixelRatio` 3 is already capped by the 2.1 Mpx budget, giving 2.98 in a 390×600 stage. That is far below
    WebKit's drawing-buffer limits.
  - The stage uses `100svh` (`viewer.css:83-86`), so iOS toolbar show/hide does not resize the canvas and reallocate
    the targets on iOS 15.4+. Older versions fall back to `vh`.
- **Context loss and restore, ordinary case.** It recovers to the same tier. No network requests after the restore:
  three keeps the images and geometry arrays and re-uploads them. The "delete: object does not belong to this
  context" warnings come from `pipeline.reset()` disposing old handles after the restore, and are harmless.
- **The other tier fallbacks.** FBO-incomplete → forward works, and so does brush failure → lite.
- **JavaScript.** Nothing newer than Safari 15 in the shipped JS apart from import maps (F1).

## 6. What cannot be known without a device

- Whether ANGLE-Metal on iOS 15–18 compiles these shaders without error, and how long the first-use compile stalls.
- Metal fast-math / NaN behaviour. Possible spots: `normalize(vec3(v.z, 0, -v.x))` in `matcapUv` when the view
  direction is exactly vertical, and zero int8 normals. Either could show as isolated black pixels.
- Real memory: the swap-chain count, depth storage, vertex conversion, ImageBitmap retention, the jetsam limit per
  iPhone model, and whether the detail switch survives on 3–4 GB devices.
- When iOS drops a backgrounded tab's context, and whether `webglcontextrestored` is fired.
- Frame time and thermal behaviour of the G pass + star + final at 2.1 Mpx while dragging, and of the Kuwahara pass
  on Mac Safari.
- Real cellular throughput, and whether Vercel compresses the GLB, which affects `content-length` and so the progress
  bar.
- Touch-gesture feel (OrbitControls) and Safari's `:active` behaviour (`ui.js`).

## 7. Reproduce

All scripts are in `SP/pipeline/safari/`; outputs are in `SP/shots/safari-01/`. The server is
`http://localhost:8765/work/`. Chromium is launched with
`--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader --ignore-gpu-blocklist`.

```
cd $SP
export NODE_PATH=/opt/node-tools/node_modules
node pipeline/safari/gltfinfo.cjs work/model-v10/standard-v14.glb      # texture / material list
node pipeline/safari/geominfo.cjs work/model-v10/detail-v14.gltf       # vertex / index bytes
node pipeline/safari/probe.cjs load                                    # request log + detail switch → load.json
node pipeline/safari/probe.cjs fbo noext sh-material sh-final sh-backdrop sh-brush sh-star sh-bloom
node pipeline/safari/probe.cjs lost lostrace lostmid
node pipeline/safari/nomap.cjs                                         # F1
node pipeline/safari/slow.cjs 4                                        # F2 (about 50 s)
node pipeline/safari/strip.cjs                                         # F4: bytes + pixel diff, JSON surgery
node pipeline/safari/plugin.cjs                                        # F4: the proposed plugin, pixel diff
```

Caveats on the measurements:
- Byte counts come from Playwright's `request.sizes()`. In one run (the unstripped half of `strip.cjs`) they
  under-counted, so the detail totals above are checked against file sizes on disk; they agree with `load.json` to
  the byte.
- The blob-request counter in `plugin.cjs` is unreliable (it read 0 in the patched run, although the textures
  loaded). Only its pixel comparison is used.
