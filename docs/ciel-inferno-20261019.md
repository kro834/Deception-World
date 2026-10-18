# Ciel / Emerald Inferno — 2026-10-19

## Interaction and boundaries

The existing Ciel (formerly Zeus) floating navigation button accepts a deliberate
burst of ten taps: no gap above 550 ms and no total burst above 4,000 ms. Only the
tenth accepted tap activates the secret. A hold above 380 ms, movement beyond
9 px, cancellation, scrolling during a press, another finger, losing capture,
blur, hiding or Escape abandons that pending press. Keyboard activation also
works; held-key autorepeat is not ten activations. The existing single-tap
navigation and long-press movement remain in place.

The supplied dragon illustration grows from the button, breathes a directional
green pressure jet, and a turbulent burn front covers the viewport. Embers turn
to ash/charcoal and the original view returns automatically after 9.2 seconds.
The native modal always offers 「演出を終了」 and Escape. The page is only visually
covered: no page content, gallery posts, personal settings or storage is burned,
deleted, captured or rewritten. There is no sound or repeated white strobe.

The renderer, its stylesheet and illustration remain unloaded on startup and
ordinary first/second taps. A third quick tap primes the lazy module and compact
illustration. The jet loads only when the effect mounts. A pending module has a
12-second outer deadline and the changed button/Escape can cancel it. The effect
has its own 9.8-second resource cap and a bounded stylesheet timeout. Failed
images use procedural pressure ribbons; failed/unavailable WebGL uses Canvas2D.

Reduced motion, economy, forced colours and constrained-network preferences use
a 1.9-second calm presentation without WebGL or jet downloads. No setting is
changed to force the effect. Pixel count, DPR and render cadence are capped and
resolution reduces further after sustained slow frames. This is browser graphics,
not MetalFX, ray tracing or a physical-device performance guarantee.

## Owner illustration and actual Blender production

`design/ciel-inferno-reference-20261019.png` preserves the supplied square artwork
pixel-for-pixel after orientation, with private metadata removed. It is not AI
redrawn. Responsive WebP derivatives are 216/720/1080 pixels, quality 90, with
individual transfer budgets and SHA-256 attestation in `artwork-manifest.json`.
Their encoded sizes are 29,478 / 216,476 / 391,368 bytes. Both check mode and
independent in-memory regeneration confirm the delivered files.

`scripts/blender/ciel_inferno_jet.py` was run in actual headless Blender 5.2.0 LTS
(`fbe6228777e7`), Cycles CPU, 64 samples. Eight closed, outward-facing 3D volume
meshes (5,824 vertices) combine heterogeneous turbulent density, absorption,
green emission and separate white-green pressure cores. Independent inspection
of the saved scene confirmed positive signed volumes and closed manifolds.

`scripts/build-ciel-inferno-jet.mjs` packs 32 rendered frames into a transparent
2048×512 WebP atlas, 8×4 tiles of 256×128, 16 fps / 2-second cycle. The inlet is
anchored at [8,64] and points right before runtime projection from the drawing's
mouth at normalized [.54,.44]. The 317,264-byte atlas is below its 600,000-byte
budget; SHA-256 is
`f7b0865fcc202d97abdb61b4001c691408339584587396d1c6a7b259a047115e`.
Frame 32 was separately rendered and compared with frame 0: RGBA channel and
geometry differences are zero. Intermediate frame hashes, generator hashes,
render settings and packing details are recorded in `jet-manifest.json`.

An early inward-normal render was rejected, not shipped. The first runtime
composition also stretched the jet into a thin beam and placed isolated pointed
sprites on the burn ring. The revised composition retains volume aspect ratio,
advects broad turbulent packets, confines additive white heat to the mouth, and
uses the continuous shader burn front instead of leaf-like radial sprites.
The illustration's four edges are feathered without repainting its contents.

## Safety, integration and verification

The native modal traps background interaction; its own close controls remain
usable even while the ordinary touch-through guard is active. That guard exempts
only the armed/busy Ciel control and the two open-modal exit controls, never the page
underneath. The Ciel portal excludes this temporary modal, preventing a removed
dialog from taking the button's return focus with it.

Cleanup cancels animation, deadlines, media/network/visibility/navigation
listeners, local CSS and GPU resources. Existing overflow/overscroll inline
values and priorities are restored without fixing/repositioning the body. Scroll
and focus are returned only to the same visible route; leaving/hiding does not
steal the next view's focus or scroll. Repeated activation starts a fresh session.
No release changes the previous Rexonance atlas or its generators.

The release identity generator and public verifier attest all six new public
assets. Unknown filenames, alternate dates, suffixes, query/hash additions,
newlines and traversal are rejected before asset fetch. Existing main changes,
including the October 19 Explom portrait, are preserved during integration.

Validation evidence is kept under `output/playwright/ciel-inferno-*` (ignored
generated output). These are desktop-browser touch emulations, not an actual
iPhone/iPad Home Screen app test. The owner performs physical-device checks.

Publication must use the existing verified-main deployment workflow and confirm
the exact public release SHA plus delivered art/jet hashes and the real ten-tap
flow. A source commit or successful push is not itself public verification.

### Local release checks

- `npm test`: 2,572 tests, 2,567 passed, zero failed, five existing skips.
- TypeScript passed. ESLint has zero errors and 12 existing warnings.
- All 15 source-part groups match; both authored asset check modes pass.
- Startup graph: entry 415,170 decoded / 132,576 gzip bytes; total critical
  graph 552,100 / 180,112 bytes. Existing budgets pass unchanged, with no
  secret-renderer markers in the critical graph. These are file-byte counts,
  not elapsed loading-time measurements. Removing the lazy component's
  unnecessary router-hook dependency preserved the original chunk boundary;
  no build configuration or budget was loosened.
- `output/playwright/ciel-inferno-v6/chromium-boundaries/report.json` verifies
  stalled import, blocked large illustration, forced colours and no-WebGL.
  Every case releases focus/scroll/settings/animation work; blocked artwork
  decodes the compact supplied illustration, not a missing-image placeholder.

An input-timing regression was reproduced before the final hit-area fix: the
550ms gap's cleanup timer (with 20ms grace) could expire while navigation was busy,
leaving about 120ms in which a physical pointerdown hit the page but its
pointerup hit the button. Final pending-import evidence deliberately crosses
`navigating=true / armed=false`: pointerdown reaches the button's own hit span,
and all three bursts (tap-cancel, Escape-cancel, 12-second cap) succeed. Ordinary
navigation was not replaced or bypassed to make the test pass.

The final `chromium-auto-three` and `webkit-auto-three` reports under that same
v6 directory exercise desktop 1440px, touch 320px/DPR3 and WebKit touch
1024px/DPR2. All three profiles pass real-pointer nine/tenth activation,
keyboard activation and explicit close, then three consecutive natural endings
each: **9/9** auto endings return focus to the live Ciel, preserve scroll and
preferences, and leave zero queued inferno animation work. Every case actually
draws all 32 source frames and records no JavaScript errors. The desktop flow
also passes synthetic visibility hiding, actual WebGL context loss and real
browser Back cancellation; those departures do not steal destination focus.
The 6.6-second final-coal capture confirms the dragon has faded to zero opacity.

Auto-completion observations (including locator polling) range from 9.36–9.87s;
they verify bounded recovery, not frame-rate or elapsed loading improvements.
An earlier one-rAF restoration raced native dialog/portal teardown. The final
bounded three-frame repair is validated above, not inferred from an explicit
close alone. Superseded v4/v5 failures remain diagnostic evidence, not accepted
release results. Reduced-motion/economy and missing-atlas cases were additionally
checked in those earlier runs without changes to their rendering paths afterward.

Existing-control regression also passes: `verify-ciel-button.mjs` at 320, 390,
844, 1024 and 1440px verifies supplied normal artwork, personal toggle persistence,
pagehide cancellation and subsequent ordinary top navigation. The four
`verify-zeus-viewport-drag.mjs` cases (390/1024px, height ±60px) preserve a held
drag, final finger position and saved location. Those scripts use mouse-driven
holds in a touch-capable context; the secret's normal flows above use actual
Playwright touch input for the touch profiles. Neither is a physical iPad test.
