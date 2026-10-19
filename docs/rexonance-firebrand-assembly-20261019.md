# Rexonance: fire vortex → explosive clearing → nanomachine assembly

This extends the vortex of `104e2bd`, which superseded the individual body-root
flames of `c2b9716` and broad firestorm of `e427350`. It changes both the entry
call and scroll-driven assembly, not the separate Ciel easter egg.

## Visible contract

The opening quietly kindles for 280 ms and winds into a broad rolling vortex
around the entire figure for an extra second. It bursts outward over
1,420–1,560 ms and clears before the first nanomachines appear at 1,600 ms.
Metal does not coexist with the intact vortex. Machines materialize from
airborne fragments, expand through a 2.25-turn helix with depth, then contract
into shared helical surface currents. Nearby grains merge into carriers, unfold as keyed cells,
form local laminae and seat against the actual armour. The scroll scene uses
the same normalized ignition contract and reproducible body-space sources.

The fire extends beyond the human silhouette, with winding front/back streams,
openings and complex curling edges rather than a green silhouette or a static
flame-shaped mask. Its breakup follows the shared phase, not frame history.
Entry canvases share one pixel-aligned, padded box
on fine and coarse pointers so the broad plume is not cut flat at the soles.

The authored fit ordering, final artwork, completed driver, unlit visor,
stationary reactor disc, independent rotating coil, feet-up gold guideways,
and separate ornament art remain intact. A pure invertible entry clock stretches
canonical 280–420 ms into elapsed 280–1,420 ms. Later events shift by 1,000 ms
without compressing material formation: the first boot still grows over
canonical 660–710 ms (elapsed 1,660–1,710 ms). Flame texture motion follows real
elapsed time rather than slowing or freezing with the choreography. DOM
fallback, call labels, reticles and the full entry cover (3,730 ms) share the
same mapping. Light/reduced entry timing remains unchanged.
Metal emergence and its first guideway begin only after the fire clears.
The same absence-before-materialization rule applies to canvas and DOM/SVG
fallbacks. Reverse scroll uses closed-form
poses rather than an accumulated simulation.
Scroll retains its canonical progress and exact docks, with a longer animated
runway (desktop 2,400 px/420 svh minimum; touch 1,950 px/360 svh minimum).
Thus the vortex and material current get more scroll travel without changing
the single-screen reduced/economy/constrained fallback.

## Rendering and resources

- The existing Cycles-rendered 32-frame green-fire atlas is reused; this change
  does **not** claim a new Blender fluid simulation or render.
- Three retained 384 × 624 canvases compose low-density turbulent flow,
  depth-separated rendered fire volumes and curling vortex geometry. The
  original body registration is unchanged; 48 px of transparent padding on
  each side prevents the fire from being cut at its preparation boundary.
  RGBA surface storage is 2,875,392 bytes, 1,050,624 bytes more than the
  previous three surfaces. No per-frame image readback, filter creation,
  canvas creation or new network dependency is introduced.
- Firebrand painting shares the same atlas/fallback and is charged against
  each nanite engine's existing draw budget. Typed data is prepared before
  animation; touch tiers retain their bounded particle/armour work.
- Nanite spirals are closed-form trajectories, not independent decorative
  hoops. Their radius grows from the exact firebrand endpoint, winds with
  changing depth, then contracts into the existing docking current. Fine
  entry filaments sample eight intervals of those real trajectories; touch
  keeps its existing lower-work path. No particle count or sprite cap grows.
- Immutable endpoints, birth radii and per-cell flight times are prepared in
  retained Float64 buffers (16 bytes per art cell plus 48 bytes per swarm
  chip). The crown-width lookup adds 392 bytes. This trades bounded retained
  storage for less repeated per-frame calculation; no rounding is introduced.
- Missing assets retain the procedural fallback. Reduced motion/economy
  preserve the finished still rather than forcing this animation.

## Verification evidence

`scripts/rexonance-ignition.test.mjs` checks the quiet/flash/handoff envelope
and source points against the real undersuit alpha. The runtime VM suites
cover firebrand-to-machine continuity, flight boundaries, exact seating,
reverse reproducibility, working-buffer reuse and draw ceilings.

`scripts/verify-rexonance-flame.mjs` captures the actual entry and scroll
compositions. It measures real fire around both outer sides of six body
heights, a clear centre before materialization, and the rise from quiet
ignition into the vortex. The earlier inner-body connected-component
measurements remain diagnostics, not a requirement to fill a hollow vortex
with a green human stencil. It also checks reverse scrolling, extinction,
repeat visits, asset reuse, hidden-page suspension and JavaScript errors.
Expensive screenshot analysis runs after the entry capture, so its real-time
handover is not mistaken for a renderer failure while the CSS meter is paused.

Browser emulation is not physical iPhone/iPad or standalone-PWA verification.
The owner performs those physical-device checks. Local build identity, pushed
commit, deployment state, canonical release identity and public browser QA
must be recorded separately when releasing this candidate.

### Extended vortex and orbital material acceptance (2026-10-19)

- Full repository checks: 2,620 tests, 2,615 passed, no failures and five
  existing skips. Typecheck, production build and 15 source groups passed;
  lint has no errors and retains 12 pre-existing warnings.
- Entry verification now samples 13 real elapsed times, including 900 and
  1,250 ms with positive native atlas draws in both intervals. The first
  metal remains absent through 1,590 ms and appears at 1,600 ms; full
  extinction is checked at 3,600 ms. The actual canonical clock is recorded
  separately, so delaying everything cannot masquerade as longer fire.
- Direct geometry tests require more than two turns, substantial radius,
  changing depth, contraction and exact reverse poses in both material
  engines. Existing firebrand handoff, current-to-flight continuity and
  exact armour docking tests remain in place.
- Chrome desktop normal and Chrome 320 px/WebKit 1024 px normal, blocked
  atlas and reduced-motion paths passed, with zero JavaScript errors.
  Evidence lives under `rexonance-orbital-v2/desktop`,
  `rexonance-orbital-v3/webkit1024` and `rexonance-orbital-v4/phone320`
  in `output/playwright/`. The last optimization changes no drawing output
  (the dense trace below covers both fine and touch paths).
- An independent initial visit uses the real World menu with no init
  script, clock seeking, animation pause or prototype wrappers. Its entry
  naturally lasted 3,837.4 ms before navigation; destination cover release,
  zero console/page errors and screenshots/video were verified. Natural
  screenshot bounds are recorded rather than called exact phase samples.
- The allocation sampler now waits for the actual entry to detach instead
  of cutting off at the old fixed 3,200 ms. Its rich/classic classification
  and acceptance ceiling are unchanged. Final optimized measurement passed
  at 23.68 MB rich extras versus 23.94 MB classic engine. The 0.26 MB margin
  is one cumulative sampled-JS result, not repeated-run stability, peak RAM
  or a physical-device FPS guarantee. Earlier failed candidates remain in
  the local evidence, and no unchanged candidate was retried for a pass.
- Precomputation preserves every traced canvas argument/state operation at
  5 ms intervals from canonical 0 to 2,700 ms: 3,160,172 fine-pointer and
  1,732,683 touch operations across 541 frames each. Paths, transforms,
  sprite arguments, alpha/style assignments and draw counts match exactly,
  including negative zero. The 49 crown factors are likewise cached in
  Float64 without changing their expression or precision.

### Previous vortex acceptance (104e2bd)

- Full repository checks: 2,616 tests, 2,611 passed, no failures, five existing
  skips. Typecheck, production build and all 15 source-sync groups passed;
  lint retains 12 existing warnings and has no errors.
- The current native-canvas verifier follows fetched Blob/ImageBitmap kit
  images and invalidates derived provenance on full clear, reset and resize.
  It waits for the live scroll canvas before reading that canvas's last
  painted frame. Both a positive material frame and a real painted
  pre-material frame are required; a loading canvas or a cumulative count
  from an earlier reverse-scroll position cannot pass as absence evidence.
- Final v6 Chrome desktop normal, Chrome 320 px/DPR3/touch and WebKit
  1024 × 768/DPR2/touch passed. Both touch profiles passed normal,
  blocked-atlas and reduced-motion cases. Each animated case completes
  all 11 exact entry clocks and 23 forward/reverse scroll samples, final
  extinction, hidden-page suspension/resumption and repeat-visit checks.
  Normal visits fetch the atlas once without a repeat fetch; reduced
  motion fetches none. Blocked-atlas retry remains subject to its existing
  30-second cooldown. JavaScript errors are zero in all seven cases.
  Reports and actual PNGs: `output/playwright/rexonance-vortex-v6/`.
- An independent, uninstrumented initial desktop visit completed the real
  menu-to-entry-to-page flow without JavaScript errors. Its screenshots/video
  are natural-time observations, not substitutes for exact-phase assertions.
- The unchanged sampled-allocation gate passed for the final v6 renderer:
  rich extras 24.47 MB versus classic engine 24.67 MB. This is one cumulative
  JS-heap sample with a small 0.20 MB margin, not proof of repeatability, peak
  memory, literal zero allocation or physical-device frame rate. Earlier
  failed measurements are retained under
  `output/playwright/rexonance-vortex-allocation/`.
- Allocation optimizations preserve all prepared density RGBA bytes (SHA-256
  `ec156b05e9d196df405dcc8e8fe49c27922d4f0601b0b5ac8a5cbb3d89904034`).
  Entry sprite tracing at every 5 ms from 0 to 2,600 ms also preserves every
  draw argument, alpha and order: 567,272 fine-pointer and 20,021 touch calls.
  No particle count, rendering budget, armour pose or quality threshold was
  reduced to obtain the allocation result.

### Previous broad-firestorm acceptance (e427350)

- Full repository gates after preserving concurrent `be97325` (Explom) and
  `32017bd` (Ciel) main updates: 2,605 passed, 5 existing skipped; typecheck and
  15-group source synchronization passed. Lint has no errors and retains
  12 pre-existing warnings.
- Chrome 320px/DPR3/touch and WebKit 1024×768/DPR2/touch passed normal,
  missing-atlas and reduced-motion cases. See
  `output/playwright/rexonance-firebrands-v3/`. The early 15-shot WebKit
  diagnostic exceeded the real entry handover while its CSS meter was
  paused; mandatory 11-shot acceptance now checks every actual clock and
  defers expensive pixel analysis until after capture. Detail shots remain
  optional. Failed diagnostics are retained rather than called acceptance.
- A separate natural-first Chrome desktop visit used the real menu with
  no clock seeking/pausing. It selected the rich painter, completed the
  visual sequence and navigation, and left no entry canvas or JS error.
- Eight operability profiles passed keyboard, lens registration, selectors,
  anchors and orientation checks; the final silhouette-mask refinement
  changes no input/layout behavior.
- Heap sampling initially failed the existing allocation gate (rich extras
  27.44 MB versus classic engine 24.12 MB). Native Canvas argument boxing
  in new fusion facets and small hardware wires was traced and reduced by
  rounding only those tiny lines to backing pixels (≤0.5 backing pixel).
  Receiver mating geometry, real artwork, poses and transforms are unchanged.
  The same unmodified gate then passed twice: 23.89 ≤ 24.46 MB and
  23.71 ≤ 24.19 MB. These are cumulative sampled JS allocations over the
  call on this Mac, not peak RAM, a device FPS guarantee or literal zero
  allocation. See the local `allocation-fix.md` receipt in that evidence
  folder. Exact seating/continuity and the 22 entry runtime tests still pass.
