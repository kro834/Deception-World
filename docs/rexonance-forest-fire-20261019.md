# Rexonance forest fire — 2026-10-19

## Scope and visual contract

Upgrade the green fire in both the entry-call assembly and the scrolling ZENITH
assembly. Preserve the owner's forest-green colour, whole-body/head/feet/floor
coverage, slow ignition and extinction, exact final artwork, stationary reactor
disc and separately rotating coil. This is not a redesign of the armour or the
site opening.

The reference build is `020e510c21e94aaee0b5fbb411a514821976f604`. Work is isolated
from the owner's dirty primary checkout. No gallery/database writes are part of
this change.

## Rendering and delivery

`scripts/blender/rexonance_flame.py` builds real closed three-dimensional volumes
and renders their heterogeneous density/emission in Blender Cycles. It is a
procedural fire effect, not a claim of a baked fluid simulation, browser
ray tracing, MetalFX, or a new WebGL engine. The reproducible source, render
settings and delivered asset hash are retained alongside the packed atlas.

The runtime uses a transparent animated atlas, with bounded shared decoding,
time interpolation, body-contour placement and overlapping near-surface fire.
The final artwork and fixed reactor/separately rotating coil are unchanged.
The owner's later full-body direction intentionally lets near-surface fire pass
in front of the unfinished face, chest and limbs as well as the contour. A lightweight
procedural fallback covers unavailable or failed image decoding. Reduced-motion,
economy and hidden-page paths must not introduce a new fire-atlas download.

The final atlas has 32 frames (8 × 4, each 128 × 256) and weighs 434,422 bytes.
Its decoded RGBA footprint is 4 MiB, retained once across return visits. Cycles
CPU rendered eight volumes/4,704 vertices at 64 samples and 256 × 512 pixels
per frame, before Lanczos downsampling. A separately rendered closing frame
matches the first frame exactly (zero differing RGBA channels). The packer
feathers only the root alpha from source y=228 to y=248, avoiding rectangular
cutoffs while keeping the physical contact at `[64,248]`.

Reproduce with a compatible Blender executable, then check the packed result:

```sh
/path/to/Blender -b --factory-startup -P scripts/blender/rexonance_flame.py -- \
  output/playwright/flame-production --frames 32 --samples 64 --scale 2 --render-loop-check
node scripts/build-rexonance-flame.mjs
node scripts/build-rexonance-flame.mjs --check
```

The atlas SHA-256 is
`db523fd82776d2aedfb3d8ce13730cb9ee422c3f584a8efefee163a846db70f4`.
The manifest also records source-script hashes and every intermediate render's
hash. Production verification hashes both the atlas and manifest, and rejects
unknown paths or suffixes before requesting them.

## Original forest-fire release verification

The local evidence is kept under `output/playwright/`; these generated screenshots,
intermediate PNGs and Blender scene are not production assets. Compare the same
assembly progress in the reference and candidate, including ignition, maximum
burn and extinction, in both engines. Browser emulation is not physical iPad or
iPhone verification; those checks remain with the owner.

Local source/build checks on `e227a0f301070192b6f50cfa25d2c108f7495862`:

- `npm test`: 2,539 discovered, 2,534 passed, zero failed, five skipped.
- `npm run typecheck`, `npx vite build`: passed. No database migration was run
  during local builds.
- `npm run lint`: zero errors, 12 warnings in pre-existing unrelated files.
- `node scripts/sync-source-parts.mjs --check`: all 15 source groups agree.
- `node scripts/build-rexonance-flame.mjs --check`: dimensions, 500 kB transfer
  budget, hashes, reproducible sources and independently rendered loop agree.
- `verify-rexonance-operability.mjs`: all eight Chromium profiles passed,
  including coarse-pointer drag/scroll, tab focus, anchor positioning,
  orientation, reduced motion and forced colours. Run against the same runtime
  before its final root-alpha feathering; no input/layout code changed afterward.

The initial candidate was rejected after the real composition made the volume
too dark. The second iteration uses controlled additive back/core emission,
wider fire tongues, a restrained screen-composited front layer and a final
root-alpha feather. This is a visual correction, not an assertion of greater
device frame rate. At peak strength the engine uses 64 tongues (52 with a coarse
pointer), each sampling at most two atlas frames, rather than the previous 570
radial blobs; actual frame costs depend on the rest of the assembly.

`verify-rexonance-flame.mjs` passed all nine final browser cases:

| Engine   | Viewports / cases                                           | Result   |
| -------- | ----------------------------------------------------------- | -------- |
| Chromium | 1440px desktop, 320px touch/DPR3, 1024px touch/DPR2; normal | 3 passed |
| Chromium | Desktop and 320px; atlas blocked and reduced motion         | 4 passed |
| WebKit   | 320px touch/DPR3 and 1024px touch/DPR2; normal              | 2 passed |

The probe recorded real atlas draws in **both** engines, all 32 source frames,
one initial request and zero repeat requests. Missing-atlas cases actually drew
the cached procedural fallback in both engines. Reduced motion requested no
flame atlas and kept its finished still without a tall scroll trap. Normal cases
had no JavaScript errors or horizontal overflow, stopped drawing under synthetic
visibility hiding, and resumed afterward. Synthetic visibility is not genuine
device backgrounding or PWA testing.

The frame audit first waits for the real entry engine's initial decision before
seeking its CSS meter. An earlier audit sought to 600 ms immediately after DOM
attachment, before WebKit's React effect/next rAF could start; that artificial
seek crossed the existing 420 ms start deadline and produced a false DOM
fallback. Independent **unmodified natural-clock** first calls confirmed Canvas
startup at 97 ms in the candidate and 52 ms in the baseline, with real green fire
in both. The corrected audit asserts actual first-call atlas draws and green
pixels; repeat-call success alone is insufficient.

The Chromium runs on this Mac measured an entry-frame median of 16.7 ms and
p95 of 16.7–16.8 ms, but occasional entry frames reached 50–83.4 ms. The scroll
canvas draw CPU p95 was 2.9 ms on desktop and 3.7 ms in the two touch emulations.
These are instrumented, warmed browser measurements, not physical-device
performance guarantees. The atlas is fetched locally as 434,422 encoded bytes
(434,722 including reported transfer overhead). The startup byte-budget check
also passed; byte size is not elapsed loading time.

Evidence directories:

- `output/playwright/rexonance-flame-v3/chromium-normal/`
- `output/playwright/rexonance-flame-v3/chromium-fallback/`
- `output/playwright/rexonance-flame-v3/webkit-normal-guarded/`
- `output/playwright/rexonance-flame-v3/webkit-natural/`

The superseded `webkit-normal/` folder is retained only for the artificial-seek
audit described above, not as first-call visual acceptance evidence. The final
guarded WebKit runs naturally selected the Canvas engine at 35 ms (320px) and
150 ms (1024px), before exact-clock captures confirmed atlas draws and green
pixels in the first three ignition/maximum/extinction shots.

Publication uses the existing **Deploy verified main to Production** workflow,
with its staged-candidate, exact SHA, asset hash and public-readiness checks.
The release receipt must compare the deployed `/release-identity.json` with the
published commit and the atlas/manifest hashes; a push alone is not completion.

Public receipt completed for `65076cc6fbcc68048714a194abaddfaab95849b0`:
the canonical domain returned that exact identity (HTTP 200), the atlas was
434,422 bytes with SHA-256
`db523fd82776d2aedfb3d8ce13730cb9ee422c3f584a8efefee163a846db70f4`,
and the manifest hash matched. Vercel's production deployment was READY for
that commit. Public Chromium 320px and WebKit 1024px flows both passed first-call
fire, scrolling, all 32 atlas frames, single first fetch / no repeat fetch,
visibility recovery and zero JavaScript errors. Receipts:
`output/playwright/flame-public/{identity-probe.json,chromium/report.json,webkit/report.json}`.

## Full-body burn revision

The owner clarified that green fire should spread over and burn the entire
undersuit before subsiding. The previous front layer intentionally avoided the
face and sternum and used only eight outer wisps. The shared renderer now uses
twenty near-surface roots (sixteen on coarse pointers), crossing the head,
chest, abdomen, waist and both upper/lower arms, thighs, shins and feet. Their
upward turbulent volumes overlap through the torso, rather than merely glowing
behind the silhouette. Both entry-call and scrolling assembly already use
these shared back/front passes, so they receive the same coverage without a
second timeline or new render loop. Existing slow ignition/extinction envelopes
still bring the fire to zero and reveal the original finished figure.

This redistributes the existing draw budget: back roots decrease to thirteen
pairs (nine on coarse pointers). Including the actual contact-light canvases,
the maximum remains 126 / 102 image draws, below the existing 128 / 104 limits.
The delivered Blender atlas, source scripts, manifest, transfer/decode size and
single-fetch policy are unchanged. The body-part coverage and deterministic
reverse-scrubbing checks are in `scripts/rexonance-flame.test.mjs`; visual
acceptance must additionally sample the same peak frame in both real engines,
not merely count green pixels somewhere in a whole canvas.

An initial full-body layout was rejected: screen blending over the bright
silver/blue undersuit left only thin green lines, and the actual screenshot's
shin regions contained no green flame. Counting the transparent entry flight
canvas by itself overstated the result because the DOM undersuit and settled
plates had not yet been composited. The acceptance script now samples the
real screenshot, using independently retained viewport/figure geometry.

The corrected front layer keeps the Blender volume's absorption with
source-over blending, denser alpha and wider overlapping tongues. Roots are
below the visible body patches; shins and feet follow the undersuit's wider
stance, and thigh fire reaches upward into the hips. Its size/strength still
follows the existing slow envelope. No full-body flat-colour sheet, new image
download or extra render loop was added. Source/volume bounds and real PNG
coverage are complementary checks; reproducing a particular root array alone
is not evidence that the final body visibly burns.

The accepted v2 reports are under `output/playwright/rexonance-flame-body-v2/`:
Chromium desktop, Chromium 320px and WebKit 1024px all pass the unchanged 5%
minimum green-pixel requirement across all eleven inner-body regions in one
peak screenshot per engine. On desktop, every near-peak entry sample has a
minimum of 25.61–28.87% and scroll samples have 24.83–28.23%. The touch profiles
are more affected by the existing plate/emission progression: accepted peak
entry samples are 6.28% / 6.13%, and scroll .14 samples are 7.95% / 8.41%.
These ratios quantify the selected frames, not continuous coverage throughout
ignition and extinction or physical-device image quality.

All three normal runs also confirm zero new fire draws at entry 2600ms and
scroll .34 / .92 / .99, with a clear final figure. They retain one atlas request,
no repeat request, hidden-page draw suspension and zero JavaScript errors.
Chromium 320px additionally passes blocked-atlas procedural fallback in both
engines and reduced motion without a fire download or tall scroll trap. The
earlier `rexonance-flame-body/chromium-normal` report is a rejected diagnostic,
not acceptance evidence. The shared renderer's 25 unit tests pass, including
real body-point bounds, context-state restoration, reverse-clock determinism
and the unchanged 128 / 104 image-draw budgets with contact lights included.
