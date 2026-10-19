# Rexonance: broad firestorm → firebrands → nanomachine assembly

This supersedes the individual body-root flames of `c2b9716`. It changes both
the entry call and the scroll-driven assembly, not the separate Ciel easter egg.

## Visible contract

The opening quietly kindles for 280 ms, flashes over by 420 ms, envelops the
entire figure in a broad asymmetric plume, and sheds burning fragments into
the air. Machines materialize from those same fragments and feed coherent
surface currents. Nearby grains merge into carriers, unfold as keyed cells,
form local laminae and seat against the actual armour. The scroll scene uses
the same normalized ignition contract and reproducible body-space sources.

The plume extends beyond the human silhouette; its boundary moves as well as
its texture. Extinction reduces density without reversing the ignition front
as a hard elliptical wipe. Entry canvases share one pixel-aligned, padded box
on fine and coarse pointers so the broad plume is not cut flat at the soles.

The original fit/sound clocks, final artwork, completed driver, unlit visor,
stationary reactor disc, independent rotating coil, feet-up gold guideways,
and separate ornament art remain intact. Reverse scroll uses closed-form
poses rather than an accumulated simulation.

## Rendering and resources

- The existing Cycles-rendered 32-frame green-fire atlas is reused; this change
  does **not** claim a new Blender fluid simulation or render.
- Three retained 288 × 528 canvases compose advected density, rendered-volume
  detail and a softly warped broad plume mask. No per-frame image readback,
  filter creation, canvas creation or new network dependency is introduced.
- Firebrand painting shares the same atlas/fallback and is charged against
  each nanite engine's existing draw budget. Typed data is prepared before
  animation; touch tiers retain their bounded particle/armour work.
- Missing assets retain the procedural fallback. Reduced motion/economy
  preserve the finished still rather than forcing this animation.

## Verification evidence

`scripts/rexonance-ignition.test.mjs` checks the quiet/flash/handoff envelope
and source points against the real undersuit alpha. The runtime VM suites
cover firebrand-to-machine continuity, flight boundaries, exact seating,
reverse reproducibility, working-buffer reuse and draw ceilings.

`scripts/verify-rexonance-flame.mjs` captures the actual entry and scroll
compositions. It measures a single connected green component reaching all
eleven body regions, meaningful fire outside the body, and the rise from
quiet ignition to flash-over. It also checks reverse scrolling, extinction,
repeat visits, asset reuse, hidden-page suspension and JavaScript errors.
Expensive screenshot analysis runs after the entry capture, so its real-time
handover is not mistaken for a renderer failure while the CSS meter is paused.

Browser emulation is not physical iPhone/iPad or standalone-PWA verification.
The owner performs those physical-device checks. Local build identity, pushed
commit, deployment state, canonical release identity and public browser QA
must be recorded separately when releasing this candidate.

### Local acceptance

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
